import type { Household } from './mealplan';
import type { Ingredient } from './types';

/**
 * Beilagen für die Vorkoch-Woche (Julia: „Bolognese mit Spätzle“ ohne eigenes Rezept): Sättigungsbeilagen, die frisch
 * dazukommen. Bewusst eine kurze feste Liste – Mix & Match hatte dafür Mini-Rezepte („Reis = 100 g Reis“), das war
 * eine zweite Welt neben dem Kochbuch.
 */
export interface Side {
  id: string;
  name: string;
  /** Gramm pro Portion – roh bzw. so, wie es im Laden liegt (frische Spätzle aus dem Kühlregal) */
  grams: number;
}

export const SIDES: readonly Side[] = [
  { id: 'pasta', name: 'Pasta', grams: 100 },
  { id: 'reis', name: 'Reis', grams: 75 },
  { id: 'schupfnudeln', name: 'Schupfnudeln', grams: 250 },
  { id: 'spaetzle', name: 'Spätzle', grams: 250 },
  { id: 'gnocchi', name: 'Gnocchi', grams: 250 },
  { id: 'kartoffeln', name: 'Kartoffeln', grams: 300 },
];

export const sideOf = (id: string | undefined): Side | undefined => SIDES.find((s) => s.id === id);

/** Menge pro Portion – feste Werte, einmal zentral änderbar (Julia: nicht bei jedem Abend nachfragen) */
export const sideGrams = (id: string, household?: Pick<Household, 'sides'>): number =>
  household?.sides?.[id] ?? sideOf(id)?.grams ?? 0;

/** Die Beilage als Zutat für so viele Portionen – Einkaufsliste und Vorrat rechnen damit wie mit jeder Zutat */
export function sideIngredient(id: string, portions: number, household?: Pick<Household, 'sides'>): Ingredient | undefined {
  const side = sideOf(id);
  return side ? { id: `beilage:${id}`, name: side.name, amount: sideGrams(id, household) * portions, unit: 'g' } : undefined;
}
