import { useMemo } from 'react';
import { recipeChoices, rollCraving, stockMarks, type Choice, type CravingState } from '../domain/craving';
import { servingsOf } from '../domain/week';
import { householdOf, useFoodTable, usePantry, usePlan, useRecipes } from '../data/store';

/**
 * Deine Rezepte (und Teile) als Bausteine, mit dem, was davon vorgekocht im Kühlschrank steht – Portionen, die im
 * Wochenplan schon einen Abend haben, zählen nicht (die sind ja verplant)
 */
export function useOwnChoices(): Choice[] {
  const recipes = useRecipes();
  const pantry = usePantry();
  const plan = usePlan();
  return useMemo(() => {
    const hh = householdOf(plan);
    const reserved = new Map<string, number>();
    for (const m of plan.week?.meals ?? []) if (!m.done) reserved.set(m.baseId, (reserved.get(m.baseId) ?? 0) + servingsOf(m, hh));
    return recipeChoices(recipes, pantry, reserved);
  }, [recipes, pantry, plan]);
}

/** Vorrats-Punkte: was von den Bausteinen zu Hause ist oder bald weg muss (stockMarks) – einmal je Vorrat, nicht je Chip */
export function useStockMarks() {
  const pantry = usePantry();
  const table = useFoodTable();
  return useMemo(() => stockMarks(pantry, table), [pantry, table]);
}

/** Würfeln mit allem, was dazu gehört – deinen Rezepten, deinen Einstellungen und dem Vorrat (rollCraving) */
export function useRoll(own: readonly Choice[]): (s: CravingState) => CravingState {
  const plan = usePlan();
  const stock = useStockMarks();
  return (s) => rollCraving(s, { own, household: householdOf(plan), stock });
}
