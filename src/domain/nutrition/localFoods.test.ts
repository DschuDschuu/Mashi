import { describe, expect, it } from 'vitest';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import type { RecipeContent, Unit } from '../types';

const one = (name: string, amount: number, unit: Unit): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount, unit }], steps: [], categories: [], tags: [], devices: [],
});
const food = (name: string) => localFoodTable.matchName(name);

describe('Lebensmitteltabelle', () => {
  it('Kochsahne rechnet mit 15 % Fett, Sahne weiter mit 30 %', () => {
    expect(food('Kochsahne')?.food.per100g.fat).toBe(15);
    expect(food('Sahne')?.food.per100g.fat).toBe(30);
  });

  it('kennt die Zutaten der koreanischen Rezepte – genau zugeordnet', () => {
    for (const name of [
      'Pak Choi', 'Gruyère', 'Tteokbokki-Reiskuchen', 'Spätzle', 'Rinder-Minutensteak', 'Frühstücksfleisch',
      'Dönerfleisch', 'Brioche-Toast-Törtchen', 'Gurke', 'Rotkohl', 'Eisbergsalat', 'Salat', 'Mayo', 'Senf', 'Miso',
    ]) {
      expect(food(name), name).toMatchObject({ quality: 'exact' });
    }
  });

  it('Zusätze in Klammern stören nicht: „Rotkohl (eingelegt)“, „Brühe (Rind)“', () => {
    expect(food('Rotkohl (eingelegt)')?.food.ref.foodId).toBe('rotkohl');
    expect(food('Brühe (Rind)')?.food.ref.foodId).toBe('gemuesebruehe');
  });

  it('Mehrzahl vom Kassenbon findet die Einzahl: Bananen, Avocados, Mangos', () => {
    expect(food('Bananen')?.food.ref.foodId).toBe('banane');
    expect(food('Avocados')?.food.ref.foodId).toBe('avocado');
    expect(food('Mangos')?.food.ref.foodId).toBe('mango');
    // … ohne Bekanntes kaputtzumachen
    expect(food('Reis')?.food.ref.foodId).toBe('reis');
    expect(food('Zwiebeln')?.food.ref.foodId).toBe('zwiebel');
  });

  it('Gewürze wie Buldak und Kreuzkümmel verschlechtern die Genauigkeit nicht', () => {
    expect(computeNutrition(one('Kreuzkümmel', 0.5, 'TL'), localFoodTable).items[0].status).toBe('ignored');
    expect(computeNutrition(one('Buldak-Gewürz', 0.5, 'TL'), localFoodTable).items[0].status).toBe('ignored');
  });

  it('Stückgewichte: 1 Pak Choi ≈ 200 g, 1 Brioche-Törtchen ≈ 45 g', () => {
    expect(computeNutrition(one('Pak Choi', 1, 'Stück'), localFoodTable).items[0].grams).toBe(200);
    expect(computeNutrition(one('Brioche-Toast-Törtchen', 2, 'Stück'), localFoodTable).items[0].grams).toBe(90);
  });

  it('neue Einträge haben eine Art für den Wochenplan', () => {
    expect(food('Pak Choi')?.food.kind).toBe('vegetable');
    expect(food('Rinder-Minutensteak')?.food.kind).toBe('protein');
    expect(food('Spätzle')?.food.kind).toBe('staple');
    expect(food('Gruyère')?.food.kind).toBe('dairy');
    expect(food('Brioche')?.food.kind).toBe('bread');
  });
});
