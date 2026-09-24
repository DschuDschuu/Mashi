import { useMemo } from 'react';
import { computeNutrition } from '../domain/nutrition/engine';
import type { NutritionResult } from '../domain/nutrition/types';
import { currentContent } from '../domain/recipe';
import type { Recipe, RecipeContent } from '../domain/types';
import { foodTable } from '../services';

/** Cache je Inhaltsobjekt – Versionen sind unveränderlich, also bleibt das Ergebnis gültig. */
const cache = new WeakMap<RecipeContent, NutritionResult>();

export function nutritionOf(content: RecipeContent): NutritionResult {
  let n = cache.get(content);
  if (!n) {
    n = computeNutrition(content, foodTable);
    cache.set(content, n);
  }
  return n;
}

export const recipeNutrition = (r: Recipe) => nutritionOf(currentContent(r));

export function useNutrition(content: RecipeContent): NutritionResult {
  return useMemo(() => nutritionOf(content), [content]);
}
