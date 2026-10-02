import { describe, expect, it } from 'vitest';
import { emptyPantry, type Pantry } from './pantry';
import { relinkOldImport, renameFood, syncProductNames } from './renameFood';
import type { MyProduct } from './nutrition/myProducts';
import type { ImportRow } from './pantry';

// Erfundene Daten
const T = '2026-10-02T12:00:00.000Z';
const base = (): Pantry => ({
  ...emptyPantry(),
  items: [
    { id: 'a', name: 'Hack', amount: 500, unit: 'g', addedAt: T },
    { id: 'b', name: 'Rinderhack mager', amount: 1, unit: 'Stück', addedAt: T, productId: 'p1' },
    { id: 'c', name: 'Rinderhack', amount: 200, unit: 'g', addedAt: T }, // hieß schon so – bleibt beim Rückgängig
    { id: 'd', name: 'Quark', amount: 250, unit: 'g', addedAt: T },
  ],
  rules: [{ key: 'rinderhack 500g', name: 'Hack', amount: 500, unit: 'g' }, { key: 'quark', name: 'Quark' }],
  bons: [{ id: 'b1', date: T, lines: [{ bon: 'Rinderhack 500g', count: 1, name: 'Hack' }, { bon: 'Quark', count: 1, name: 'Quark' }], updatedAt: T }],
  history: [{ name: 'Hack', perUnit: 0.007, unit: 'g', date: T }, { name: 'Quark', perUnit: 0.003, unit: 'g', date: T }],
  prices: [{ name: 'hack', perUnit: 0.007, unit: 'g', date: T }],
  restock: [{ name: 'Hack', below: 500, unit: 'g' }],
  basics: ['Salz', 'Hack'],
});

describe('Lebensmittel umbenennen', () => {
  it('alles mit dem alten Namen oder dieser Sorte heißt danach neu', () => {
    const { pantry: p } = renameFood(base(), 'Hack', 'Rinderhack', ['p1']);
    expect(p.items.map((i) => i.name)).toEqual(['Rinderhack', 'Rinderhack', 'Rinderhack', 'Quark']);
    expect(p.rules.map((r) => r.name)).toEqual(['Rinderhack', 'Quark']);
    expect(p.bons![0].lines.map((l) => l.name)).toEqual(['Rinderhack', 'Quark']);
    expect(p.history!.map((h) => h.name)).toEqual(['Rinderhack', 'Quark']);
    expect(p.prices.map((h) => h.name)).toEqual(['Rinderhack']);
    expect(p.restock!.map((r) => r.name)).toEqual(['Rinderhack']);
    expect(p.basics).toEqual(['Salz', 'Rinderhack']);
  });

  it('Rückgängig stellt genau das Geänderte zurück – samt alter Schreibweise', () => {
    const before = base();
    const { pantry: p, undo } = renameFood(before, 'Hack', 'Rinderhack', ['p1']);
    const back = undo(p);
    expect(back.items.map((i) => i.name)).toEqual(['Hack', 'Rinderhack mager', 'Rinderhack', 'Quark']);
    expect(back.prices.map((h) => h.name)).toEqual(['hack']);
    expect({ ...back, updatedAt: '' }).toEqual({ ...before, updatedAt: '' });
  });

  it('gleicher Name oder leer: nichts passiert', () => {
    const p = base();
    expect(renameFood(p, 'Hack', 'hack', []).pantry).toBe(p);
    expect(renameFood(p, 'Hack', ' ', []).pantry).toBe(p);
  });
});

const product = (id: string, name: string): MyProduct => ({ id, name, replaces: [], per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, updatedAt: T });

describe('Meine Lebensmittel gibt den Namen vor', () => {
  it('Vorrat, Gelerntes und Bons einer Sorte heißen wie sie – Preise mit dem alten Namen ziehen mit', () => {
    const p = syncProductNames(base(), [product('p1', 'Rinderhack')])!;
    expect(p.items.find((i) => i.id === 'b')!.name).toBe('Rinderhack');
    expect(p.items.find((i) => i.id === 'a')!.name).toBe('Hack'); // ohne Sorte: bleibt
    const q = syncProductNames({ ...base(), rules: [{ key: 'rinderhack 500g', name: 'Hack', productId: 'p1' }], history: [{ name: 'Hack', perUnit: 1, unit: 'g', date: T }] }, [product('p1', 'Rinderhack')])!;
    expect(q.rules[0].name).toBe('Rinderhack');
    expect(q.history!.map((h) => h.name)).toEqual(['Rinderhack']);
  });

  it('schon einheitlich → nichts zu tun', () => {
    expect(syncProductNames(base(), [product('p1', 'Rinderhack mager')])).toBeUndefined();
  });

  it('Bon ersetzen: Vorrat vom ersten Einlesen bekommt Name und Sorte der neuen Zuordnung', () => {
    const p = base(); // erster Import: „Rinderhack 500g“ → „Hack“ (ohne Sorte)
    const row: ImportRow = { line: { name: 'Rinderhack 500g', count: 1 }, key: 'rinderhack 500g', known: true, skip: false, name: 'Rinderhack', productId: 'p1' };
    const out = relinkOldImport(p, [row]);
    expect(out.items.find((i) => i.id === 'a')).toMatchObject({ name: 'Rinderhack', productId: 'p1', amount: 500 });
    // was nicht vom alten Import kam, bleibt
    expect(out.items.find((i) => i.id === 'd')).toEqual(p.items.find((i) => i.id === 'd'));
    // gleiche Zuordnung wie damals: nichts ändert sich
    expect(relinkOldImport(p, [{ ...row, name: 'Hack', productId: undefined }])).toBe(p);
  });
});

