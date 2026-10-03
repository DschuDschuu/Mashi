import { describe, expect, it } from 'vitest';
import { asCooked } from './scaling';

describe('asCooked – das Rezept, wie es wirklich gekocht wird', () => {
  const c = { title: 't', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1 as const, steps: [], categories: [], tags: [], devices: [],
    ingredients: [{ id: 'p', name: 'Paprika', amount: 1, unit: 'Stück' as const }, { id: 'r', name: 'Reis', amount: 150, unit: 'g' as const }] };
  it('Portionen umgerechnet, geänderte Mengen eingesetzt', () => {
    const k = asCooked(c, 4, { p: 3 });
    expect(k.servings).toBe(4);
    expect(k.ingredients.map((i) => i.amount)).toEqual([3, 300]);
  });
  it('nichts geändert → dasselbe Rezept', () => {
    expect(asCooked(c, 2)).toBe(c);
  });
});
