import type { PriceEntry } from './cost';
import { resolveIngredient, type Resolved } from './mealplan';
import type { FoodTable } from './nutrition/types';
import type { ReceiptLine } from './receipt';
import type { ReceiptSavings } from './savings';
import { currentContent } from './recipe';
import type { MealPlan } from './mealplan';
import type { Recipe, RecipeContent } from './types';

/**
 * Speisekammer: was noch da ist. Gefüllt per Kassenbon oder von Hand,
 * geleert durch „Gekocht“. Mengen nur, wo bekannt – sonst „vorhanden“.
 */
export type PantryUnit = 'g' | 'ml' | 'Stück';

export interface PantryItem {
  id: string;
  /** Name wie in Rezepten („Hähnchenbrust“) – darüber findet Mashi die passende Zutat */
  name: string;
  amount?: number;
  unit?: PantryUnit;
  addedAt: string;
  /** Nach dem Kochen verwendet, aber ohne Menge – „Noch da?“ fragen */
  check?: boolean;
}

/**
 * Gelernter Bon-Artikel: „Mozzarella light“ auf dem Bon = „Mozzarella“, 125 g je Stück.
 * Oder: überspringen (Getränke, Drogerie …). Beim nächsten Bon ist alles schon ausgefüllt.
 */
export interface ReceiptRule {
  /** Bon-Name, vereinheitlicht (siehe receiptKey) */
  key: string;
  skip?: boolean;
  name?: string;
  /** Menge je Stück/Packung – bei loser Ware (kg auf dem Bon) nicht nötig */
  amount?: number;
  unit?: PantryUnit;
  /** gehört zu diesem Produkt aus „Meine Produkte“ – dessen Packungsgröße gilt dann immer aktuell */
  productId?: string;
}

export interface Pantry {
  items: PantryItem[];
  rules: ReceiptRule[];
  /** zuletzt bezahlte Preise, je Artikel einer – vom Kassenbon */
  prices: PriceEntry[];
  /** alle Preise vom Kassenbon mit Einkaufsdatum – für den Preisverlauf */
  history?: PriceEntry[];
  /** Ersparnis je Bon (Lidl Plus, Angebote) */
  savings?: ReceiptSavings[];
  updatedAt: string;
}

export const emptyPantry = (): Pantry => ({ items: [], rules: [], prices: [], updatedAt: new Date(0).toISOString() });

/** Packungsgröße aus „Meine Produkte“ für einen Bon-Namen (z. B. Mozzarella light → 125 g). */
export type PackageLookup = (receiptName: string) => { amount: number; unit: PantryUnit } | undefined;

export const receiptKey = (name: string) => name.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();

const sameName = (a: string, b: string) => receiptKey(a) === receiptKey(b);

// ── Import ─────────────────────────────────────────────────────────

/** Eine Bon-Zeile, wie sie zur Prüfung angezeigt wird – vorausgefüllt, wenn Mashi den Artikel kennt. */
export interface ImportRow {
  line: ReceiptLine;
  key: string;
  known: boolean;
  skip: boolean;
  name: string;
  /** Gesamtmenge dieser Zeile (bei 3 Stück à 250 g: 750) */
  amount?: number;
  unit?: PantryUnit;
  /** diesem Produkt aus „Meine Produkte“ zugeordnet */
  productId?: string;
}

export function proposeImport(lines: ReceiptLine[], rules: ReceiptRule[], packageFor?: PackageLookup): ImportRow[] {
  return lines.map((line) => {
    const key = receiptKey(line.name);
    const rule = rules.find((r) => r.key === key);
    if (rule?.skip) return { line, key, known: true, skip: true, name: rule.name ?? line.name };
    const row: ImportRow = { line, key, known: !!rule, skip: false, name: rule?.name ?? line.name, ...(rule?.productId ? { productId: rule.productId } : {}) };
    // Zugeordnetes Produkt: dessen Packungsgröße gilt – auch wenn du sie inzwischen geändert hast
    const productPack = rule?.productId && line.weightKg === undefined ? packageFor?.(rule.name ?? line.name) : undefined;
    if (productPack) {
      row.amount = productPack.amount * line.count;
      row.unit = productPack.unit;
    } else if (line.weightKg !== undefined) {
      // Lose Ware: das Gewicht steht auf dem Bon – genauer als jede gelernte Menge
      row.amount = Math.round(line.weightKg * 1000);
      row.unit = 'g';
    } else if (rule?.amount !== undefined) {
      row.amount = rule.amount * line.count;
      row.unit = rule.unit;
    } else if (rule?.unit === 'Stück') {
      row.amount = line.count;
      row.unit = 'Stück';
    } else if (!rule) {
      // Noch nie auf einem Bon gesehen – aber vielleicht ein eigenes Produkt mit Packungsgröße
      const pack = packageFor?.(line.name);
      if (pack) {
        row.amount = pack.amount * line.count; // 2 × 125 g = 250 g · 3 × 1 Stück = 3 Stück
        row.unit = pack.unit;
      }
    }
    return row;
  });
}

