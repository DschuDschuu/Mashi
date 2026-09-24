import type { FoodEntry, FoodKind, FoodTable } from './nutrition/types';
import { toGrams } from './nutrition/units';
import { normalizeName } from './nutrition/localFoods';
import { currentContent } from './recipe';
import { formatAmount, formatUnitAmount } from './scaling';
import type { Ingredient, Recipe, Unit } from './types';

/** Der Wochenplan: eine Liste „Diese Woche“ – ohne feste Tage, passend zu Meal Prep. */
export interface PlanItem {
  recipeId: string;
  servings: number;
}

export interface MealPlan {
  items: PlanItem[];
  /** abgehakte Einträge der Einkaufsliste (ShoppingItem.key) */
  checked: string[];
  updatedAt: string;
}

export const emptyPlan = (): MealPlan => ({ items: [], checked: [], updatedAt: new Date(0).toISOString() });

/**
 * Grundvorrat: hat man meist zu Hause. Zählt nicht für Vorschläge und steht nicht
 * auf der Einkaufsliste (einblendbar). Dazu kommen alle „vernachlässigbaren“ Lebensmittel
 * der Tabelle (Salz, Pfeffer, Kräuter, Wasser …).
 */
const PANTRY = new Set([
  'rapsoel', 'olivenoel', 'sesamoel', 'currypulver', 'paprikapulver', 'huehnerbruehe-pulver',
  'gemuesebruehe', 'speisestaerke', 'mehl', 'apfelessig', 'reisessig',
]);

/**
 * Wie wichtig eine gemeinsame Zutat für Meal Prep ist. Hähnchen, Pasta, Milchprodukte,
 * Eier und Brot bestimmen den Einkauf – Gemüse und Obst sind eher austauschbar.
 * Alles ohne feste Art (Soßen, Pasten, Hülsenfrüchte …) zählt normal.
 */
export const KIND_WEIGHT: Record<FoodKind, number> = {
  protein: 3, staple: 3, dairy: 3, egg: 3, bread: 3, vegetable: 0.3, fruit: 0.3,
};

/**
 * Für Zutaten, die die Tabelle nicht kennt (oder ohne Art): grob am Namen erkennen.
 * Nur fürs Gewichten – Nährwerte werden daraus nie abgeleitet.
 */
const KIND_BY_NAME: [FoodKind, RegExp][] = [
  ['bread', /brot|brötchen|toast|wrap|tortilla|fladen|baguette|pita|bagel/],
  // „hack“ nur am Wortende (Rinderhack, Hackfleisch) – nicht „gehackte Mandeln“
  ['protein', /hähnchen|huhn|hühner|pute|rind|schwein|lachs|thunfisch|fisch|garnele|shrimp|tofu|tempeh|hack(fleisch)?\b|steak|filet/],
  // „reis“ nur am Wortanfang/-ende (Basmatireis, Reisnudeln) – nicht „Preiselbeeren“
  ['staple', /nudel|pasta|spaghetti|penne|(^|[\s-])reis|reis($|[\s-])|kartoffel|couscous|bulgur|quinoa|gnocchi|spätzle/],
  ['dairy', /käse|joghurt|quark|milch|sahne|skyr|feta|ricotta|mascarpone/],
  ['egg', /(^|\s)eier?(\s|$)/],
];

function kindFor(food: FoodEntry | undefined, name: string): FoodKind | undefined {
  if (food?.kind) return food.kind;
  const n = normalizeName(name);
  return KIND_BY_NAME.find(([, re]) => re.test(n))?.[0];
}

interface Resolved {
  /** gleiche Lebensmittel → gleicher Schlüssel, auch bei verschiedenen Namen („Pasta“/„Nudeln“) */
  key: string;
  name: string;
  pantry: boolean;
  /** Wichtigkeit für Vorschläge (siehe KIND_WEIGHT), 1 = normal */
  weight: number;
  grams?: number;
  amount?: number;
  unit?: Unit;
}

function resolve(ing: Ingredient, factor: number, table: FoodTable): Resolved | null {
  if (ing.optional) return null;
  const match = ing.foodRef ? { food: table.byRef(ing.foodRef)! } : table.matchName(ing.name);
  const food = match?.food;
  const amount = ing.amount !== undefined ? ing.amount * factor : undefined;
  // Gramm und Kilo lassen sich auch ohne bekanntes Lebensmittel zusammenzählen
  const grams = amount === undefined ? undefined
    : food ? toGrams(amount, ing.unit, food)?.grams
    : ing.unit === 'g' ? amount : ing.unit === 'kg' ? amount * 1000 : undefined;
  const kind = kindFor(food, ing.name);
  return {
    key: food ? `food:${food.ref.foodId}` : `name:${normalizeName(ing.name)}`,
    name: food?.name ?? ing.name,
    pantry: !!food && (!!food.negligible || PANTRY.has(food.ref.foodId)),
    weight: kind ? KIND_WEIGHT[kind] : 1,
    grams,
    amount,
    unit: ing.unit,
  };
}

