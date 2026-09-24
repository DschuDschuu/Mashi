import { describe, expect, it } from 'vitest';
import type { PriceEntry } from './cost';
import { applyImport, emptyPantry, proposeImport } from './pantry';
import { priceTrends } from './priceHistory';
import { parseReceipt, parseReceiptDate } from './receipt';

const e = (name: string, perUnit: number, date: string, unit: 'g' | 'Stück' = 'g'): PriceEntry => ({ name, perUnit, unit, date: `${date}T12:00:00.000Z` });

describe('Einkaufsdatum vom Bon', () => {
  it('liest „15.09.26 17:24“ und „15.09.2026“', () => {
    expect(parseReceiptDate('6567 005518/85 15.09.26 17:24')).toBe('2026-09-15T12:00:00.000Z');
    expect(parseReceiptDate('15.09.2026 17:24 T-ID')).toBe('2026-09-15T12:00:00.000Z');
  });

  it('ignoriert, was nur wie ein Datum aussieht (Preise, unmögliche Tage)', () => {
    expect(parseReceiptDate('Butter 1,99 A\n31.02.26')).toBeUndefined();
    expect(parseReceiptDate('Summe 20,21')).toBeUndefined();
  });
});

describe('Preisverlauf', () => {
  it('nur Artikel, die mindestens zweimal gekauft wurden – teurer zuerst', () => {
    const t = priceTrends([
      e('Hähnchenbrust', 0.0145, '2026-08-01'), e('Hähnchenbrust', 0.0162, '2026-09-15'),
      e('Magerquark', 0.0033, '2026-08-01'), e('Magerquark', 0.0032, '2026-09-15'),
      e('Bananen', 0.00119, '2026-08-01'), e('Bananen', 0.00119, '2026-09-15'),
      e('Einmal gekauft', 0.01, '2026-09-15'),
    ]);
    expect(t.map((x) => [x.name, x.direction])).toEqual([
      ['Hähnchenbrust', 'teurer'], ['Magerquark', 'guenstiger'], ['Bananen', 'gleich'],
    ]);
    expect(t[0].change).toBeCloseTo(0.117, 3); // +11,7 % zum vorigen Einkauf
  });

  it('vergleicht mit dem vorigen Einkauf, zeigt aber den ganzen Verlauf', () => {
    const [t] = priceTrends([e('Reis', 0.002, '2026-06-01'), e('Reis', 0.0025, '2026-07-01'), e('Reis', 0.0024, '2026-08-01')]);
    expect(t.points.map((p) => p.perUnit)).toEqual([0.002, 0.0025, 0.0024]);
    expect(t.direction).toBe('guenstiger');
  });

  it('derselbe Bon zweimal importiert zählt nicht als zweiter Einkauf', () => {
    expect(priceTrends([e('Reis', 0.002, '2026-09-15'), e('Reis', 0.002, '2026-09-15')])).toEqual([]);
  });

  it('Import: Preis mit Einkaufsdatum in den Verlauf – ein alter Bon überschreibt nicht den neueren Preis', () => {
    const bon = (price: string) => proposeImport(parseReceipt(`EUR\nBananen ${price} A\n1,000 kg x ${price} EUR/kg\nZu zahlen`), []);
    let p = applyImport(emptyPantry(), bon('1,29'), '2026-09-24T10:00:00Z', undefined, '2026-09-20T12:00:00.000Z');
    p = applyImport(p, bon('1,19'), '2026-09-24T11:00:00Z', undefined, '2026-08-01T12:00:00.000Z'); // alter Bon, später importiert
    expect(p.prices[0].perUnit).toBeCloseTo(0.00129);                       // der neuere Preis bleibt der aktuelle
    expect(priceTrends(p.history!).map((t) => t.direction)).toEqual(['teurer']); // 1,19 → 1,29
  });
});