/**
 * Geprüfte Zeilen übernehmen: Artikel in die Speisekammer, und jede Entscheidung merken –
 * damit der nächste Bon schon ausgefüllt ist. Preise landen im Verlauf.
 * @param paidAt Einkaufsdatum vom Bon – fehlt es, zählt der Import-Zeitpunkt
 */
export function applyImport(pantry: Pantry, rows: ImportRow[], now = new Date().toISOString(), newId = defaultId, paidAt = now): Pantry {
  const rules = new Map(pantry.rules.map((r) => [r.key, r]));
  const prices = new Map((pantry.prices ?? []).map((p) => [receiptKey(p.name), p]));
  // Ältere Speisekammern haben nur die letzten Preise – die sind der Anfang des Verlaufs
  const history = [...(pantry.history ?? pantry.prices ?? [])];
  let items = pantry.items;
  for (const row of rows) {
    if (row.skip) {
      rules.set(row.key, { key: row.key, skip: true });
      continue;
    }
    const perPiece = row.line.weightKg === undefined && row.amount !== undefined ? row.amount / row.line.count : undefined;
    rules.set(row.key, {
      key: row.key, name: row.name.trim(),
      ...(perPiece !== undefined && row.unit !== 'Stück' ? { amount: perPiece } : {}),
      ...(row.unit ? { unit: row.unit } : {}),
      ...(row.productId ? { productId: row.productId } : {}),
    });
    items = addItem(items, { name: row.name.trim(), amount: row.amount, unit: row.unit }, now, newId);
    const price = priceOf(row, paidAt);
    if (price) {
      const key = receiptKey(price.name);
      // Ein nachträglich importierter alter Bon überschreibt keinen neueren Preis
      if ((prices.get(key)?.date ?? '') <= price.date) prices.set(key, price);
      history.push(price);
    }
  }
  return { ...pantry, items, rules: [...rules.values()], prices: [...prices.values()], history };
}

/**
 * Preis je Gramm oder je Stück aus einer Bon-Zeile: 2 × Mozzarella à 125 g für 1,70 €
 * → 0,0068 €/g. Ohne Menge nur je Stück (Preis ÷ Anzahl).
 */
function priceOf(row: ImportRow, date: string): PriceEntry | undefined {
  const paid = row.line.price;
  if (!paid) return undefined;
  const name = row.name.trim();
  if (row.amount && row.unit !== 'Stück') return { name, perUnit: paid / row.amount, unit: 'g', date };
  const pieces = row.unit === 'Stück' && row.amount ? row.amount : row.line.count;
  return { name, perUnit: paid / pieces, unit: 'Stück', date };
}

/** Gleicher Name + gleiche Einheit → Mengen zusammenzählen statt doppelt führen. */
export function addItem(items: PantryItem[], add: { name: string; amount?: number; unit?: PantryUnit }, now: string, newId = defaultId): PantryItem[] {
  const i = items.findIndex((x) => sameName(x.name, add.name) && (x.unit === add.unit || x.amount === undefined || add.amount === undefined));
  if (i < 0) return [...items, { id: newId(), name: add.name, ...(add.amount !== undefined ? { amount: add.amount, unit: add.unit } : {}), addedAt: now }];
  const x = items[i];
  const merged: PantryItem = x.amount === undefined || add.amount === undefined
    ? { ...x, amount: x.amount ?? add.amount, unit: x.unit ?? add.unit, addedAt: now, check: false }
    : { ...x, amount: x.amount + add.amount, addedAt: now, check: false };
  return items.map((y, n) => (n === i ? merged : y));
}

