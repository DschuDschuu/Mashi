import { useMemo } from 'react';
import { computeNutrition } from '../domain/nutrition/engine';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import type { FoodTable, NutritionResult } from '../domain/nutrition/types';
import { currentContent } from '../domain/recipe';
import type { Recipe, RecipeContent } from '../domain/types';
import { currentMacroGoal, currentNoNutrition, currentPantry, currentProducts, currentStock, useMacroGoal, useNoNutrition, usePantry, useProducts, useStock } from '../data/store';
import { pickFor, variantChoices, type VariantChoice } from '../domain/nutrition/variants';
import { withoutNutrition } from '../domain/nutrition/noNutrition';
import { foodTable } from '../services';

/**
 * Nährwerte rechnen immer gegen die allgemeine Tabelle MIT „Meinen Produkten“ darüber.
 * Cache je Inhaltsobjekt (Versionen sind unveränderlich) – aber nur solange sich die
 * Produktliste nicht ändert; eine neue Liste bekommt einen frischen Cache.
 */
let cachedFor: MyProduct[] | null = null;
let cachedZero: string[] | null = null;
let cachedStock: string[] | null = null;
let table: FoodTable = foodTable;
let cache = new WeakMap<RecipeContent, NutritionResult>();

/**
 * „Ohne Nährwerte“ (Gewürze …) kommt obendrauf – mit den Namen im Vorrat (frische Petersilie im Haus → die frische).
 * Ändert sich eins davon, frischer Cache.
 */
function tableFor(products: MyProduct[], zero: string[], stock: string[] = currentStock()): FoodTable {
  if (products !== cachedFor || zero !== cachedZero || stock !== cachedStock) {
    cachedFor = products;
    cachedZero = zero;
    cachedStock = stock;
    table = withoutNutrition(withMyProducts(foodTable, products), zero, stock);
    cache = new WeakMap();
  }
  return table;
}

export function nutritionOf(content: RecipeContent, products: MyProduct[] = currentProducts(), zero: string[] = currentNoNutrition(), stock: string[] = currentStock()): NutritionResult {
  const t = tableFor(products, zero, stock);
  let n = cache.get(content);
  if (!n) {
    n = computeNutrition(content, t);
    cache.set(content, n);
  }
  return n;
}

export const recipeNutrition = (r: Recipe) => nutritionOf(currentContent(r));

/** Bei welchen Zutaten die Sorte zählt (mind. eine im Vorrat) – jetzt, ohne Hook */
export function choicesFor(content: RecipeContent): VariantChoice[] {
  return variantChoices(content, tableFor(currentProducts(), currentNoNutrition()), currentPantry().items, currentMacroGoal());
}

/**
 * Sorten für ein Gericht: Auswahl + fertige Wahl (eigene Wahl vor Vorschlag) + Nährwerte damit.
 * Ändert sich Vorrat, Produkte oder Ziel, rechnet es neu.
 */
export function useVariants(content: RecipeContent, own: Readonly<Record<string, string>> | undefined) {
  const products = useProducts();
  const zero = useNoNutrition();
  const pantry = usePantry();
  const stock = useStock();
  const goal = useMacroGoal();
  return useMemo(() => {
    const choices = variantChoices(content, tableFor(products, zero, stock), pantry.items, goal);
    const pick = pickFor(choices, own);
    const n = Object.keys(pick).length ? computeNutrition(content, tableFor(products, zero, stock), pick) : nutritionOf(content, products, zero, stock);
    return { choices, pick, n };
  }, [content, own, products, zero, stock, pantry, goal]);
}

export function useNutrition(content: RecipeContent): NutritionResult {
  const products = useProducts();
  const zero = useNoNutrition();
  const stock = useStock();
  return useMemo(() => nutritionOf(content, products, zero, stock), [content, products, zero, stock]);
}
