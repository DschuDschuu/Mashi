import { describe, expect, it } from 'vitest';
import { computeNutrition } from './engine';
import { fatLevel } from './fatLevels';
import { localFoodTable, normalizeName } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';
import type { RecipeContent } from '../types';

const dish = (name: string): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount: 100, unit: 'g' }], steps: [], categories: [], tags: [], devices: [],
});
// erfundenes Standard-Produkt „Milch“ mit 0,1-%-Werten
const myMilk: MyProduct = { id: 'p-m', name: 'Milch', names: ['milch'], replaces: [], per100g: { kcal: 34, protein: 3.4, carbs: 4.8, fat: 0.1 }, updatedAt: '2026-09-27T00:00:00Z' };
const kcal = (name: string, products: MyProduct[] = []) => computeNutrition(dish(name), withMyProducts(localFoodTable, products)).perServing!.kcal;

describe('Fettstufen', () => {
  it('liest die Stufe aus Zahl oder Wort', () => {
    expect(['Milch 3,5 %', 'Milch (3,8%)', 'Vollmilch', 'Milch 1.5 %', 'fettarme Milch', 'Milch 0,3 %', 'Magermilch'].map((n) => fatLevel(n)?.label))
      .toEqual(['Milch 3,5 %', 'Milch 3,5 %', 'Milch 3,5 %', 'Milch 1,5 %', 'Milch 1,5 %', 'Milch', 'Milch']);
    expect(['Quark 20 %', 'Sahnequark', 'Magerquark', 'Joghurt 1,5 %'].map((n) => fatLevel(n)?.label)).toEqual(['Quark 20 %', 'Quark 40 %', 'Quark', 'Joghurt 1,5 %']);
    // kein Milchprodukt mit Stufe
    expect([fatLevel('Milch'), fatLevel('Kokosmilch'), fatLevel('Buttermilch'), fatLevel('Hafermilch 1,5 %'), fatLevel('Sojajoghurt 2 %'), fatLevel('Griechischer Joghurt 10 %'), fatLevel('Milchreis')])
      .toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(fatLevel('Weidemilch 3,5 %')?.label).toBe('Milch 3,5 %');
  });

  it('„Milch“ rechnet mit deinem Produkt, eine ausdrückliche Stufe mit der Tabelle', () => {
    expect(kcal('Milch', [myMilk])).toBeCloseTo(34);
    expect(kcal('Milch 3,5 %', [myMilk])).toBeCloseTo(64);
    expect(kcal('Milch (1,5 %)', [myMilk])).toBeCloseTo(47);
    expect(kcal('Vollmilch', [myMilk])).toBeCloseTo(64);
  });

  it('ohne eigenes Produkt: Stufen aus der Tabelle; „Joghurt“ ist kein griechischer Joghurt mehr', () => {
    expect(kcal('Milch 1,5 %')).toBeCloseTo(47);
    expect(kcal('Joghurt')).toBeCloseTo(66);
    expect(kcal('Joghurt 0,1 %')).toBeCloseTo(36);
    expect(kcal('Quark')).toBeCloseTo(67);
    expect(kcal('Quark 40 %')).toBeCloseTo(160);
    expect(kcal('Griechischer Joghurt')).toBeCloseTo(125);
  });

  it('Komma zwischen Ziffern bleibt, sonst trennt es wie bisher', () => {
    expect(normalizeName('Milch 3,5 %')).toBe('milch 3,5 %');
    expect(normalizeName('Tomaten, gehackt')).toBe('tomaten');
  });
});

describe('Ältere Produkte, die den Eintrag „Milch“ ersetzen', () => {
  // wie früher angelegt: ersetzt alle Milch-Einträge, Stufe steht im Namen
  const legacy: MyProduct = { id: 'p-l', name: 'Milch 0,1 % (Test)', replaces: ['milch', 'milch-fettarm', 'magermilch'], per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt: '2026-09-27T00:00:00Z' };
  const rich: MyProduct = { id: 'p-r', name: 'Weidemilch 3,5 % (Test)', replaces: ['milch'], per100g: { kcal: 66, protein: 3.4, carbs: 4.8, fat: 3.6 }, updatedAt: '2026-09-27T00:00:00Z' };
  it('gelten nur für ihre eigene Stufe', () => {
    expect(kcal('Milch', [legacy])).toBeCloseTo(35);
    expect(kcal('Magermilch', [legacy])).toBeCloseTo(35);
    expect(kcal('Milch 3,5 %', [legacy])).toBeCloseTo(64); // Tabelle, nicht 0,1 %
    expect(kcal('fettarme Milch', [legacy])).toBeCloseTo(47);
    expect(kcal('Milch 3,5 %', [legacy, rich])).toBeCloseTo(66); // dein 3,5-%-Produkt
    expect(kcal('Milch', [legacy, rich])).toBeCloseTo(35);
  });
});
