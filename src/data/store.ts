import { useSyncExternalStore } from 'react';
import { emptyPlan, normalizePlan, toggleCooked, type MealPlan } from '../domain/mealplan';
import { mergeRecipes } from '../domain/merge';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import {
  addItem, applyImport, deductRecipe, emptyPantry, type ImportRow, type Pantry, type PantryItem, type PantryUnit,
} from '../domain/pantry';
import { currentContent, currentVersion, newId, withNewVersion } from '../domain/recipe';
import { recordSavings } from '../domain/savings';
import { canTransition } from '../domain/status';
import type { Rating, Recipe, RecipeContent, RecipeImage, RecipeSource, RecipeStatus } from '../domain/types';
import { foodTable, imageProvider } from '../services';
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
let plan: MealPlan = emptyPlan();
/** Speichern des Plans läuft noch – beim Neuladen gewinnt dann der Stand im Speicher. */
let planPending = 0;
let pantry: Pantry = emptyPantry();
let pantryPending = 0;
/** Letzter Speicherfehler (z. B. Speicher voll). Wird beim nächsten erfolgreichen Speichern gelöscht. */
let saveError: string | null = null;
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Jeder Speichervorgang meldet sich hier zurück – so bleibt ein Fehler nicht nur in der Konsole. */
function tracked(p: Promise<void>): Promise<void> {
  return p.then(
    () => {
      if (saveError) {
        saveError = null;
        emit();
      }
    },
    (e) => {
      console.error('Mashi: Speichern fehlgeschlagen', e);
      const quota = (e as { name?: string }).name === 'QuotaExceededError';
      saveError = quota ? 'Der Speicher des Geräts ist voll – die letzte Änderung ist nicht gesichert.' : 'Die letzte Änderung konnte nicht gespeichert werden.';
      emit();
    },
  );
}

function commit(changed: Recipe) {
  // JEDE Änderung bekommt einen Zeitstempel. Der Abgleich zwischen Geräten entscheidet
  // darüber, welche Fassung neuer ist (mergeRecipes) – vergessene Stempel = verlorene Änderungen.
  const next = { ...changed, updatedAt: now() };
  recipes = recipes.some((r) => r.id === next.id) ? recipes.map((r) => (r.id === next.id ? next : r)) : [next, ...recipes];
  emit();
  pending.set(next.id, (pending.get(next.id) ?? 0) + 1);
  tracked(repo.save(next))
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
  let loaded: MealPlan;
  [recipes, products, loaded, pantry] = await Promise.all([repo.list(), repo.loadProducts(), repo.loadPlan(), repo.loadPantry()]);
  plan = normalizePlan(loaded);
  ready = true;
  emit();
  repo.onExternalChange?.(scheduleReload);
}

/** Änderungen von anderen Geräten: kurz sammeln (ein Abgleich bringt oft viele auf einmal), dann neu laden. */
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    const [fresh, freshProducts, freshPlan, freshPantry] = await Promise.all([repo.list(), repo.loadProducts(), repo.loadPlan(), repo.loadPantry()]);
    products = freshProducts;
    if (!planPending) plan = normalizePlan(freshPlan);
    if (!pantryPending) pantry = freshPantry;
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

export function usePlan(): MealPlan {
  return useSyncExternalStore(subscribe, () => plan);
}

export function usePantry(): Pantry {
  return useSyncExternalStore(subscribe, () => pantry);
}

