import { useSyncExternalStore } from 'react';
import { mergeRecipes } from '../domain/merge';
import type { MyProduct } from '../domain/nutrition/myProducts';
import { currentContent, currentVersion, newId, withNewVersion } from '../domain/recipe';
import { canTransition } from '../domain/status';
import type { Rating, Recipe, RecipeContent, RecipeImage, RecipeSource, RecipeStatus } from '../domain/types';
import { imageProvider } from '../services';
import { LocalRecipeRepository } from './localRepository';
import type { RecipeRepository } from './repository';

/**
 * Zentraler Zustand der App. Alle Änderungen laufen über diese Aktionen –
 * die Screens schreiben nie direkt ins Repository.
 * Muster: sofort im Speicher ändern (UI reagiert ohne Wartezeit), dann speichern.
 */

/** Wird beim Start von backend.ts gesetzt: Demo (localStorage) oder Sync (PouchDB). */
let repo: RecipeRepository;
/** Rezepte, deren Speichern noch läuft – beim Neuladen gewinnt dann der Stand im Speicher. */
const pending = new Map<string, number>();

let recipes: Recipe[] = [];
let products: MyProduct[] = [];
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function commit(changed: Recipe) {
  // JEDE Änderung bekommt einen Zeitstempel. Der Abgleich zwischen Geräten entscheidet
  // darüber, welche Fassung neuer ist (mergeRecipes) – vergessene Stempel = verlorene Änderungen.
  const next = { ...changed, updatedAt: now() };
  recipes = recipes.some((r) => r.id === next.id) ? recipes.map((r) => (r.id === next.id ? next : r)) : [next, ...recipes];
  emit();
  pending.set(next.id, (pending.get(next.id) ?? 0) + 1);
  repo
    .save(next)
    .catch((e) => console.error('Mashi: Speichern fehlgeschlagen', e))
    .finally(() => {
      const n = (pending.get(next.id) ?? 1) - 1;
      if (n > 0) pending.set(next.id, n);
      else pending.delete(next.id);
    });
}

function get(id: string): Recipe {
  const r = recipes.find((x) => x.id === id);
  if (!r) throw new Error(`Rezept ${id} nicht gefunden`);
  return r;
}

const now = () => new Date().toISOString();

/** Auch Beschreibung, Tags usw. zählen – diffContent listet nur die „sichtbaren“ Kochänderungen. */
const sameContent = (a: RecipeContent, b: RecipeContent) => JSON.stringify(a) === JSON.stringify(b);

export async function initStore(r: RecipeRepository) {
  repo = r;
  [recipes, products] = await Promise.all([repo.list(), repo.loadProducts()]);
  ready = true;
  emit();
  repo.onExternalChange?.(scheduleReload);
}

/** Änderungen von anderen Geräten: kurz sammeln (ein Abgleich bringt oft viele auf einmal), dann neu laden. */
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    const [fresh, freshProducts] = await Promise.all([repo.list(), repo.loadProducts()]);
    products = freshProducts;
    const inMemory = new Map(recipes.map((r) => [r.id, r]));
    recipes = fresh.map((r) => (pending.has(r.id) ? inMemory.get(r.id) ?? r : r));
    for (const id of pending.keys()) if (!fresh.some((r) => r.id === id) && inMemory.has(id)) recipes.unshift(inMemory.get(id)!);
    emit();
  }, 300);
}

// ── Hooks ──────────────────────────────────────────────────────────

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useRecipes(): Recipe[] {
  return useSyncExternalStore(subscribe, () => recipes);
}

export function useRecipe(id: string | undefined): Recipe | undefined {
  return useSyncExternalStore(subscribe, () => recipes.find((r) => r.id === id));
}

export function useProducts(): MyProduct[] {
  return useSyncExternalStore(subscribe, () => products);
}

/** Für Berechnungen außerhalb von React (z. B. Nährwerte auf den Rezeptkarten). */
export function currentProducts(): MyProduct[] {
  return products;
}

export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready);
}

// ── Aktionen ───────────────────────────────────────────────────────

export function toggleFavorite(id: string) {
  const r = get(id);
  commit({ ...r, favorite: !r.favorite, updatedAt: now() });
}

export function setStatus(id: string, status: RecipeStatus) {
  const r = get(id);
  if (!canTransition(r.status, status)) throw new Error(`Statuswechsel ${r.status} → ${status} nicht erlaubt`);
  commit({ ...r, status, updatedAt: now() });
}

export function updateNotes(id: string, notes: string) {
  const r = get(id);
  if (r.notes !== notes) commit({ ...r, notes, updatedAt: now() });
}

export function markCooked(id: string) {
  const r = get(id);
  commit({ ...r, lastCookedAt: now() });
}

interface CreateOptions {
  source: RecipeSource;
  status: RecipeStatus;
  image?: RecipeImage;
  notes?: string;
}

