import { useSyncExternalStore } from 'react';
import { buildShoppingList, emptyPlan, normalizePlan, resolveIngredient, toggleCooked, type MealPlan } from '../domain/mealplan';
import { mergeRecipes } from '../domain/merge';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import {
  addItem, applyImport, bonKey, deductRecipe, emptyPantry, freezeItem, rememberReceipt, restock, takenBetween, thawItem, type Taken, type ImportRow, type Pantry, type PantryItem, type PantryUnit,
} from '../domain/pantry';
import { currentContent, currentVersion, newId, withNewVersion } from '../domain/recipe';
import { recordSavings, type BonSavings } from '../domain/savings';
import { specialDays, type ShelfDays } from '../domain/shelfLife';
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
    let loaded;
    try {
      loaded = await Promise.all([repo.list(), repo.loadProducts(), repo.loadPlan(), repo.loadPantry()]);
    } catch (e) {
      console.error('Mashi: Änderungen vom anderen Gerät ließen sich nicht laden', e);
      saveError = 'Änderungen von deinem anderen Gerät ließen sich nicht laden. Lade die Seite bitte neu.';
      emit();
      return;
    }
    const [fresh, freshProducts, freshPlan, freshPantry] = loaded;
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
  /** Haken im Plan zurückgenommen: das kam wieder in die Speisekammer */
  restored?: string[];
  /** „Rückgängig“ direkt danach: Speisekammer, Plan-Haken und „zuletzt gekocht“ wie vorher */
  undo?: () => void;
}

/**
 * „Fertig“ im Kochmodus: zuletzt gekocht merken, im Wochenplan abhaken und die Zutaten
 * aus der Speisekammer nehmen. Schon im Plan abgehakt → nicht ein zweites Mal abziehen.
 * @param amounts Mengen „nur dieses Mal“ je Zutat-ID (z. B. 3 statt 2 Tomaten) – das Rezept bleibt unverändert
 */
export function markCooked(id: string, servings?: number, amounts: Record<string, number> = {}): CookedResult {
  const r = get(id);
  commit({ ...r, lastCookedAt: now() });
  const planned = plan.items.find((i) => i.recipeId === id);
  if (planned && plan.cooked.includes(id)) return { used: [], toCheck: [], undo: () => commit({ ...get(id), lastCookedAt: r.lastCookedAt }) };
  if (planned) commitPlan(toggleCooked(plan, id, true));
  const result = consume(r, servings ?? planned?.servings ?? currentContent(r).servings, amounts, !!planned);
  return {
    ...result,
    undo: () => {
      result.undo?.();
      if (planned && plan.cooked.includes(id)) commitPlan({ ...plan, cooked: plan.cooked.filter((x) => x !== id) });
      commit({ ...get(id), lastCookedAt: r.lastCookedAt });
    },
  };
}

/**
 * Zutaten abziehen. undo legt genau das Genommene zurück. log = im Wochenplan abgehakt →
 * merken, damit auch späteres Zurücknehmen des Hakens die Zutaten zurückbringt.
 */
function consume(r: Recipe, servings: number, amounts: Record<string, number> = {}, log = false): CookedResult {
  if (!pantry.items.length) return { used: [], toCheck: [] };
  const before = pantry;
  const d = deductRecipe(pantry, currentContent(r), servings, withMyProducts(foodTable, products), amounts);
  if (!d.used.length && !d.toCheck.length) return { used: [], toCheck: [] };
  const taken = takenBetween(before, d.pantry);
  commitPantry(log ? { ...d.pantry, cookLog: { ...pruneCookLog(d.pantry.cookLog), [r.id]: taken } } : d.pantry);
  return { used: d.used, toCheck: d.toCheck, undo: () => putBack(r.id, taken) };
}

/** Genommenes zurücklegen und den Merkzettel dafür löschen. */
function putBack(recipeId: string, taken: Taken[]) {
  const { [recipeId]: _done, ...rest } = pantry.cookLog ?? {};
  const back = restock(pantry, taken);
  commitPantry(Object.keys(rest).length ? { ...back, cookLog: rest } : withoutCookLog(back));
}

