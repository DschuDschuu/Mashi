import type { PriceEntry } from './cost';
import { basicsKeys, needIn, resolveIngredient, type Resolved } from './mealplan';
import type { FoodTable } from './nutrition/types';
import type { ReceiptLine } from './receipt';
import type { ReceiptSavings } from './savings';
import { useByOf, type ShelfDays } from './shelfLife';
import { currentContent } from './recipe';
import type { MealPlan } from './mealplan';
import type { Ingredient, Recipe, RecipeContent, Unit } from './types';

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
  /** Einkaufsdatum (vom Bon) – Grundlage für die geschätzte Haltbarkeit; fehlt es, zählt addedAt */
  boughtAt?: string;
  /** eigenes „verbrauchen bis“ – geht immer vor der Schätzung */
  useBy?: string;
  /** reduzierte MHD-Ware (vom Bon: „RABATT 20%“, oder von Hand) – hält nur noch kurz */
  reduced?: boolean;
  /** eingefroren am … – die Uhr steht, erst nach Monaten ein Hinweis */
  frozenAt?: string;
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
  /**
   * Was „Gekocht“ je geplantem Rezept aus der Speisekammer genommen hat – nimmst du den Haken
   * im Wochenplan zurück, kommt es wieder hinein. „Neue Woche beginnen“ leert es.
   */
  cookLog?: Record<string, Taken[]>;
  /** „Immer im Haus“ (Namen) – fehlt die Liste, gilt DEFAULT_BASICS */
  basics?: string[];
  /** schon importierte Bons (Einkaufstag|Endbetrag) – warnt vor doppeltem Import */
  receipts?: string[];
  /** deine Richtwerte „hält X Tage“ je Art (Gemüse, Milchprodukte …) – fehlt einer, gilt Mashis Standard */
  shelfDays?: ShelfDays;
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
  /** MHD-Ware – vorausgewählt, wenn auf dem Bon „RABATT 20%“ darunter stand */
  reduced?: boolean;
  /**
   * Gleich einfrieren: so viele der gekauften Packungen (bei 4 × Hack z. B. 3). Bei loser Ware oder
   * einer Packung heißt 1 = alles. Nie vorausgewählt – nur wenn du es beim Prüfen ankreuzt.
   */
  freeze?: number;
}

/** Wie viel einer Bon-Zeile eingefroren wird: 0 = nichts, 1 = alles, dazwischen der Anteil. */
export function frozenShare(row: Pick<ImportRow, 'freeze' | 'line'>): number {
  if (!row.freeze || row.freeze <= 0) return 0;
  const packs = row.line.weightKg === undefined ? row.line.count : 1;
  return Math.min(row.freeze, packs) / packs;
}

