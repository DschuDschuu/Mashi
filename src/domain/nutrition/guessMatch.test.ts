import { describe, expect, it } from 'vitest';
import { computeNutrition } from './engine';
import { levelNameFromFat } from './fatLevels';
import { guessMatch, localFoodTable } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';
import type { RecipeContent } from '../types';

const dish = (name: string): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount: 100, unit: 'g' }], steps: [], categories: [], tags: [], devices: [],
});
/** erfundenes Produkt, „gilt für“ wie vom neuen Formular vorgeschlagen */
const guessed = (name: string, kcal: number): MyProduct => ({
  id: `p-${name}`, name, ...guessMatch(name), per100g: { kcal, protein: 3, carbs: 5, fat: 1 }, updatedAt: '2026-09-30T00:00:00Z',
});
const kcal = (ingredient: string, products: MyProduct[]) => computeNutrition(dish(ingredient), withMyProducts(localFoodTable, products)).perServing!.kcal;

describe('„gilt für“ aus dem Namen', () => {
  it('trifft den Tabellen-Eintrag – bei Fettstufen den der eigenen Stufe', () => {
    // schlicht „Milch“ ist in Mashi die niedrigste Stufe (0,1 %)
    expect(guessMatch('Milch').replaces).toEqual(['magermilch']);
    expect(guessMatch('Milch 3,5 %').replaces).toEqual(['milch']);
    expect(guessMatch('Vollmilch').replaces).toEqual(['milch']);
    expect(guessMatch('Joghurt 1,5 %').replaces).toEqual(['joghurt-15']);
    expect(guessMatch('Haferflocken')).toEqual({ replaces: ['haferflocken'], names: [], excludes: [] });
    // Marke in Klammern stört nicht
    expect(guessMatch('Haferflocken (Kölln)').replaces).toEqual(['haferflocken']);
  });

  it('unbekannt oder nur ungefähr → eigener Name statt falschem Eintrag', () => {
    expect(guessMatch('Kimchi-Paste')).toEqual({ replaces: [], names: ['kimchi-paste'], excludes: [] });
    // „Pesto mit Rucola“ enthält „pesto“ nur ungefähr – kein Ersatz für jedes Pesto
    expect(guessMatch('Pesto mit Rucola').replaces).toEqual([]);
    expect(guessMatch('  ')).toEqual({ replaces: [], names: [], excludes: [] });
  });

  it('das vorgeschlagene „Milch“ rechnet für „Milch“ und „Magermilch“, nicht für „Milch 3,5 %“', () => {
    const milk = guessed('Milch', 33);
    expect(kcal('Milch', [milk])).toBeCloseTo(33);
    expect(kcal('Magermilch', [milk])).toBeCloseTo(33);
    expect(kcal('Milch 3,5 %', [milk])).toBeCloseTo(64); // Tabelle
  });
});

describe('Stufe aus dem Fettwert', () => {
  it('schlägt die Stufe nur vor, wenn sie vom Namen abweicht', () => {
    expect(levelNameFromFat('Milch', 3.5)).toBe('Milch 3,5 %');
    expect(levelNameFromFat('Milch', 1.5)).toBe('Milch 1,5 %');
    expect(levelNameFromFat('Weidemilch', 3.8)).toBe('Weidemilch 3,5 %');
    // 0,1 g passt schon zu „Milch“ (Standard)
    expect(levelNameFromFat('Milch', 0.1)).toBeUndefined();
    // steht eine Stufe im Namen, gilt sie
    expect(levelNameFromFat('Milch 1,5 %', 3.5)).toBeUndefined();
    // kein Milchprodukt mit Stufen, oder kein Wert
    expect([levelNameFromFat('Hafermilch', 1.5), levelNameFromFat('Haferflocken', 7), levelNameFromFat('Milch', undefined)]).toEqual([undefined, undefined, undefined]);
  });

  it('Quark: Gramm vom Etikett, nicht „% i. Tr.“', () => {
    expect(levelNameFromFat('Quark', 0.3)).toBeUndefined(); // Magerquark
    expect(levelNameFromFat('Quark', 5.1)).toBe('Quark 20 %');
    expect(levelNameFromFat('Quark', 11.4)).toBe('Quark 40 %');
  });

  it('der vorgeschlagene Name ergibt wieder die richtige Zuordnung', () => {
    expect(guessMatch(levelNameFromFat('Milch', 3.5)!).replaces).toEqual(['milch']);
  });
});
