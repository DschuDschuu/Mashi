import { useMemo } from 'react';
import { productPrices, recipeCost, type Cost, type PriceEntry } from '../domain/cost';
import { MY_PRODUCTS_PROVIDER } from '../domain/nutrition/myProducts';
import type { FoodTable } from '../domain/nutrition/types';
import type { PackageLookup } from '../domain/pantry';
import type { RecipeContent } from '../domain/types';
import { useFoodTable, usePantry, useProducts } from '../data/store';

/** Tabelle mit „Meinen Produkten“ + alle bekannten Preise (Kassenbon und von Hand). */
export function usePricing(): { table: FoodTable; prices: PriceEntry[]; packageFor: PackageLookup } {
  const products = useProducts();
  const pantry = usePantry();
  const table = useFoodTable();
  return useMemo(() => {
    // Packungsgröße deines Produkts, wenn der Bon-Name zu ihm führt („Mozzarella light“ → dein Mozzarella)
    const packageFor: PackageLookup = (name) => {
      const food = table.matchName(name)?.food;
      const product = food?.ref.provider === MY_PRODUCTS_PROVIDER ? products.find((p) => p.id === food.ref.foodId) : undefined;
      return product?.packageAmount ? { amount: product.packageAmount, unit: product.packageUnit ?? 'g' } : undefined;
    };
    return { table, prices: [...(pantry.prices ?? []), ...productPrices(products)], packageFor };
  }, [products, pantry, table]);
}

/** pick: gewählte Sorte je Zutat (wie im Wochenplan) – sonst der neueste Preis je Lebensmittel */
export function useRecipeCost(content: RecipeContent, servings: number, pick?: Readonly<Record<string, string>>): Cost | null {
  const { table, prices } = usePricing();
  return useMemo(() => recipeCost(content, servings, table, prices, pick), [content, servings, table, prices, pick]);
}
