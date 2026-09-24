/// <reference types="pouchdb-core" />
import { mergeRecipes } from '../domain/merge';
import type { MyProduct } from '../domain/nutrition/myProducts';
import type { Recipe } from '../domain/types';
import type { RecipeRepository } from './repository';

/** So liegt ein Rezept in PouchDB/CouchDB: das Recipe-Objekt plus Verwaltungsfelder. */
export type RecipeDoc = Recipe & { _id: string; _rev?: string; type: 'recipe' };
export type RecipeDb = PouchDB.Database<RecipeDoc>;

/** „Meine Produkte“ liegen als EIN Dokument neben den Rezepten und werden mit abgeglichen. */
const PRODUCTS_ID = 'meine-produkte';
type ProductsDoc = { _id: string; _rev?: string; type: 'products'; products: MyProduct[]; updatedAt: string };

/**
 * Rezepte in PouchDB (im Browser: IndexedDB). Ein Rezept = ein Dokument,
 * inklusive aller Versionen und Testbewertungen. Der Abgleich mit dem Server
 * läuft getrennt davon in sync.ts – dieses Repository kennt nur die lokale Datenbank.
 */
export class PouchRecipeRepository implements RecipeRepository {
  /** Schreibvorgänge nacheinander ausführen – sonst kollidieren zwei schnelle Klicks aufs selbe Rezept. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Revisionen, die wir selbst geschrieben haben – deren Änderungsmeldung ist nicht „extern“. */
  private ownRevs = new Set<string>();

  constructor(private db: RecipeDb) {}

  async list(): Promise<Recipe[]> {
    const res = await this.db.allDocs({ include_docs: true, conflicts: true });
    const docs = res.rows.map((r) => r.doc).filter((d): d is PouchDB.Core.ExistingDocument<RecipeDoc> & PouchDB.Core.AllDocsMeta => !!d && d.type === 'recipe');
    const out: Recipe[] = [];
    for (const doc of docs) {
      out.push(doc._conflicts?.length ? await this.resolveConflicts(doc._id) : strip(doc));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  save(recipe: Recipe): Promise<void> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const rev = await this.currentRev(recipe.id);
        try {
          const res = await this.db.put({ ...recipe, _id: recipe.id, _rev: rev, type: 'recipe' });
          this.ownRevs.add(res.rev);
          return;
        } catch (e) {
          if ((e as { status?: number }).status !== 409) throw e; // 409 = jemand war schneller → neu versuchen
        }
      }
      throw new Error(`Rezept ${recipe.id} konnte nicht gespeichert werden`);
    });
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const rev = await this.currentRev(id);
      if (!rev) return;
      // Löschen in CouchDB = „Grabstein“-Revision. Die wird mit abgeglichen,
      // damit das Rezept auch auf den anderen Geräten verschwindet.
      const res = await this.db.remove(id, rev);
      this.ownRevs.add(res.rev);
    });
  }

  async loadProducts(): Promise<MyProduct[]> {
    const db = this.db as unknown as PouchDB.Database<ProductsDoc>;
    try {
      const doc = await db.get(PRODUCTS_ID, { conflicts: true });
      if (!doc._conflicts?.length) return doc.products;
      // Auf zwei Geräten offline geändert: die zuletzt geänderte Liste gewinnt.
      return this.enqueue(async () => {
        const all = [doc, ...(await Promise.all(doc._conflicts!.map((rev) => db.get(PRODUCTS_ID, { rev }))))];
        const newest = all.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
        // _conflicts ist nur eine Lese-Angabe – beim Speichern lehnt CouchDB es ab.
        const { _conflicts: _c, ...clean } = newest as ProductsDoc & { _conflicts?: string[] };
        const res = await db.put({ ...clean, _rev: doc._rev });
        this.ownRevs.add(res.rev);
        for (const rev of doc._conflicts!) this.ownRevs.add((await db.remove(PRODUCTS_ID, rev)).rev);
        return newest.products;
      });
    } catch (e) {
      if ((e as { status?: number }).status === 404) return [];
      throw e;
    }
  }

  saveProducts(products: MyProduct[]): Promise<void> {
    const db = this.db as unknown as PouchDB.Database<ProductsDoc>;
    return this.enqueue(async () => {
      const rev = await this.currentRev(PRODUCTS_ID);
      const res = await db.put({ _id: PRODUCTS_ID, _rev: rev, type: 'products', products, updatedAt: new Date().toISOString() });
      this.ownRevs.add(res.rev);
    });
  }

  onExternalChange(callback: () => void): () => void {
    const feed = this.db.changes({ since: 'now', live: true }).on('change', (change) => {
      const rev = change.changes[0]?.rev;
      if (rev && this.ownRevs.delete(rev)) return; // eigene Änderung – schon im Speicher
      callback();
    });
    return () => feed.cancel();
  }

  /**
   * Konflikt: Zwei Geräte haben dasselbe Rezept unabhängig geändert. CouchDB behält
   * beide Fassungen und wählt vorläufig eine als Gewinner. Wir führen alle zusammen
   * (siehe mergeRecipes), speichern das Ergebnis und löschen die Verlierer-Revisionen.
   */
  async resolveConflicts(id: string): Promise<Recipe> {
    return this.enqueue(async () => {
      const winner = await this.db.get(id, { conflicts: true });
      const losers = winner._conflicts ?? [];
      if (!losers.length) return strip(winner);

      let merged = strip(winner);
      for (const rev of losers) merged = mergeRecipes(merged, strip(await this.db.get(id, { rev })));

      const res = await this.db.put({ ...merged, _id: id, _rev: winner._rev, type: 'recipe' });
      this.ownRevs.add(res.rev);
      for (const rev of losers) {
        const del = await this.db.remove(id, rev);
        this.ownRevs.add(del.rev);
      }
      return merged;
    });
  }

  private async currentRev(id: string): Promise<string | undefined> {
    try {
      return (await this.db.get(id))._rev;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return undefined;
      throw e;
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Verwaltungsfelder entfernen – nach außen gibt es nur saubere Recipe-Objekte. */
function strip(doc: RecipeDoc & { _conflicts?: string[] }): Recipe {
  const { _id: _i, _rev: _r, _conflicts: _c, type: _t, ...recipe } = doc as RecipeDoc & { _conflicts?: string[]; _attachments?: unknown };
  return recipe;
}
