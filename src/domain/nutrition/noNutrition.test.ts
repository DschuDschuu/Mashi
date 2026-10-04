import { describe, expect, it } from 'vitest';
import type { Ingredient, RecipeContent, Unit } from '../types';
import { keyOfName, resolveIngredient } from '../mealplan';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';
import { withoutNutrition, withSpices } from './noNutrition';

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

describe('Gewürz und frisches Lebensmittel mit gleichem Namen (Julia: Petersilie getrocknet und Bund)', () => {
  // erfundene Werte: frische Petersilie als eigenes Lebensmittel
  const bund: MyProduct = { id: 'p-pet', name: 'Petersilie', replaces: [], per100g: { kcal: 40, protein: 4, carbs: 3, fat: 1 }, updatedAt: '2026-10-01T00:00:00Z' };
  const mine = withMyProducts(localFoodTable, [bund]);
  const keys = withSpices(mine, ['Petersilie', 'Kreuzkümmel']);
  const ing = (name: string, unit?: Unit): Ingredient => ({ id: name + unit, name, amount: 1, unit });
  const key = (i: Ingredient, t = keys) => resolveIngredient(i, 1, t)?.key;

  it('überschreibt nichts mehr: „Petersilie“ bleibt der Bund, getrocknet hat einen eigenen Schlüssel', () => {
    expect(keyOfName('Petersilie', keys)).toBe('food:p-pet');
    expect(keyOfName('getrocknete Petersilie', keys)).toBe('food:petersilie getrocknet');
    expect(keyOfName('Petersilie (getr.)', keys)).toBe('food:petersilie getrocknet');
    expect(keyOfName('Petersilie, gerebelt', keys)).toBe('food:petersilie getrocknet');
  });

  it('Julias Regel: TL und Prise getrocknet, EL/Bund/Gramm frisch, „frisch“ im Namen frisch', () => {
    expect(key(ing('Petersilie', 'TL'))).toBe('food:petersilie getrocknet');
    expect(key(ing('Petersilie', 'Prise'))).toBe('food:petersilie getrocknet');
    expect(key(ing('Petersilie', 'EL'))).toBe('food:p-pet');
    expect(key(ing('Petersilie', 'Bund'))).toBe('food:p-pet');
    expect(key(ing('Petersilie', 'g'))).toBe('food:p-pet');
    expect(key(ing('frische Petersilie', 'TL'))).toBe('food:p-pet');
    expect(key(ing('getrocknete Petersilie', 'EL'))).toBe('food:petersilie getrocknet');
  });

  it('frische im Vorrat: dann auch beim TL die frische', () => {
    const stocked = withSpices(mine, ['Petersilie'], { stock: ['Petersilie'] });
    expect(key(ing('Petersilie', 'TL'), stocked)).toBe('food:p-pet');
    // getrocknete im Vorrat zählt nicht als frisch
    expect(key(ing('Petersilie', 'TL'), withSpices(mine, ['Petersilie'], { stock: ['Petersilie getrocknet'] }))).toBe('food:petersilie getrocknet');
  });

  it('Nährwerte: 1 TL getrocknet zählt nicht, der Bund schon – vorher zählte auch der Bund 0 kcal', () => {
    const zero = withoutNutrition(mine, ['Petersilie']);
    const n = computeNutrition(content([ing('Petersilie', 'TL'), { id: 'b', name: 'Petersilie', amount: 30, unit: 'g' }]), zero);
    expect(n.items.map((i) => i.status)).toEqual(['ignored', 'exact']);
    expect(n.total!.kcal).toBeCloseTo(12); // 30 g × 40 kcal/100 g
  });

  it('auch mit der Tabelle: Basilikum als Gewürz macht frisches Basilikum nicht zu 0 kcal', () => {
    const zero = withoutNutrition(localFoodTable, ['Basilikum']);
    const n = computeNutrition(content([ing('Basilikum', 'TL'), { id: 'b', name: 'Basilikum', amount: 20, unit: 'g' }]), zero);
    expect(n.items.map((i) => i.status)).toEqual(['ignored', 'exact']);
  });

  it('Gewürze ohne frische Form bleiben, wie sie waren – gleicher Schlüssel, als Gewürz markiert', () => {
    expect(keyOfName('Kreuzkümmel', keys)).toBe(keyOfName('Kreuzkümmel', localFoodTable));
    expect(resolveIngredient(ing('Kreuzkümmel', 'TL'), 1, keys)?.spice).toBe(true);
    // unbekannt (Sumach): Schlüssel bleibt „name:…“, ist aber ein Gewürz
    const sumach = withSpices(localFoodTable, ['Sumach']);
    expect(resolveIngredient(ing('Sumach', 'TL'), 1, sumach)).toMatchObject({ key: 'name:sumach', spice: true });
  });
});
