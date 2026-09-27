import { useMemo } from 'react';
import { normalizeName } from '../domain/nutrition/localFoods';
import type { RenameOptions } from '../domain/renames';
import { usePantry, useProducts } from '../data/store';

/** Ausgeblendete Vorschläge und die Namen, an denen eigene Produkte hängen (die bleiben, wie sie sind) */
export function useRenameOptions(): RenameOptions {
  const pantry = usePantry();
  const products = useProducts();
  return useMemo(() => ({
    dismissed: pantry.renameDismissed ?? [],
    protectedNames: new Set(products.flatMap((p) => (p.names ?? []).map(normalizeName))),
  }), [pantry.renameDismissed, products]);
}