export function proposeImport(lines: ReceiptLine[], rules: ReceiptRule[], packageFor?: PackageLookup): ImportRow[] {
  return lines.map((line) => {
    const key = receiptKey(line.name);
    const rule = rules.find((r) => r.key === key);
    if (rule?.skip) return { line, key, known: true, skip: true, name: rule.name ?? line.name };
    const row: ImportRow = {
      line, key, known: !!rule, skip: false, name: rule?.name ?? line.name,
      ...(rule?.productId ? { productId: rule.productId } : {}), ...(line.reduced ? { reduced: true } : {}),
    };
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
      // Auch in Stück: „Eier 10er“ = 10 Stück je Packung. Nur 1 Stück je Packung muss man sich nicht merken.
      ...(perPiece !== undefined && !(row.unit === 'Stück' && perPiece === 1) ? { amount: perPiece } : {}),
      ...(row.unit ? { unit: row.unit } : {}),
      ...(row.productId ? { productId: row.productId } : {}),
    });
    const name = row.name.trim();
    const share = frozenShare(row);
    const part = (f: number) => (row.amount === undefined ? undefined : Math.round(row.amount * f * 10) / 10);
    // Der frische Teil wie gewohnt – Gefrorenes als eigener Eintrag, eingefroren am Einkaufstag
    if (share < 1) items = addItem(items, { name, amount: part(1 - share), unit: row.unit, boughtAt: paidAt, reduced: row.reduced }, now, newId);
    if (share > 0) {
      items = [...items, {
        id: newId(), name, ...(row.amount !== undefined ? { amount: part(share), unit: row.unit } : {}),
        addedAt: now, boughtAt: paidAt, frozenAt: paidAt, ...(row.reduced ? { reduced: true } : {}),
      }];
    }
    const price = priceOf(row, paidAt);
    if (price) {
      const key = receiptKey(price.name);
      // Ein nachträglich importierter alter Bon überschreibt keinen neueren Preis
      if ((prices.get(key)?.date ?? '') <= price.date) prices.set(key, price);
      const same = history.findIndex((h) => receiptKey(h.name) === key && h.date.slice(0, 10) === price.date.slice(0, 10));
      if (same >= 0) history[same] = price;
      else history.push(price);
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

/**
 * Gleicher Name + gleiche Einheit → Mengen zusammenzählen statt doppelt führen.
 * Gefrorenes und MHD-Ware bleiben eigene Einträge – sie halten ganz anders als frische Ware.
 */
export function addItem(
  items: PantryItem[], add: { name: string; amount?: number; unit?: PantryUnit; boughtAt?: string; reduced?: boolean }, now: string, newId = defaultId,
): PantryItem[] {
  const i = items.findIndex((x) => sameName(x.name, add.name) && !x.frozenAt && !!x.reduced === !!add.reduced
    && (x.unit === add.unit || x.amount === undefined || add.amount === undefined));
  const bought = add.boughtAt ?? now;
  if (i < 0) {
    return [...items, {
      id: newId(), name: add.name, ...(add.amount !== undefined ? { amount: add.amount, unit: add.unit } : {}),
      addedAt: now, boughtAt: bought, ...(add.reduced ? { reduced: true } : {}),
    }];
  }
  const x = items[i];
  // Alte und neue Ware zusammen: das ältere Kaufdatum zählt – sonst ginge die ältere Tomate unter
  const oldest = [x.boughtAt ?? x.addedAt, bought].sort()[0];
  const merged: PantryItem = x.amount === undefined || add.amount === undefined
    ? { ...x, amount: x.amount ?? add.amount, unit: x.unit ?? add.unit, addedAt: now, boughtAt: oldest, check: false }
    : { ...x, amount: x.amount + add.amount, addedAt: now, boughtAt: oldest, check: false };
  return items.map((y, n) => (n === i ? merged : y));
}

/**
 * Einfrieren – ganz oder nur einen Teil (3 von 4 Packungen Hack): der Rest bleibt frisch daneben.
 * Ein eigenes „verbrauchen bis“ gilt eingefroren nicht mehr.
 */
export function freezeItem(items: PantryItem[], id: string, now: string, amount?: number, newId = defaultId): PantryItem[] {
  const item = items.find((x) => x.id === id);
  if (!item || item.frozenAt) return items;
  const { useBy: _u, check: _c, ...rest } = item;
  if (amount !== undefined && item.amount !== undefined && amount > 0 && amount < item.amount) {
    const frozen: PantryItem = { ...rest, id: newId(), amount, frozenAt: now };
    return items.flatMap((x) => (x.id === id ? [{ ...x, amount: Math.round((x.amount! - amount) * 10) / 10 }, frozen] : [x]));
  }
  return items.map((x) => (x.id === id ? { ...rest, frozenAt: now } : x));
}

/** Auftauen: hält dann nur noch kurz (Standard 1 Tag) – als festes „verbrauchen bis“. */
export function thawItem(items: PantryItem[], id: string, now: string, days: number): PantryItem[] {
  const useBy = new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return items.map((x) => {
    if (x.id !== id || !x.frozenAt) return x;
    const { frozenAt: _f, ...rest } = x;
    return { ...rest, useBy };
  });
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
  /** dieselben als IDs – Namen können doppelt vorkommen */
  checkIds: string[];
  /** je Zutat-ID: da, reicht nicht ganz, fehlt – oder Grundvorrat (Öl, Salz …, nie „fehlt“) */
  stock: Map<string, Stock>;
}

/** Ist die Zutat in der Speisekammer? „basis“ = Grundvorrat, den man hat (Öl, Salz, Gewürze). */
export type Stock = 'da' | 'knapp' | 'fehlt' | 'basis';

/** „Fehlt: …“ und „reicht nicht: …“ – ohne optionale Zutaten und ohne Grundvorrat. */
export function stockSummary(content: RecipeContent, stock: Map<string, Stock>): { missing: string[]; short: string[] } {
  const pick = (s: Stock) => [...new Set(content.ingredients.filter((i) => !i.optional && stock.get(i.id) === s).map((i) => i.name))];
  return { missing: pick('fehlt'), short: pick('knapp') };
}

const itemAsIngredient = (item: PantryItem, table: FoodTable) => resolveIngredient({ id: item.id, name: item.name }, 1, table);

/**
 * @param amounts Mengen „nur dieses Mal“ je Zutat-ID (in der Einheit der Zutat, schon für diese
 *   Portionen) – z. B. 3 statt 2 Tomaten, um den Rest mitzuverbrauchen. Das Rezept bleibt, wie es ist.
 */
export function deductRecipe(pantry: Pantry, content: RecipeContent, servings: number, table: FoodTable, amounts: Readonly<Record<string, number>> = {}): Deduction {
  const factor = servings / content.servings;
  const keyOf = new Map(pantry.items.map((it) => [it.id, itemAsIngredient(it, table)?.key]));
  // Gibt es etwas doppelt (MHD-Ware + frische Packung, oder gefroren), zuerst das, was eher weg muss
  const rank = (it: PantryItem) => (it.frozenAt ? Infinity : useByOf(it, table, pantry.shelfDays)?.getTime() ?? Number.MAX_SAFE_INTEGER);
  const items = pantry.items.map((it) => ({ ...it }));
  const byUrgency = [...items].sort((a, b) => rank(a) - rank(b));
  const used: string[] = [];
  const toCheck: string[] = [];
  const checkIds: string[] = [];
  const stock = new Map<string, Stock>();
  const basics = basicsKeys(pantry, table);

  for (const ing of content.ingredients) {
    const own = amounts[ing.id];
    const need = own === undefined ? resolveIngredient(ing, factor, table) : resolveIngredient({ ...ing, amount: own }, 1, table);
    if (!need || need.food?.negligible) continue; // Salz, Wasser & Co. führt niemand im Vorrat
    // Über alle passenden Vorräte verteilen, dringendster zuerst: 300 g MHD-Hähnchen leer, der Rest
    // von der frischen Packung. Gerechnet wird mit dem offenen Anteil – die Vorräte können
    // verschiedene Einheiten haben (g hier, Stück dort).
    let open = 1;
    let found = false;
    for (const item of byUrgency) {
      if (open < 1e-6) break;
      if (keyOf.get(item.id) !== need.key || (item.amount ?? 1) <= 0) continue;
      found = true;
      const full = item.amount === undefined ? undefined : needIn(item, need);
      if (item.amount === undefined || full === undefined) {
        // Menge unbekannt: gilt als ausreichend – „Noch da?“ fragen
        item.check = true;
        toCheck.push(item.name);
        checkIds.push(item.id);
        open = 0;
        break;
      }
      const take = Math.min(item.amount, full * open);
      item.amount = Math.max(0, Math.round((item.amount - take) * 10) / 10);
      open = full > 0 ? open - take / full : 0;
      if (!used.includes(item.name)) used.push(item.name);
    }
    stock.set(ing.id, need.pantry || basics.has(need.key) ? 'basis' : !found ? 'fehlt' : open < 0.02 ? 'da' : 'knapp');
  }
  // Aufgebraucht = raus aus der Speisekammer
  return { pantry: { ...pantry, items: items.filter((it) => it.amount === undefined || it.amount > 0) }, used, toCheck, checkIds, stock };
}

// ── Was kann ich kochen? ───────────────────────────────────────────

export interface PantryMatch {
  recipe: Recipe;
  /** bald ablaufende Vorräte, die dieses Rezept aufbraucht */
  useUp: string[];
  /** Anteil der (gewichteten) Zutaten, die da sind: 1 = alles da */
  share: number;
  have: string[];
  missing: string[];
}

/**
 * Was nach dem Wochenplan übrig bleibt: die noch nicht gekochten, geplanten Gerichte werden
 * gedanklich schon abgezogen. Vorräte ohne Menge, die ein geplantes Gericht braucht, gelten als verplant.
 */
export function pantryAfterPlan(pantry: Pantry, plan: MealPlan, recipes: Recipe[], table: FoodTable): Pantry {
  let rest = pantry;
  // nach ID, nicht nach Name – sonst fiele „Paprika 3 Stück“ mit raus, nur weil es auch „Paprika“ ohne Menge gibt
  const reserved = new Set<string>();
  for (const item of plan.items) {
    if (plan.cooked.includes(item.recipeId)) continue;
    const r = recipes.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const d = deductRecipe(rest, currentContent(r), item.servings, table);
    d.checkIds.forEach((id) => reserved.add(id));
    rest = d.pantry;
  }
  return { ...rest, items: rest.items.filter((it) => !reserved.has(it.id)).map((it) => ({ ...it, check: false })) };
}

/**
 * Rezepte nach Übereinstimmung mit der Speisekammer. Grundvorrat (Öl, Salz, Gewürze) zählt
 * nicht mit – den hat man. Hähnchen & Co. wiegen mehr als Gemüse (wie im Wochenplan).
 * @param useUp bald ablaufende Vorräte (Schlüssel → Tage). Rezepte, die davon etwas aufbrauchen,
 *   stehen IMMER vorne – die Tomaten müssen weg, die Pasta hält. Innerhalb der Gruppen zählt die Übereinstimmung.
 */
export function recipesFromPantry(pantry: Pantry, recipes: Recipe[], table: FoodTable, limit = 8, useUp = new Map<string, number>()): PantryMatch[] {
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
      const usedUp = have.filter((p) => useUp.has(p.key));
      return {
        recipe, share, have: have.map((p) => p.name), missing: unique.filter((p) => !inStock.has(p.key)).map((p) => p.name),
        useUp: usedUp.map((p) => p.name),
      };
    })
    .filter((m) => m.have.length > 0)
    .sort((a, b) => b.useUp.length - a.useUp.length || b.share - a.share || a.missing.length - b.missing.length)
    .slice(0, limit);
}

