import { describe, expect, it } from 'vitest';
import { linePrice as price, mhdPercent, productIdsOfName } from './usePurchases';
import { localFoodTable } from '../domain/nutrition/localFoods';
import { withMyProducts } from '../domain/nutrition/myProducts';

/** € steht hinter einem geschützten Leerzeichen – \s erfasst es, für den Vergleich ein normales */
const linePrice = (...a: Parameters<typeof price>) => price(...a).replace(/\s/g, ' ');

const line = (price: number, discounts: { kind: 'angebot' | 'lidlplus' | 'mhd'; amount: number; percent?: number }[]) => ({ bon: 'X', count: 1, name: 'X', price, discounts });

describe('MHD-Rabatt in Prozent', () => {
  it('wie auf dem Bon – auch wenn Ausrechnen wegen Rundung danebenläge (0,08 von 0,39 € = 21 %)', () => {
    expect(mhdPercent(line(0.39, [{ kind: 'mhd', amount: 0.08, percent: 20 }]))).toBe(20);
    expect(linePrice(line(0.39, [{ kind: 'mhd', amount: 0.08, percent: 20 }]))).toBe('0,31 € statt 0,39 € · MHD −20 %');
  });

  it('Zahl verschluckt: ausgerechnet – nur aus dem MHD-Rabatt, nicht zusammen mit dem Angebot', () => {
    const l = line(2, [{ kind: 'angebot', amount: 0.5 }, { kind: 'mhd', amount: 0.4 }]);
    expect(mhdPercent(l)).toBe(20);
    expect(linePrice(l)).toBe('1,10 € statt 2,00 € · Angebot + MHD −20 %');
  });
});

describe('Sorten hinter einem Namen', () => {
  const sort = (id: string, detail?: string) => ({ id, name: 'Kürbis', ...(detail ? { detail } : {}), replaces: ['hokkaido'], per100g: { kcal: 40, protein: 1.7, carbs: 8, fat: 0.2 }, updatedAt: '2026-10-02T12:00:00.000Z' });
  it('zwei Sorten: der Tabellenname („Hokkaido“) und der Sortenname finden beide Sorten (Preis-Seite fand nichts)', () => {
    const table = withMyProducts(localFoodTable, [sort('a'), sort('b', 'Hokkaido')]);
    expect(productIdsOfName('Hokkaido', table).sort()).toEqual(['a', 'b']);
    expect(productIdsOfName('Kürbis', table).length).toBeGreaterThan(0);
    expect(productIdsOfName('Quark', table)).toEqual([]);
  });
});
