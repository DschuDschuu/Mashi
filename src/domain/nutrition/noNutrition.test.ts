import { describe, expect, it } from 'vitest';
import type { RecipeContent } from '../types';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import { withoutNutrition } from './noNutrition';

const content = (ingredients: RecipeContent['ingredients']): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1, ingredients, steps: [], categories: [], tags: [], devices: [],
});

describe('Ohne Nährwerte', () => {
  const c = content([
    { id: '1', name: 'Hähnchenbrust', amount: 100, unit: 'g' },
    { id: '2', name: 'Paprikapulver', amount: 2, unit: 'EL' },
    { id: '3', name: 'Sumach', amount: 1, unit: 'TL' },
  ]);
  it('gelistete Gewürze zählen nicht mit – auch solche, die die Tabelle nicht kennt', () => {
    const zero = withoutNutrition(localFoodTable, ['Paprikapulver', 'Sumach']);
    // ohne Liste: Sumach unbekannt → lieber gar keine Summe als eine erfundene
    expect(computeNutrition(c, localFoodTable).items[2].status).toBe('unmatched');
    const after = computeNutrition(c, zero);
    expect(after.items.map((i) => i.status)).toEqual(['exact', 'ignored', 'ignored']);
    // Paprikapulver zählt nicht mehr: weniger kcal als mit ihm
    const withPaprika = computeNutrition(content(c.ingredients.slice(0, 2)), localFoodTable);
    expect(after.total!.kcal).toBeLessThan(withPaprika.total!.kcal);
  });
  it('leere Liste = unverändert', () => {
    expect(withoutNutrition(localFoodTable, [])).toBe(localFoodTable);
  });
});