// ── Reste mitverbrauchen ───────────────────────────────────────────

export interface Leftover {
  ingredientId: string;
  name: string;
  /** vorgeschlagene Menge in der Einheit der Zutat – so viel, dass nichts übrig bleibt */
  amount: number;
  /** was das Rezept für diese Portionen vorsieht */
  planned: number;
  unit?: Unit;
}

/**
 * Das Rezept will 2 Tomaten, da sind 3 → „alle 3 nehmen?“. Nur Verderbliches, und nur wenn der Rest
 * nennenswert ist (ab 10 %) und höchstens so viel wie geplant – 5 kg Nudeln schlägt niemand vor.
 * @param ingredients schon auf die Portionen umgerechnet
 * @param pantry am besten ohne das, was andere geplante Gerichte noch brauchen (pantryAfterPlan)
 */
export function leftoverSuggestions(pantry: Pantry, ingredients: Ingredient[], table: FoodTable): Leftover[] {
  const perishable = pantry.items.filter((it) => (it.amount ?? 0) > 0 && !it.frozenAt && useByOf(it, table, pantry.shelfDays));
  const resolved = ingredients.map((ing) => ({ ing, need: resolveIngredient(ing, 1, table) }));
  const out: Leftover[] = [];
  for (const { ing, need } of resolved) {
    if (!need || need.pantry || need.food?.negligible || ing.amount === undefined) continue;
    // Kommt dieselbe Zutat zweimal vor (Knoblauch für Soße UND Topping), lieber nichts vorschlagen
    if (resolved.filter((r) => r.need?.key === need.key).length > 1) continue;
    const item = perishable.find((it) => itemAsIngredient(it, table)?.key === need.key);
    const inItem = item && needIn(item, need);
    if (!item || !inItem) continue;
    const rest = item.amount! - inItem;
    if (rest < inItem * 0.1 || rest > inItem) continue;
    out.push({ ingredientId: ing.id, name: ing.name, amount: ing.amount * (item.amount! / inItem), planned: ing.amount, unit: ing.unit });
  }
  return out;
}

