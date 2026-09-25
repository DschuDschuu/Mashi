import type { FoodKind } from '../domain/nutrition/types';

/** Gruppen wie im Laden – gemeinsam für Speisekammer und Einkaufsliste. */
export const FOOD_GROUPS: { title: string; kinds: (FoodKind | undefined)[] }[] = [
  { title: 'Obst & Gemüse', kinds: ['vegetable', 'fruit'] },
  { title: 'Fleisch, Fisch & Eier', kinds: ['protein', 'egg'] },
  { title: 'Milchprodukte', kinds: ['dairy'] },
  { title: 'Nudeln, Reis & Brot', kinds: ['staple', 'bread'] },
  { title: 'Sonstiges', kinds: [undefined] },
];

/** Einträge in Gruppen einsortieren – leere Gruppen fallen weg. */
export function groupByKind<T>(items: T[], kindOf: (item: T) => FoodKind | undefined) {
  return FOOD_GROUPS
    .map((g) => ({ title: g.title, items: items.filter((i) => g.kinds.includes(kindOf(i))) }))
    .filter((g) => g.items.length > 0);
}
