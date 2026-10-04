import { describe, expect, it } from 'vitest';
import type { BonLine, Purchase } from './bons';
import type { PriceEntry } from './cost';
import { foodPricePoints, lastBySize, overviewEntries, seriesKeyOf, sizeRanks } from './foodPrices';
import { foodTrends } from './priceHistory';

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

  it('entfernte Sorte zählt als „ohne Sorte“; ältere Preise tragen ihren Eintrag (zum Zuordnen)', () => {
    const old: PriceEntry = { name: 'Hähnchen', perUnit: 0.01, unit: 'g', date: '2026-08-01T10:00:00Z' };
    const pts = foodPricePoints([old], [buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g', productId: 'geloescht' })], new Set(['leicht']));
    expect(pts.map((p) => [p.sortId, p.entry])).toEqual([['', old], ['', undefined]]);
  });

  it('Linienart je Größe: Hauptgröße durchgezogen, dann nach Häufigkeit, „Größe unbekannt“ zuletzt', () => {
    const pts = foodPricePoints([], [
      buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g', productId: 'leicht' }),
      buy('2026-09-02T10:00:00Z', { price: 4, amount: 400, unit: 'g', productId: 'leicht' }),
      buy('2026-09-03T10:00:00Z', { price: 8, amount: 1000, unit: 'g', productId: 'leicht' }),
      buy('2026-09-04T10:00:00Z', { price: 2, amount: 250, unit: 'g', productId: 'leicht' }),
      buy('2026-09-05T10:00:00Z', { price: 2, amount: 250, unit: 'g', productId: 'leicht' }),
      buy('2026-09-06T10:00:00Z', { price: 2, amount: 250, unit: 'g', productId: 'leicht' }),
      buy('2026-09-07T10:00:00Z', { price: 3, weightKg: 0.5, perKg: 6, productId: 'leicht' }), // lose: ohne Größe
      buy('2026-09-09T10:00:00Z', { price: 3, amount: 500, unit: 'g', productId: 'normal' }),
    ]);
    // gespeicherte Packungsgröße der Sorte „leicht“: 1 kg – auch wenn 250 g öfter gekauft wurde
    const ranks = sizeRanks(pts, (id) => (id === 'leicht' ? '1000 g' : undefined));
    expect(Object.fromEntries(ranks)).toEqual({ 'leicht|1000 g': 0, 'leicht|250 g': 1, 'leicht|400 g': 2, 'leicht|?': 3, 'normal|': 0 });
    // ohne gespeicherte Größe: die meistgekaufte ist die Hauptgröße
    expect(sizeRanks(pts, () => undefined).get('leicht|250 g')).toBe(0);
  });
});

describe('Preise-Übersicht wie die Preis-Seite (Julia)', () => {
  const purchases = [
    buy('2026-09-01T10:00:00Z', { price: 4, amount: 400, unit: 'g', productId: 'leicht' }),
    buy('2026-09-08T10:00:00Z', { price: 8, amount: 1000, unit: 'g', productId: 'leicht' }),
    buy('2026-09-15T10:00:00Z', { price: 4.4, amount: 400, unit: 'g', productId: 'leicht', discounts: [{ kind: 'lidlplus', amount: 1.1 }] }),
  ];
  const keyOf = () => 'haehnchen';

  it('Regalpreis: je Größe eine Linie, teurer/günstiger je Linie', () => {
    const { entries, ranks } = overviewEntries([], purchases, keyOf, 'regal', undefined, () => '400 g');
    const [t] = foodTrends(entries, keyOf, (e) => e.productId);
    expect(t.sorts.map((s) => [s.id, s.points.length, Math.round(s.latest * 1000 * 100) / 100])).toEqual([['leicht|400 g', 2, 11], ['leicht|1000 g', 1, 8]]);
    expect(t.direction).toBe('teurer'); // 10 → 11 €/kg, zuletzt gekauft: 400 g
    expect(ranks.get('haehnchen')?.get('leicht|400 g')).toBe(0);  // gespeicherte Hauptgröße: durchgezogen
  });

  it('Bezahlt: mit Rabatt – und der Tag ist als Rabatt markiert', () => {
    const { entries, marks } = overviewEntries([], purchases, keyOf, 'bezahlt');
    const [t] = foodTrends(entries, keyOf, (e) => e.productId);
    expect(Math.round(t.sorts[0].latest * 1000 * 100) / 100).toBe(8.25); // 3,30 € für 400 g
    expect(t.direction).toBe('guenstiger');
    expect([...marks]).toEqual([['haehnchen|leicht|400 g|2026-09-15', 'rabatt']]);
  });
});

describe('Zuletzt gekauft je Packungsgröße (Julia: Kachel in „Meine Lebensmittel“)', () => {
  it('je Größe der letzte Einkauf, klein nach groß – lose Ware dahinter', () => {
    const pts = foodPricePoints([], [
      buy('2026-09-01T10:00:00Z', { price: 3.99, amount: 500, unit: 'g' }),
      buy('2026-09-15T10:00:00Z', { price: 4.29, amount: 500, unit: 'g' }),
      buy('2026-09-12T10:00:00Z', { price: 7.99, amount: 1000, unit: 'g', discounts: [{ kind: 'angebot', amount: 0.5 }] }),
      buy('2026-09-26T10:00:00Z', { price: 2.29, amount: 250, unit: 'g' }),
      buy('2026-09-20T10:00:00Z', { price: 3.2, weightKg: 0.4, perKg: 8 }),
    ]);
    expect(lastBySize(pts).map((p) => [p.size ?? 'lose', p.date.slice(0, 10), p.purchase!.line.price])).toEqual([
      [250, '2026-09-26', 2.29], [500, '2026-09-15', 4.29], [1000, '2026-09-12', 7.99], ['lose', '2026-09-20', 3.2],
    ]);
  });

  it('nur ältere Preise ohne Bon: der letzte', () => {
    const history: PriceEntry[] = [
      { name: 'Hähnchen', perUnit: 0.01, unit: 'g', date: '2026-08-01T10:00:00Z' },
      { name: 'Hähnchen', perUnit: 0.012, unit: 'g', date: '2026-08-20T10:00:00Z' },
    ];
    expect(lastBySize(foodPricePoints(history, [])).map((p) => p.shelf)).toEqual([0.012]);
  });
});
