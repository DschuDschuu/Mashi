import { useMemo } from 'react';
import { buildShoppingList, type ShoppingItem } from '../domain/mealplan';
import { withMyProducts } from '../domain/nutrition/myProducts';
import { restockStatus, shoppingList, type RestockStatus } from '../domain/restock';
import { pantryAfterPlan } from '../domain/pantry';
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

/** Stand jeder Nachkauf-Regel je Schlüssel – fürs Einstellfeld unter „Meine Lebensmittel“ */
export function useRestockStatus(): Map<string, RestockStatus> {
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    if (!pantry.restock?.length) return new Map();
    const table = withMyProducts(foodTable, products);
    return new Map(restockStatus(pantry, table, products, pantryAfterPlan(pantry, plan, recipes, table)).map((s) => [s.key, s]));
  }, [plan, recipes, products, pantry]);
}
