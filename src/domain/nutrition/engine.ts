import type { RecipeContent } from '../types';
import { toGrams } from './units';
import {
  CORE_NUTRIENTS, OPTIONAL_NUTRIENTS,
  type FoodTable, type IngredientNutrition, type NutritionAccuracy, type NutritionResult, type Nutrients,
} from './types';

/**
 * Ab diesem Anteil nicht zuordenbarer Zutaten zeigen wir gar keine Werte mehr.
 * Lieber „nicht verfügbar“ als eine Zahl, die nur so tut, als wäre sie genau.
 */
export const UNAVAILABLE_SHARE = 0.3;

/**
 * Berechnet Nährwerte rein mathematisch aus Zutaten × Lebensmitteltabelle.
 * Keine Zahl stammt aus der KI – die Engine kennt nur Zutaten, Mengen und die FoodTable.
 */
export function computeNutrition(content: RecipeContent, table: FoodTable): NutritionResult {
  const items: IngredientNutrition[] = content.ingredients.map((ing) => {
    const base = { ingredientId: ing.id, name: ing.name };
    const refFood = ing.foodRef ? table.byRef(ing.foodRef) : undefined;
    const match = refFood ? { food: refFood, quality: 'exact' as const } : table.matchName(ing.name);

    if (ing.optional) return { ...base, status: 'ignored', food: match?.food };
    if (!match) return { ...base, status: ing.amount === undefined ? 'no-amount' : 'unmatched', grams: gramsIfObvious(ing.amount, ing.unit) };
    if (ing.amount === undefined) return { ...base, status: match.food.negligible ? 'ignored' : 'no-amount', food: match.food };

    const conv = toGrams(ing.amount, ing.unit, match.food);
    if (!conv) return { ...base, status: 'no-weight', food: match.food };
    const status = match.quality === 'exact' && !conv.rough ? 'exact' : 'approx';
    return { ...base, status, food: match.food, grams: conv.grams };
  });

  const counted = items.filter((i) => i.status !== 'ignored');
  const accuracy = rateAccuracy(counted);
  if (accuracy === 'nicht_verfuegbar') return { accuracy, total: null, perServing: null, items };

  const contributing = counted.filter((i) => i.food && i.grams !== undefined && (i.status === 'exact' || i.status === 'approx'));
  const total = sumNutrients(contributing.map((i) => ({ per100g: i.food!.per100g, grams: i.grams! })));
  return { accuracy, total, perServing: divide(total, content.servings), items };
}

function rateAccuracy(counted: IngredientNutrition[]): NutritionAccuracy {
  if (counted.length === 0) return 'nicht_verfuegbar';
  const matchedGrams = counted.reduce((s, i) => s + (i.status === 'exact' || i.status === 'approx' ? i.grams ?? 0 : 0), 0);
  if (matchedGrams === 0) return 'nicht_verfuegbar';

  const unmatched = counted.filter((i) => i.status === 'unmatched' || i.status === 'no-weight' || i.status === 'no-amount');
  const unmatchedGrams = unmatched.reduce((s, i) => s + (i.grams ?? 0), 0);
  const byWeight = unmatchedGrams / (matchedGrams + unmatchedGrams);
  const byCount = unmatched.length / counted.length;
  if (byWeight > UNAVAILABLE_SHARE || byCount > UNAVAILABLE_SHARE) return 'nicht_verfuegbar';

  return counted.every((i) => i.status === 'exact') ? 'berechnet' : 'geschaetzt';
}

/** Für nicht zuordenbare Zutaten kennen wir das Gewicht nur bei g/ml – wichtig für den Gewichtsanteil. */
function gramsIfObvious(amount: number | undefined, unit: string | undefined): number | undefined {
  if (amount === undefined) return undefined;
  if (unit === 'g' || unit === 'ml') return amount;
  if (unit === 'kg' || unit === 'l') return amount * 1000;
  return undefined;
}

function sumNutrients(parts: { per100g: Nutrients; grams: number }[]): Nutrients {
  const total: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { per100g, grams } of parts) {
    for (const k of CORE_NUTRIENTS) total[k] += (per100g[k] * grams) / 100;
  }
  // Optionale Werte nur, wenn JEDE beteiligte Zutat sie kennt – sonst wäre die Summe zu niedrig.
  for (const k of OPTIONAL_NUTRIENTS) {
    if (parts.length > 0 && parts.every((p) => p.per100g[k] !== undefined)) {
      total[k] = parts.reduce((s, p) => s + (p.per100g[k]! * p.grams) / 100, 0);
    }
  }
  return total;
}

function divide(n: Nutrients, by: number): Nutrients {
  const out = {} as Nutrients;
  for (const [k, v] of Object.entries(n) as [keyof Nutrients, number][]) out[k] = v / by;
  return out;
}
