import type { NutritionResult } from '../domain/nutrition/types';

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
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