/** Nur Einträge für Gerichte behalten, die im Plan noch als gekocht gelten. */
function pruneCookLog(log: Pantry['cookLog']): Record<string, Taken[]> {
  return Object.fromEntries(Object.entries(log ?? {}).filter(([id]) => plan.cooked.includes(id)));
}

function withoutCookLog(p: Pantry): Pantry {
  const { cookLog: _l, ...rest } = p;
  return rest;
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

/** Endgültig löschen – gibt „Rückgängig“ zurück (legt das Rezept samt Plan-Eintrag wieder an). */
export function deleteRecipe(id: string): () => void {
  const removed = recipes.find((r) => r.id === id);
  const planned = plan.items.find((i) => i.recipeId === id);
  recipes = recipes.filter((r) => r.id !== id);
  if (planned) removeFromPlan(id);
  emit();
  void tracked(repo.remove(id));
  return () => {
    if (!removed || recipes.some((r) => r.id === id)) return;
    commit(removed); // gelöscht = Grabstein in CouchDB; neu speichern legt das Rezept wieder an
    if (planned) addToPlan(id, planned.servings);
  };
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

/** Aus dem Plan nehmen – gibt „Rückgängig“ zurück (gleiche Stelle, Portionen und Gekocht-Haken). */
export function removeFromPlan(recipeId: string): () => void {
  const index = plan.items.findIndex((i) => i.recipeId === recipeId);
  const removed = plan.items[index];
  const wasCooked = plan.cooked.includes(recipeId);
  commitPlan({ ...plan, items: plan.items.filter((i) => i.recipeId !== recipeId), cooked: plan.cooked.filter((id) => id !== recipeId) });
  return () => {
    if (!removed || plan.items.some((i) => i.recipeId === recipeId)) return;
    const items = [...plan.items];
    items.splice(Math.min(index, items.length), 0, removed);
    commitPlan({ ...plan, items, cooked: wasCooked ? [...plan.cooked, recipeId] : plan.cooked });
  };
}

export function setPlanServings(recipeId: string, servings: number) {
  commitPlan({ ...plan, items: plan.items.map((i) => (i.recipeId === recipeId ? { ...i, servings } : i)) });
}

/** Einkaufsliste: trotz Vorrat kaufen – oder wieder mit dem Vorrat verrechnen. */
export function toggleBuyAnyway(key: string) {
  const buy = plan.buy ?? [];
  const next = buy.includes(key) ? buy.filter((k) => k !== key) : [...buy, key];
  commitPlan({ ...plan, buy: next });
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
  if (!next.cooked.includes(recipeId)) {
    // Haken zurückgenommen → was „Gekocht“ genommen hatte, kommt zurück
    const taken = pantry.cookLog?.[recipeId];
    if (!taken?.length) return null;
    putBack(recipeId, taken);
    return { used: [], toCheck: [], restored: [...new Set(taken.map((t) => t.item.name))] };
  }
  const r = get(recipeId);
  commit({ ...r, lastCookedAt: now() });
  const result = consume(r, next.items.find((i) => i.recipeId === recipeId)!.servings, {}, true);
  return {
    ...result,
    undo: () => {
      result.undo?.();
      if (plan.cooked.includes(recipeId)) commitPlan({ ...plan, cooked: plan.cooked.filter((x) => x !== recipeId) });
      commit({ ...get(recipeId), lastCookedAt: r.lastCookedAt });
    },
  };
}

/** „Neue Woche“: Plan, Haken und „Gekocht“ leeren. */
export function clearPlan() {
  commitPlan({ items: [], checked: [], cooked: [] });
  // Neue Woche: das Zurücklegen alter Gerichte ist erledigt
  if (pantry.cookLog) commitPantry(withoutCookLog(pantry));
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
/**
 * Geprüfte Bon-Zeilen übernehmen. onList = wie viele Einträge der Einkaufsliste damit erledigt sind:
 * Was jetzt reicht, steht dort unter „Hast du schon“; was ohne Menge kam, wird abgehakt.
 * Hast du zu wenig gekauft, bleibt der Rest auf der Liste.
 */
export function importReceipt(rows: ImportRow[], paidAt?: string, savings?: BonSavings): { count: number; onList: number } {
  const t = now();
  const next = rememberReceipt(applyImport(pantry, rows, t, () => newId('v'), paidAt ?? t), bonKey(paidAt, savings?.total));
  commitPantry(savings ? recordSavings(next, savings, paidAt ?? t) : next);

  const table = withMyProducts(foodTable, products);
  const bought = new Set(rows.filter((r) => !r.skip).map((r) => resolveIngredient({ id: r.key, name: r.name }, 1, table)?.key));
  const list = buildShoppingList(plan, recipes, table, pantry).filter((i) => bought.has(i.key) && !plan.checked.includes(i.key));
  const tick = list.filter((i) => !i.covered && i.have === 'vorhanden').map((i) => i.key);
  if (tick.length) commitPlan({ ...plan, checked: [...plan.checked, ...tick] });
  return { count: rows.filter((r) => !r.skip).length, onList: list.filter((i) => i.covered).length + tick.length };
}

export function addPantryItem(name: string, amount?: number, unit?: PantryUnit) {
  if (!name.trim()) return;
  commitPantry({ ...pantry, items: addItem(pantry.items, { name: name.trim(), amount, unit }, now(), () => newId('v')) });
}

export function updatePantryItem(id: string, patch: Partial<Pick<PantryItem, 'name' | 'amount' | 'unit' | 'useBy' | 'reduced'>>) {
  commitPantry({ ...pantry, items: pantry.items.map((i) => (i.id === id ? { ...i, ...patch, check: false } : i)) });
}

/** Einfrieren – ganz oder nur einen Teil (amount in der Einheit des Vorrats). */
export function freezePantryItem(id: string, amount?: number) {
  commitPantry({ ...pantry, items: freezeItem(pantry.items, id, now(), amount, () => newId('v')) });
}

/** Auftauen – hält danach nur noch kurz (einstellbar, Standard 1 Tag). */
export function thawPantryItem(id: string) {
  commitPantry({ ...pantry, items: thawItem(pantry.items, id, now(), specialDays('thawed', pantry.shelfDays)) });
}

/** Entfernen – gibt „Rückgängig“ zurück: legt den Vorrat an dieselbe Stelle zurück. */
export function removePantryItem(id: string): () => void {
  const index = pantry.items.findIndex((i) => i.id === id);
  const removed = pantry.items[index];
  commitPantry({ ...pantry, items: pantry.items.filter((i) => i.id !== id) });
  return () => {
    if (!removed || pantry.items.some((i) => i.id === removed.id)) return;
    const items = [...pantry.items];
    items.splice(Math.min(index, items.length), 0, { ...removed, check: false });
    commitPantry({ ...pantry, items });
  };
}

/** Antwort auf „Noch da?“ nach dem Kochen – „Aufgebraucht“ lässt sich rückgängig machen. */
export function answerPantryCheck(id: string, stillThere: boolean): (() => void) | undefined {
  if (stillThere) {
    commitPantry({ ...pantry, items: pantry.items.map((i) => (i.id === id ? { ...i, check: false } : i)) });
    return undefined;
  }
  return removePantryItem(id);
}

/** Deine Richtwerte „hält X Tage“ (je Art oder Lebensmittel) – gelten auf allen Geräten. */
export function setPantryShelfDays(shelfDays: ShelfDays) {
  const { shelfDays: _old, ...rest } = pantry;
  commitPantry(Object.keys(shelfDays).length ? { ...rest, shelfDays } : rest);
}

/** Gelernten Bon-Artikel vergessen (z. B. falsch zugeordnet). */
export function forgetReceiptRule(key: string) {
  commitPantry({ ...pantry, rules: pantry.rules.filter((r) => r.key !== key) });
}
