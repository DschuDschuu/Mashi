import { buildShoppingList, resolveIngredient, type ExtraItem, type MealPlan, type ShoppingItem } from './mealplan';
import { normalizeName } from './nutrition/localFoods';
import type { MyProduct } from './nutrition/myProducts';
import type { FoodEntry, FoodTable } from './nutrition/types';
import { pantryAfterPlan, type Pantry, type PantryItem, type PantryUnit } from './pantry';
import type { Recipe } from './types';
import { formatAmount } from './scaling';

/**
 * Mindestbestand („Nachkaufen“): Sachen, die man auf Vorrat kauft – 12 Dosen passierte Tomaten –,
 * kommen von selbst auf die Einkaufsliste, sobald weniger als `below` da ist. Nur ein Hinweis, keine Menge.
 */
export interface RestockRule {
  /** Zutat, wie unter „Meine Lebensmittel“ („Passierte Tomaten“) */
  name: string;
  below: number;
  unit: PantryUnit;
}

export interface RestockNeed {
  /** Schlüssel wie auf der Einkaufsliste (resolveIngredient) */
  key: string;
  name: string;
  kind?: ShoppingItem['kind'];
  /** „Im Vorrat 3 Stück · Nachkaufen unter 4“ */
  label: string;
}

/** Wie steht es um eine Regel? – fürs Einstellfeld, damit „kein Hinweis“ nie rätselhaft ist */
export interface RestockStatus {
  rule: RestockRule;
  key: string;
  state: 'unter' | 'reicht' | 'unbekannt';
  /** warum Mashi nicht zählen kann */
  why?: 'ohne-menge' | 'packung-fehlt';
  /** „Gerade 3 Stück – steht auf der Einkaufsliste“ (fürs Einstellfeld) */
  text: string;
  /** „Im Vorrat 3 Stück“ (für die Liste) */
  have?: string;
}

/** Schlüssel der Haken für reine Nachkauf-Einträge – getrennt von den Rezept-Zutaten, siehe tidy im Store */
export const RESTOCK_PREFIX = 'restock:';

/** Schlüssel einer Regel – „Passata“ und „Passierte Tomaten“ sind dasselbe */
export const ruleKey = (rule: Pick<RestockRule, 'name'>, table: FoodTable) => resolveIngredient({ id: 'restock', name: rule.name }, 1, table)?.key;

/**
 * Stand aller Regeln. Gezählt wird, was nach dem Wochenplan übrig bleibt – so kommt es auf die
 * Liste, BEVOR die Dosen beim Kochen ausgehen. Vorrat ohne Menge oder ohne bekannte Packungsgröße
 * → „unbekannt“ (lieber still als falsch – aber im Einstellfeld mit Grund).
 * Gleiche Zutat unter zwei Namen (Passata / Passierte Tomaten): die strengere Regel gilt.
 */
