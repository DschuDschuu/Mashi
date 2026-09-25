import { useMemo } from 'react';
import { resolveIngredient } from '../domain/mealplan';
import { withMyProducts } from '../domain/nutrition/myProducts';
import { deductRecipe, pantryAfterPlan, plannedByDish, type Stock } from '../domain/pantry';
import { currentContent } from '../domain/recipe';
import { useUpKeys } from '../domain/shelfLife';
import type { Recipe } from '../domain/types';
import { usePantry, usePlan, useProducts, useRecipes } from '../data/store';
import { foodTable } from '../services';

/**
 * Für die Rezeptseite: je Zutat da / knapp / fehlt – und welche bald weg muss.
 * - Geplant: in Plan-Reihenfolge wie beim Kochen (was die Gerichte davor brauchen, ist schon weg)
 * - Nicht geplant: mit dem, was nach dem Wochenplan frei bleibt
 * Leere Speisekammer → stock undefined: dann zeigt die Seite nichts dazu.
 */
export function useRecipeStock(recipe: Recipe, servings: number): { stock?: Map<string, Stock>; soon: Set<string> } {
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  return useMemo(() => {
    if (!pantry.items.length) return { soon: new Set<string>() };
    const table = withMyProducts(foodTable, products);
    const c = currentContent(recipe);
    const planned = plan.items.some((i) => i.recipeId === recipe.id) && !plan.cooked.includes(recipe.id);
    const stock = planned
      ? plannedByDish(pantry, { ...plan, items: plan.items.map((i) => (i.recipeId === recipe.id ? { ...i, servings } : i)) }, recipes, table)
        .find((d) => d.recipeId === recipe.id)?.stock
      : deductRecipe(pantryAfterPlan(pantry, plan, recipes, table), c, servings, table).stock;
    const keys = useUpKeys(pantry, table);
    const soon = new Set(c.ingredients.filter((i) => {
      const key = resolveIngredient(i, 1, table)?.key;
      return !!key && keys.has(key) && stock?.get(i.id) !== 'fehlt';
    }).map((i) => i.id));
    return { stock, soon };
  }, [pantry, plan, recipes, products, recipe, servings]);
}
