import { describe, expect, it } from 'vitest';
import type { RecipeContent } from '../types';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';

const milk: MyProduct = {
  id: 'p-milch', name: 'Milch 0,1 % (Test)', replaces: ['milch', 'milch-fettarm', 'magermilch'],
  per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt: '2026-09-24T00:00:00Z',
};
const content = (name: string, amount: number, unit: 'ml' | 'g' | 'EL'): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount, unit }], steps: [], categories: [], tags: [], devices: [],
});

describe('Meine Produkte', () => {
  const table = withMyProducts(localFoodTable, [milk]);

  it('rechnet jede Milch mit dem eigenen Produkt', () => {
    for (const name of ['Milch', 'Vollmilch', 'Fettarme Milch', 'Magermilch (0,1 %)']) {
      const n = computeNutrition(content(name, 100, 'g'), table);
      expect(n.perServing!.kcal, name).toBeCloseTo(35);
      expect(n.items[0].food?.name, name).toBe('Milch 0,1 % (Test)');
    }
  });

  it('übernimmt die Dichte des ersetzten Eintrags (ml → g)', () => {
    // Milch: 1,03 g/ml → 100 ml = 103 g → 36,05 kcal
    expect(computeNutrition(content('Milch', 100, 'ml'), table).perServing!.kcal).toBeCloseTo(36.05);
  });

  it('lässt alles andere unverändert – Hafermilch ist keine Milch', () => {
    expect(computeNutrition(content('Hafermilch', 100, 'g'), table).perServing!.kcal).toBeCloseTo(45);
    expect(computeNutrition(content('Reis', 100, 'g'), table).perServing!.kcal).toBeCloseTo(350);
  });

  it('behält die Genauigkeit: ungefähre Zuordnung bleibt „geschätzt“', () => {
    const n = computeNutrition(content('Milch vom Bauernhof', 100, 'g'), table);
    expect(n.accuracy).toBe('geschaetzt');
    expect(n.items[0].food?.name).toBe('Milch 0,1 % (Test)');
  });

  it('ohne Produkte ist die Tabelle genau die alte', () => {
    expect(withMyProducts(localFoodTable, [])).toBe(localFoodTable);
  });
});

describe('Produkte für unbekannte Zutaten', () => {
  const kimchi: MyProduct = {
    id: 'p-kimchi', name: 'Kimchi', replaces: [], names: ['kimchi'],
    per100g: { kcal: 23, protein: 1.7, carbs: 2.4, fat: 0.5 }, updatedAt: '2026-09-24T00:00:00Z',
  };
  const table = withMyProducts(localFoodTable, [kimchi]);

  it('vorher unbekannt, danach genau berechnet – auch mit Zusatz in Klammern', () => {
    expect(computeNutrition(content('Kimchi', 100, 'g'), localFoodTable).items[0].status).toBe('unmatched');
    const n = computeNutrition(content('Kimchi (vegan)', 200, 'g'), table);
    expect(n.accuracy).toBe('berechnet');
    expect(n.perServing!.kcal).toBeCloseTo(46);
  });

  it('Löffel rechnet es wie überall über 15 ml (Dichte 1)', () => {
    const n = computeNutrition(content('Kimchi', 2, 'EL'), table);
    expect(n.items[0]).toMatchObject({ status: 'exact', grams: 30 });
  });

  it('eigene Namen gewinnen vor der allgemeinen Tabelle', () => {
    const own = { ...kimchi, id: 'p-reis', name: 'Mein Reis', names: ['reis'] };
    expect(withMyProducts(localFoodTable, [own]).matchName('Reis')?.food.name).toBe('Mein Reis');
  });
});