export function restockStatus(
  pantry: Pantry, table: FoodTable, products: readonly MyProduct[] = [], afterPlan: Pantry = pantry,
): RestockStatus[] {
  const rules = (pantry.restock ?? []).filter((r) => r.below > 0);
  if (!rules.length) return [];
  // Schlüssel je Vorrat einmal auflösen (nicht je Regel neu)
  const keyOf = new Map<string, string | undefined>();
  const key = (it: PantryItem) => {
    if (!keyOf.has(it.id)) keyOf.set(it.id, it.recipeId ? undefined : resolveIngredient({ id: it.id, name: it.name }, 1, table)?.key);
    return keyOf.get(it.id);
  };
  const byKey = new Map<string, RestockRule>();
  for (const rule of rules) {
    const k = ruleKey(rule, table);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || (prev.unit === rule.unit && rule.below > prev.below)) byKey.set(k, rule);
  }
  const out: RestockStatus[] = [];
  for (const [k, rule] of byKey) {
    const r = resolveIngredient({ id: 'restock', name: rule.name }, 1, table);
    const sizes = packSizes(k, r?.food, pantry, table, products);
    const now = stockIn(pantry.items.filter((it) => key(it) === k), rule.unit, sizes);
    const later = stockIn(afterPlan.items.filter((it) => key(it) === k), rule.unit, sizes);
    if ('why' in now || 'why' in later) {
      const why = 'why' in now ? now.why : (later as { why: RestockStatus['why'] }).why;
      out.push({
        rule, key: k, state: 'unbekannt', why,
        text: why === 'ohne-menge'
          ? 'Kann nicht zählen: Ein Vorrat steht ohne Menge da („vorhanden“) – trag in der Speisekammer ein, wie viel.'
          : 'Kann nicht zählen: Mashi kennt die Packungsgröße nicht – trag sie am Produkt ein oder beim nächsten Bon „je Stück“.',
      });
      continue;
    }
    const amount = (v: number) => `${formatAmount(v, isCount(rule.unit) ? 'Stück' : 'g')} ${rule.unit}`;
    const fmt = (v: number) => (v <= 0.01 ? 'nichts' : `${later.approx || now.approx ? 'ca. ' : ''}${amount(v)}`);
    const planned = Math.abs(now.value - later.value) > 0.01;
    const under = later.value < rule.below;
    const afterPlanText = `Nach dem Wochenplan ${later.value <= 0.01 ? 'nichts mehr' : `noch ${fmt(later.value)}`}`;
    const where = planned ? afterPlanText : now.value <= 0.01 ? 'Nichts im Vorrat' : `Gerade ${fmt(now.value)}`;
    const have = planned ? afterPlanText : now.value <= 0.01 ? 'Nichts mehr im Vorrat' : `Im Vorrat ${fmt(now.value)}`;
    out.push({ rule, key: k, state: under ? 'unter' : 'reicht', have, text: `${where} – ${under ? 'steht auf der Einkaufsliste' : 'reicht'}` });
  }
  return out;
}

/** Was ist unter den Mindestbestand gefallen? – die Einträge für die Einkaufsliste */
export function restockNeeds(
  pantry: Pantry, table: FoodTable, products: readonly MyProduct[] = [], afterPlan: Pantry = pantry,
): RestockNeed[] {
  return restockStatus(pantry, table, products, afterPlan).filter((s) => s.state === 'unter').map((s) => {
    const r = resolveIngredient({ id: 'restock', name: s.rule.name }, 1, table);
    const unit = s.rule.unit;
    const below = `${formatAmount(s.rule.below, isCount(unit) ? 'Stück' : 'g')} ${unit}`;
    return { key: s.key, name: s.rule.name, ...(r?.kind ? { kind: r.kind } : {}), label: `${s.have} · Nachkaufen unter ${below}` };
  });
}

/**
 * Einkaufsliste mit Nachkauf-Hinweisen: Steht die Zutat schon zum Kaufen drauf, bekommt sie nur den
 * Hinweis. Stünde sie sonst unter „Basics“ oder „Hast du schon“, kommt sie auf die Liste. Sonst neu dazu.
 */
