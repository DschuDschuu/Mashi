import { ownIngredients, ownMinutes, readyPortions, readyPrep, weekCookSteps } from './craving';
import { spiceOf, type StyleStep } from './cookStyle';
import { cookingContent } from './homemade';
import type { Household, Week, WeekMeal, Weekday } from './mealplan';
import { scaleIngredients } from './scaling';
import type { PantryItem } from './pantry';
import { stepPart } from './parts';
import { currentContent } from './recipe';
import { bareSide, comboSteps, ownSidesOf, sideIngredient, sidesOf, styleOf } from './sides';
import type { Ingredient, Recipe, RecipeContent, Step } from './types';
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
 * gleichen Bausteinen – in der Reihenfolge der Woche. Würze und Zubereitung zählen nicht (Julia: trotzdem anbieten,
 * mit Hinweis – mitgekocht wird es wie heute, siehe alongNote).
 */
export function alongMeals(week: Week, meal: WeekMeal, recipes: readonly Recipe[], keepsFallback?: number): { meals: WeekMeal[]; until: Weekday } {
  const order = weekOrder(week);
  const at = slotIndex(order, slotOf(meal));
  const from = order.indexOf(meal.day);
  const days = freshDaysOf(meal, recipes, keepsFallback);
  const meals = week.meals
    .filter((m) => {
      const later = slotIndex(order, slotOf(m)) - at;
      return later > 0 && order.indexOf(m.day) - from <= days && !m.done && !m.freshCooked && m.recipeId === meal.recipeId && m.baseId === meal.baseId && bareSide(m.side) === bareSide(meal.side);
    })
    .sort((a, b) => slotIndex(order, slotOf(a)) - slotIndex(order, slotOf(b)));
  return { meals, until: order[Math.min(order.length - 1, from + days)] };
}

/**
 * Mitkochen, obwohl dort anders geplant (Julia: „Anbieten, mit Hinweis“): was dort anders gewesen wäre – mitgekocht
 * gibt es das von heute. Die Würze zuerst, die schmeckt man; undefined, wenn gleich geplant.
 */
export function alongNote(meal: Pick<WeekMeal, 'side'>, today: Pick<WeekMeal, 'side'>): string | undefined {
  const a = styleOf(meal.side);
  const b = styleOf(today.side);
  const spice = spiceOf(a.spice, a.direction);
  if (spice?.id !== spiceOf(b.spice, b.direction)?.id) return `geplant ${spice?.name ?? 'ungewürzt'} – wird wie heute`;
  const ways = (s: typeof a) => Object.entries(s.ways).sort(([x], [y]) => x.localeCompare(y)).join(';');
  return a.direction !== b.direction || ways(a) !== ways(b) ? 'geplant anders zubereitet – wird wie heute' : undefined;
}

/** vor jeder id – damit sich Frisches und Grundlage nicht mischen (Mengen „nur dieses Mal“ hängen an der id) */
export const TODAY = 'heute:';

/**
 * Was zu diesem Essen frisch dazukommt, für EINE Portion: das Gericht ohne seine Grundlage (die Spaghetti zur Bolo)
 * und die Bausteine (Reis, Parmesan) mit ihrer Zubereitung – das Längste zuerst. Nichts frisch (nur die Grundlage
 * selbst): undefined, dann gibt es auch nichts zu fragen.
 */
