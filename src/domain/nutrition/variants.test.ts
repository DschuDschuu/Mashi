import { describe, expect, it } from 'vitest';
import { addItem, deductRecipe, emptyPantry, type PantryItem } from '../pantry';
import type { RecipeContent } from '../types';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';
import { bestVariant, DEFAULT_MACRO_GOAL, macroShares, needsAsking, noticeableRange, pickFor, variantChoices, withFavorite } from './variants';

// Zwei erfundene Pesto-Sorten für dieselbe Zutat
const pesto = (id: string, name: string, kcal: number, protein: number, carbs: number, fat: number): MyProduct => ({
  id, name, replaces: [], names: ['grünes pesto'], per100g: { kcal, protein, carbs, fat }, updatedAt: '2026-09-25T00:00:00Z',
});
const A = pesto('p-a', 'Pesto A (Test)', 400, 5, 6, 40);
const B = pesto('p-b', 'Pesto B (Test)', 500, 4, 5, 50);
const table = withMyProducts(localFoodTable, [A, B]);

const dish = (grams: number): RecipeContent => ({
  title: 't', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [
    { id: 'i-pesto', name: 'Grünes Pesto', amount: grams, unit: 'g' },
    { id: 'i-nudeln', name: 'Spaghetti', amount: 250, unit: 'g' },
  ],
  steps: [], categories: [], tags: [], devices: [],
});
const stockOf = (...items: Partial<PantryItem>[]) => items.map((x, n) => ({ id: `v${n}`, name: 'Grünes Pesto', addedAt: '2026-09-20', ...x }) as PantryItem);

describe('Sorten: mehrere eigene Produkte für eine Zutat', () => {
  it('rechnet beim Stöbern mit dem Durchschnitt und kennt beide Sorten', () => {
    const food = table.matchName('Grünes Pesto')!.food;
    expect(food.per100g.kcal).toBe(450);
    expect(food.variants?.map((v) => v.id)).toEqual(['p-a', 'p-b']);
    // gleicher Schlüssel für Vorrat und Rezept – auch bei anderer Schreibweise
    expect(table.matchName('grünes Pesto')!.food.ref).toEqual(food.ref);
    expect(table.byRef(food.ref)?.per100g.kcal).toBe(450);
  });

  it('gibt die Spanne an – und zeigt sie nur, wenn sie das Gericht spürbar verändert', () => {
    const big = computeNutrition(dish(100), table);
    expect(big.range!.kcal[1] - big.range!.kcal[0]).toBeCloseTo(100); // 100 g × 100 kcal Unterschied
    expect(noticeableRange(big)!.kcal.map(Math.round)).toEqual([Math.round((big.range!.kcal[0]) / 2), Math.round(big.range!.kcal[1] / 2)]);
    // ein Löffel Pesto in viel Nudeln: 3 kcal Unterschied sind nur Rauschen
    expect(noticeableRange(computeNutrition(dish(3), table))).toBeNull();
  });

  it('rechnet mit der gewählten Sorte, wenn man sie beim Planen/Kochen nimmt', () => {
    const avg = computeNutrition(dish(100), table).total!.kcal;
    const withB = computeNutrition(dish(100), table, { 'i-pesto': 'p-b' });
    expect(withB.total!.kcal).toBeCloseTo(avg + 50);
    expect(withB.items[0].food?.name).toBe('Pesto B (Test)');
    expect(withB.range).toBeUndefined();
  });

  it('nimmt die Sorte ohne Frage, wenn nur eine im Vorrat liegt', () => {
    const c = variantChoices(dish(100), table, stockOf({ productId: 'p-b', amount: 190, unit: 'g' }), DEFAULT_MACRO_GOAL);
    expect(c).toEqual([expect.objectContaining({ ingredientId: 'i-pesto', suggested: 'p-b' })]);
    expect(c[0].options).toHaveLength(1);
  });

  it('schlägt bei beiden im Vorrat die vor, die näher an 40/30/30 liegt – eigene Wahl geht vor', () => {
    const c = variantChoices(dish(100), table, stockOf({ productId: 'p-a' }, { productId: 'p-b' }), DEFAULT_MACRO_GOAL);
    expect(c[0].options).toHaveLength(2);
    expect(c[0].suggested).toBe(bestVariant([A, B].map((p) => ({ id: p.id, name: p.name, per100g: p.per100g })), DEFAULT_MACRO_GOAL).id);
    expect(c[0].suggested).toBe('p-a'); // weniger Fett-lastig
    expect(pickFor(c, { 'i-pesto': 'p-b' })).toEqual({ 'i-pesto': 'p-b' });
    expect(pickFor(c, { 'i-pesto': 'p-weg' })).toEqual({ 'i-pesto': 'p-a' }); // gewählte Sorte ist aufgebraucht
  });

  it('fragt nicht, wenn keine Sorte erkannt im Vorrat liegt (dann bleibt der Durchschnitt)', () => {
    expect(variantChoices(dish(100), table, stockOf({}), DEFAULT_MACRO_GOAL)).toEqual([]);
  });

  it('rechnet das Makro-Verhältnis als Anteil an den Kalorien', () => {
    const s = macroShares({ carbs: 40, protein: 30, fat: 13.33 });
    expect(s.carbs).toBeCloseTo(40, 0);
    expect(s.protein).toBeCloseTo(30, 0);
    expect(s.fat).toBeCloseTo(30, 0);
  });
});

