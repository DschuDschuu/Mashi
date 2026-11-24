import type { Household, KcalRange } from './mealplan';
import type { PotItem } from './week';

/**
 * Woche aus den Angeboten (Julia: „wie machen wir daraus meinen Wochenplan“): Mashi füllt den Topf von „Woche planen“
 * mit Rezepten, die die Angebote nutzen – so viele Essen, wie die Woche braucht, im kcal-Bereich pro Essen.
 * Reine Logik ohne Nährwert-Berechnung: kcal je Rezept-Portion und die Reihenfolge (beste zuerst, offers.ts:
 * offerRecipes) kommen von außen.
 */

/** Rezept-Portionen je Essen, die Mashi probiert – halbe Schritte (Julia: „auch 1,5“), höchstens 2 („2 Portionen sind dann 1“) */
const FACTORS = [0.5, 1, 1.5, 2];

/** Einfrierbares höchstens für die halbe Woche (Julia: „wenige Rezepte“ – aber nicht sieben Tage dasselbe) */
const FREEZE_SHARE = 0.5;

const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9;

/**
 * Wie viele Rezept-Portionen sind ein Essen in deinem kcal-Bereich? Am liebsten 1 (Julia: „Rezepte, die das pro Portion
 * haben“), sonst zusammengelegt oder halbiert – unter mehreren passenden die, die näher an 1 liegt.
 * Ohne Bereich: 1. undefined: kcal unbekannt oder kein Schritt passt.
 */
export function mealFactor(kcalPerServing: number | undefined, range: KcalRange | undefined): number | undefined {
  if (!range) return 1;
  if (!kcalPerServing || kcalPerServing <= 0) return undefined;
  const fits = FACTORS.filter((f) => f * kcalPerServing >= range.min && f * kcalPerServing <= range.max);
  return fits.sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1) || a - b)[0];
}

/**
 * Essen in welchen Schritten, damit ganze Portionen gekocht werden (Julia: „für die Woche nur gerade Zahlen – 2 × 1,5
 * ergibt 3 Portionen zum Kochen“): 1, oder 2 bei halben Portionen je Essen.
 */
export const mealStep = (per: number, household: Pick<Household, 'portions'>): number => (whole(per * household.portions) ? 1 : 2);

/** Wie viele Essen die Woche braucht: deine Abende plus die Mittage (Julia: „5 Abende und 3 Mittage“) */
export const mealsNeeded = (household: Pick<Household, 'evenings' | 'lunchDays'>): number => (household.evenings ?? 7) + household.lunchDays.length;

/** So viele Essen ergibt ein Topf-Eintrag – angefangene zählen nicht */
export const mealsOf = (item: Pick<PotItem, 'portions' | 'per'>, household: Pick<Household, 'portions'>): number =>
  Math.floor(item.portions / Math.max(0.5, (item.per ?? 1) * household.portions) + 1e-9);

export interface SuggestCandidate {
  recipeId: string;
  /** kcal je Rezept-Portion – fehlt: unbekannt */
  kcal?: number;
  /** so viele Tage hält es gekocht */
  keeps: number;
  freezable?: boolean;
}

export interface WeekSuggestion {
  /** neu in den Topf */
  pot: PotItem[];
  /** so viele Essen fehlen danach noch (nichts Passendes mehr) */
  missing: number;
}

/**
 * Den Topf auffüllen (Julia: „Mashi schlägt vor“, „wenige Rezepte“): der Reihe nach, jedes Rezept für so viele Essen,
 * wie es frisch hält – Einfrierbares darf mehr, höchstens die halbe Woche. Mit kcal-Bereich nur, was hineinpasst (auch
 * zusammengelegt); bei halben Portionen je Essen nur gerade Zahlen Essen, damit ganze Portionen gekocht werden.
 * @param have Essen, die schon im Topf liegen (Julias Auswahl bleibt, Mashi füllt nur den Rest)
 */
export function suggestPot(candidates: readonly SuggestCandidate[], household: Household, have = 0, skip: readonly string[] = []): WeekSuggestion {
  const needed = mealsNeeded(household);
  const perDay = needed / 7;
  let left = needed - have;
  const pot: PotItem[] = [];
  for (const c of candidates) {
    if (left <= 0) break;
    if (skip.includes(c.recipeId) || pot.some((p) => p.recipeId === c.recipeId)) continue;
    const per = mealFactor(c.kcal, household.kcal);
    if (per === undefined) continue;
    const step = mealStep(per, household);
    // gekocht hält es keeps Tage – an jedem davon so viele Essen, wie die Woche im Schnitt hat
    const fresh = Math.max(1, Math.floor(c.keeps * perDay));
    const holds = c.freezable ? Math.max(fresh, Math.round(needed * FREEZE_SHARE)) : fresh;
    const meals = Math.floor(Math.min(left, holds) / step) * step;
    if (!meals) continue;
    pot.push({ recipeId: c.recipeId, portions: meals * per * household.portions, ...(per !== 1 ? { per } : {}) });
    left -= meals;
  }
  return { pot, missing: Math.max(0, left) };
}
