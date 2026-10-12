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

describe('Zu viele unbekannte Zutaten: das Bekannte trotzdem zeigen (Julia)', () => {
  const unknown = (id: string) => ({ id, name: `Zzqx-Testzutat ${id}`, amount: 100, unit: 'g' as const });
  const n = computeNutrition(content([
    { id: 'a', name: 'Spaghetti', amount: 200, unit: 'g' },
    unknown('1'), unknown('2'), unknown('3'),
  ]), localFoodTable);

  it('kein Gesamtwert (wie bisher), aber ein Mindestwert aus den bekannten Zutaten', () => {
    expect(n.accuracy).toBe('nicht_verfuegbar');
    expect(n.perServing).toBeNull();
    expect(n.partial).toMatchObject({ known: 1, of: 4 });
    // 200 g Spaghetti auf 2 Portionen = 100 g je Portion
    expect(n.partial!.perServing.kcal).toBeCloseTo(localFoodTable.matchName('Spaghetti')!.food.per100g.kcal);
  });

  it('die bekannte Zutat hat ihren Anteil je Portion, die unbekannten keinen', () => {
    expect(n.items[0].perServing!.kcal).toBeCloseTo(n.partial!.perServing.kcal);
    expect(n.items.slice(1).every((i) => i.perServing === undefined)).toBe(true);
  });

  it('ist gar nichts bekannt: kein Mindestwert', () => {
    expect(computeNutrition(content([unknown('1'), unknown('2')]), localFoodTable).partial).toBeUndefined();
  });
});
