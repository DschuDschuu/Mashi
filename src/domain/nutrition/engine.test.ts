import { describe, expect, it } from 'vitest';
import type { RecipeContent } from '../types';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';

const content = (ingredients: RecipeContent['ingredients']): RecipeContent => ({
  title: 't', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});

describe('Anteil je Zutat', () => {
  it('rechnet jede Zutat pro Portion aus – zusammen ergibt es die Portion', () => {
    const n = computeNutrition(content([
      { id: 'a', name: 'Spaghetti', amount: 200, unit: 'g' },
      { id: 'b', name: 'Olivenöl', amount: 2, unit: 'EL' },
      { id: 'c', name: 'Salz', amount: 1, unit: 'Prise' },
    ]), localFoodTable);
    const sum = n.items.reduce((s, i) => s + (i.perServing?.kcal ?? 0), 0);
    expect(sum).toBeCloseTo(n.perServing!.kcal);
    // 200 g Spaghetti auf 2 Portionen = 100 g je Portion
    expect(n.items[0].perServing!.kcal).toBeCloseTo(localFoodTable.matchName('Spaghetti')!.food.per100g.kcal);
    expect(n.items[2].perServing).toBeUndefined(); // Salz zählt nicht
  });
});