describe('Sorten im Vorrat', () => {
  it('hält verschiedene Sorten getrennt, gleiche zusammen', () => {
    let items = addItem([], { name: 'Grünes Pesto', amount: 190, unit: 'g', productId: 'p-a' }, '2026-09-25', () => 'x1');
    items = addItem(items, { name: 'Grünes Pesto', amount: 190, unit: 'g', productId: 'p-b' }, '2026-09-25', () => 'x2');
    items = addItem(items, { name: 'Grünes Pesto', amount: 190, unit: 'g', productId: 'p-a' }, '2026-09-25', () => 'x3');
    expect(items.map((i) => [i.productId, i.amount])).toEqual([['p-a', 380], ['p-b', 190]]);
  });

  it('nimmt beim Kochen die Packung der gewählten Sorte', () => {
    const p = { ...emptyPantry(), items: stockOf({ productId: 'p-a', amount: 190, unit: 'g' }, { productId: 'p-b', amount: 190, unit: 'g' }) };
    const d = deductRecipe(p, dish(100), 2, table, {}, { 'i-pesto': 'p-b' });
    expect(d.pantry.items.map((i) => [i.productId, i.amount])).toEqual([['p-a', 190], ['p-b', 90]]);
  });
});

describe('Favorit unter den Sorten (★)', () => {
  const fav = withMyProducts(localFoodTable, withFavorite([A, B], [A, B], 'p-b'));

  it('rechnet beim Stöbern mit dem Favoriten statt dem Durchschnitt – ohne Spanne', () => {
    const food = fav.matchName('Grünes Pesto')!.food;
    expect(food.per100g.kcal).toBe(500);
    expect(food.favoriteId).toBe('p-b');
    expect(food.ref).toEqual(table.matchName('Grünes Pesto')!.food.ref); // Vorrat findet sich weiter
    expect(computeNutrition(dish(100), fav).range).toBeUndefined();
  });

  it('nimmt den Favoriten ohne Nachfrage, wenn er im Vorrat liegt', () => {
    const c = variantChoices(dish(100), fav, stockOf({ productId: 'p-a' }, { productId: 'p-b' }), DEFAULT_MACRO_GOAL);
    expect(c[0].suggested).toBe('p-b'); // obwohl A besser zu 40/30/30 passt
    expect(needsAsking(c)).toBe(false);
    // ohne Favorit: nachfragen
    expect(needsAsking(variantChoices(dish(100), table, stockOf({ productId: 'p-a' }, { productId: 'p-b' }), DEFAULT_MACRO_GOAL))).toBe(true);
  });

  it('ist der Favorit nicht da, zählt, was da ist', () => {
    const c = variantChoices(dish(100), fav, stockOf({ productId: 'p-a' }), DEFAULT_MACRO_GOAL);
    expect(c[0].suggested).toBe('p-a');
  });

  it('hat je Zutat höchstens einen Favoriten und lässt sich zurücknehmen', () => {
    const both = withFavorite(withFavorite([A, B], [A, B], 'p-a'), [A, B], 'p-b');
    expect(both.filter((p) => p.favorite).map((p) => p.id)).toEqual(['p-b']);
    expect(withFavorite(both, [A, B], null).some((p) => p.favorite)).toBe(false);
  });
});
