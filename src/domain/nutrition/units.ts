import type { Unit } from '../types';
import type { FoodEntry } from './types';

/** Standardvolumen in ml, falls das Lebensmittel nichts Eigenes angibt. */
const DEFAULT_ML: Partial<Record<Unit, number>> = { EL: 15, TL: 5, Messlöffel: 30 };
/** Grobe Standardgewichte – zählen immer als Schätzung. */
const ROUGH_GRAMS: Partial<Record<Unit, number>> = { Prise: 0.5, Handvoll: 30, Bund: 50, Dose: 400, Glas: 300 };

export interface GramConversion {
  grams: number;
  /** true = mit Standardwert geschätzt, nicht lebensmittelspezifisch */
  rough: boolean;
}

/** Rechnet eine Menge in Gramm um. undefined = nicht sinnvoll möglich (z. B. „1 Stück“ ohne Stückgewicht). */
export function toGrams(amount: number, unit: Unit | undefined, food: FoodEntry): GramConversion | undefined {
  const density = food.density ?? 1;
  const specific = unit ? food.portions?.[unit] : undefined;
  if (specific !== undefined) return { grams: amount * specific, rough: false };

  switch (unit) {
    case 'g': return { grams: amount, rough: false };
    case 'kg': return { grams: amount * 1000, rough: false };
    case 'ml': return { grams: amount * density, rough: false };
    case 'l': return { grams: amount * 1000 * density, rough: false };
    case undefined: return food.portions?.Stück ? { grams: amount * food.portions.Stück, rough: false } : undefined;
  }
  // EL/TL sind definierte Volumen (15/5 ml) – Umrechnung, keine Schätzung.
  const ml = DEFAULT_ML[unit];
  if (ml !== undefined) return { grams: amount * ml * density, rough: false };
  const rough = ROUGH_GRAMS[unit];
  if (rough !== undefined) return { grams: amount * rough, rough: true };
  return undefined;
}