let seq = 0;
function defaultId() {
  return `p_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

// ── Nach dem Kochen abziehen ───────────────────────────────────────

export interface Deduction {
  pantry: Pantry;
  /** was abgezogen wurde (für die Rückmeldung „Aus der Speisekammer genommen: …“) */
  used: string[];
  /** verwendet, aber ohne Menge – bitte prüfen */
  toCheck: string[];
}

const itemAsIngredient = (item: PantryItem, table: FoodTable) => resolveIngredient({ id: item.id, name: item.name }, 1, table);

/** Wie viel von einem Vorrat ein Rezept braucht – in der Einheit des Vorrats. undefined = nicht umrechenbar. */
function needIn(item: PantryItem, need: Resolved): number | undefined {
  if (need.amount === undefined) return undefined;
  if (item.unit === 'Stück') {
    if (need.unit === 'Stück' || need.unit === undefined) return need.amount;
    const piece = need.food?.portions?.Stück;
    return need.grams !== undefined && piece ? need.grams / piece : undefined;
  }
  // g und ml: gleich behandelt (für Joghurt, Milch & Co. nah genug)
  return need.grams ?? (need.unit === 'ml' ? need.amount : undefined);
}

export function deductRecipe(pantry: Pantry, content: RecipeContent, servings: number, table: FoodTable): Deduction {
  const factor = servings / content.servings;
  const keyOf = new Map(pantry.items.map((it) => [it.id, itemAsIngredient(it, table)?.key]));
  const items = pantry.items.map((it) => ({ ...it }));
  const used: string[] = [];
  const toCheck: string[] = [];

  for (const ing of content.ingredients) {
    const need = resolveIngredient(ing, factor, table);
    if (!need || need.food?.negligible) continue; // Salz, Wasser & Co. führt niemand im Vorrat
    const item = items.find((it) => keyOf.get(it.id) === need.key && (it.amount ?? 1) > 0);
    if (!item) continue;
    const amount = item.amount === undefined ? undefined : needIn(item, need);
    if (item.amount === undefined || amount === undefined) {
      item.check = true;
      toCheck.push(item.name);
      continue;
    }
    item.amount = Math.max(0, Math.round((item.amount - amount) * 10) / 10);
    used.push(item.name);
  }
  // Aufgebraucht = raus aus der Speisekammer
  return { pantry: { ...pantry, items: items.filter((it) => it.amount === undefined || it.amount > 0) }, used, toCheck };
}

// ── Was kann ich kochen? ───────────────────────────────────────────

export interface PantryMatch {
  recipe: Recipe;
  /** Anteil der (gewichteten) Zutaten, die da sind: 1 = alles da */
  share: number;
  have: string[];
  missing: string[];
}

/**
 * Rezepte nach Übereinstimmung mit der Speisekammer. Grundvorrat (Öl, Salz, Gewürze) zählt
 * nicht mit – den hat man. Hähnchen & Co. wiegen mehr als Gemüse (wie im Wochenplan).
 */
/**
 * Was nach dem Wochenplan übrig bleibt: die noch nicht gekochten, geplanten Gerichte werden
 * gedanklich schon abgezogen. Vorräte ohne Menge, die ein geplantes Gericht braucht, gelten als verplant.
 */
export function pantryAfterPlan(pantry: Pantry, plan: MealPlan, recipes: Recipe[], table: FoodTable): Pantry {
  let rest = pantry;
  const reserved = new Set<string>();
  for (const item of plan.items) {
    if (plan.cooked.includes(item.recipeId)) continue;
    const r = recipes.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const d = deductRecipe(rest, currentContent(r), item.servings, table);
    d.toCheck.forEach((name) => reserved.add(receiptKey(name)));
    rest = d.pantry;
  }
  return { ...rest, items: rest.items.filter((it) => !reserved.has(receiptKey(it.name))).map((it) => ({ ...it, check: false })) };
}

export function recipesFromPantry(pantry: Pantry, recipes: Recipe[], table: FoodTable, limit = 8): PantryMatch[] {
  const inStock = new Set(pantry.items.map((it) => itemAsIngredient(it, table)?.key).filter(Boolean));
  if (!inStock.size) return [];
  return recipes
    .filter((r) => !r.archivedAt && r.status !== 'ki_entwurf')
    .map((recipe) => {
      const c = currentContent(recipe);
      const parts = c.ingredients.map((i) => resolveIngredient(i, 1, table)).filter((x): x is Resolved => !!x && !x.pantry);
      // Knoblauch für Soße UND Béchamel ist eine Zutat, nicht zwei
      const unique = [...new Map(parts.map((p) => [p.key, p])).values()];
      const total = unique.reduce((s, p) => s + p.weight, 0);
      const have = unique.filter((p) => inStock.has(p.key));
      const share = total ? have.reduce((s, p) => s + p.weight, 0) / total : 0;
      return { recipe, share, have: have.map((p) => p.name), missing: unique.filter((p) => !inStock.has(p.key)).map((p) => p.name) };
    })
    .filter((m) => m.have.length > 0)
    .sort((a, b) => b.share - a.share || a.missing.length - b.missing.length)
    .slice(0, limit);
}
