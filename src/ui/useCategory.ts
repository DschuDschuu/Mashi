import { useCallback } from 'react';
import { categoryOf, type FoodCategory } from '../domain/categories';
import { useFoodTable, usePantry } from '../data/store';

/** Kategorie eines Namens – deine Wahl, sonst Mashis Vorschlag (gleich in Lebensmitteln, Speisekammer, Einkaufsliste) */
export function useCategoryOf(): (name: string) => FoodCategory {
  const table = useFoodTable();
  const own = usePantry().categories;
  return useCallback((name: string) => categoryOf(name, table, own), [table, own]);
}
