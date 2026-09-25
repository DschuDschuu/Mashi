import type { PantryItem } from '../domain/pantry';
import { formatAmount } from '../domain/scaling';
import type { NutritionResult } from '../domain/nutrition/types';

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Kurzform für enge Stellen wie Rezeptkarten: „25 Min.“, „1:15 Std.“, „2 Std.“ */
export function formatMinutesShort(min: number): string {
  if (min < 60) return `${min} Min.`;
  const m = min % 60;
  return m ? `${Math.floor(min / 60)}:${String(m).padStart(2, '0')} Std.` : `${min / 60} Std.`;
}

/** „520 kcal“, „ca. 520 kcal“ oder null (dann zeigen wir nichts). */
export function kcalLabel(n: NutritionResult): string | null {
  if (!n.perServing) return null;
  return `${n.accuracy === 'geschaetzt' ? 'ca. ' : ''}${Math.round(n.perServing.kcal)} kcal`;
}

export function gram(value: number): string {
  return `${value < 10 ? value.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : Math.round(value)} g`;
}

export function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/** „1 Portion“, „2 Portionen“ */
export function portionCount(n: number): string {
  return `${n} ${n === 1 ? 'Portion' : 'Portionen'}`;
}

/** „1 Rezept“, „0 Rezepte“, „5 Rezepte“ */
export function recipeCount(n: number): string {
  return `${n} ${n === 1 ? 'Rezept' : 'Rezepte'}`;
}

/** „1,70 €“ */
export const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** „980 g“, „3 Stück“ – oder „vorhanden“, wenn die Menge unbekannt ist. */
export const quantityLabel = (item: Pick<PantryItem, 'amount' | 'unit'>) =>
  item.amount === undefined ? 'vorhanden' : `${formatAmount(item.amount, item.unit === 'Stück' || item.unit === 'Glas' ? 'Stück' : 'g')} ${item.unit ?? ''}`.trim();