/** Legt ein neues Rezept mit Version 1 an. Ohne Bild wird eines erzeugt (einmalig). */
export function createRecipe(content: RecipeContent, opts: CreateOptions): string {
  const t = now();
  const versionId = newId('v');
  const recipe: Recipe = {
    id: newId('r'),
    createdAt: t,
    updatedAt: t,
    status: opts.status,
    source: opts.source,
    favorite: false,
    image: opts.image,
    notes: opts.notes ?? '',
    currentVersionId: versionId,
    versions: [{
      id: versionId, number: 1, createdAt: t,
      author: opts.source === 'ki' ? 'ki' : opts.source === 'import' ? 'import' : 'nutzer',
      label: opts.source === 'ki' ? 'KI-Vorschlag' : opts.source === 'import' ? 'Import' : 'Erste Fassung',
      content,
    }],
    feedback: [],
  };
  commit(recipe);
  if (!opts.image) void regenerateImage(recipe.id);
  return recipe.id;
}

/** Bearbeiten = neue Version. Nur wenn sich wirklich etwas geändert hat. */
export function saveContent(id: string, content: RecipeContent, label = 'Bearbeitet'): boolean {
  const r = get(id);
  if (sameContent(currentContent(r), content)) return false;
  commit(withNewVersion(r, content, 'nutzer', label));
  return true;
}

/**
 * Testergebnis speichern. Das Feedback hängt an der GEKOCHTEN Version;
 * Anpassungen daraus werden eine neue Version.
 */
export function submitTest(id: string, input: { rating: Rating; note: string; content: RecipeContent; nextStatus?: RecipeStatus }) {
  let r = get(id);
  const tested = currentVersion(r);
  r = {
    ...r,
    lastCookedAt: now(),
    feedback: [...r.feedback, { id: newId('f'), versionId: tested.id, createdAt: now(), rating: input.rating, note: input.note.trim() }],
  };
  if (!sameContent(tested.content, input.content)) {
    r = withNewVersion(r, input.content, 'nutzer', `Nach Test am ${new Date().toLocaleDateString('de-DE')}`);
  }
  if (input.nextStatus && input.nextStatus !== r.status && canTransition(r.status, input.nextStatus)) {
    r = { ...r, status: input.nextStatus };
  }
  commit({ ...r, updatedAt: now() });
}

/**
 * „Ins Kochbuch übernehmen“: Die aktuelle Fassung wird als eigene Nutzer-Version
 * festgehalten. Die KI-Version bleibt als Version 1 erhalten.
 */
export function adoptToCookbook(id: string) {
  const r = get(id);
  if (!canTransition(r.status, 'kochbuch')) return;
  const withVersion = withNewVersion(r, currentContent(r), 'nutzer', 'Meine Kochbuch-Version');
  commit({ ...withVersion, status: 'kochbuch' });
}

export async function regenerateImage(id: string) {
  const image = await imageProvider.generate(currentContent(get(id)));
  commit({ ...get(id), image, updatedAt: now() });
}

export function archiveRecipe(id: string) {
  commit({ ...get(id), archivedAt: now() });
}

export function restoreRecipe(id: string) {
  const { archivedAt: _, ...rest } = get(id);
  commit({ ...rest, updatedAt: now() });
}

export function deleteRecipe(id: string) {
  recipes = recipes.filter((r) => r.id !== id);
  emit();
  void repo.remove(id);
}

/**
 * Rezepte aus einer Sicherungsdatei übernehmen. Gibt es ein Rezept schon (gleiche ID),
 * wird zusammengeführt statt überschrieben – wie beim Abgleich zwischen Geräten,
 * damit keine Version und keine Bewertung verloren geht.
 */
export function importRecipes(list: Recipe[]): { added: number; merged: number } {
  let added = 0;
  let merged = 0;
  for (const r of list) {
    const existing = recipes.find((x) => x.id === r.id);
    if (existing) {
      commit(mergeRecipes(existing, r));
      merged++;
    } else {
      commit(r);
      added++;
    }
  }
  return { added, merged };
}

/**
 * „Meine Produkte“ speichern. Danach bekommt die Rezeptliste bewusst eine NEUE Identität
 * (gleiche Rezepte): So rechnen auch alle Rezeptkarten ihre Nährwerte neu.
 */
/** Produkte aus einer Sicherung übernehmen: gleiche ID = ersetzen, neue = anhängen. */
export function importProducts(incoming: MyProduct[]): number {
  if (!incoming.length) return 0;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  saveProducts([...byId.values()]);
  return incoming.length;
}

export function saveProducts(next: MyProduct[]) {
  products = next;
  recipes = [...recipes];
  emit();
  repo.saveProducts(next).catch((e) => console.error('Mashi: Produkte speichern fehlgeschlagen', e));
}

export function isDemo(): boolean {
  return repo instanceof LocalRecipeRepository;
}

export async function resetDemoData() {
  if (!(repo instanceof LocalRecipeRepository)) return; // echte Daten nie per Knopfdruck ersetzen
  recipes = await repo.reset();
  emit();
}