// ── Doppelte Bons ──────────────────────────────────────────────────

/** Ein Bon = Einkaufstag + Endbetrag. Ohne beides kein sicherer Schlüssel. */
export const bonKey = (paidAt?: string, total?: number) => (paidAt && total !== undefined ? `${paidAt.slice(0, 10)}|${total}` : undefined);

/** Diesen Bon schon importiert? */
export const alreadyImported = (pantry: Pantry, key?: string) => !!key && (pantry.receipts ?? []).includes(key);

/** Bon als importiert merken (die letzten 200 reichen). */
export function rememberReceipt(pantry: Pantry, key?: string): Pantry {
  if (!key || alreadyImported(pantry, key)) return pantry;
  return { ...pantry, receipts: [...(pantry.receipts ?? []), key].slice(-200) };
}

// ── Gekocht zurücknehmen ───────────────────────────────────────────

/** Ein Vorrat, wie er VOR dem Kochen war, und wie viel davon genommen wurde (ohne Menge: nur „Noch da?“ gesetzt). */
export interface Taken {
  item: PantryItem;
  amount?: number;
}

/** Was sich zwischen vorher und nachher geändert hat – für „Rückgängig“. */
export function takenBetween(before: Pantry, after: Pantry): Taken[] {
  const out: Taken[] = [];
  for (const b of before.items) {
    const a = after.items.find((x) => x.id === b.id);
    if (!a) out.push({ item: b, ...(b.amount !== undefined ? { amount: b.amount } : {}) }); // ganz aufgebraucht
    else if (b.amount !== undefined && a.amount !== undefined && a.amount < b.amount) out.push({ item: b, amount: Math.round((b.amount - a.amount) * 10) / 10 });
    else if (a.check && !b.check) out.push({ item: b });
  }
  return out;
}

