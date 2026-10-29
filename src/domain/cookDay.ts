import { cookingContent } from './homemade';
import type { Household, Week, WeekMeal, Weekday } from './mealplan';
import { scaleIngredients } from './scaling';
import { comboSteps, sideIngredient } from './sides';
import type { Recipe, RecipeContent, Step } from './types';
import { FRESH_DAYS, keepsOf, servingsOf, slotIndex, slotOf, weekOrder, type MealView, type WeekView } from './week';

/**
 * Kochtag in einem Durchgang (Julia: „10 Portionen vorkochen, aber heute schon was davon essen – die frischen Zutaten
 * sollen mitkommen“): Vorkochen und das Essen von heute stehen in einer Liste und einem Ablauf. Die Grundlage zählt
 * alle Portionen der Woche, das Frische nur die Portionen von heute – wie im Wochenplan eingestellt.
 */

/** Das Essen am Kochtag aus dieser Grundlage, noch nicht gegessen (mittags am Kochtag ist sie noch nicht fertig) */
export function cookDayMeal(week: Week, baseId: string): WeekMeal | undefined {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base || base.cooked) return undefined;
  return week.meals.find((m) => m.baseId === baseId && m.day === base.day && !m.lunch && !m.done);
}

export type CookStart =
  | { prep: true; baseId: string; portions: number }
  | { prep: false; recipeId: string; mealId: string; portions: number };

/**
 * „Kochmodus starten“ an einem Essen der Woche (Julia: im Wochenplan-Fenster): Grundlage schon gekocht → das Gericht
 * mit seinen Portionen (die Grundlage kommt aus dem Kühlschrank). Am Kochtag, noch nicht gekocht → Vorkochen, das Essen
 * kommt im selben Durchgang mit. Nichts zu kochen: nur die Grundlage aufwärmen, oder sie ist erst später dran.
 */
export function cookStart(view: WeekView, m: MealView, household: Household): CookStart | undefined {
  if (m.meal.done) return undefined;
  const b = view.bases.find((x) => x.base.recipeId === m.meal.baseId);
  if (b && !b.base.cooked) return m.age === 0 && !m.meal.lunch ? { prep: true, baseId: b.base.recipeId, portions: b.portions } : undefined;
  // nur aufwärmen – oder das Frische wurde am Abend vorher schon mitgekocht
  if (m.meal.recipeId === m.meal.baseId || m.meal.freshCooked) return undefined;
  return { prep: false, recipeId: m.meal.recipeId, mealId: m.meal.id, portions: servingsOf(m.meal, household) };
}

/**
 * Wie viele Tage später mitgekochtes Frisches noch gut ist (Julia: „wenn etwas länger hält, soll es sich daran
 * orientieren“): „Hält gekocht X Tage“ am Gericht – ohne eigene Angabe „Vorgekochtes hält“ (keepsFallback), wie der
 * Regler auf der Rezeptseite zeigt – frisch bis X−1 Tage nach dem Kochen, wie beim Kühlschrank (fridgeOf). Bei der
 * Grundlage mit Bausteinen sind nur Nudeln, Reis … frisch – dass die Bolo 3 Tage hält, sagt nichts über die Nudeln:
 * dann FRESH_DAYS wie bei zweimal Nudeln (carbCarry).
 */
export function freshDaysOf(meal: Pick<WeekMeal, 'recipeId' | 'baseId'>, recipes: readonly Recipe[], keepsFallback?: number): number {
  const dish = meal.recipeId !== meal.baseId ? recipes.find((r) => r.id === meal.recipeId) : undefined;
  return dish ? Math.max(0, keepsOf(dish, keepsFallback) - 1) : FRESH_DAYS;
}

/**
 * Dasselbe Gericht in den nächsten Tagen: der Kochmodus bietet an, das Frische dafür gleich mitzukochen. Mittags und
 * abends, solange es frisch bleibt (freshDaysOf, `until` = letzter frischer Tag), noch offen, gleiches Gericht mit
 * gleichen Bausteinen – in der Reihenfolge der Woche.
 */
export function alongMeals(week: Week, meal: WeekMeal, recipes: readonly Recipe[], keepsFallback?: number): { meals: WeekMeal[]; until: Weekday } {
  const order = weekOrder(week);
  const at = slotIndex(order, slotOf(meal));
  const from = order.indexOf(meal.day);
  const days = freshDaysOf(meal, recipes, keepsFallback);
  const meals = week.meals
    .filter((m) => {
      const later = slotIndex(order, slotOf(m)) - at;
      return later > 0 && order.indexOf(m.day) - from <= days && !m.done && !m.freshCooked && m.recipeId === meal.recipeId && m.baseId === meal.baseId && m.side === meal.side;
    })
    .sort((a, b) => slotIndex(order, slotOf(a)) - slotIndex(order, slotOf(b)));
  return { meals, until: order[Math.min(order.length - 1, from + days)] };
}

/** vor jeder id – damit sich Frisches und Grundlage nicht mischen (Mengen „nur dieses Mal“ hängen an der id) */
export const TODAY = 'heute:';

/**
 * Was zu diesem Essen frisch dazukommt, für EINE Portion: das Gericht ohne seine Grundlage (die Spaghetti zur Bolo)
 * und die Bausteine (Reis, Parmesan) mit ihrer Zubereitung – das Längste zuerst. Nichts frisch (nur die Grundlage
 * selbst): undefined, dann gibt es auch nichts zu fragen.
 */
export function freshFor(meal: WeekMeal, recipes: readonly Recipe[], household: Household): RecipeContent | undefined {
  const dish = meal.recipeId !== meal.baseId ? recipes.find((r) => r.id === meal.recipeId) : undefined;
  const own = dish ? cookingContent(dish, recipes, [meal.baseId]) : undefined;
  // Zubereitung wie im Wochenplan (ComboSteps) – auch die nur für diese Grundlage
  const sides = comboSteps(meal.side, '', household, recipes.find((r) => r.id === meal.baseId)).filter((s) => s.id);
  const ingredients = [
    ...(own ? scaleIngredients(own, 1) : []),
    ...sides.flatMap((s) => sideIngredient(s.id!, 1, household) ?? []),
  ];
  if (!ingredients.length) return undefined;
  const steps: Step[] = [
    ...(own?.steps ?? []).filter((s) => s.text.trim()),
    ...sides.map((s): Step => ({ id: `beilage:${s.id}`, text: `${s.name}: ${s.text ?? 'zubereiten'}`, ingredientIds: [`beilage:${s.id}`], ...(s.minutes > 0 ? { timerMinutes: s.minutes } : {}) })),
  ];
  return {
    ...(own ?? { title: '', description: '', prepMinutes: 0, cookMinutes: 0, difficulty: 1, categories: [], tags: [], devices: [] }),
    servings: 1,
    ingredients: ingredients.map((i) => ({ ...i, id: TODAY + i.id })),
    steps: steps.map((s) => ({ ...s, id: TODAY + s.id, ...(s.ingredientIds ? { ingredientIds: s.ingredientIds.map((x) => TODAY + x) } : {}) })),
  };
}
