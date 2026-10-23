import type { Week } from './mealplan';

/*
 * Eigene kleine Datei, weil Einkaufsliste und Vorrat (mealplan.ts, pantry.ts) sie brauchen und week.ts wiederum
 * mealplan.ts – so entsteht kein Kreis zwischen den Modulen.
 */

/** IDs der Grundlagen dieser Woche */
export const weekBaseIds = (week: Week | undefined): string[] => week?.bases.map((b) => b.recipeId) ?? [];

/**
 * Ein Gericht ohne seine Grundlage-Zutat („1 Bolognese“) – die kommt aus dem Vorgekochten, nicht vom Einkauf.
 * Für Einkaufsliste, Reservierung im Vorrat und das Abziehen beim Essen.
 */
export function withoutBases<C extends { ingredients: { recipeId?: string }[] }>(c: C, baseIds: readonly string[]): C {
  if (!baseIds.length || !c.ingredients.some((i) => i.recipeId && baseIds.includes(i.recipeId))) return c;
  return { ...c, ingredients: c.ingredients.filter((i) => !(i.recipeId && baseIds.includes(i.recipeId))) };
}
