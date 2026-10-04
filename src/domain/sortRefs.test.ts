import { describe, expect, it } from 'vitest';
import type { PriceEntry } from './cost';
import { emptyPantry, type Pantry } from './pantry';
import { assignPrices, moveSort, sortUses } from './sortRefs';

const T0 = '2026-09-01T10:00:00Z';
const NOW = '2026-10-04T10:00:00Z';
const price = (date: string, perUnit: number, productId?: string): PriceEntry => ({ name: 'Hackfleisch', perUnit, unit: 'g', date, ...(productId ? { productId } : {}) });

// erfundene Daten: Hackfleisch „rind“ und „gemischt“, dazu ein alter Preis ohne Sorte (ohne Bon)
const pantry: Pantry = {
  ...emptyPantry(),
  items: [
    { id: 'i1', name: 'Hackfleisch', amount: 1, addedAt: T0, productId: 'rind' },
    { id: 'i2', name: 'Hackfleisch', amount: 1, addedAt: T0, productId: 'gemischt' },
  ],
  rules: [{ key: 'hackfleisch 400g', name: 'Hackfleisch', productId: 'rind' }],
  history: [price('2026-08-01T10:00:00Z', 0.008), price(T0, 0.011, 'rind'), price('2026-09-08T10:00:00Z', 0.009, 'gemischt')],
  prices: [price(T0, 0.011, 'rind')],
  bons: [{ id: 'b1', date: T0, updatedAt: T0, lines: [
    { bon: 'Hackfleisch 400g', count: 1, name: 'Hackfleisch', amount: 400, unit: 'g', price: 4.49, productId: 'rind' },
    { bon: 'Hackfleisch 500g', count: 1, name: 'Hackfleisch', amount: 500, unit: 'g', price: 3.99, productId: 'gemischt' },
  ] }],
};
const sorts = (p: Pantry) => ({
  items: p.items.map((i) => i.productId),
  lines: p.bons![0].lines.map((l) => l.productId),
  rule: p.rules[0].productId,
  history: p.history!.map((h) => h.productId),
  prices: p.prices.map((h) => h.productId),
});

describe('Sorte entfernen: wohin mit ihren Einkäufen? (Julia)', () => {
  it('zählt Einkäufe und Vorrat einer Sorte', () => {
    expect(sortUses(pantry, 'rind')).toEqual({ purchases: 1, stock: 1 });
    expect(sortUses(pantry, 'gibts-nicht')).toEqual({ purchases: 0, stock: 0 });
  });

  it('zu einer anderen Sorte: Vorrat, Bon-Zeilen, Gelerntes und Preise ziehen um – der Bon gilt als geändert', () => {
    const { next } = moveSort(pantry, 'rind', 'gemischt', NOW);
    expect(sorts(next)).toEqual({
      items: ['gemischt', 'gemischt'], lines: ['gemischt', 'gemischt'], rule: 'gemischt',
      history: [undefined, 'gemischt', 'gemischt'], prices: ['gemischt'],
    });
    expect(next.bons![0].updatedAt).toBe(NOW);
  });

  it('ohne Sorte: das Feld fällt weg', () => {
    const { next } = moveSort(pantry, 'rind', undefined, NOW);
    expect(next.items[0]).not.toHaveProperty('productId');
    expect(sorts(next).lines).toEqual([undefined, 'gemischt']);
  });

  it('Rückgängig: genau diese Stellen zurück, was „gemischt“ schon vorher war, bleibt „gemischt“', () => {
    const { next, undo } = moveSort(pantry, 'rind', 'gemischt', NOW);
    expect(sorts(undo(next))).toEqual(sorts(pantry));
  });
});

describe('Alte Preise ohne Sorte zuordnen (Julia)', () => {
  it('nur die gewählten Preise bekommen die Sorte, Rückgängig nimmt sie wieder weg', () => {
    const old = pantry.history![0];
    const { next, undo } = assignPrices(pantry, [old], 'gemischt', NOW);
    expect(sorts(next).history).toEqual(['gemischt', 'rind', 'gemischt']);
    expect(sorts(undo(next)).history).toEqual([undefined, 'rind', 'gemischt']);
  });

  it('auch Preise einer entfernten Sorte lassen sich neu zuordnen', () => {
    const gone = { ...pantry, history: [price(T0, 0.011, 'geloescht')] };
    expect(assignPrices(gone, gone.history, 'rind', NOW).next.history![0].productId).toBe('rind');
  });
});
