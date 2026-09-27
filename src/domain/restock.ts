import { buildShoppingList, resolveIngredient, type MealPlan, type ShoppingItem } from './mealplan';
import type { MyProduct } from './nutrition/myProducts';
import { normalizeName } from './nutrition/localFoods';
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

/** Schlüssel der Haken für reine Nachkauf-Einträge – getrennt von den Rezept-Zutaten, siehe tidy im Store */
export const RESTOCK_PREFIX = 'restock:';

export const sameRule = (a: Pick<RestockRule, 'name'>, b: Pick<RestockRule, 'name'>) => normalizeName(a.name) === normalizeName(b.name);

/**
 * Was ist unter den Mindestbestand gefallen? Gezählt wird, was nach dem Wochenplan übrig bleibt –
 * so kommt es auf die Liste, BEVOR die Dosen beim Kochen ausgehen.
 * Vorrat ohne Menge („vorhanden“) oder nicht umrechenbar → kein Hinweis (lieber still als falsch).
 */
export function restockNeeds(
  pantry: Pantry, table: FoodTable, products: readonly MyProduct[] = [], afterPlan: Pantry = pantry,
): RestockNeed[] {
  const needs: RestockNeed[] = [];
  for (const rule of pantry.restock ?? []) {
    if (!(rule.below > 0)) continue;
    const r = resolveIngredient({ id: 'restock', name: rule.name }, 1, table);
    if (!r) continue;
    const sizes = packSizes(r.key, r.food, pantry, table, products);
    const now = stockIn(pantry.items, r.key, rule.unit, table, sizes);
    const later = stockIn(afterPlan.items, r.key, rule.unit, table, sizes);
    if (later === undefined || now === undefined || later.value >= rule.below) continue;
    const amount = (v: number) => `${formatAmount(v, isCount(rule.unit) ? 'Stück' : 'g')} ${rule.unit}`;
    const fmt = (v: number) => `${later.approx || now.approx ? 'ca. ' : ''}${amount(v)}`;
    const have = later.value <= 0.01 && now.value <= 0.01 ? 'Nichts mehr im Vorrat'
      : Math.abs(now.value - later.value) > 0.01
        ? (later.value <= 0.01 ? 'Nach dem Wochenplan nichts mehr' : `Nach dem Wochenplan noch ${fmt(later.value)}`)
        : `Im Vorrat ${fmt(later.value)}`;
    needs.push({
      key: r.key, name: r.name, ...(r.kind ? { kind: r.kind } : {}),
      label: `${have} · Nachkaufen unter ${amount(rule.below)}`,
    });
  }
  return needs;
}

/**
 * Einkaufsliste mit Nachkauf-Hinweisen: Steht die Zutat schon zum Kaufen drauf, bekommt sie nur den
 * Hinweis. Stünde sie sonst unter „Basics“ oder „Hast du schon“, kommt sie auf die Liste. Sonst neu dazu.
 */
export function withRestock(list: ShoppingItem[], needs: readonly RestockNeed[]): ShoppingItem[] {
  const out = [...list];
  for (const n of needs) {
    const i = out.findIndex((x) => x.key === n.key);
    if (i >= 0) {
      out[i] = { ...out[i], pantry: false, covered: false, restock: n.label, ...(out[i].covered ? { quantity: '' } : {}) };
    } else {
      out.push({ key: RESTOCK_PREFIX + n.key, name: n.name, quantity: '', pantry: false, from: [], ...(n.kind ? { kind: n.kind } : {}), restock: n.label });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Einkaufsliste mit allem – was Liste, Zähler und Kassenbon benutzen */
export function shoppingList(plan: MealPlan, recipes: Recipe[], table: FoodTable, pantry: Pantry, products: readonly MyProduct[] = []): ShoppingItem[] {
  const list = buildShoppingList(plan, recipes, table, pantry);
  if (!pantry.restock?.length) return list;
  return withRestock(list, restockNeeds(pantry, table, products, pantryAfterPlan(pantry, plan, recipes, table)));
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

/** Summe des Vorrats in der Einheit der Regel; undefined = nicht sicher zu sagen */
function stockIn(items: readonly PantryItem[], key: string, unit: PantryUnit, table: FoodTable, sizes: Sizes): { value: number; approx: boolean } | undefined {
  let value = 0;
  let approx = false;
  for (const it of items) {
    if (resolveIngredient({ id: it.id, name: it.name }, 1, table)?.key !== key) continue;
    if (it.amount === undefined || it.unit === undefined) return undefined;
    if (it.amount <= 0) continue;
    if (it.unit === unit || (!isCount(it.unit) && !isCount(unit))) {
      value += it.amount;
      continue;
    }
    const from = gramsPer(it.unit, sizes, it.productId);
    const to = gramsPer(unit, sizes);
    if (!from || !to) return undefined;
    value += (it.amount * from) / to;
    approx = true;
  }
  return { value, approx };
}
