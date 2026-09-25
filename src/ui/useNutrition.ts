import { useMemo } from 'react';
import { computeNutrition } from '../domain/nutrition/engine';
import { withMyProducts, type MyProduct } from '../domain/nutrition/myProducts';
import type { FoodTable, NutritionResult } from '../domain/nutrition/types';
import { currentContent } from '../domain/recipe';
import type { Recipe, RecipeContent } from '../domain/types';
import { currentMacroGoal, currentNoNutrition, currentPantry, currentProducts, useMacroGoal, useNoNutrition, usePantry, useProducts } from '../data/store';
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

/** Mit gewählter Sorte je Zutat (Plan/Kochmodus) – ohne Wahl wie nutritionOf (Durchschnitt) */
export function nutritionWith(content: RecipeContent, pick: Readonly<Record<string, string>>): NutritionResult {
  if (!Object.keys(pick).length) return nutritionOf(content);
  return computeNutrition(content, tableFor(currentProducts(), currentNoNutrition()), pick);
}

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
  const goal = useMacroGoal();
  return useMemo(() => {
    const choices = variantChoices(content, tableFor(products, zero), pantry.items, goal);
    const pick = pickFor(choices, own);
    const n = Object.keys(pick).length ? computeNutrition(content, tableFor(products, zero), pick) : nutritionOf(content, products, zero);
    return { choices, pick, n };
  }, [content, own, products, zero, pantry, goal]);
}

export function useNutrition(content: RecipeContent): NutritionResult {
  const products = useProducts();
  const zero = useNoNutrition();
  return useMemo(() => nutritionOf(content, products, zero), [content, products, zero]);
}
