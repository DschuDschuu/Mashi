import type { MealPlan } from './mealplan';
import type { MyProduct } from './nutrition/myProducts';
import type { Pantry, PantryItem } from './pantry';
import { mergeRecipes } from './merge';
import type { Recipe } from './types';

/**
 * Zusammenführen der Einzel-Dokumente (Speisekammer, Wochenplan, Meine Produkte), wenn zwei
 * Geräte gleichzeitig geändert haben – statt dass eine ganze Fassung die andere überschreibt.
 *
 * Zwei Fälle:
 * - merge3: Wir kennen den Stand, auf dem unsere Änderung beruht (base). Dann ist klar, was WIR
 *   geändert haben (base → ours) – genau das wird auf den neueren Stand (theirs) angewendet.
 *   Mengen in der Speisekammer werden verrechnet: 400 g hier verkocht + 500 g dort gekauft = beides.
 * - union: Offline-Konflikt ohne gemeinsamen Stand. Beide Fassungen werden vereint; bei gleichem
 *   Eintrag gewinnt die neuere. Gelöschtes kann dabei wieder auftauchen – lieber das als Datenverlust.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Liste mit Schlüssel dreiseitig zusammenführen.
 * Nur wir geändert → unseres. Nur die anderen → deren. Beide → combine (Standard: unseres).
 * Einer hat gelöscht, der andere geändert → behalten (combine entscheidet, z. B. Mengen verrechnen).
 */
