import type { Household } from './mealplan';
import type { Ingredient } from './types';

/**
 * Baukasten für die Vorkoch-Woche (Julia: „+ Kohlenhydrat, + Protein, + Beilage, + Topping“): Bausteine, die frisch zur
 * Grundlage dazukommen – „Kürbissauce mit Pasta, Hähnchen & Parmesan“ ohne eigenes Rezept. Bewusst eine kurze feste
 * Liste – Mix & Match hatte dafür Mini-Rezepte („Reis = 100 g Reis“), das war eine zweite Welt neben dem Kochbuch.
 */
export type SideKind = 'carb' | 'protein' | 'veg' | 'topping';

export interface Side {
  id: string;
  name: string;
  kind: SideKind;
  /** Menge pro Portion – roh bzw. so, wie es im Laden liegt (frische Spätzle aus dem Kühlregal); in `unit` */
  grams: number;
  unit?: 'g' | 'Stück';
}

export const SIDE_KINDS: readonly { kind: SideKind; label: string }[] = [
  { kind: 'carb', label: 'Kohlenhydrat' },
  { kind: 'protein', label: 'Protein' },
  { kind: 'veg', label: 'Beilage' },
  { kind: 'topping', label: 'Topping' },
];

export const SIDES: readonly Side[] = [
  { id: 'pasta', name: 'Pasta', kind: 'carb', grams: 100 },
  { id: 'reis', name: 'Reis', kind: 'carb', grams: 75 },
  { id: 'schupfnudeln', name: 'Schupfnudeln', kind: 'carb', grams: 250 },
  { id: 'spaetzle', name: 'Spätzle', kind: 'carb', grams: 250 },
  { id: 'gnocchi', name: 'Gnocchi', kind: 'carb', grams: 250 },
  { id: 'kartoffeln', name: 'Kartoffeln', kind: 'carb', grams: 300 },
  { id: 'haehnchen', name: 'Hähnchenbrust', kind: 'protein', grams: 125 },
  { id: 'hack', name: 'Hackfleisch', kind: 'protein', grams: 125 },
  { id: 'tofu', name: 'Tofu', kind: 'protein', grams: 100 },
  { id: 'linsen', name: 'Linsen', kind: 'protein', grams: 60 },
  { id: 'brokkoli', name: 'Brokkoli', kind: 'veg', grams: 150 },
  { id: 'salat', name: 'Salat', kind: 'veg', grams: 50 },
  { id: 'paprika', name: 'Paprika', kind: 'veg', grams: 100 },
  { id: 'zucchini', name: 'Zucchini', kind: 'veg', grams: 150 },
  { id: 'spinat', name: 'Spinat', kind: 'veg', grams: 100 },
  { id: 'parmesan', name: 'Parmesan', kind: 'topping', grams: 15 },
  { id: 'feta', name: 'Feta', kind: 'topping', grams: 40 },
  { id: 'kraeuter', name: 'Frische Kräuter', kind: 'topping', grams: 5 },
  { id: 'sesam', name: 'Sesam', kind: 'topping', grams: 5 },
  { id: 'roestzwiebeln', name: 'Röstzwiebeln', kind: 'topping', grams: 10 },
  { id: 'ei', name: 'Ei', kind: 'topping', grams: 1, unit: 'Stück' },
];

export const sideOf = (id: string | undefined): Side | undefined => SIDES.find((s) => s.id === id);

/**
 * Die Bausteine eines Abends. Gespeichert als eine Zeichenkette („pasta,haehnchen,parmesan“) im bisherigen Feld
 * `WeekMeal.side` – so bleiben Abgleich, Tauschen und Auswahl-Schlüssel (mealKey) unverändert, alte Abende („pasta“) gelten weiter.
 */
export const sidesOf = (side: string | undefined): Side[] => (side ? side.split(',').flatMap((id) => sideOf(id) ?? []) : []);

/** Bausteine → gespeicherte Form, in fester Reihenfolge (Kohlenhydrat, Protein, Beilage, Topping) */
export const comboOf = (ids: readonly string[]): string | undefined => {
  const order = SIDE_KINDS.map((k) => k.kind);
  const list = ids.flatMap((id) => sideOf(id) ?? []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return list.length ? list.map((s) => s.id).join(',') : undefined;
};

/** Bausteine lesbar: „Pasta, Hähnchenbrust & Parmesan“ */
export function comboText(side: string | undefined): string {
  const names = sidesOf(side).map((s) => s.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? '';
}

/** Menge pro Portion – feste Werte, einmal zentral änderbar (Julia: nicht bei jedem Abend nachfragen) */
export const sideGrams = (id: string, household?: Pick<Household, 'sides'>): number =>
  household?.sides?.[id] ?? sideOf(id)?.grams ?? 0;

/** Ein Baustein als Zutat für so viele Portionen – Einkaufsliste und Vorrat rechnen damit wie mit jeder Zutat */
export function sideIngredient(id: string, portions: number, household?: Pick<Household, 'sides'>): Ingredient | undefined {
  const side = sideOf(id);
  return side ? { id: `beilage:${id}`, name: side.name, amount: sideGrams(id, household) * portions, unit: side.unit ?? 'g' } : undefined;
}
