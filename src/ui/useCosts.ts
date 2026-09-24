import { useMemo } from 'react';
import { productPrices, recipeCost, type Cost, type PriceEntry } from '../domain/cost';
import { withMyProducts, MY_PRODUCTS_PROVIDER } from '../domain/nutrition/myProducts';
import type { FoodTable } from '../domain/nutrition/types';
import type { PackageLookup } from '../domain/pantry';
import type { RecipeContent } from '../domain/types';
import { usePantry, useProducts } from '../data/store';
import { foodTable } from '../services';

/** Tabelle mit „Meinen Produkten“ + alle bekannten Preise (Kassenbon und von Hand). */
export function usePricing(): { table: FoodTable; prices: PriceEntry[]; packageFor: PackageLookup } {
  const products = useProducts();
  const pantry = usePantry();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    // Packungsgröße deines Produkts, wenn der Bon-Name zu ihm führt („Mozzarella light“ → dein Mozzarella)
    const packageFor: PackageLookup = (name) => {
      const food = table.matchName(name)?.food;
      const product = food?.ref.provider === MY_PRODUCTS_PROVIDER ? products.find((p) => p.id === food.ref.foodId) : undefined;
      return product?.packageAmount ? { amount: product.packageAmount, unit: product.packageUnit ?? 'g' } : undefined;
    };
    return { table, prices: [...(pantry.prices ?? []), ...productPrices(products)], packageFor };
  }, [products, pantry]);
}

export function useRecipeCost(content: RecipeContent, servings: number): Cost | null {
  const { table, prices } = usePricing();
  return useMemo(() => recipeCost(content, servings, table, prices), [content, servings, table, prices]);
}
