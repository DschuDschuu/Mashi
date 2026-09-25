import { resolveIngredient } from './mealplan';
import type { MyProduct } from './nutrition/myProducts';
import type { FoodTable } from './nutrition/types';
import type { RecipeContent } from './types';

/**
 * Was kostet ein Gericht? Preise kommen vom Kassenbon (automatisch) oder aus „Meine Produkte“
 * (von Hand). Gerechnet wird nur mit bekannten Preisen – fehlt einer, steht die Zutat in
 * „missing“, statt dass Mashi einen Preis erfindet.
 */
export interface PriceEntry {
  /** Name wie in der Speisekammer („Magerquark“) – darüber findet Mashi die Zutat im Rezept */
  name: string;
  /** Euro je Gramm (bzw. ml) oder je Stück */
  perUnit: number;
  unit: 'g' | 'Stück';
  /** wann bezahlt – der neueste Preis gewinnt */
  date: string;
}

export interface Cost {
  total: number;
  perServing: number;
  /** Zutaten ohne bekannten Preis (Grundvorrat wie Salz und Öl zählt hier nicht) */
  missing: string[];
}

/** Preise aus „Meine Produkte“: Preis je Packung ÷ Packungsgröße. */
export function productPrices(products: MyProduct[]): PriceEntry[] {
  return products
    .filter((p) => p.packagePrice !== undefined && p.packageAmount)
    .map((p) => ({
      name: p.name,
      perUnit: p.packagePrice! / p.packageAmount!,
      unit: p.packageUnit === 'Stück' ? 'Stück' : 'g',
      date: p.updatedAt,
    }));
}

export function recipeCost(content: RecipeContent, servings: number, table: FoodTable, prices: PriceEntry[]): Cost | null {
  // Gleiche Zutat, mehrere Preise (z. B. zwei Bons) → der neueste zählt
  const byKey = new Map<string, PriceEntry>();
  for (const p of [...prices].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = resolveIngredient({ id: '', name: p.name }, 1, table)?.key;
    if (key) byKey.set(key, p);
  }

  const factor = servings / content.servings;
  let total = 0;
  let priced = 0;
  const missing: string[] = [];
  for (const ing of content.ingredients) {
    const need = resolveIngredient(ing, factor, table);
    if (!need || need.food?.negligible) continue;
    const price = byKey.get(need.key);
    const qty = price && quantityIn(price.unit, need);
    if (!price || qty === undefined) {
      if (!need.pantry) missing.push(need.name);
      continue;
    }
    total += qty * price.perUnit;
    priced++;
  }
  if (!priced) return null;
  return { total: round(total), perServing: round(total / servings), missing: [...new Set(missing)] };
}

/** Wie viel davon das Rezept braucht – in der Einheit des Preises. */
function quantityIn(unit: 'g' | 'Stück', need: NonNullable<ReturnType<typeof resolveIngredient>>): number | undefined {
  if (need.amount === undefined) return undefined;
  if (unit === 'g') return need.grams ?? (need.unit === 'ml' ? need.amount : undefined);
  if (need.unit === 'Stück' || need.unit === 'Dose' || need.unit === undefined) return need.amount;
  const piece = need.food?.portions?.Stück;
  return need.grams !== undefined && piece ? need.grams / piece : undefined;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Wochenplan: Kosten je Gericht und zusammen. */
export function sumCosts(costs: (Cost | null)[]): { total: number; missing: string[]; unknown: number } {
  const known = costs.filter((c): c is Cost => c !== null);
  return {
    total: round(known.reduce((s, c) => s + c.total, 0)),
    missing: [...new Set(known.flatMap((c) => c.missing))],
    unknown: costs.length - known.length,
  };
}
