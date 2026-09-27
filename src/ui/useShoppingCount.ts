import { useMemo } from 'react';
import { buildShoppingList, type ShoppingItem } from '../domain/mealplan';
import { withMyProducts } from '../domain/nutrition/myProducts';
import { shoppingList } from '../domain/restock';
import { usePantry, usePlan, useProducts, useRecipes } from '../data/store';
import { foodTable } from '../services';

const open = (plan: { checked: string[] }) => (i: ShoppingItem) => !i.pantry && !i.covered && !plan.checked.includes(i.key);

/** Was für die geplanten Gerichte noch fehlt: ohne Basics, ohne „Hast du schon“, ohne Abgehaktes – und ohne „Nachkaufen“. */
export function useMissing(): ShoppingItem[] {
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    return buildShoppingList(plan, recipes, table, pantry).filter(open(plan));
  }, [plan, recipes, products, pantry]);
}

/** Noch einzukaufen – Zahl am Wagen und auf der Startseite, „Nachkaufen“ mitgezählt (wie auf der Liste). */
export function useShoppingCount(): number {
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    return shoppingList(plan, recipes, table, pantry, products).filter(open(plan)).length;
  }, [plan, recipes, products, pantry]);
}