export function withRestock(list: ShoppingItem[], needs: readonly RestockNeed[]): ShoppingItem[] {
  const out = [...list];
  for (const n of needs) {
    const i = out.findIndex((x) => x.key === n.key || x.key === RESTOCK_PREFIX + n.key);
    if (i >= 0) {
      out[i] = { ...out[i], pantry: false, covered: false, restock: n.label, ...(out[i].covered ? { quantity: '' } : {}) };
    } else {
      out.push({ key: RESTOCK_PREFIX + n.key, name: n.name, quantity: '', pantry: false, from: [], ...(n.kind ? { kind: n.kind } : {}), restock: n.label });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Schlüssel der Haken für eigene Einträge */
export const EXTRA_PREFIX = 'extra:';

/**
 * Eigene Einträge (selbst getippt, aus der Inventur) dazu. Steht die Zutat schon zum Kaufen drauf, bekommt sie
 * nur den Hinweis; stünde sie unter „Basics“ oder „Hast du schon“, kommt sie auf die Liste – du willst sie ja kaufen.
 */
export function withExtras(list: ShoppingItem[], extras: readonly ExtraItem[], table: FoodTable): ShoppingItem[] {
  const out = [...list];
  for (const x of extras) {
    const r = resolveIngredient({ id: 'extra', name: x.name }, 1, table);
    const note = x.source === 'inventur' ? 'aus der Inventur' : undefined;
    const i = r ? out.findIndex((o) => o.key === r.key || o.key === RESTOCK_PREFIX + r.key) : -1;
    if (i >= 0) {
      out[i] = { ...out[i], pantry: false, covered: false, extra: true, ...(note ? { note } : {}) };
      continue;
    }
    out.push({ key: EXTRA_PREFIX + normalizeName(x.name), name: x.name, quantity: '', pantry: false, from: [], ...(r?.kind ? { kind: r.kind } : {}), extra: true, ...(note ? { note } : {}) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// Die Liste wird an mehreren Stellen gebraucht (Liste, Wagen-Zahl, Startseite) – gleiche Eingaben, gleiches Ergebnis
let last: { args: unknown[]; list: ShoppingItem[] } | undefined;

/** Einkaufsliste mit allem – was Liste, Zähler und Kassenbon benutzen */
export function shoppingList(plan: MealPlan, recipes: Recipe[], table: FoodTable, pantry: Pantry, products: readonly MyProduct[] = []): ShoppingItem[] {
  const args = [plan, recipes, table, pantry, products];
  if (last && last.args.every((a, i) => a === args[i])) return last.list;
  const base = buildShoppingList(plan, recipes, table, pantry);
  const withNeeds = pantry.restock?.length ? withRestock(base, restockNeeds(pantry, table, products, pantryAfterPlan(pantry, plan, recipes, table))) : base;
  const list = plan.extra?.length ? withExtras(withNeeds, plan.extra, table) : withNeeds;
  last = { args, list };
  return list;
}

// ── Umrechnen ──────────────────────────────────────────────────────

const isCount = (u: PantryUnit | undefined) => u === 'Stück' || u === 'Glas';

/** Gramm je Packung/Stück/Glas – woher Mashi es weiß (Produkt, Kassenbon, Tabelle) */
interface Sizes { byProduct: Map<string, number>; piece?: number; glass?: number }

function packSizes(key: string, food: FoodEntry | undefined, pantry: Pantry, table: FoodTable, products: readonly MyProduct[]): Sizes {
  const byProduct = new Map<string, number>();
  for (const p of products) if (p.packageAmount && p.packageUnit && p.packageUnit !== 'Stück') byProduct.set(p.id, p.packageAmount);
  // Packung eines eigenen Produkts für diese Zutat (die Sorte selbst oder eine der Sorten)
  const ids = food ? [food.ref.foodId, ...(food.variants ?? []).map((v) => v.id)] : [];
  const own = ids.map((id) => byProduct.get(id)).find((x) => x !== undefined);
  // gelernt vom Kassenbon: „Mais 285 g“ je Stück
  const rule = pantry.rules.find((r) => !r.skip && r.name && r.amount && (r.unit === 'g' || r.unit === 'ml')
    && resolveIngredient({ id: r.key, name: r.name }, 1, table)?.key === key);
  const pack = own ?? rule?.amount;
  return { byProduct, piece: pack ?? food?.portions?.Stück, glass: food?.portions?.Glas ?? pack };
}

function gramsPer(unit: PantryUnit, sizes: Sizes, productId?: string): number | undefined {
  if (unit === 'g' || unit === 'ml') return 1;
  const own = productId ? sizes.byProduct.get(productId) : undefined;
  return own ?? (unit === 'Glas' ? sizes.glass : sizes.piece);
}

/** Summe der (schon passenden) Vorräte in der Einheit der Regel – oder warum das nicht geht */
function stockIn(items: readonly PantryItem[], unit: PantryUnit, sizes: Sizes): { value: number; approx: boolean } | { why: 'ohne-menge' | 'packung-fehlt' } {
  let value = 0;
  let approx = false;
  for (const it of items) {
    // Angebrochenes ist kein Vorrat mehr – der offene Becher zählt nicht als „noch einer da“
    if (it.openedAt) continue;
    if (it.amount === undefined || it.unit === undefined) return { why: 'ohne-menge' };
    if (it.amount <= 0) continue;
    if (it.unit === unit || (!isCount(it.unit) && !isCount(unit))) {
      value += it.amount;
      continue;
    }
    const from = it.pack && isCount(it.unit) ? it.pack.amount : gramsPer(it.unit, sizes, it.productId);
    const to = gramsPer(unit, sizes);
    if (!from || !to) return { why: 'packung-fehlt' };
    value += (it.amount * from) / to;
    approx = true;
  }
  return { value, approx };
}