export function useSaveError(): string | null {
  return useSyncExternalStore(subscribe, () => saveError);
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

/** Was nach „Gekocht“ passiert ist – für die Rückmeldung. */
export interface CookedResult {
  /** aus der Speisekammer genommen */
  used: string[];
  /** verwendet, aber ohne Menge – „Noch da?“ */
  toCheck: string[];
}

/**
 * „Fertig“ im Kochmodus: zuletzt gekocht merken, im Wochenplan abhaken und die Zutaten
 * aus der Speisekammer nehmen. Schon im Plan abgehakt → nicht ein zweites Mal abziehen.
 */
export function markCooked(id: string, servings?: number): CookedResult {
  const r = get(id);
  commit({ ...r, lastCookedAt: now() });
  const planned = plan.items.find((i) => i.recipeId === id);
  if (planned && plan.cooked.includes(id)) return { used: [], toCheck: [] };
  if (planned) commitPlan(toggleCooked(plan, id, true));
  return consume(r, servings ?? planned?.servings ?? currentContent(r).servings);
}

function consume(r: Recipe, servings: number): CookedResult {
  if (!pantry.items.length) return { used: [], toCheck: [] };
  const d = deductRecipe(pantry, currentContent(r), servings, withMyProducts(foodTable, products));
  if (d.used.length || d.toCheck.length) commitPantry(d.pantry);
  return { used: d.used, toCheck: d.toCheck };
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

/** Eigenes Foto (oder wieder ein Platzhalter). */
export function setImage(id: string, image: RecipeImage) {
  commit({ ...get(id), image });
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
  if (plan.items.some((i) => i.recipeId === id)) removeFromPlan(id);
  emit();
  void tracked(repo.remove(id));
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

/** Produkte aus einer Sicherung übernehmen: gleiche ID = ersetzen, neue = anhängen. */
export function importProducts(incoming: MyProduct[]): number {
  if (!incoming.length) return 0;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  saveProducts([...byId.values()]);
  return incoming.length;
}

/**
 * „Meine Produkte“ speichern. Danach bekommt die Rezeptliste bewusst eine NEUE Identität
 * (gleiche Rezepte): So rechnen auch alle Rezeptkarten ihre Nährwerte neu.
 */
export function saveProducts(next: MyProduct[]) {
  products = next;
  recipes = [...recipes];
  emit();
  void tracked(repo.saveProducts(next));
}

// ── Wochenplan ─────────────────────────────────────────────────────

function commitPlan(next: Omit<MealPlan, 'updatedAt'>) {
  plan = { ...next, updatedAt: now() };
  emit();
  planPending++;
  void tracked(repo.savePlan(plan)).finally(() => planPending--);
}

/** Gibt false zurück, wenn das Rezept schon im Plan steht. */
export function addToPlan(recipeId: string, servings = currentContent(get(recipeId)).servings): boolean {
  if (plan.items.some((i) => i.recipeId === recipeId)) return false;
  commitPlan({ ...plan, items: [...plan.items, { recipeId, servings }] });
  return true;
}

export function removeFromPlan(recipeId: string) {
  commitPlan({ ...plan, items: plan.items.filter((i) => i.recipeId !== recipeId), cooked: plan.cooked.filter((id) => id !== recipeId) });
}

export function setPlanServings(recipeId: string, servings: number) {
  commitPlan({ ...plan, items: plan.items.map((i) => (i.recipeId === recipeId ? { ...i, servings } : i)) });
}

export function toggleShoppingItem(key: string) {
  const checked = plan.checked.includes(key) ? plan.checked.filter((k) => k !== key) : [...plan.checked, key];
  commitPlan({ ...plan, checked });
}

/**
 * „Gekocht“ im Plan an- oder abhaken. Beim Abhaken zählt es als „zuletzt gekocht“ und die
 * Zutaten gehen aus der Speisekammer. Zurücknehmen legt sie NICHT wieder hinein.
 */
export function togglePlanCooked(recipeId: string): CookedResult | null {
  const next = toggleCooked(plan, recipeId);
  if (next === plan) return null;
  commitPlan(next);
  if (!next.cooked.includes(recipeId)) return null;
  const r = get(recipeId);
  commit({ ...r, lastCookedAt: now() });
  return consume(r, next.items.find((i) => i.recipeId === recipeId)!.servings);
}

/** „Neue Woche“: Plan, Haken und „Gekocht“ leeren. */
export function clearPlan() {
  commitPlan({ items: [], checked: [], cooked: [] });
}

export function isDemo(): boolean {
  return repo instanceof LocalRecipeRepository;
}

export async function resetDemoData() {
  if (!(repo instanceof LocalRecipeRepository)) return; // echte Daten nie per Knopfdruck ersetzen
  recipes = await repo.reset();
  plan = emptyPlan();
  pantry = emptyPantry();
  emit();
}

// ── Speisekammer ───────────────────────────────────────────────────

function commitPantry(next: Omit<Pantry, 'updatedAt'>) {
  pantry = { ...next, updatedAt: now() };
  emit();
  pantryPending++;
  void tracked(repo.savePantry(pantry)).finally(() => pantryPending--);
}

/** Geprüfte Bon-Zeilen übernehmen – und merken, damit der nächste Bon schon ausgefüllt ist. */
export function importReceipt(rows: ImportRow[], paidAt?: string, savings?: { lidlPlus: number; offers: number; total?: number }): number {
  const t = now();
  const next = applyImport(pantry, rows, t, () => newId('v'), paidAt ?? t);
  commitPantry(savings ? recordSavings(next, savings, paidAt ?? t) : next);
  return rows.filter((r) => !r.skip).length;
}

export function addPantryItem(name: string, amount?: number, unit?: PantryUnit) {
  if (!name.trim()) return;
  commitPantry({ ...pantry, items: addItem(pantry.items, { name: name.trim(), amount, unit }, now(), () => newId('v')) });
}

export function updatePantryItem(id: string, patch: Partial<Pick<PantryItem, 'name' | 'amount' | 'unit'>>) {
  commitPantry({ ...pantry, items: pantry.items.map((i) => (i.id === id ? { ...i, ...patch, check: false } : i)) });
}

export function removePantryItem(id: string) {
  commitPantry({ ...pantry, items: pantry.items.filter((i) => i.id !== id) });
}

/** Antwort auf „Noch da?“ nach dem Kochen. */
export function answerPantryCheck(id: string, stillThere: boolean) {
  if (stillThere) commitPantry({ ...pantry, items: pantry.items.map((i) => (i.id === id ? { ...i, check: false } : i)) });
  else removePantryItem(id);
}

/** Gelernten Bon-Artikel vergessen (z. B. falsch zugeordnet). */
export function forgetReceiptRule(key: string) {
  commitPantry({ ...pantry, rules: pantry.rules.filter((r) => r.key !== key) });
}
