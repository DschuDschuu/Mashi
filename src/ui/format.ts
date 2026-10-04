import type { PantryItem } from '../domain/pantry';
import { amountLabel } from '../domain/pantryLabel';
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

/** Packungsgröße einer Preis-Linie („500 g“, „1000 g“, „?“) lesbar: „500 g“, „1 kg“, „1,5 l“ */
export function sizeLabel(size: string): string {
  if (size === '?') return 'Größe unbekannt';
  const [n, u] = size.split(' ');
  const v = Number(n);
  const fmt = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return v >= 1000 ? `${fmt(v / 1000)} ${u === 'ml' ? 'l' : 'kg'}` : `${fmt(v)} ${u}`;
}

/** „980 g“, „3 Stück“ – oder „vorhanden“, wenn die Menge unbekannt ist. */
export const quantityLabel = (item: Pick<PantryItem, 'amount' | 'unit' | 'pack' | 'openedAt' | 'recipeId'>) => amountLabel(item);

/** Teile einer Vorrats-Zeile (Speisekammer, Sortenwahl): erst das Offene (je Einheit zusammengezählt), dann die Packungen und der Rest */
export function stockLabels(parts: readonly PantryItem[]): string[] {
  const opened = parts.filter((p) => p.openedAt && p.amount !== undefined && (p.unit === 'g' || p.unit === 'ml'));
  const units = [...new Set(opened.map((p) => p.unit))];
  const openLabels = units.map((u) => quantityLabel({ amount: opened.filter((p) => p.unit === u).reduce((n, p) => n + p.amount!, 0), unit: u, openedAt: 'offen' }));
  // gleich große Packungen zusammen – auch von verschiedenen Marken: „2 × 400 ml“ statt „1 × 400 ml + 1 × 400 ml“
  const rest = parts.filter((p) => !opened.includes(p));
  const packed = rest.filter((p) => p.pack && p.amount !== undefined && (p.unit === 'Stück' || p.unit === 'Glas'));
  const sizes = [...new Map(packed.map((p) => [`${p.unit}|${p.pack!.amount}|${p.pack!.unit}`, p])).entries()];
  const packLabels = sizes.map(([key, first]) => quantityLabel({
    ...first, openedAt: undefined,
    amount: packed.filter((p) => `${p.unit}|${p.pack!.amount}|${p.pack!.unit}` === key).reduce((n, p) => n + p.amount!, 0),
  }));
  return [...openLabels, ...packLabels, ...rest.filter((p) => !packed.includes(p)).map((p) => quantityLabel(p))];
}
