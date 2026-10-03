import { describe, expect, it } from 'vitest';
import type { BonLine, Purchase } from './bons';
import type { PriceEntry } from './cost';
import { foodPricePoints, seriesKeyOf } from './foodPrices';

const buy = (date: string, line: Partial<BonLine>): Purchase => ({ bonId: `b-${date}`, index: 0, date, line: { bon: 'Haehnchen', count: 1, name: 'Hähnchen', ...line } });

describe('Preis-Diagramm eines Lebensmittels (Julia)', () => {
  it('Regalpreis und bezahlt, Rabatt und MHD markiert, Packungsgröße', () => {
    const [a, b] = foodPricePoints([], [
      buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g', discounts: [{ kind: 'angebot', amount: 1 }] }),
      buy('2026-09-08T10:00:00Z', { price: 8, amount: 1000, unit: 'g', reduced: true, discounts: [{ kind: 'mhd', amount: 1.6, percent: 20 }] }),
    ]);
    expect(a).toMatchObject({ size: 400, sizeUnit: 'g', unit: 'g', discount: true, mhd: false });
    expect(a.shelf * 1000).toBeCloseTo(10); // 4 € für 400 g = 10 €/kg
    expect(a.paid * 1000).toBeCloseTo(7.5); // 3 € bezahlt
    expect(b).toMatchObject({ size: 1000, discount: false, mhd: true });
    expect(b.paid * 1000).toBeCloseTo(6.4);
  });

  it('lose Ware mit Kilopreis: bezahlt im selben Verhältnis, keine Größe', () => {
    const [p] = foodPricePoints([], [buy('2026-09-01T10:00:00Z', { price: 6.45, weightKg: 3.242, perKg: 1.99, discounts: [{ kind: 'lidlplus', amount: 0.645 }] })]);
    expect(p.size).toBeUndefined();
    expect(p.shelf * 1000).toBeCloseTo(1.99);
    expect(p.paid * 1000).toBeCloseTo(1.99 * 0.9);
  });

  it('ältere Preise ohne Bon zählen mit – mit Bon nicht doppelt', () => {
    const history: PriceEntry[] = [
      { name: 'Hähnchen', perUnit: 0.01, unit: 'g', date: '2026-08-01T10:00:00Z' },
      { name: 'Hähnchen', perUnit: 0.01, unit: 'g', date: '2026-09-01T10:00:00Z' },
    ];
    const pts = foodPricePoints(history, [buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g' })]);
    expect(pts.map((p) => [p.date.slice(0, 10), !!p.purchase])).toEqual([['2026-08-01', false], ['2026-09-01', true]]);
  });

  it('eigene Linie je Größe nur, wenn eine Sorte in mehreren Größen gekauft wurde', () => {
    const pts = foodPricePoints([], [
      buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g', productId: 'leicht' }),
      buy('2026-09-08T10:00:00Z', { price: 8, amount: 1000, unit: 'g', productId: 'leicht' }),
      buy('2026-09-09T10:00:00Z', { price: 3, amount: 500, unit: 'g', productId: 'normal' }),
    ]);
    const key = seriesKeyOf(pts);
    expect(pts.map((p) => key(p).id)).toEqual(['leicht|400 g', 'leicht|1000 g', 'normal|']);
  });
});
