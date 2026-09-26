import { describe, expect, it } from 'vitest';
import { buildFoodList, matchesFilter } from './foodList';
import { localFoodTable } from './localFoods';
import type { MyProduct } from './myProducts';

// Erfundene Produkte
const p = (id: string, name: string, extra: Partial<MyProduct> = {}): MyProduct => ({
  id, name, replaces: [], per100g: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, updatedAt: '2026-09-26T00:00:00Z', ...extra,
});
const pestoA = p('a', 'Pesto A (Test)', { names: ['grünes pesto'] });
const pestoB = p('b', 'Pesto B (Test)', { names: ['grünes pesto'] });
const milk = p('m', 'Milch 0,1 % (Test)', { replaces: ['milch'] });
const gochu = p('g', 'Gochujang', { replaces: ['gochujang'], generic: true });

describe('Meine Lebensmittel – eine Liste', () => {
  const rows = buildFoodList([pestoA, milk, pestoB, gochu], ['Gochujang', 'Pasta'], ['Kreuzkümmel'], localFoodTable);
  const by = (name: string) => rows.find((r) => r.name === name);

  it('fasst Sorten derselben Zutat in einer Zeile zusammen', () => {
    expect(by('Grünes pesto')?.products.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('schreibt die Zutat so, wie sie in deinen Rezepten steht', () => {
    const spelled = buildFoodList([pestoA, pestoB], [], [], localFoodTable, ['Grünes Pesto', 'Spaghetti']);
    expect(spelled.map((r) => r.name)).toEqual(['Grünes Pesto']);
  });

  it('zeigt ein einzelnes Produkt unter seinem Namen', () => {
    expect(by('Milch 0,1 % (Test)')?.products).toHaveLength(1);
  });

  it('hängt „Immer im Haus“ an das passende Produkt – oder legt eine eigene Zeile mit Tabellenwerten an', () => {
    expect(by('Gochujang')?.basic).toBe('Gochujang');
    expect(by('Gochujang')?.products).toHaveLength(1);
    const pasta = by('Pasta')!;
    expect(pasta.products).toHaveLength(0);
    expect(pasta.table?.per100g.kcal).toBeGreaterThan(0);
  });

  it('kennt „Ohne Nährwerte“ und filtert', () => {
    expect(by('Kreuzkümmel')?.zero).toBe('Kreuzkümmel');
    expect(rows.filter((r) => matchesFilter(r, 'haus')).map((r) => r.name)).toEqual(['Gochujang', 'Pasta']);
    expect(rows.filter((r) => matchesFilter(r, 'ohne')).map((r) => r.name)).toEqual(['Kreuzkümmel']);
    // Meine Produkte = alles mit eigenen Werten (Pasta ohne eigene Werte nicht)
    expect(rows.filter((r) => matchesFilter(r, 'produkte')).map((r) => r.name)).toEqual(['Gochujang', 'Grünes pesto', 'Milch 0,1 % (Test)']);
  });

  it('lässt eine gerade geleerte Zeile stehen, statt sie verschwinden zu lassen', () => {
    // Pasta war nur „Immer im Haus“ – ausgeschaltet, aber noch angefasst
    const kept = buildFoodList([], [], [], localFoodTable, [], ['Pasta']);
    expect(kept.map((r) => [r.name, r.basic, r.products.length])).toEqual([['Pasta', undefined, 0]]);
    expect(buildFoodList([], [], [], localFoodTable)).toEqual([]);
  });

  it('sortiert alphabetisch – jede Zutat genau einmal', () => {
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b, 'de')));
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});
