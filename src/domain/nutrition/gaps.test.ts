import { describe, expect, it } from 'vitest';
import { nutritionGaps } from './gaps';
import { localFoodTable } from './localFoods';
import { withMyProducts, type MyProduct } from './myProducts';
import { sideContent } from '../mix';
import type { Ingredient, Recipe } from '../types';

// erfundene Rezepte und Lebensmittel – keine echten (das Repo ist öffentlich)
const recipe = (id: string, title: string, ingredients: Ingredient[], extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '', currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(title), ingredients } }],
  ...extra,
});
const ing = (id: string, name: string, amount: number, unit: Ingredient['unit'] = 'g'): Ingredient => ({ id, name, amount, unit });
// bekannt (eigene Werte), aber ohne „1 Stück wiegt“
const testtofu: MyProduct = { id: 'p-t', name: 'Testtofu', names: ['testtofu'], replaces: [], per100g: { kcal: 120, protein: 12, carbs: 2, fat: 7 }, updatedAt: '2026-11-01T00:00:00Z' };
const table = withMyProducts(localFoodTable, [testtofu]);

describe('Nährwert-Lücken (Julia: „welchen Zutaten fehlen Werte?“)', () => {
  const a = recipe('a', 'Testpfanne', [ing('1', 'Testpaste', 50), ing('2', 'Testtofu', 1, 'Stück'), ing('3', 'Testtofu', 100)]);
  const b = recipe('b', 'Testsuppe', [ing('1', 'testpaste', 30), ing('2', 'Testtofu', 2, 'Stück'), ing('3', 'Testtofu', 1, 'Dose')]);
  const c = recipe('c', 'Testsalat', [ing('1', 'Testkraut', 10)]);

  it('unbekannt und ohne Gewicht – je Lebensmittel eine Zeile, mit den Rezepten, das Häufigste zuerst', () => {
    const gaps = nutritionGaps([c, a, b], table);
    expect(gaps.map((g) => [g.name, g.kind, g.recipes.map((r) => r.title)])).toEqual([
      ['Testpaste', 'unbekannt', ['Testpfanne', 'Testsuppe']], // „testpaste“ ist dieselbe
      ['Testtofu', 'gewicht', ['Testpfanne', 'Testsuppe']],
      ['Testkraut', 'unbekannt', ['Testsalat']],
    ]);
    expect(gaps[1].units).toEqual(['Stück']); // 100 g und „1 Dose“ (grob 400 g) rechnen – das fehlt nicht
  });

  it('einmal zugeordnet (ohne Stückgewicht), anderswo unbekannt: zählt als unbekannt – dann fehlen alle Werte', () => {
    const ref = table.matchName('Testtofu')!.food.ref;
    const x = recipe('x', 'Testwok', [{ ...ing('1', 'Testpilz', 1, 'Stück'), foodRef: ref }]);
    const y = recipe('y', 'Testauflauf', [ing('1', 'Testpilz', 100)]);
    expect(nutritionGaps([x, y], table).map((g) => [g.name, g.kind])).toEqual([['Testpilz', 'unbekannt']]);
  });

  it('Archiv und KI-Entwürfe zählen nicht; nichts fehlt → leer', () => {
    expect(nutritionGaps([{ ...c, archivedAt: '2026-10-01T00:00:00Z' }, { ...a, status: 'ki_entwurf' }], table)).toEqual([]);
    expect(nutritionGaps([recipe('d', 'Testteller', [ing('1', 'Testtofu', 200)])], table)).toEqual([]);
  });

  it('Bausteine nur, wenn du sie nutzt: im Wochenplan oder selbst angelegt (Julia: „nur genutzte“)', () => {
    // ohne Woche und eigene: keine Bausteine, auch wenn Mashi viele nicht kennt
    expect(nutritionGaps([], table)).toEqual([]);
    const week = { meals: [{ id: 'm', day: 0 as const, recipeId: 'g', baseId: 'g', side: 'halloumi,richtung:bowl' }] };
    const gaps = nutritionGaps([], table, { week, household: { customSides: ['eigen:veg:Testrübe'] } });
    expect(gaps.map((g) => [g.name, g.block, g.recipes.length])).toEqual([['Halloumi', true, 0], ['Testrübe', true, 0]]);
  });
});