function merge3Keyed<T>(
  base: T[], ours: T[], theirs: T[], key: (t: T) => string,
  combine: (b: T | undefined, o: T | undefined, t: T | undefined) => T | undefined = (_b, o, t) => o ?? t,
): T[] {
  const b = new Map(base.map((x) => [key(x), x]));
  const o = new Map(ours.map((x) => [key(x), x]));
  const t = new Map(theirs.map((x) => [key(x), x]));
  // Reihenfolge: wie beim neueren Stand, eigene neue Einträge hinten dran
  const keys = [...new Set([...t.keys(), ...o.keys()])];
  const out: T[] = [];
  for (const k of keys) {
    const bv = b.get(k), ov = o.get(k), tv = t.get(k);
    const oursChanged = !same(bv, ov);
    const theirsChanged = !same(bv, tv);
    const v = !oursChanged ? tv : !theirsChanged ? ov : combine(bv, ov, tv);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** Menge (Liste von Schlüsseln, z. B. abgehakte Einkäufe) dreiseitig: deren Stand + unsere Zu- und Abgänge. */
function merge3Set(base: string[] = [], ours: string[] = [], theirs: string[] = []): string[] {
  const b = new Set(base), o = new Set(ours);
  const added = ours.filter((x) => !b.has(x));
  const removed = new Set(base.filter((x) => !o.has(x)));
  return [...new Set([...theirs.filter((x) => !removed.has(x)), ...added])];
}

/** Einfacher Wert: haben wir ihn geändert, gilt unserer – sonst deren. */
const merge3Value = <T>(base: T, ours: T, theirs: T): T => (same(base, ours) ? theirs : ours);

/** Vorrat: beide Seiten haben dieselbe Zeile geändert (oder einer gelöscht) → Mengen verrechnen. */
function combineItem(b: PantryItem | undefined, o: PantryItem | undefined, t: PantryItem | undefined): PantryItem | undefined {
  const numeric = (x: PantryItem | undefined) => x === undefined || x.amount !== undefined;
  const sameUnit = [b, o, t].filter(Boolean).every((x) => x!.unit === (b ?? o ?? t)!.unit);
  if (b && numeric(b) && numeric(o) && numeric(t) && sameUnit) {
    // entfernt = 0 übrig; Ergebnis = Stand der anderen + unsere Veränderung
    const amount = Math.round(((t?.amount ?? 0) + (o?.amount ?? 0) - (b.amount ?? 0)) * 10) / 10;
    if (amount <= 0) return undefined;
    return { ...(t ?? b), ...(o ?? {}), amount };
  }
  // ohne Mengen: geändert schlägt gelöscht („lieber behalten“), sonst unseres
  return o ?? t;
}

const byName = (x: { name: string }) => x.name.toLocaleLowerCase('de-DE').trim();
const byNameDay = (x: { name: string; date: string }) => `${byName(x)}|${x.date.slice(0, 10)}`;
const later = (a: string | undefined, b: string | undefined) => ((a ?? '') > (b ?? '') ? a : b);

export function merge3Pantry(base: Pantry, ours: Pantry, theirs: Pantry): Pantry {
  const cookLog = Object.fromEntries(merge3Keyed(
    Object.entries(base.cookLog ?? {}), Object.entries(ours.cookLog ?? {}), Object.entries(theirs.cookLog ?? {}), ([k]) => k,
  ));
  return {
    ...theirs,
    ...ours,
    items: merge3Keyed(base.items, ours.items, theirs.items, (i) => i.id, combineItem),
    rules: merge3Keyed(base.rules, ours.rules, theirs.rules, (r) => r.key),
    prices: merge3Keyed(base.prices ?? [], ours.prices ?? [], theirs.prices ?? [], byName),
    history: merge3Keyed(base.history ?? [], ours.history ?? [], theirs.history ?? [], byNameDay),
    savings: merge3Keyed(base.savings ?? [], ours.savings ?? [], theirs.savings ?? [], (s) => s.key),
    receipts: merge3Set(base.receipts, ours.receipts, theirs.receipts),
    shelfDays: merge3Value(base.shelfDays, ours.shelfDays, theirs.shelfDays),
    basics: merge3Value(base.basics, ours.basics, theirs.basics),
    noNutrition: merge3Value(base.noNutrition, ours.noNutrition, theirs.noNutrition),
    macroGoal: merge3Value(base.macroGoal, ours.macroGoal, theirs.macroGoal),
    cookLog: Object.keys(cookLog).length ? cookLog : undefined,
    updatedAt: later(ours.updatedAt, theirs.updatedAt)!,
  };
}

export function merge3Plan(base: MealPlan, ours: MealPlan, theirs: MealPlan): MealPlan {
  return {
    ...theirs,
    ...ours,
    items: merge3Keyed(base.items, ours.items, theirs.items, (i) => i.recipeId),
    checked: merge3Set(base.checked, ours.checked, theirs.checked),
    cooked: merge3Set(base.cooked, ours.cooked, theirs.cooked),
    buy: merge3Set(base.buy, ours.buy, theirs.buy),
    updatedAt: later(ours.updatedAt, theirs.updatedAt)!,
  };
}

export function merge3Products(base: MyProduct[], ours: MyProduct[], theirs: MyProduct[]): MyProduct[] {
  // beide dasselbe Produkt geändert → das zuletzt geänderte
  return merge3Keyed(base, ours, theirs, (p) => p.id, (_b, o, t) => (o && t ? (o.updatedAt >= t.updatedAt ? o : t) : o ?? t));
}

// ── Offline-Konflikt: ohne gemeinsamen Stand vereinen ─────────────

/** Vereinigung nach Schlüssel: alles aus der neueren Fassung, dazu, was nur die ältere hat. */
function unionKeyed<T>(newer: T[], older: T[], key: (t: T) => string): T[] {
  const seen = new Set(newer.map(key));
  return [...newer, ...older.filter((x) => !seen.has(key(x)))];
}
const unionSet = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

export function unionPantry(a: Pantry, b: Pantry): Pantry {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const cookLog = { ...older.cookLog, ...newer.cookLog };
  return {
    ...newer,
    items: unionKeyed(newer.items, older.items, (i) => i.id),
    rules: unionKeyed(newer.rules, older.rules, (r) => r.key),
    prices: unionKeyed(newer.prices ?? [], older.prices ?? [], byName),
    history: unionKeyed(newer.history ?? [], older.history ?? [], byNameDay),
    savings: unionKeyed(newer.savings ?? [], older.savings ?? [], (s) => s.key),
    receipts: unionSet(newer.receipts, older.receipts),
    cookLog: Object.keys(cookLog).length ? cookLog : undefined,
  };
}

export function unionPlan(a: MealPlan, b: MealPlan): MealPlan {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  return {
    ...newer,
    items: unionKeyed(newer.items, older.items, (i) => i.recipeId),
    checked: unionSet(newer.checked, older.checked),
    cooked: unionSet(newer.cooked, older.cooked),
    buy: unionSet(newer.buy, older.buy),
  };
}

export function unionProducts(a: MyProduct[], b: MyProduct[]): MyProduct[] {
  const all = new Map<string, MyProduct>();
  for (const p of [...a, ...b]) {
    const prev = all.get(p.id);
    if (!prev || p.updatedAt > prev.updatedAt) all.set(p.id, p);
  }
  // Reihenfolge der ersten Liste behalten, Neues hinten
  const order = [...new Set([...a.map((p) => p.id), ...b.map((p) => p.id)])];
  return order.map((id) => all.get(id)!);
}

// ── Rezepte ────────────────────────────────────────────────────────

/**
 * Rezept: Versionen und Bewertungen beider Seiten bleiben (wie beim Offline-Konflikt, mergeRecipes).
 * Einfache Felder (Favorit, Notizen, Status, Bild …): was WIR geändert haben, sonst deren Stand –
 * so überschreibt ein Tipp auf „Favorit“ nicht die Notiz, die gerade vom anderen Gerät kam.
 */
export function merge3Recipe(base: Recipe | undefined, ours: Recipe, theirs: Recipe): Recipe {
  const union = mergeRecipes(ours, theirs);
  if (!base) return union;
  const out: Record<string, unknown> = { ...union };
  const skip = new Set(['versions', 'feedback', 'lastCookedAt', 'updatedAt']);
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    if (skip.has(k)) continue;
    out[k] = merge3Value((base as unknown as Record<string, unknown>)[k], (ours as unknown as Record<string, unknown>)[k], (theirs as unknown as Record<string, unknown>)[k]);
  }
  // die aktuelle Version muss es geben – sonst die neueste
  const versions = union.versions;
  if (!versions.some((v) => v.id === out.currentVersionId)) out.currentVersionId = versions[versions.length - 1]?.id;
  return { ...(out as unknown as Recipe), updatedAt: later(ours.updatedAt, theirs.updatedAt)! };
}
