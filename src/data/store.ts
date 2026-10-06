import { useSyncExternalStore } from 'react';
import { normalizeName } from '../domain/nutrition/localFoods';
import { EXTRA_PREFIX, RESTOCK_PREFIX, shoppingList, type RestockRule } from '../domain/restock';
import { exclusiveStages, stageOf, withStage, type FoodStage } from '../domain/stage';
import { emptyPlan, keyOfName, normalizePlan, toggleCooked, type MealPlan } from '../domain/mealplan';
import { mergeRecipes } from '../domain/merge';
import { unionPantry, unionPlan } from '../domain/syncMerge';
import { fillOrAdd, nameOf, productsFor, withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import type { FoodTable } from '../domain/nutrition/types';
import {
  addItem, applyImport, bonKey, deductRecipe, emptyPantry, freezeItem, rememberReceipt, returnTaken, takenBetween, thawItem, type Taken, type ImportRow, type Pantry, type PantryItem, type PantryUnit,
} from '../domain/pantry';
import { attachPacks, changeAmount, mergeSamePacks, openItem } from '../domain/packs';
import { addPrepared, eatPrepared } from '../domain/prepared';
import { currentContent, currentVersion, newId, sameContent, withNewVersion } from '../domain/recipe';
import { recordSavings, type BonSavings } from '../domain/savings';
import { addBon, bonFromImport, dropDayPrices, editBonLine, includeBonLine, sameBonOf, withdrawBonStock, dropUnsavedDay, type BonLine, type BonLinePatch } from '../domain/bons';
import type { PriceEntry } from '../domain/cost';
import { assignPrices, moveSort } from '../domain/sortRefs';
import { doneParts, forParts, partLabel, partsOf, remainingContent } from '../domain/parts';
import { withCategory, type FoodCategory } from '../domain/categories';
import { relinkOldImport, renameFood, syncProductNames } from '../domain/renameFood';
import { specialDays, type ShelfDays } from '../domain/shelfLife';
import { withSpices, zeroOf } from '../domain/nutrition/noNutrition';
import { DEFAULT_MACRO_GOAL, withFavorite, type MacroGoal } from '../domain/nutrition/variants';
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
let productsPending = 0;
/** Ein Neuladen wurde übersprungen, weil noch gespeichert wurde → danach nachholen. */
let reloadMissed = false;
/** Letzter Speicherfehler (z. B. Speicher voll). Wird beim nächsten erfolgreichen Speichern gelöscht. */
let saveError: string | null = null;
/** Nach „Gekocht“: „Wie viele Portionen sind übrig?“ – null = keine Frage offen */
let leftoverAsk: LeftoverAsk | null = null;
/** zuletzt angelegte Reste je Rezept – „Rückgängig“ nach dem Kochen nimmt sie wieder weg */
const leftoverOf = new Map<string, string>();

function dropLeftover(recipeId: string) {
  const id = leftoverOf.get(recipeId);
  leftoverOf.delete(recipeId);
  if (id && pantry.items.some((x) => x.id === id)) commitPantry({ ...pantry, items: pantry.items.filter((x) => x.id !== id) });
}
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Jeder Speichervorgang meldet sich hier zurück – so bleibt ein Fehler nicht nur in der Konsole. */
function tracked<T>(p: Promise<T>): Promise<T | void> {
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
  const base = recipes.find((r) => r.id === next.id);
  recipes = base ? recipes.map((r) => (r.id === next.id ? next : r)) : [next, ...recipes];
  emit();
  pending.set(next.id, (pending.get(next.id) ?? 0) + 1);
  // base = der Stand, den wir geändert haben – so wird eine Änderung vom anderen Gerät nicht überschrieben
  tracked(repo.save(next, base))
    .then((stored) => {
      // Zusammengeführt (anderes Gerät hat inzwischen auch geändert) → das anzeigen, falls hier nichts Neueres kam
      if (stored && stored !== next && recipes.some((r) => r === next)) {
        recipes = recipes.map((r) => (r === next ? stored : r));
        emit();
      }
    })
    .finally(() => {
      const n = (pending.get(next.id) ?? 1) - 1;
      if (n > 0) pending.set(next.id, n);
      else pending.delete(next.id);
      catchUpReload();
    });
}

function get(id: string): Recipe {
  const r = recipes.find((x) => x.id === id);
  if (!r) throw new Error(`Rezept ${id} nicht gefunden`);
  return r;
}

const now = () => new Date().toISOString();

/** Auch Beschreibung, Tags usw. zählen – diffContent listet nur die „sichtbaren“ Kochänderungen. */

export async function initStore(r: RecipeRepository) {
  repo = r;
  let loaded: MealPlan;
  [recipes, products, loaded, pantry] = await Promise.all([repo.list(), repo.loadProducts(), repo.loadPlan(), repo.loadPantry()]);
  plan = normalizePlan(loaded);
  ready = true;
  emit();
  normalizePacks();
  normalizeStages();
  normalizeNames();
  repo.onExternalChange?.(scheduleReload);
}

/** Änderungen von anderen Geräten: kurz sammeln (ein Abgleich bringt oft viele auf einmal), dann neu laden. */
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    let loaded;
    if (planPending || pantryPending || productsPending || pending.size) reloadMissed = true;
    try {
      loaded = await Promise.all([repo.list(), repo.loadProducts(), repo.loadPlan(), repo.loadPantry()]);
    } catch (e) {
      console.error('Mashi: Änderungen vom anderen Gerät ließen sich nicht laden', e);
      saveError = 'Änderungen von deinem anderen Gerät ließen sich nicht laden. Lade die Seite bitte neu.';
      emit();
      return;
    }
    const [fresh, freshProducts, freshPlan, freshPantry] = loaded;
    if (!productsPending) products = freshProducts;
    if (!planPending) plan = normalizePlan(freshPlan);
    if (!pantryPending) pantry = freshPantry;
    const inMemory = new Map(recipes.map((r) => [r.id, r]));
    recipes = fresh.map((r) => (pending.has(r.id) ? inMemory.get(r.id) ?? r : r));
    for (const id of pending.keys()) if (!fresh.some((r) => r.id === id) && inMemory.has(id)) recipes.unshift(inMemory.get(id)!);
    emit();
    if (!planPending) tidyRestockChecks();
  }, 300);
}

