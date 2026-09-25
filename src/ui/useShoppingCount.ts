import { useMemo } from 'react';
import { buildShoppingList } from '../domain/mealplan';
import { withMyProducts } from '../domain/nutrition/myProducts';
import { usePantry, usePlan, useProducts, useRecipes } from '../data/store';
import { foodTable } from '../services';

/** Noch einzukaufen: ohne Basics, ohne „Hast du schon“, ohne Abgehaktes. */
export function useShoppingCount(): number {
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    return buildShoppingList(plan, recipes, table, pantry).filter((i) => !i.pantry && !i.covered && !plan.checked.includes(i.key)).length;
  }, [plan, recipes, products, pantry]);
}
