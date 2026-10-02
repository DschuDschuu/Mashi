import { useCallback } from 'react';
import { categoryOf, type FoodCategory } from '../domain/categories';
import { nameOf } from '../domain/nutrition/myProducts';
import { useFoodTable, usePantry, useProducts } from '../data/store';

/**
 * Kategorie eines Namens – deine Wahl, sonst Mashis Vorschlag (gleich in Lebensmitteln, Speisekammer, Einkaufsliste).
 * Mit productId (Vorrat einer Sorte): die Kategorie ihres Lebensmittels – auch wenn der Vorrat anders heißt.
 */
export function useCategoryOf(): (name: string, productId?: string) => FoodCategory {
  const table = useFoodTable();
  const own = usePantry().categories;
  const products = useProducts();
  return useCallback((name: string, productId?: string) => {
    const p = productId ? products.find((x) => x.id === productId) : undefined;
    return categoryOf(p ? nameOf(p) : name, table, own);
  }, [table, own, products]);
}
