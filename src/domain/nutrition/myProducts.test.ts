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