/**
 * Wieder zurücklegen – relativ, nicht als Schnappschuss: Was du inzwischen geändert hast
 * (z. B. ein Bon dazwischen), bleibt erhalten; nur die genommene Menge kommt dazu.
 */
export function restock(pantry: Pantry, taken: Taken[]): Pantry {
  const items = [...pantry.items];
  for (const t of taken) {
    const i = items.findIndex((x) => x.id === t.item.id);
    if (i < 0) {
      items.push({ ...t.item });
      continue;
    }
    const x = items[i];
    const { check: _c, ...rest } = x;
    items[i] = {
      ...rest,
      ...(t.amount !== undefined && x.amount !== undefined ? { amount: Math.round((x.amount + t.amount) * 10) / 10 } : {}),
      ...(t.item.check ? { check: true } : {}),
    };
  }
  return { ...pantry, items };
}

// ── Verplant ───────────────────────────────────────────────────────

/** Für geplante Gerichte reserviert – je Vorrat. Wert: wie viel (in seiner Einheit); 'all' = alles (oder ohne Menge). */
export type PlannedUse = Map<string, number | 'all'>;

/** Was ein geplantes Gericht aus der Speisekammer reserviert (ohne Menge: amount fehlt). */
export interface DishReservation {
  recipeId: string;
  taken: Taken[];
  /** je Zutat: da / knapp / fehlt – nach dem, was die Gerichte davor schon brauchen */
  stock: Map<string, Stock>;
}

/**
 * Je noch nicht gekochtem Gericht im Wochenplan: was es von der Speisekammer brauchen wird –
 * in Plan-Reihenfolge, wie beim Kochen. Abgezogen wird erst beim Kochen; das hier ist nur die Anzeige.
 */
export function plannedByDish(pantry: Pantry, plan: MealPlan, recipes: Recipe[], table: FoodTable): DishReservation[] {
  const originalCheck = new Map(pantry.items.map((it) => [it.id, it.check]));
  let rest = pantry;
  const out: DishReservation[] = [];
  for (const item of plan.items) {
    if (plan.cooked.includes(item.recipeId)) continue;
    const r = recipes.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const d = deductRecipe(rest, currentContent(r), item.servings, table);
    out.push({ recipeId: r.id, taken: takenBetween(rest, d.pantry), stock: d.stock });
    // „Noch da?“-Markierung nur gedacht – fürs nächste Gericht wieder wie vorher
    rest = { ...d.pantry, items: d.pantry.items.map((it) => ({ ...it, check: originalCheck.get(it.id) })) };
  }
  return out;
}

/**
 * Summe je Vorrat über alle geplanten Gerichte: wie viel verplant ist. 'all' = alles (oder ohne Menge).
 * Die Speisekammer zeigt oben nur, was frei bleibt.
 */
export function plannedUse(pantry: Pantry, plan: MealPlan, recipes: Recipe[], table: FoodTable, dishes = plannedByDish(pantry, plan, recipes, table)): PlannedUse {
  const out: PlannedUse = new Map();
  for (const d of dishes) {
    for (const t of d.taken) {
      const prev = out.get(t.item.id);
      if (t.amount === undefined || prev === 'all') out.set(t.item.id, 'all');
      else out.set(t.item.id, Math.round(((prev ?? 0) + t.amount) * 10) / 10);
    }
  }
  for (const [id, v] of out) {
    const item = pantry.items.find((x) => x.id === id);
    if (v !== 'all' && item?.amount !== undefined && v >= item.amount - 1e-9) out.set(id, 'all');
  }
  return out;
}
