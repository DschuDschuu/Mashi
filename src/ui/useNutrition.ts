import { useMemo } from 'react';
import { computeNutrition } from '../domain/nutrition/engine';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import type { FoodTable, NutritionResult } from '../domain/nutrition/types';
import { currentContent } from '../domain/recipe';
import type { Recipe, RecipeContent } from '../domain/types';
import { currentNoNutrition, currentProducts, useNoNutrition, useProducts } from '../data/store';
import { withoutNutrition } from '../domain/nutrition/noNutrition';
import { foodTable } from '../services';

/**
 * Nährwerte rechnen immer gegen die allgemeine Tabelle MIT „Meinen Produkten“ darüber.
 * Cache je Inhaltsobjekt (Versionen sind unveränderlich) – aber nur solange sich die
 * Produktliste nicht ändert; eine neue Liste bekommt einen frischen Cache.
 */
let cachedFor: MyProduct[] | null = null;
let cachedZero: string[] | null = null;
let table: FoodTable = foodTable;
let cache = new WeakMap<RecipeContent, NutritionResult>();

/** „Ohne Nährwerte“ (Gewürze …) kommt obendrauf – ändert sich eins von beiden, frischer Cache. */
function tableFor(products: MyProduct[], zero: string[]): FoodTable {
  if (products !== cachedFor || zero !== cachedZero) {
    cachedFor = products;
    cachedZero = zero;
    table = withoutNutrition(withMyProducts(foodTable, products), zero);
    cache = new WeakMap();
  }
  return table;
}

export function nutritionOf(content: RecipeContent, products: MyProduct[] = currentProducts(), zero: string[] = currentNoNutrition()): NutritionResult {
  const t = tableFor(products, zero);
  let n = cache.get(content);
  if (!n) {
    n = computeNutrition(content, t);
    cache.set(content, n);
  }
  return n;
}

export const recipeNutrition = (r: Recipe) => nutritionOf(currentContent(r));

export function useNutrition(content: RecipeContent): NutritionResult {
  const products = useProducts();
  const zero = useNoNutrition();
  return useMemo(() => nutritionOf(content, products, zero), [content, products, zero]);
}