/** Nach dem letzten laufenden Speichern ein übersprungenes Neuladen nachholen – sonst bliebe die Anzeige alt. */
function catchUpReload() {
  if (!reloadMissed || planPending || pantryPending || productsPending || pending.size) return;
  reloadMissed = false;
  scheduleReload();
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

/**
 * Namen im Vorrat (ohne Aufgebrauchtes) – für „frische Petersilie im Haus?“ bei den Gewürzen. Dieselbe Liste,
 * solange sich nur Mengen ändern: sonst entstünde bei jedem Abziehen eine neue Tabelle und alles rechnete neu.
 */
let stockCache: { items: PantryItem[]; names: string[] } | null = null;
export function currentStock(): string[] {
  if (stockCache?.items === pantry.items) return stockCache.names;
  const names = [...new Set(pantry.items.filter((i) => i.amount === undefined || i.amount > 0).map((i) => i.name))].sort();
  stockCache = { items: pantry.items, names: stockCache && stockCache.names.join('|') === names.join('|') ? stockCache.names : names };
  return stockCache.names;
}
export const useStock = (): string[] => useSyncExternalStore(subscribe, currentStock);

/**
 * Die Lebensmitteltabelle mit meinen Produkten und Gewürzen – überall dieselbe, damit „Mein Pesto“ auf jedem
 * Bildschirm gleich erkannt wird und „Petersilie“ (Bund) nie mit „Petersilie getrocknet“ (Gewürz) verwechselt wird.
 * Gleiche Produkte, Gewürze und Vorrats-Namen → dieselbe Tabelle.
 */
let spiced: { base: FoodTable; zero: string[]; stock: string[]; table: FoodTable } | null = null;
export function currentFoodTable(): FoodTable {
  const base = withMyProducts(foodTable, products);
  const zero = zeroOf(pantry);
  const stock = currentStock();
  if (spiced?.base !== base || spiced.zero !== zero || spiced.stock !== stock) spiced = { base, zero, stock, table: withSpices(base, zero, { stock }) };
  return spiced.table;
}

/** Dasselbe für die Oberfläche – neu, sobald sich Produkte, Gewürze oder die Namen im Vorrat ändern */
export function useFoodTable(): FoodTable {
  return useSyncExternalStore(subscribe, currentFoodTable);
}

/** Für Berechnungen außerhalb von React (z. B. Nährwerte auf den Rezeptkarten). */
export function currentProducts(): MyProduct[] {
  return products;
}

/** „Ohne Nährwerte“ – stabile Referenz, solange sich die Liste nicht ändert (für den Nährwert-Cache). */
export function currentNoNutrition(): string[] {
  return zeroOf(pantry);
}

export function useNoNutrition(): string[] {
  return useSyncExternalStore(subscribe, currentNoNutrition);
}

/** Makro-Ziel (Anteil an den Kalorien) – schlägt beim Planen/Kochen die passendere Sorte vor */
export function currentMacroGoal(): MacroGoal {
  return pantry.macroGoal ?? DEFAULT_MACRO_GOAL;
}

export function useMacroGoal(): MacroGoal {
  return useSyncExternalStore(subscribe, currentMacroGoal);
}

export function currentPantry(): Pantry {
  return pantry;
}

export function usePlan(): MealPlan {
  return useSyncExternalStore(subscribe, () => plan);
}

export function usePantry(): Pantry {
  return useSyncExternalStore(subscribe, () => pantry);
}

export interface LeftoverAsk {
  recipeId: string;
  title: string;
  servings: number;
  /** im Wochenplan gekocht → „Gekocht“ zurücknehmen nimmt die Reste wieder weg */
  planned: boolean;
  /** so gekocht – die Reste rechnen ihre Nährwerte damit */
  amounts?: Record<string, number>;
  variants?: Record<string, string>;
}

/** für Tests und Nicht-React-Code */
export const currentLeftoverAsk = () => leftoverAsk;

export function useLeftoverAsk(): LeftoverAsk | null {
  return useSyncExternalStore(subscribe, () => leftoverAsk);
}

function askLeftover(r: Recipe, servings: number, planned: boolean, amounts: Record<string, number> = {}, variants?: Record<string, string>) {
  if (servings <= 1) return; // eine Portion gekocht – bleibt nichts übrig
  leftoverAsk = { recipeId: r.id, title: currentContent(r).title, servings, planned, amounts, ...(variants ? { variants } : {}) };
  emit();
}

/** Antwort auf „Wie viele Portionen sind übrig?“ – als Vorgekochtes in die Speisekammer (0 = nichts). */
export function answerLeftover(portions: number) {
  const ask = leftoverAsk;
  leftoverAsk = null;
  emit();
  if (!ask || !(portions > 0)) return;
  const { items, item } = addPrepared(pantry.items, { id: ask.recipeId, title: ask.title }, portions, now(), () => newId('v'),
    { servings: ask.servings, amounts: ask.amounts, variants: ask.variants });
  if (item) leftoverOf.set(ask.recipeId, item.id);
  // im Plan gekocht: beim Zurücknehmen von „Gekocht“ verschwinden die Reste wieder (wie Angebrochenes)
  const log = ask.planned && plan.cooked.includes(ask.recipeId) && item
    ? { cookLog: { ...pruneCookLog(pantry.cookLog), [ask.recipeId]: [...(pantry.cookLog?.[ask.recipeId] ?? []), { item, created: true }] } }
    : {};
  commitPantry({ ...pantry, items, ...log });
}

/** Vorgekochtes gegessen (Standard 1 Portion) – gibt „Rückgängig“ zurück. */
export function eatPreparedPortions(id: string, portions = 1): () => void {
  const before = pantry.items.find((x) => x.id === id);
  commitPantry({ ...pantry, items: eatPrepared(pantry.items, id, portions) });
  return () => {
    if (!before) return;
    const now = pantry.items.find((x) => x.id === id);
    commitPantry({ ...pantry, items: now ? pantry.items.map((x) => (x.id === id ? { ...x, amount: Math.round(((x.amount ?? 0) + portions) * 10) / 10 } : x)) : [...pantry.items, before] });
  };
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
const sameDay = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date(now()).toDateString();

/** „zuletzt gekocht“ auf jetzt – das Datum davor bleibt gemerkt (zweimal am selben Tag: das von vorher) */
function stampCooked(r: Recipe): Recipe {
  const previousCookedAt = sameDay(r.lastCookedAt) ? r.previousCookedAt : r.lastCookedAt;
  const { previousCookedAt: _p, lastCookedAt: _l, ...rest } = r;
  return { ...rest, lastCookedAt: now(), ...(previousCookedAt ? { previousCookedAt } : {}) };
}

/** „zuletzt gekocht“ wieder wie in before – für „Rückgängig“ und „Heute gekocht“ zurücknehmen */
function unstampCooked(cur: Recipe, before: Pick<Recipe, 'lastCookedAt' | 'previousCookedAt'>): Recipe {
  const { previousCookedAt: _p, lastCookedAt: _l, ...rest } = cur;
  return { ...rest, ...(before.lastCookedAt ? { lastCookedAt: before.lastCookedAt } : {}), ...(before.previousCookedAt ? { previousCookedAt: before.previousCookedAt } : {}) };
}

export function markCooked(id: string, servings?: number, amounts: Record<string, number> = {}, variants?: Record<string, string>): CookedResult {
  const r = get(id);
  commit(stampCooked(r));
  const planned = plan.items.find((i) => i.recipeId === id);
  if (planned && plan.cooked.includes(id)) return { used: [], toCheck: [], undo: () => commit(unstampCooked(get(id), r)) };
  if (planned) commitPlan(toggleCooked(plan, id, true));
  const cookedServings = servings ?? planned?.servings ?? currentContent(r).servings;
  // immer mitschreiben, was genommen wurde – auch ohne Plan lässt sich „Heute gekocht“ so später zurücknehmen
  const result = consume(r, cookedServings, amounts, true, variants ?? planned?.variants);
  askLeftover(r, cookedServings, !!planned, amounts, variants ?? planned?.variants);
  return {
    ...result,
    undo: () => {
      result.undo?.();
      dropLeftover(id);
      if (planned && plan.cooked.includes(id)) commitPlan({ ...plan, cooked: plan.cooked.filter((x) => x !== id) });
      commit(unstampCooked(get(id), r));
    },
  };
}

/**
 * „Heute gekocht“ zurücknehmen – für Gerichte, die nicht im Wochenplan stehen (dort ist es der Haken):
 * Genommenes kommt zurück, „zuletzt gekocht“ wieder wie vorher, die Frage „Was ist übrig?“ fällt weg.
 */
export function uncookRecipe(id: string): CookedResult | null {
  const r = get(id);
  if (!sameDay(r.lastCookedAt)) return null;
  if (leftoverAsk?.recipeId === id) {
    leftoverAsk = null;
    emit();
  }
  dropLeftover(id);
  const taken = pantry.cookLog?.[id];
  if (taken?.length) putBack(id, taken);
  commit(unstampCooked(r, { lastCookedAt: r.previousCookedAt }));
  return { used: [], toCheck: [], restored: [...new Set((taken ?? []).filter((t) => !t.created).map((t) => t.item.name))] };
}

/**
 * Zutaten abziehen. undo legt genau das Genommene zurück. log = im Wochenplan abgehakt →
 * merken, damit auch späteres Zurücknehmen des Hakens die Zutaten zurückbringt.
 */
function consume(r: Recipe, servings: number, amounts: Record<string, number> = {}, log = false, variants: Record<string, string> = {}): CookedResult {
  if (!pantry.items.length) return { used: [], toCheck: [] };
  const before = pantry;
  // schon fertige Teile (die Sauce von gestern): nur noch der Rest – und die gelagerte Sauce ist jetzt verbraucht
  const done = doneParts(pantry.items, r.id);
  const d = deductRecipe(pantry, remainingContent(currentContent(r), done), servings, currentFoodTable(), amounts, variants);
  const after = done.length ? { ...d.pantry, items: d.pantry.items.filter((it) => !(it.recipeId === r.id && it.part)) } : d.pantry;
  if (!d.used.length && !d.toCheck.length && !done.length) return { used: [], toCheck: [] };
  const taken = takenBetween(before, after);
  commitPantry(log ? { ...after, cookLog: { ...pruneCookLog(after.cookLog), [r.id]: taken } } : after);
  return { used: d.used, toCheck: d.toCheck, undo: () => putBack(r.id, taken) };
}

/**
 * Nur Teile kochen (Julia: „Sauce gestern, Nudeln und Fleisch heute frisch“): ihre Zutaten gehen aus dem Vorrat, jeder
 * Teil steht als Vorgekocht in der Speisekammer („Sauce für Lasagne“), bis der Rest gekocht ist. Wird das Gericht damit
 * fertig (alle übrigen Teile schon da), ist es ein ganz normales „Gekocht“ (markCooked).
 */
export function cookParts(id: string, parts: readonly string[], servings?: number, amounts: Record<string, number> = {}, variants?: Record<string, string>): CookedResult & { stored: string[] } {
  const r = get(id);
  const c = currentContent(r);
  const all = partsOf(c);
  const done = doneParts(pantry.items, id);
  if (!all.length || all.every((p) => parts.includes(p) || done.includes(p))) return { ...markCooked(id, servings, amounts, variants), stored: [] };
  const planned = plan.items.find((i) => i.recipeId === id);
  const cookedServings = servings ?? planned?.servings ?? c.servings;
  const pick = variants ?? planned?.variants ?? {};
  const before = pantry;
  const d = pantry.items.length ? deductRecipe(pantry, forParts(c, parts), cookedServings, currentFoodTable(), amounts, pick) : { pantry, used: [], toCheck: [] };
  const taken = takenBetween(before, d.pantry);
  let items = d.pantry.items;
  const created: string[] = [];
  const stored: string[] = [];
  for (const p of parts.filter((x) => !done.includes(x))) {
    const title = `${partLabel(p)} für ${c.title}`;
    const add = addPrepared(items, { id, title }, cookedServings, now(), () => newId('v'), { servings: cookedServings, amounts, variants: pick }, p);
    items = add.items;
    if (add.item) { created.push(add.item.id); stored.push(title); }
  }
  commitPantry({ ...d.pantry, items });
  return {
    used: d.used, toCheck: d.toCheck, stored,
    // genau das Genommene zurück, die gelagerten Teile wieder weg – sonst bleibt, was sich inzwischen geändert hat
    undo: () => { const back = returnTaken(pantry, taken); commitPantry({ ...back, items: back.items.filter((it) => !created.includes(it.id)) }); },
  };
}

/** Genommenes zurücklegen und den Merkzettel dafür löschen. */
function putBack(recipeId: string, taken: Taken[]) {
  const { [recipeId]: _done, ...rest } = pantry.cookLog ?? {};
  const back = returnTaken(pantry, taken);
  commitPantry(Object.keys(rest).length ? { ...back, cookLog: rest } : withoutCookLog(back));
}

/** Nur Einträge für Gerichte behalten, die im Plan noch als gekocht gelten – oder heute gekocht wurden (zurücknehmbar). */
function pruneCookLog(log: Pantry['cookLog']): Record<string, Taken[]> {
  return Object.fromEntries(Object.entries(log ?? {}).filter(([id]) => plan.cooked.includes(id) || sameDay(recipes.find((x) => x.id === id)?.lastCookedAt)));
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
  // Während das Bild entsteht, kann das Rezept gelöscht werden (oder ein anderes Kochbuch geladen) –
  // dann gibt es nichts mehr zu bebildern. Vorher warf get() hier „nicht gefunden“ ins Leere (im CI rot).
  const r = recipes.find((x) => x.id === id);
  if (r) commit({ ...r, image, updatedAt: now() });
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
/** Speisekammer aus einer Sicherung: mit dem heutigen Stand vereinen, nichts wird gelöscht */
export function importPantry(incoming: Pantry) {
  commitPantry(unionPantry(pantry, incoming));
}

/** Wochenplan aus einer Sicherung: vereinen (Gerichte, Haken, eigene Einträge) */
export function importPlan(incoming: MealPlan) {
  commitPlan(unionPlan(plan, normalizePlan(incoming)));
}

export function importProducts(incoming: MyProduct[]): number {
  if (!incoming.length) return 0;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  saveProducts([...byId.values()]);
  return incoming.length;
}

/**
 * Neues Produkt speichern – gibt es das Lebensmittel bisher nur ohne Werte, füllt sich dessen Sorte (siehe fillOrAdd).
 * @param forName unter diesem Namen gesucht (die Zutat im Rezept, der Name im Vorrat)
 */
export function addProduct(p: MyProduct, forName = p.name): MyProduct {
  const all = currentProducts();
  const { products: next, saved } = fillOrAdd(all, p, productsFor(forName, currentFoodTable(), all));
  saveProducts(next);
  return saved;
}

/**
 * „Meine Produkte“ speichern. Danach bekommt die Rezeptliste bewusst eine NEUE Identität
 * (gleiche Rezepte): So rechnen auch alle Rezeptkarten ihre Nährwerte neu.
 */
export function saveProducts(next: MyProduct[]) {
  const base = products;
  products = next;
  recipes = [...recipes];
  emit();
  // Packungsgröße neu eingetragen → vorhandener Vorrat zählt ab jetzt in Packungen
  normalizePacks();
  // umbenannt → der Vorrat dieser Sorte heißt mit
  normalizeNames();
  productsPending++;
  void tracked(repo.saveProducts(next, base))
    .then((stored) => {
      if (stored && stored !== next && products === next) {
        products = stored;
        recipes = [...recipes];
        emit();
      }
    })
    .finally(() => { productsPending--; catchUpReload(); });
}

// ── Wochenplan ─────────────────────────────────────────────────────

function commitPlan(next: Omit<MealPlan, 'updatedAt'>) {
  const base = plan;
  const saved = { ...next, updatedAt: now() };
  plan = saved;
  emit();
  tidyRestockChecks();
  planPending++;
  void tracked(repo.savePlan(saved, base))
    .then((stored) => {
      if (stored && stored !== saved && plan === saved) {
        plan = normalizePlan(stored);
        emit();
      }
    })
    .finally(() => { planPending--; catchUpReload(); });
}

/** Gibt false zurück, wenn das Rezept schon im Plan steht. */
export function addToPlan(recipeId: string, servings = currentContent(get(recipeId)).servings, variants: Record<string, string> = {}, amounts: Record<string, number> = {}): boolean {
  if (plan.items.some((i) => i.recipeId === recipeId)) return false;
  commitPlan({ ...plan, items: [...plan.items, { recipeId, servings, ...(Object.keys(variants).length ? { variants } : {}), ...(Object.keys(amounts).length ? { amounts } : {}) }] });
  return true;
}

/** Welche Sorte ein geplantes Gericht nimmt (z. B. welches Pesto) – auf der Plan-Karte umwählbar */
export function setPlanVariants(recipeId: string, variants: Record<string, string>) {
  commitPlan({ ...plan, items: plan.items.map((i) => (i.recipeId === recipeId ? { ...i, variants } : i)) });
}

/**
 * „Nur dieses Mal“-Mengen eines geplanten Gerichts ändern (Julia: im Wochenplan und im Kochmodus anpassbar) –
 * leer = wieder wie im Rezept. Die Reservierung in der Speisekammer rechnet sofort damit.
 */
export function setPlanAmounts(recipeId: string, amounts: Record<string, number>) {
  const item = plan.items.find((i) => i.recipeId === recipeId);
  if (!item || JSON.stringify(item.amounts ?? {}) === JSON.stringify(amounts)) return;
  commitPlan({ ...plan, items: plan.items.map((i) => (i.recipeId === recipeId ? (({ amounts: _a, ...rest }) => (Object.keys(amounts).length ? { ...rest, amounts } : rest))(i) : i)) });
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
  // „nur dieses Mal“-Mengen gelten für die alten Portionen – bei anderen Portionen fallen sie weg
  commitPlan({ ...plan, items: plan.items.map((i) => (i.recipeId === recipeId ? (({ amounts: _a, ...rest }) => ({ ...rest, servings }))(i) : i)) });
}

// ── Eigene Einträge auf der Einkaufsliste ──────────────────────────

const sameExtra = (a: string, b: string) => normalizeName(a) === normalizeName(b);

/** Selbst getippt („Spülmittel“) oder aus der Inventur („auffüllen“) – doppelt wird nichts. */
export function addExtra(name: string, source?: 'inventur') {
  const n = name.trim();
  if (!n || (plan.extra ?? []).some((x) => sameExtra(x.name, n))) return;
  commitPlan({ ...plan, extra: [...(plan.extra ?? []), { name: n, addedAt: now(), ...(source ? { source } : {}) }] });
}

export function removeExtra(name: string) {
  commitPlan({ ...plan, extra: (plan.extra ?? []).filter((x) => !sameExtra(x.name, name)) });
}

/** „Erledigtes entfernen“: abgehakte eigene Einträge von der Liste – gibt „Rückgängig“ zurück. */
/**
 * „Abgehaktes entfernen“ (Julia): eigene Einträge, die abgehakt sind, fliegen raus; abgehakte Sachen vom Wochenplan
 * verschwinden von der Liste (bleiben abgehakt). „Rückgängig“ holt alles zurück.
 */
export function clearChecked(): () => void {
  const before = { extra: plan.extra, checked: plan.checked, hidden: plan.hidden };
  clearDoneExtras();
  const fromPlan = plan.checked.filter((k) => !k.startsWith(EXTRA_PREFIX));
  if (fromPlan.length) commitPlan({ ...plan, hidden: [...new Set([...(plan.hidden ?? []), ...fromPlan])] });
  return () => {
    const { hidden: _h, ...rest } = plan;
    commitPlan({ ...rest, extra: before.extra, checked: before.checked, ...(before.hidden ? { hidden: before.hidden } : {}) });
  };
}

export function clearDoneExtras(): () => void {
  const before = { extra: plan.extra, checked: plan.checked };
  const table = currentFoodTable();
  const done = shoppingList(plan, recipes, table, pantry, products).filter((i) => i.extra && plan.checked.includes(i.key));
  const doneKeys = new Set(done.map((i) => i.key));
  const keyOf = (n: string) => keyOfName(n, table);
  const extra = (plan.extra ?? []).filter((x) => !doneKeys.has(EXTRA_PREFIX + normalizeName(x.name)) && !doneKeys.has(keyOf(x.name) ?? ''));
  commitPlan({ ...plan, extra, checked: plan.checked.filter((k) => !(k.startsWith(EXTRA_PREFIX) && doneKeys.has(k))) });
  return () => commitPlan({ ...plan, extra: before.extra, checked: before.checked });
}

// ── Inventur ───────────────────────────────────────────────────────

export interface InventoryChanges {
  /** neue Menge je Vorrat (in seiner Einheit; bei Packungen die Zahl der Packungen) – 0 = aufgebraucht */
  amounts: Record<string, number>;
  /** weg (aufgebraucht, weggeworfen) */
  remove: string[];
  /** Immer im Haus / Gewürze: auffüllen → auf die Einkaufsliste */
  refill: string[];
  /** Einheit für Vorräte, die bisher nur „vorhanden“ waren (sonst hieße „3“ nichts) */
  units?: Record<string, PantryUnit>;
}

/** Inventur übernehmen – alles auf einmal, mit „Rückgängig“. */
export function applyInventory(c: InventoryChanges): () => void {
  // nur die angefassten Vorräte merken – „Rückgängig“ soll nicht überschreiben, was inzwischen kam (Bon, anderes Gerät)
  const touched = pantry.items.filter((it) => c.remove.includes(it.id) || c.amounts[it.id] !== undefined);
  const hadExtra = new Set((plan.extra ?? []).map((x) => normalizeName(x.name)));
  const items = pantry.items.flatMap((it) => {
    if (c.remove.includes(it.id)) return [];
    const a = c.amounts[it.id];
    if (a === undefined) return [it];
    const unit = it.unit ?? c.units?.[it.id];
    return a > 0 ? [{ ...it, amount: a, ...(unit ? { unit } : {}), check: false }] : [];
  });
  if (touched.length) commitPantry({ ...pantry, items });
  for (const n of c.refill) addExtra(n, 'inventur');
  const added = c.refill.filter((n) => !hadExtra.has(normalizeName(n)));
  return () => {
    const back = new Map(touched.map((it) => [it.id, it]));
    const kept = pantry.items.map((it) => back.get(it.id) ?? it);
    const missing = touched.filter((it) => !pantry.items.some((x) => x.id === it.id));
    commitPantry({ ...pantry, items: [...kept, ...missing] });
    if (added.length) commitPlan({ ...plan, extra: (plan.extra ?? []).filter((x) => !added.some((n) => sameExtra(n, x.name))) });
  };
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
 * Zutaten gehen aus der Speisekammer. Zurücknehmen legt das Genommene wieder hinein (Merkzettel cookLog).
 */
export function togglePlanCooked(recipeId: string): CookedResult | null {
  const next = toggleCooked(plan, recipeId);
  if (next === plan) return null;
  commitPlan(next);
  if (!next.cooked.includes(recipeId)) {
    // doch nicht gekocht → auch die Frage „Was ist übrig?“ ist hinfällig (sie blieb sonst offen stehen)
    if (leftoverAsk?.recipeId === recipeId) {
      leftoverAsk = null;
      emit();
    }
    // am selben Tag zurückgenommen → „zuletzt gekocht“ wieder wie vorher
    const cur = get(recipeId);
    if (sameDay(cur.lastCookedAt)) commit(unstampCooked(cur, { lastCookedAt: cur.previousCookedAt }));
    // Haken zurückgenommen → was „Gekocht“ genommen hatte, kommt zurück
    const taken = pantry.cookLog?.[recipeId];
    if (!taken?.length) return null;
    putBack(recipeId, taken);
    // Reste, die beim Kochen entstanden, verschwinden wieder – sie sind kein „Zurückgelegtes“
    const restored = [...new Set(taken.filter((t) => !t.created).map((t) => t.item.name))];
    return { used: [], toCheck: [], restored };
  }
  const r = get(recipeId);
  commit(stampCooked(r));
  const item = next.items.find((i) => i.recipeId === recipeId)!;
  const result = consume(r, item.servings, item.amounts ?? {}, true, item.variants);
  askLeftover(r, item.servings, true, item.amounts ?? {}, item.variants);
  return {
    ...result,
    undo: () => {
      result.undo?.();
      dropLeftover(recipeId);
      if (plan.cooked.includes(recipeId)) commitPlan({ ...plan, cooked: plan.cooked.filter((x) => x !== recipeId) });
      commit(unstampCooked(get(recipeId), r));
    },
  };
}

/**
 * Gekochte Gerichte aus dem Plan nehmen – Geplantes bleibt, Vorgekochtes bleibt in der Speisekammer.
 * (Ersetzt „Neue Woche beginnen“: der Plan läuft einfach weiter, auch übers Wochenende hinaus.)
 */
export function clearCooked() {
  const cooked = new Set(plan.cooked);
  if (!cooked.size) return;
  commitPlan({ ...plan, items: plan.items.filter((i) => !cooked.has(i.recipeId)), cooked: [] });
  // das Zurücklegen dieser Gerichte ist erledigt
  if (pantry.cookLog) {
    const rest = Object.fromEntries(Object.entries(pantry.cookLog).filter(([id]) => !cooked.has(id)));
    commitPantry(Object.keys(rest).length ? { ...pantry, cookLog: rest } : withoutCookLog(pantry));
  }
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
  const base = pantry;
  const saved = { ...next, updatedAt: now() };
  pantry = saved;
  emit();
  tidyRestockChecks();
  pantryPending++;
  // base = der Stand, den wir geändert haben: kam inzwischen ein Bon vom Handy, bleibt er erhalten
  void tracked(repo.savePantry(saved, base))
    .then((stored) => {
      if (stored && stored !== saved && pantry === saved) {
        pantry = stored;
        emit();
      }
    })
    .finally(() => { pantryPending--; catchUpReload(); });
}

/**
 * Geprüfte Bon-Zeilen übernehmen – und merken, damit der nächste Bon schon ausgefüllt ist. onList = wie viele Einträge der Einkaufsliste damit erledigt sind:
 * Was jetzt reicht, steht dort unter „Hast du schon“; was ohne Menge kam, wird abgehakt.
 * Hast du zu wenig gekauft, bleibt der Rest auf der Liste.
 */
export function importReceipt(rows: ImportRow[], paidAt?: string, savings?: BonSavings, opts: { replace?: boolean; historyOnly?: boolean } = {}): { count: number; onList: number } {
  const t = now();
  const key = bonKey(paidAt, savings?.total);
  // alten Import ersetzen: Preise dieses Tages neu, der Vorrat ist schon da (kommt nicht doppelt)
  // … und die Vorräte vom ersten Einlesen bekommen die neue Zuordnung (Name, Sorte)
  // derselbe Einkauf schon als Bon gespeichert (Endbetrag anders gelesen)? Der fällt weg – der neue ersetzt ihn
  const old = opts.replace ? sameBonOf(pantry, paidAt ?? t, rows) : undefined;
  const base = old ? { ...pantry, bons: (pantry.bons ?? []).filter((b) => b.id !== old.id) } : pantry;
  const start = opts.replace ? relinkOldImport(dropDayPrices(base, paidAt ?? t, key), rows) : pantry;
  const next = rememberReceipt(applyImport(start, rows, t, () => newId('v'), paidAt ?? t, { stock: !opts.replace && !opts.historyOnly }), key);
  // den Bon selbst aufheben (nur die Zeilen) – zum Nachsehen und Korrigieren unter „Preise“;
  // nur für den Verlauf (alter Bon, Julia): ohne Vorrat – Korrekturen ändern dann nur Preise
  const bon = bonFromImport(rows, paidAt ?? t, t, newId('b'), key, savings);
  const kept = addBon(next, opts.historyOnly ? { ...bon, noStock: true } : bon);
  commitPantry(savings ? recordSavings(kept, savings, paidAt ?? t) : kept);
  normalizeNames();
  // ersetzt (die Einkaufsliste hat der erste Import schon abgehakt) oder nur für den Verlauf: Liste bleibt
  if (opts.replace || opts.historyOnly) return { count: rows.filter((r) => !r.skip).length, onList: 0 };

  const table = currentFoodTable();
  const bought = new Set(rows.filter((r) => !r.skip).map((r) => keyOfName(r.name, table)));
  // mit Nachkaufen: was darunter bleibt, zählt nicht als „erledigt“
  const list = shoppingList(plan, recipes, table, pantry, products).filter((i) => bought.has(i.key) && !plan.checked.includes(i.key));
  const tick = list.filter((i) => !i.covered && i.have === 'vorhanden').map((i) => i.key);
  if (tick.length) commitPlan({ ...plan, checked: [...plan.checked, ...tick] });
  // eigene Einträge, die auf dem Bon stehen, sind gekauft → von der Liste
  const boughtExtra = (plan.extra ?? []).filter((x) => bought.has(keyOfName(x.name, table)));
  if (boughtExtra.length) commitPlan({ ...plan, extra: (plan.extra ?? []).filter((x) => !boughtExtra.includes(x)) });
  return { count: rows.filter((r) => !r.skip).length, onList: list.filter((i) => i.covered).length + tick.length };
}

/**
 * Zeile eines gespeicherten Bons korrigieren – Vorrat, Preisverlauf, Ersparnis und das Gelernte ziehen mit.
 * „Rückgängig“ ist dieselbe Änderung zurück (auf den alten Stand der Zeile).
 */
export function editBon(bonId: string, index: number, patch: BonLinePatch): () => void {
  const old = pantry.bons?.find((b) => b.id === bonId)?.lines[index];
  if (!old) return () => {};
  commitPantry(editBonLine(pantry, bonId, index, patch, now(), () => newId('v')));
  return () => {
    const back: Record<keyof BonLinePatch, unknown> = { name: old.name, amount: old.amount, unit: old.unit, productId: old.productId, price: old.price, discounts: old.discounts ?? [], count: old.count, weightKg: old.weightKg, perKg: old.perKg };
    commitPantry(editBonLine(pantry, bonId, index, back as Partial<BonLine>, now(), () => newId('v')));
  };
}

/**
 * Übersprungene Bon-Zeile nachträglich aufnehmen (siehe includeBonLine). „Rückgängig“ gleich danach (Toast):
 * Bon, Gelerntes und Preise zurück – und der Vorrat, falls die Zeile dort eingebucht wurde.
 */
export function includeBon(bonId: string, index: number, patch: BonLinePatch, toStock: boolean): () => void {
  const before = pantry;
  const next = includeBonLine(pantry, bonId, index, patch, toStock, now(), () => newId('v'));
  if (next === pantry) return () => {};
  commitPantry(next);
  return () => commitPantry({ ...pantry, bons: before.bons, rules: before.rules, history: before.history, prices: before.prices, ...(toStock ? { items: before.items } : {}) });
}

/**
 * Lebensmittel umbenennen – Speisekammer, gelernte Bon-Artikel, Bons, Preise und Stufen ziehen mit (Produkte
 * benennt FoodList selbst um). Gibt „Rückgängig“ zurück: genau die geänderten Einträge zurück.
 */
export function renameFoodEverywhere(from: string, to: string, productIds: readonly string[]): () => void {
  const { pantry: next, undo } = renameFood(pantry, from, to, productIds);
  if (next === pantry) return () => {};
  commitPantry(next);
  return () => commitPantry(undo(pantry));
}

/**
 * Doppelt eingelesener Bon: seine Mengen wieder aus dem Vorrat. „Rückgängig“ legt genau die geänderten
 * Vorräte zurück (andere Änderungen in der Zwischenzeit bleiben).
 */
export function withdrawBon(bonId: string): () => void {
  const before = new Map(pantry.items.map((i) => [i.id, i]));
  const next = withdrawBonStock(pantry, bonId, now());
  if (next === pantry) return () => {};
  const after = new Map(next.items.map((i) => [i.id, i]));
  const touched = [...before.values()].filter((i) => after.get(i.id) !== i);
  commitPantry(next);
  return () => {
    const ids = new Set(touched.map((i) => i.id));
    commitPantry({
      ...pantry,
      items: [...pantry.items.filter((i) => !ids.has(i.id)), ...touched],
      bons: (pantry.bons ?? []).map((b) => (b.id === bonId ? (({ noStock: _n, ...rest }) => ({ ...rest, updatedAt: now() }))(b) : b)),
    });
  };
}

/** Tag ohne gespeicherten Bon aus dem Preisverlauf löschen – „Rückgängig“ legt Preise, Ersparnis und Merker zurück */
export function dropPriceDay(day: string): () => void {
  const before = { history: pantry.history, prices: pantry.prices, savings: pantry.savings, receipts: pantry.receipts };
  const next = dropUnsavedDay(pantry, day);
  if (next === pantry) return () => {};
  commitPantry(next);
  return () => {
    const gone = <T,>(was: T[] | undefined, now: T[] | undefined) => (was ?? []).filter((x) => !(now ?? []).includes(x));
    commitPantry({
      ...pantry,
      history: [...(pantry.history ?? []), ...gone(before.history, next.history)],
      prices: [...pantry.prices.filter((p) => !gone(next.prices, before.prices).includes(p)), ...gone(before.prices, next.prices)],
      ...(before.savings ? { savings: [...(pantry.savings ?? []), ...gone(before.savings, next.savings)] } : {}),
      ...(before.receipts ? { receipts: [...(pantry.receipts ?? []), ...gone(before.receipts, next.receipts)] } : {}),
    });
  };
}

/** Kategorie eines Lebensmittels (überall gleich) – Mashis Vorschlag wählen heißt: wieder automatisch */
export function setCategory(name: string, c: FoodCategory): () => void {
  const before = pantry.categories;
  const table = currentFoodTable();
  const { categories: _old, ...rest } = pantry;
  const next = withCategory(before, name, c, table);
  commitPantry(next ? { ...rest, categories: next } : rest);
  return () => {
    const { categories: _now, ...r } = pantry;
    commitPantry(before ? { ...r, categories: before } : r);
  };
}

export function addPantryItem(name: string, amount?: number, unit?: PantryUnit, productId?: string) {
  if (!name.trim()) return;
  // „3 Stück“ (oder „2 Glas“) von einem Produkt mit Packungsgröße → „3 × 500 g“
  const p = productId ? products.find((x) => x.id === productId) : undefined;
  const pack = (unit === 'Stück' || unit === 'Glas') && p?.packageAmount && (p.packageUnit === 'g' || p.packageUnit === 'ml' || p.packageUnit === undefined)
    ? { amount: p.packageAmount, unit: p.packageUnit ?? 'g' as const } : undefined;
  // mit Sorte heißt der Vorrat wie sie („Meine Lebensmittel“ gibt den Namen vor) – so zählt er mit dem Vorhandenen zusammen
  commitPantry({ ...pantry, items: addItem(pantry.items, { name: p ? nameOf(p) : name.trim(), amount, unit, productId, pack }, now(), () => newId('v')) });
  // „700 g“ von etwas mit Packungsgröße → gleich in Packungen (nicht erst beim nächsten Start)
  normalizePacks();
}

/** Vorräte ohne Packungsgröße, deren Produkt eine hat: einmal umstellen („2⅔ Stück“ → „2 × 500 g“ + „333 g offen“) */
function normalizePacks() {
  if (!pantry.items.length) return;
  const attached = attachPacks(pantry.items, currentFoodTable(), products, now()) ?? pantry.items;
  // … und doppelte Zeilen derselben Packung zusammen („2 × 500 g“ + „2 × 500 g“)
  const items = mergeSamePacks(attached) ?? attached;
  if (items !== pantry.items) commitPantry({ ...pantry, items });
}

/** „Meine Lebensmittel“ gibt den Namen vor: Vorrat, Gelerntes und Bons einer Sorte heißen wie sie */
function normalizeNames() {
  const next = syncProductNames(pantry, products);
  if (next) commitPantry(next);
}

/** Von Hand angebrochen: eine Packung wird zum offenen Rest (hält dann kürzer); take = gleich herausgenommen. */
export function openPantryItem(id: string, take?: number) {
  commitPantry({ ...pantry, items: openItem(pantry.items, id, now(), () => newId('v'), take) });
}

/** Nach der Wahl beim Planen/Kochen: Vorräte ohne Sorte bekommen die gewählte Sorte (Zutat → Produkt) */
export function assignPantrySorts(assign: readonly { itemIds: string[]; productId: string }[]) {
  const to = new Map(assign.flatMap((a) => a.itemIds.map((id) => [id, a.productId] as const)));
  if (!to.size) return;
  // mit der Sorte auch ihr Name – „Meine Lebensmittel“ gibt ihn vor
  const nameOfId = (id: string) => { const p = products.find((x) => x.id === id); return p ? nameOf(p) : undefined; };
  commitPantry({ ...pantry, items: pantry.items.map((i) => (to.has(i.id) ? { ...i, productId: to.get(i.id), name: nameOfId(to.get(i.id)!) ?? i.name } : i)) });
}

/**
 * Sorte entfernen – ihre Einkäufe, Preise und ihr Vorrat gehen zu Sorte „to“ oder werden „ohne Sorte“ (Julia: beim
 * Entfernen fragen). Erst umhängen, dann entfernen: saveProducts benennt den Vorrat nach seiner (neuen) Sorte.
 * „Rückgängig“: erst die Stellen zurück, dann die Sorte – so heißt ihr Vorrat wieder wie sie.
 */
export function removeProduct(id: string, to: string | undefined): () => void {
  const p = products.find((x) => x.id === id);
  if (!p) return () => {};
  const at = products.indexOf(p);
  const { next, undo } = moveSort(pantry, id, to, now());
  commitPantry(next);
  saveProducts(products.filter((x) => x.id !== id));
  return () => {
    commitPantry(undo(pantry));
    const list = products.filter((x) => x.id !== id);
    list.splice(Math.min(at, list.length), 0, p);
    saveProducts(list);
  };
}

/** Ältere Preise ohne Sorte (oder mit einer entfernten) einer Sorte zuordnen – mit „Rückgängig“ */
export function assignPriceSort(entries: readonly PriceEntry[], productId: string): () => void {
  const { next, undo } = assignPrices(pantry, entries, productId, now());
  commitPantry(next);
  return () => commitPantry(undo(pantry));
}

/**
 * Eine Änderung, die Einträge teilen kann (Menge, Anbrechen) – mit „Rückgängig“: neu entstandene Teile
 * weg, der alte Eintrag zurück (wie beim Auftauen). Andere Änderungen in der Zwischenzeit bleiben.
 */
function changeWithUndo(id: string, change: (items: PantryItem[]) => PantryItem[]): () => void {
  const before = pantry.items.find((i) => i.id === id);
  const known = new Set(pantry.items.map((i) => i.id));
  commitPantry({ ...pantry, items: change(pantry.items) });
  const split = pantry.items.filter((i) => !known.has(i.id)).map((i) => i.id);
  return () => {
    if (!before) return;
    const items = pantry.items.filter((i) => !split.includes(i.id)).map((i) => (i.id === id ? before : i));
    commitPantry({ ...pantry, items: items.some((i) => i.id === id) ? items : [...items, before] });
  };
}

export type AmountResult = 'alle' | 'angebrochen' | 'geändert';

/**
 * Menge von Hand: weniger heißt meistens angebrochen (siehe changeAmount), 0 = alle.
 * „alle“ nur, wenn weder der Eintrag noch ein neuer Teil übrig ist – die letzte Packung anzubrechen
 * macht aus „1 × 500 g“ einen offenen Rest mit NEUER ID, der alte Eintrag fällt weg (war der Fehler:
 * Joghurt angebrochen, Meldung „ist alle“).
 */
export function setPantryAmount(id: string, amount: number): { undo: () => void; result: AmountResult } {
  const wasOpen = !!pantry.items.find((i) => i.id === id)?.openedAt;
  const known = new Set(pantry.items.map((i) => i.id));
  const undo = changeWithUndo(id, (items) => changeAmount(items, id, amount, now(), () => newId('v')));
  // was von diesem Vorrat übrig ist: der Eintrag selbst und neu entstandene Teile (offener Rest)
  const left = pantry.items.filter((i) => i.id === id || !known.has(i.id));
  const result: AmountResult = !left.length ? 'alle' : !wasOpen && left.some((i) => i.openedAt) ? 'angebrochen' : 'geändert';
  return { undo, result };
}

export function updatePantryItem(id: string, patch: Partial<Pick<PantryItem, 'name' | 'amount' | 'unit' | 'useBy' | 'reduced' | 'productId'>>) {
  // Einheit weg von Stück/Glas (z. B. auf g) → die Packungsgröße passt nicht mehr
  const dropPack = (i: PantryItem) => 'unit' in patch && patch.unit !== 'Stück' && patch.unit !== 'Glas' && i.pack;
  commitPantry({ ...pantry, items: pantry.items.map((i) => (i.id === id ? { ...i, ...patch, check: false, ...(dropPack(i) ? { pack: undefined } : {}) } : i)) });
}

/** Einfrieren – ganz oder nur einen Teil (amount in der Einheit des Vorrats). */
export function freezePantryItem(id: string, amount?: number) {
  commitPantry({ ...pantry, items: freezeItem(pantry.items, id, now(), amount, () => newId('v')) });
}

/**
 * Auftauen – hält danach nur noch kurz (einstellbar, Standard 1 Tag).
 * @param amount nur so viele Packungen/Stück (der Rest bleibt gefroren)
 * Gibt „Rückgängig“ zurück: wieder gefroren wie vorher, der abgeteilte Teil verschwindet.
 */
export function thawPantryItem(id: string, amount?: number): () => void {
  return changeWithUndo(id, (items) => thawItem(items, id, now(), specialDays('thawed', pantry.shelfDays), amount, () => newId('v')));
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

/** „Ohne Nährwerte“ – gilt auf allen Geräten; Rezeptkarten neu zeichnen, ihre kcal ändern sich. */
/** Favorit (★) unter den Sorten einer Zutat setzen – null nimmt ihn zurück. Gilt für alle Rezepte. */
export function setFavoriteVariant(group: readonly { id: string }[], favoriteId: string | null) {
  const stamp = now();
  const ids = new Set(group.map((g) => g.id));
  saveProducts(withFavorite(products, group, favoriteId).map((p) => (ids.has(p.id) ? { ...p, updatedAt: stamp } : p)));
}

/** Namensvorschlag ausblenden („Nicht mehr vorschlagen“) – oder mit restore wieder zeigen */
export function dismissRename(key: string, restore = false) {
  const list = pantry.renameDismissed ?? [];
  commitPantry({ ...pantry, renameDismissed: restore ? list.filter((k) => k !== key) : [...new Set([...list, key])] });
}

export function setMacroGoal(goal: MacroGoal) {
  commitPantry({ ...pantry, macroGoal: goal });
}

/** Vorlieben für die KI – leer = keine */
export function setTastes(text: string) {
  const { tastes: _old, ...rest } = pantry;
  const t = text.trim();
  commitPantry(t ? { ...rest, tastes: t } : rest);
}

export function setNoNutrition(names: string[]) {
  commitPantry({ ...pantry, noNutrition: names });
  recipes = [...recipes];
  emit();
}

/** Mindestbestand je Zutat („Nachkaufen unter 4 Stück“) – gilt auf allen Geräten. */
/**
 * Stufe eines Lebensmittels: normal · immer im Haus · nachkaufen unter X – die andere fällt weg.
 * Gibt „Rückgängig“ zurück (stellt genau die vorige Stufe dieses Lebensmittels wieder her).
 */
export function setFoodStage(name: string, stage: FoodStage, rule?: Omit<RestockRule, 'name'>): () => void {
  const table = currentFoodTable();
  const before = stageOf(name, pantry, table);
  commitStages(withStage(pantry, name, stage, table, rule));
  return () => {
    const t = currentFoodTable();
    commitStages(withStage(pantry, before.basic ?? before.zero ?? before.rule?.name ?? name, before.stage, t, before.rule && { below: before.rule.below, unit: before.rule.unit }));
  };
}

/** Stufen speichern – ändert sich „Ohne Nährwerte“, rechnen alle Rezepte neu (wie setNoNutrition) */
function commitStages(next: Partial<Pick<Pantry, 'basics' | 'restock' | 'noNutrition'>>) {
  const zeroChanged = next.noNutrition !== undefined && next.noNutrition.join('|') !== zeroOf(pantry).join('|');
  commitPantry({ ...pantry, ...next });
  if (zeroChanged) {
    recipes = [...recipes];
    emit();
  }
}

/** Einmal beim Start: wo zwei Stufen zugleich galten, gilt die genauere (siehe exclusiveStages). */
function normalizeStages() {
  const fix = exclusiveStages(pantry, currentFoodTable());
  if (fix) commitStages(fix);
}

/**
 * Abgehaktes „Nachkaufen“ wieder freigeben, sobald es reicht (Bon, von Hand eingetragen) –
 * sonst stünde es beim nächsten Mal gleich „Im Wagen“. Rezept-Zutaten bleiben bis zur neuen Woche.
 */
let tidying = false;
function tidyRestockChecks() {
  if (tidying) return;
  // ausgeblendet (Abgehaktes entfernt) gilt nur, solange es abgehakt auf der Liste steht – danach wieder sichtbar
  if (!plan.checked.length) {
    if (plan.hidden?.length) { const { hidden: _h, ...rest } = plan; commitPlan(rest); }
    return;
  }
  tidying = true;
  try {
    const onList = new Set(shoppingList(plan, recipes, currentFoodTable(), pantry, products).map((i) => i.key));
    const next: string[] = [];
    for (const k of plan.checked) {
      if (onList.has(k)) next.push(k);
      else if (k.startsWith(RESTOCK_PREFIX)) {
        // Nachkaufen, und jetzt braucht es auch ein Rezept → der Haken wandert mit (liegt ja schon im Wagen);
        // sonst reicht es wieder → Haken weg
        const plain = k.slice(RESTOCK_PREFIX.length);
        if (onList.has(plain)) next.push(plain);
      } else if (k.startsWith(EXTRA_PREFIX)) {
        // eigener Eintrag, und jetzt braucht ihn auch ein Rezept → der Haken wandert mit
        const plain = keyOfName(k.slice(EXTRA_PREFIX.length), currentFoodTable());
        if (plain && onList.has(plain)) next.push(plain);
      } else if (onList.has(RESTOCK_PREFIX + k)) next.push(RESTOCK_PREFIX + k); // Gericht raus, bleibt als Nachkaufen: Haken mitnehmen
      // sonst steht es nicht mehr auf der Liste (Gericht gekocht oder entfernt) → Haken weg
    }
    const checked = [...new Set(next)];
    const hidden = (plan.hidden ?? []).filter((k) => checked.includes(k));
    const hiddenChanged = hidden.length !== (plan.hidden ?? []).length;
    if (checked.length !== plan.checked.length || checked.some((k, i) => k !== plan.checked[i]) || hiddenChanged) {
      const { hidden: _h, ...rest } = plan;
      commitPlan({ ...rest, checked, ...(hidden.length ? { hidden } : {}) });
    }
  } finally {
    tidying = false;
  }
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