export function freshFor(meal: WeekMeal, recipes: readonly Recipe[], household: Household, items: readonly PantryItem[] = []): RecipeContent | undefined {
  const dish = meal.recipeId !== meal.baseId ? recipes.find((r) => r.id === meal.recipeId) : undefined;
  const own = dish ? cookingContent(dish, recipes, [meal.baseId]) : undefined;
  // Zubereitung wie im Wochenplan (ComboSteps: weekCookSteps) – mit Kochstil, auch die nur für diese Grundlage. Die
  // Grundlage wird heute erst gekocht, nicht aufgewärmt: in ihr gart nichts mit (basePot: false). Ohne Grundlage
  // (gelöscht) wie früher, ohne Kochstil.
  const baseRecipe = recipes.find((r) => r.id === meal.baseId);
  const sides = sidesOf(meal.side);
  const styled: StyleStep[] = baseRecipe
    ? weekCookSteps(meal.side, baseRecipe, { household, recipes, items, portions: servingsOf(meal, household), basePot: false }).filter((s) => s.fixed || s.serving)
    : comboSteps(meal.side, '', household).filter((s) => s.id).map((s) => ({ ids: [s.id!], name: s.name, text: s.text, minutes: s.minutes, fixed: true }));
  // deine Rezepte als Baustein (die Guacamole): steht genug vorgekocht da, nur „aus dem Kühlschrank“ – sonst seine
  // Zutaten (für eine Portion) und Schritte, der erste mit dem Namen davor
  const mine = ownSidesOf(meal.side).flatMap((o): { ingredients: Ingredient[]; steps: Step[]; minutes: number }[] => {
    const r = recipes.find((x) => x.id === o.recipeId);
    if (!r) return [];
    const pre = `mein:${o.recipeId}:`;
    if (readyPortions(items, o.recipeId, o.part, true) >= servingsOf(meal, household)) {
      const p = readyPrep(o.kind);
      return [{ ingredients: [], minutes: p.minutes, steps: [{ id: `${pre}fertig`, text: `${o.name}: ${p.text}`, ...(p.minutes ? { timerMinutes: p.minutes } : {}) }] }];
    }
    const c = o.part ? currentContent(r) : cookingContent(r, recipes);
    const steps = c.steps.filter((st) => st.text.trim() && (!o.part || stepPart(st, c) === o.part)).map((st, k): Step => ({
      ...st, id: pre + st.id, text: k === 0 ? `${o.name}: ${st.text}` : st.text,
      ...(st.ingredientIds ? { ingredientIds: st.ingredientIds.map((x) => pre + x) } : {}),
    }));
    return [{ ingredients: ownIngredients(r, o.part, 1, recipes).map((i) => ({ ...i, id: pre + i.id })), steps, minutes: ownMinutes(c, o.part) }];
  });
  const ingredients = [
    ...(own ? scaleIngredients(own, 1) : []),
    ...sides.flatMap((s) => sideIngredient(s.id, 1, household) ?? []),
    ...mine.flatMap((m) => m.ingredients),
  ];
  if (!ingredients.length && !mine.length) return undefined;
  // Bausteine – feste und deine – das Längste zuerst (die Gnocchi vor dem Parmesan); „Anrichten“ ganz zum Schluss
  const groups = [
    ...styled.filter((s) => !s.serving).map((s) => ({ minutes: s.minutes, steps: [{ id: `beilage:${s.ids.join('+')}`, text: `${s.name}: ${s.text ?? 'zubereiten'}`, ingredientIds: s.ids.map((id) => `beilage:${id}`), ...(s.minutes > 0 ? { timerMinutes: s.minutes } : {}) }] })),
    ...mine,
  ].sort((a, b) => b.minutes - a.minutes);
  const serving = styled.filter((s) => s.serving).map((s): Step => ({ id: 'beilage:anrichten', text: `${s.name}: ${s.text}` }));
  const steps: Step[] = [...(own?.steps ?? []).filter((s) => s.text.trim()), ...groups.flatMap((g) => g.steps), ...serving];
  return {
    ...(own ?? { title: '', description: '', prepMinutes: 0, cookMinutes: 0, difficulty: 1, categories: [], tags: [], devices: [] }),
    servings: 1,
    ingredients: ingredients.map((i) => ({ ...i, id: TODAY + i.id })),
    steps: steps.map((s) => ({ ...s, id: TODAY + s.id, ...(s.ingredientIds ? { ingredientIds: s.ingredientIds.map((x) => TODAY + x) } : {}) })),
  };
}
