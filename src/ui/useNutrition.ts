import { useMemo } from 'react';
import { computeNutrition } from '../domain/nutrition/engine';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import type { FoodTable, NutritionResult } from '../domain/nutrition/types';
import { currentContent } from '../domain/recipe';
import type { Recipe, RecipeContent } from '../domain/types';
import { currentProducts, useProducts } from '../data/store';
import { foodTable } from '../services';

/**
 * Nährwerte rechnen immer gegen die allgemeine Tabelle MIT „Meinen Produkten“ darüber.
 * Cache je Inhaltsobjekt (Versionen sind unveränderlich) – aber nur solange sich die
 * Produktliste nicht ändert; eine neue Liste bekommt einen frischen Cache.
 */
let cachedFor: MyProduct[] | null = null;
let table: FoodTable = foodTable;
let cache = new WeakMap<RecipeContent, NutritionResult>();

function tableFor(products: MyProduct[]): FoodTable {
  if (products !== cachedFor) {
    cachedFor = products;
    table = withMyProducts(foodTable, products);
    cache = new WeakMap();
  }
  return table;
}

export function nutritionOf(content: RecipeContent, products: MyProduct[] = currentProducts()): NutritionResult {
  const t = tableFor(products);
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
  return useMemo(() => nutritionOf(content, products), [content, products]);
}
