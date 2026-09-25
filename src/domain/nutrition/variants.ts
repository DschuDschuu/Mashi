import type { PantryItem } from '../pantry';
import type { RecipeContent } from '../types';
import { OPTIONAL_NUTRIENTS, CORE_NUTRIENTS, type FoodTable, type FoodVariant, type Nutrients, type NutritionResult } from './types';

/**
 * Sorten: mehrere eigene Produkte für dieselbe Zutat („Grünes Pesto“ von Lidl und von K-Classic).
 *
 * - Beim Stöbern rechnet ein Rezept mit dem Durchschnitt deiner Sorten; verändern die Sorten das
 *   Gericht spürbar, steht die Spanne dabei („je nach Sorte 610–650 kcal“).
 * - Beim Planen und Kochen zählt die Sorte, die du wirklich nimmst: liegt nur eine im Vorrat,
 *   automatisch diese; liegen mehrere da, darfst du wählen – vorgeschlagen ist die, die am
 *   nächsten an deinem Makro-Ziel liegt.
 */

/** Makro-Ziel als Anteil an den Kalorien (Prozent), z. B. 40 / 30 / 30 */
export interface MacroGoal { carbs: number; protein: number; fat: number }
export const DEFAULT_MACRO_GOAL: MacroGoal = { carbs: 40, protein: 30, fat: 30 };

/** ab diesem Anteil am Gericht lohnt sich die Spanne – darunter wäre sie nur Rauschen */
export const NOTICEABLE_SHARE = 0.05;

/** Mittelwert; Zusatzwerte (Zucker …) nur, wenn jede Sorte sie kennt */
export function averageNutrients(list: Nutrients[]): Nutrients {
  const avg = {} as Nutrients;
  for (const k of CORE_NUTRIENTS) avg[k] = list.reduce((s, n) => s + n[k], 0) / list.length;
  for (const k of OPTIONAL_NUTRIENTS) {
    if (list.every((n) => n[k] !== undefined)) avg[k] = list.reduce((s, n) => s + n[k]!, 0) / list.length;
  }
  return avg;
}

/** Anteil an den Kalorien in Prozent – Eiweiß und Kohlenhydrate 4 kcal/g, Fett 9 kcal/g */
export function macroShares(n: Pick<Nutrients, 'carbs' | 'protein' | 'fat'>): MacroGoal {
  const c = n.carbs * 4, p = n.protein * 4, f = n.fat * 9;
  const sum = c + p + f;
  if (sum <= 0) return { carbs: 0, protein: 0, fat: 0 };
  return { carbs: (c / sum) * 100, protein: (p / sum) * 100, fat: (f / sum) * 100 };
}

/** Wie weit weg vom Ziel (Summe der Abweichungen in Prozentpunkten) – kleiner = besser */
export function macroDistance(n: Nutrients, goal: MacroGoal): number {
  const s = macroShares(n);
  return Math.abs(s.carbs - goal.carbs) + Math.abs(s.protein - goal.protein) + Math.abs(s.fat - goal.fat);
}

export function bestVariant(variants: FoodVariant[], goal: MacroGoal): FoodVariant {
  return [...variants].sort((a, b) => macroDistance(a.per100g, goal) - macroDistance(b.per100g, goal))[0];
}

/** Sorten, von denen gerade etwas im Vorrat liegt (erkannt am Produkt – vom Bon oder Barcode) */
export function variantsInStock(variants: FoodVariant[], items: readonly PantryItem[]): FoodVariant[] {
  const have = new Set(items.filter((it) => it.productId && (it.amount === undefined || it.amount > 0)).map((it) => it.productId));
  return variants.filter((v) => have.has(v.id));
}

/** Eine Zutat, bei der die Sorte zählt, weil mindestens eine im Vorrat liegt */
export interface VariantChoice {
  ingredientId: string;
  /** Zutat, wie sie im Rezept steht */
  name: string;
  /** Sorten im Vorrat – ab zwei darfst du wählen */
  options: FoodVariant[];
  /** vorgeschlagen: der Favorit, wenn er da ist – sonst die einzige – sonst die, die am besten zum Makro-Ziel passt */
  suggested: string;
  /** alle Sorten (auch nicht vorrätige) – zum Setzen des Favoriten */
  all: FoodVariant[];
  /** Favorit liegt im Vorrat → nicht nachfragen */
  favoriteInStock: boolean;
}

/**
 * Für Plan und Kochmodus: bei welchen Zutaten die Sorte zählt und welche vorgeschlagen ist.
 * Nichts im Vorrat → keine Auswahl, dann bleibt der Durchschnitt.
 */
export function variantChoices(content: RecipeContent, table: FoodTable, items: readonly PantryItem[], goal: MacroGoal): VariantChoice[] {
  const out: VariantChoice[] = [];
  for (const ing of content.ingredients) {
    if (ing.optional) continue;
    const food = (ing.foodRef ? table.byRef(ing.foodRef) : undefined) ?? table.matchName(ing.name)?.food;
    if (!food?.variants?.length) continue;
    const options = variantsInStock(food.variants, items);
    if (!options.length) continue;
    const fav = options.find((o) => o.favorite);
    out.push({ ingredientId: ing.id, name: ing.name, options, suggested: (fav ?? bestVariant(options, goal)).id, all: food.variants, favoriteInStock: !!fav });
  }
  return out;
}

/** Nachfragen nur, wenn mehrere Sorten da sind und kein Favorit darunter ist */
export function needsAsking(choices: VariantChoice[]): boolean {
  return choices.some((c) => c.options.length > 1 && !c.favoriteInStock);
}

/** Favorit setzen (oder mit null zurücknehmen) – je Zutat höchstens einer */
export function withFavorite<P extends { id: string; favorite?: boolean }>(products: P[], group: readonly { id: string }[], favoriteId: string | null): P[] {
  const ids = new Set(group.map((g) => g.id));
  return products.map((p) => {
    if (!ids.has(p.id)) return p;
    const { favorite: _old, ...rest } = p;
    return (p.id === favoriteId ? { ...rest, favorite: true } : rest) as P;
  });
}

/** Vorschläge als fertige Wahl (Zutat → Produkt) – deine eigene Wahl geht vor, solange die Sorte noch da ist */
export function pickFor(choices: VariantChoice[], own: Readonly<Record<string, string>> = {}): Record<string, string> {
  return Object.fromEntries(choices.map((c) => [c.ingredientId, c.options.some((o) => o.id === own[c.ingredientId]) ? own[c.ingredientId] : c.suggested]));
}

/** Spanne pro Portion, aber nur wenn die Sorten das Gericht spürbar (≥ 5 %) verändern */
export function noticeableRange(n: NutritionResult): { kcal: [number, number]; protein: [number, number] } | null {
  if (!n.range || !n.total || !n.perServing || n.total.kcal <= 0) return null;
  const [lo, hi] = n.range.kcal;
  if ((hi - lo) / n.total.kcal < NOTICEABLE_SHARE) return null;
  const f = n.perServing.kcal / n.total.kcal;
  const per = (r: [number, number]): [number, number] => [r[0] * f, r[1] * f];
  return { kcal: per(n.range.kcal), protein: per(n.range.protein) };
}
