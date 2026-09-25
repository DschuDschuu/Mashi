import { useMemo } from 'react';
import { buildShoppingList, type ShoppingItem } from '../domain/mealplan';
import { withMyProducts } from '../domain/nutrition/myProducts';
import { usePantry, usePlan, useProducts, useRecipes } from '../data/store';
import { foodTable } from '../services';

/** Was für die geplanten Gerichte noch fehlt: ohne Basics, ohne „Hast du schon“, ohne Abgehaktes. */
export function useMissing(): ShoppingItem[] {
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    return buildShoppingList(plan, recipes, table, pantry).filter((i) => !i.pantry && !i.covered && !plan.checked.includes(i.key));
  }, [plan, recipes, products, pantry]);
}

/** Noch einzukaufen – Zahl am Wagen und auf der Startseite. */
export function useShoppingCount(): number {
  return useMissing().length;
}
