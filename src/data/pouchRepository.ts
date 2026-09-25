/// <reference types="pouchdb-core" />
import { emptyPlan, type MealPlan } from '../domain/mealplan';
import { mergeRecipes } from '../domain/merge';
import { merge3Pantry, merge3Plan, merge3Products, merge3Recipe, unionPantry, unionPlan, unionProducts } from '../domain/syncMerge';
import { emptyPantry, type Pantry } from '../domain/pantry';
import type { MyProduct } from '../domain/nutrition/myProducts';
import type { Recipe } from '../domain/types';
import type { RecipeRepository } from './repository';

/** So liegt ein Rezept in PouchDB/CouchDB: das Recipe-Objekt plus Verwaltungsfelder. */
export type RecipeDoc = Recipe & { _id: string; _rev?: string; type: 'recipe' };
export type RecipeDb = PouchDB.Database<RecipeDoc>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** „Meine Produkte“, Wochenplan und Speisekammer liegen je als EIN Dokument neben den Rezepten und werden mit abgeglichen. */
type SingleDoc = {
  _id: string; _rev?: string; type: 'products' | 'plan' | 'pantry';
  products?: MyProduct[]; plan?: MealPlan; pantry?: Pantry; updatedAt: string;
};

/** Je Einzel-Dokument: wo es liegt und wie man zwei Fassungen zusammenführt. */
interface SingleKind<T> {
  id: string;
  type: SingleDoc['type'];
  field: 'products' | 'plan' | 'pantry';
  merge3: (base: T, ours: T, theirs: T) => T;
  union: (a: T, b: T) => T;
  stamp: (data: T) => string;
}
const PRODUCTS: SingleKind<MyProduct[]> = {
  id: 'meine-produkte', type: 'products', field: 'products', merge3: merge3Products, union: unionProducts,
  stamp: (ps) => ps.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), ''),
};
const PLAN: SingleKind<MealPlan> = { id: 'wochenplan', type: 'plan', field: 'plan', merge3: merge3Plan, union: unionPlan, stamp: (p) => p.updatedAt };
const PANTRY: SingleKind<Pantry> = { id: 'speisekammer', type: 'pantry', field: 'pantry', merge3: merge3Pantry, union: unionPantry, stamp: (p) => p.updatedAt };

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

  /**
   * Speichern, ohne Neueres zu überschreiben: Was in der Datenbank liegt, wird mit unserer Änderung
   * (base → recipe) zusammengeführt. Hat niemand anders geschrieben, ist das Ergebnis einfach recipe.
   */
  save(recipe: Recipe, base?: Recipe): Promise<Recipe> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.getOrUndefined(recipe.id);
        const m = current && current.type === 'recipe' ? merge3Recipe(base ?? strip(current), recipe, strip(current)) : recipe;
        const merged = same(m, recipe) ? recipe : m; // nichts dazugekommen → dasselbe Objekt (kein unnötiges Neuzeichnen)
        try {
          const res = await this.db.put({ ...merged, _id: recipe.id, _rev: current?._rev, type: 'recipe' });
          this.ownRevs.add(res.rev);
          return merged;
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
    return this.loadSingle(PRODUCTS, (d) => d.products ?? []);
  }

  saveProducts(products: MyProduct[], base?: MyProduct[]): Promise<MyProduct[]> {
    return this.saveSingle(PRODUCTS, products, base, (d) => d.products ?? []);
  }

  async loadPlan(): Promise<MealPlan> {
    return this.loadSingle(PLAN, (d) => d.plan ?? emptyPlan());
  }

  savePlan(plan: MealPlan, base?: MealPlan): Promise<MealPlan> {
    return this.saveSingle(PLAN, plan, base, (d) => d.plan ?? emptyPlan());
  }

  async loadPantry(): Promise<Pantry> {
    return this.loadSingle(PANTRY, (d) => ({ ...emptyPantry(), ...d.pantry }));
  }

  savePantry(pantry: Pantry, base?: Pantry): Promise<Pantry> {
    return this.saveSingle(PANTRY, pantry, base, (d) => ({ ...emptyPantry(), ...d.pantry }));
  }

  /**
   * Einzel-Dokument laden. Offline auf zwei Geräten geändert (Konflikt) → beide Fassungen
   * vereinen (union…) statt eine zu verwerfen; das Ergebnis wird gespeichert, die Konflikte gelöscht.
   */
  private async loadSingle<T>(kind: SingleKind<T>, pick: (d: SingleDoc) => T): Promise<T> {
    const db = this.db as unknown as PouchDB.Database<SingleDoc>;
    let doc: PouchDB.Core.ExistingDocument<SingleDoc> & { _conflicts?: string[] };
    try {
      doc = await db.get(kind.id, { conflicts: true });
    } catch (e) {
      if ((e as { status?: number }).status === 404) return pick({ _id: kind.id, type: kind.type, updatedAt: '' });
      throw e;
    }
    if (!doc._conflicts?.length) return pick(doc);
    return this.enqueue(async () => {
      const others = await Promise.all(doc._conflicts!.map((rev) => db.get(kind.id, { rev })));
      const data = others.reduce((acc, o) => kind.union(acc, pick(o)), pick(doc));
      const res = await db.put({ _id: kind.id, _rev: doc._rev, type: kind.type, [kind.field]: data, updatedAt: kind.stamp(data) });
      this.ownRevs.add(res.rev);
      for (const rev of doc._conflicts!) this.ownRevs.add((await db.remove(kind.id, rev)).rev);
      return data;
    });
  }

  /**
   * Einzel-Dokument speichern, ohne Neueres zu überschreiben: der aktuelle Stand in der Datenbank
   * (theirs) + unsere Änderung (base → data). Ohne base: einfach data (z. B. Sicherung einspielen).
   */
  private saveSingle<T>(kind: SingleKind<T>, data: T, base: T | undefined, pick: (d: SingleDoc) => T): Promise<T> {
    const db = this.db as unknown as PouchDB.Database<SingleDoc>;
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.getOrUndefined(kind.id) as (PouchDB.Core.ExistingDocument<SingleDoc> | undefined);
        const m = current && base !== undefined ? kind.merge3(base, data, pick(current)) : data;
        const merged = same(m, data) ? data : m;
        try {
          const res = await db.put({ _id: kind.id, _rev: current?._rev, type: kind.type, [kind.field]: merged, updatedAt: kind.stamp(merged) });
          this.ownRevs.add(res.rev);
          return merged;
        } catch (e) {
          if ((e as { status?: number }).status !== 409) throw e; // Abgleich hat gerade geschrieben → nochmal mit dem neuen Stand
        }
      }
      throw new Error(`${kind.id} konnte nicht gespeichert werden`);
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
    return (await this.getOrUndefined(id))?._rev;
  }

  private async getOrUndefined(id: string): Promise<PouchDB.Core.ExistingDocument<RecipeDoc> | undefined> {
    try {
      return await this.db.get(id);
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