function resolveRecipe(r: Recipe, servings: number, table: FoodTable): Resolved[] {
  const c = currentContent(r);
  const factor = servings / c.servings;
  return c.ingredients.map((i) => resolve(i, factor, table)).filter((x): x is Resolved => x !== null);
}

// ── Vorschläge ─────────────────────────────────────────────────────

export interface Suggestion {
  recipe: Recipe;
  score: number;
  /** gemeinsame Zutaten, wichtigste zuerst */
  shared: string[];
}

/**
 * Welche Rezepte passen zu dem, was schon geplant ist? Je mehr gemeinsame Zutaten
 * (ohne Grundvorrat), desto besser – gewichtet nach Menge (600 g Hähnchen zählen mehr
 * als eine Zwiebel) UND nach Art (Hähnchen, Pasta, Milchprodukte ×3, Gemüse und Obst ×0,3).
 * Ein kleiner Bonus je gemeinsamer Zutat, damit auch Kleinkram zählt.
 */
export function suggestRecipes(plan: MealPlan, all: Recipe[], table: FoodTable, limit = 5): Suggestion[] {
  const planned = new Set(plan.items.map((i) => i.recipeId));
  if (!planned.size) return [];

  const have = new Map<string, number>(); // Schlüssel → Gramm (oder 1 ohne Gewicht)
  for (const item of plan.items) {
    const r = all.find((x) => x.id === item.recipeId);
    if (!r) continue;
    for (const x of resolveRecipe(r, item.servings, table)) {
      if (!x.pantry) have.set(x.key, (have.get(x.key) ?? 0) + (x.grams ?? 1));
    }
  }

  return all
    .filter((r) => !planned.has(r.id) && !r.archivedAt && r.status !== 'ki_entwurf')
    .map((r) => {
      const byKey = new Map<string, { name: string; grams: number; weight: number }>();
      for (const x of resolveRecipe(r, currentContent(r).servings, table)) {
        if (x.pantry || !have.has(x.key)) continue;
        const prev = byKey.get(x.key);
        byKey.set(x.key, { name: x.name, grams: (prev?.grams ?? 0) + (x.grams ?? 1), weight: x.weight });
      }
      const sharedList = [...byKey.entries()]
        .map(([key, v]) => ({ name: v.name, points: v.weight * (Math.min(v.grams, have.get(key)!) + 25) }))
        .sort((a, b) => b.points - a.points);
      const score = sharedList.reduce((s, x) => s + x.points, 0);
      return { recipe: r, score, shared: sharedList.map((x) => x.name) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Einkaufsliste ──────────────────────────────────────────────────

export interface ShoppingItem {
  /** stabil, damit Haken erhalten bleiben, wenn sich Mengen ändern */
  key: string;
  name: string;
  /** z. B. „950 g“, „3 Stück“, „2 Stück + 150 g“ */
  quantity: string;
  pantry: boolean;
  /** aus welchen Rezepten */
  from: string[];
}

/**
 * Fasst alle Zutaten der geplanten Rezepte zusammen (auf die geplanten Portionen umgerechnet).
 * Gleiche Einheit → addieren. Verschiedene Einheiten → in Gramm, wo möglich.
 * Was sich nicht umrechnen lässt, steht getrennt da – nie falsch zusammengezählt.
 */
export function buildShoppingList(plan: MealPlan, all: Recipe[], table: FoodTable): ShoppingItem[] {
  const groups = new Map<string, { name: string; pantry: boolean; parts: Resolved[]; from: Set<string> }>();
  for (const item of plan.items) {
    const r = all.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const title = currentContent(r).title;
    for (const x of resolveRecipe(r, item.servings, table)) {
      const g = groups.get(x.key) ?? { name: x.name, pantry: x.pantry, parts: [], from: new Set<string>() };
      g.parts.push(x);
      g.from.add(title);
      groups.set(x.key, g);
    }
  }

  return [...groups.entries()]
    .map(([key, g]) => ({ key, name: g.name, quantity: quantityOf(g.parts), pantry: g.pantry, from: [...g.from] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function quantityOf(parts: Resolved[]): string {
  const withAmount = parts.filter((p) => p.amount !== undefined);
  if (!withAmount.length) return '';
  const units = new Set(withAmount.map((p) => p.unit ?? ''));
  // Alle in derselben Einheit → einfach addieren („3 Stück“, „2 EL“)
  if (units.size === 1) {
    const unit = withAmount[0].unit;
    const sum = withAmount.reduce((s, p) => s + p.amount!, 0);
    return formatUnitAmount(sum, unit);
  }
  // Gemischt → umrechenbare in Gramm, Rest einzeln
  const grams = withAmount.filter((p) => p.grams !== undefined).reduce((s, p) => s + p.grams!, 0);
  const rest = withAmount.filter((p) => p.grams === undefined).map((p) => formatUnitAmount(p.amount!, p.unit));
  return [...(grams ? [`${formatAmount(grams, 'g')} g`] : []), ...rest].join(' + ');
}
