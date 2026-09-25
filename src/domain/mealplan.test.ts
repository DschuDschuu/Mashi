import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { buildShoppingList, normalizePlan, suggestRecipes, toggleCooked, type MealPlan } from './mealplan';
import { localFoodTable } from './nutrition/localFoods';
import { withMyProducts } from './nutrition/myProducts';
import type { Recipe, RecipeContent } from './types';

const recipes = createMockRecipes();
const plan = (...items: [string, number][]): MealPlan => ({
  items: items.map(([recipeId, servings]) => ({ recipeId, servings })), checked: [], cooked: [], updatedAt: '',
});
const make = (id: string, title: string, ingredients: RecipeContent['ingredients'], servings = 2): Recipe => ({
  ...structuredClone(recipes[0]), id, status: 'kochbuch',
  versions: [{ ...recipes[0].versions[0], id: `${id}-v`, content: { ...recipes[0].versions[0].content, title, servings, ingredients, steps: [] } }],
  currentVersionId: `${id}-v`,
});

describe('Vorschläge für Meal Prep', () => {
  it('schlägt Rezepte mit gemeinsamen Zutaten vor – Hähnchen zuerst', () => {
    // Airfryer-Hähnchen geplant → Gochujang Bowl (Hähnchenhack ≠ Hähnchenbrust) nicht,
    // aber alles mit Hähnchenbrust/Joghurt vorne
    const a = make('a', 'A', [{ id: '1', name: 'Hähnchenbrust', amount: 400, unit: 'g' }, { id: '2', name: 'Paprika', amount: 1, unit: 'Stück' }]);
    const b = make('b', 'B (viel Hähnchen)', [{ id: '1', name: 'Hähnchenbrust', amount: 500, unit: 'g' }]);
    const c = make('c', 'C (nur Paprika)', [{ id: '1', name: 'rote Paprika', amount: 2, unit: 'Stück' }]);
    const d = make('d', 'D (nichts gemeinsam)', [{ id: '1', name: 'Haferflocken', amount: 80, unit: 'g' }]);
    const s = suggestRecipes(plan(['a', 2]), [a, b, c, d], localFoodTable);
    expect(s.map((x) => x.recipe.id)).toEqual(['b', 'c']);
    expect(s[0].shared).toEqual(['Hähnchenbrust']);
  });

  it('Hähnchen, Pasta & Co. zählen mehr als Gemüse – auch wenn vom Gemüse mehr drin ist', () => {
    const planned = make('p', 'Geplant', [
      { id: '1', name: 'Hähnchenbrust', amount: 350, unit: 'g' },
      { id: '2', name: 'Paprika', amount: 1000, unit: 'g' },
      { id: '3', name: 'Pasta', amount: 250, unit: 'g' },
    ]);
    const lotsOfVeg = make('veg', 'Viel Paprika', [{ id: '1', name: 'Paprika', amount: 1000, unit: 'g' }]);
    const someChicken = make('chk', 'Etwas Hähnchen', [{ id: '1', name: 'Hähnchenbrust', amount: 200, unit: 'g' }]);
    const mixed = make('mix', 'Gemischt', [{ id: '1', name: 'Paprika', amount: 300, unit: 'g' }, { id: '2', name: 'Pasta', amount: 100, unit: 'g' }]);
    const s = suggestRecipes(plan(['p', 2]), [planned, lotsOfVeg, someChicken, mixed], localFoodTable);
    expect(s.map((x) => x.recipe.id)).toEqual(['chk', 'mix', 'veg']);
    // „Auch drin“: Pasta vor Paprika, obwohl von der Paprika dreimal so viel drin ist
    expect(s.find((x) => x.recipe.id === 'mix')!.shared).toEqual(['Pasta', 'Paprika']);
  });

  it('erkennt Brot & Wraps am Namen, auch wenn die Tabelle sie nicht kennt', () => {
    const planned = make('p', 'Geplant', [{ id: '1', name: 'Weizentortillas', amount: 4, unit: 'Stück' }, { id: '2', name: 'Kimchi', amount: 4, unit: 'EL' }]);
    const wraps = make('w', 'Wraps', [{ id: '1', name: 'Weizentortillas', amount: 2, unit: 'Stück' }]);
    const kimchi = make('k', 'Kimchi-Reis', [{ id: '1', name: 'Kimchi', amount: 2, unit: 'EL' }]);
    expect(suggestRecipes(plan(['p', 2]), [planned, kimchi, wraps], localFoodTable).map((x) => x.recipe.id)).toEqual(['w', 'k']);
  });

  it('Namensregeln greifen nicht mitten im Wort („gehackte Mandeln“, „Preiselbeeren“)', () => {
    const planned = make('p', 'Geplant', [
      { id: '1', name: 'gehackte Mandeln', amount: 100, unit: 'g' },
      { id: '2', name: 'Preiselbeeren', amount: 100, unit: 'g' },
      { id: '3', name: 'Kartoffeln', amount: 100, unit: 'g' },
    ]);
    const nuts = make('n', 'Mandeln + Preiselbeeren', [{ id: '1', name: 'gehackte Mandeln', amount: 100, unit: 'g' }, { id: '2', name: 'Preiselbeeren', amount: 100, unit: 'g' }]);
    const potato = make('k', 'Kartoffeln', [{ id: '1', name: 'Kartoffeln', amount: 100, unit: 'g' }]);
    const [first, second] = suggestRecipes(plan(['p', 2]), [planned, nuts, potato], localFoodTable);
    // Kartoffeln: 3 × 125 = 375 · Mandeln + Preiselbeeren: je 1 × 125 = 250
    expect([first.recipe.id, first.score, second.recipe.id, second.score]).toEqual(['k', 375, 'n', 250]);
  });

  it('eigene Produkte behalten die Art des ersetzten Eintrags (Milch bleibt Milchprodukt)', () => {
    const milk = { id: 'p-milch', name: 'Milch 0,1 %', replaces: ['milch'], per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt: '' };
    expect(withMyProducts(localFoodTable, [milk]).matchName('Milch')?.food.kind).toBe('dairy');
  });

  it('zählt Grundvorrat nicht: gemeinsames Salz und Öl machen kein Rezept „passend“', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Olivenöl', amount: 2, unit: 'EL' }, { id: '2', name: 'Salz', amount: 1, unit: 'TL' }, { id: '3', name: 'Reis', amount: 100, unit: 'g' }]);
    const b = make('b', 'B', [{ id: '1', name: 'Olivenöl', amount: 3, unit: 'EL' }, { id: '2', name: 'Salz', amount: 1, unit: 'TL' }]);
    expect(suggestRecipes(plan(['a', 2]), [a, b], localFoodTable)).toEqual([]);
  });

  it('erkennt „Pasta“ und „Nudeln“ als dieselbe Zutat', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Nudeln', amount: 150, unit: 'g' }]);
    const b = make('b', 'B', [{ id: '1', name: 'Pasta', amount: 240, unit: 'g' }]);
    expect(suggestRecipes(plan(['a', 2]), [a, b], localFoodTable)[0].shared).toEqual(['Pasta']);
  });

  it('schlägt nichts vor, was schon geplant, archiviert oder nur KI-Idee ist', () => {
    const s = suggestRecipes(plan(['gochujang-bowl', 2]), recipes, localFoodTable, 20);
    const ids = s.map((x) => x.recipe.id);
    expect(ids).not.toContain('gochujang-bowl');
    expect(ids).not.toContain('kimchi-rice'); // KI-Idee
    expect(suggestRecipes(plan(), recipes, localFoodTable)).toEqual([]);
  });
});

describe('Einkaufsliste', () => {
  it('addiert gleiche Zutaten über Rezepte und rechnet auf die geplanten Portionen um', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }], 2);
    const b = make('b', 'B', [{ id: '1', name: 'Hähnchenbrust', amount: 600, unit: 'g' }], 6);
    const list = buildShoppingList(plan(['a', 4], ['b', 6]), [a, b], localFoodTable);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Hähnchenbrust', quantity: '1.200 g', from: ['A', 'B'] });
  });

  it('gleiche Einheit wird addiert, gemischte in Gramm – Nicht-Umrechenbares bleibt getrennt', () => {
    const a = make('a', 'A', [
      { id: '1', name: 'Paprika', amount: 1, unit: 'Stück' },
      { id: '2', name: 'Zwiebel', amount: 1, unit: 'Stück' },
      { id: '3', name: 'Kimchi', amount: 2, unit: 'EL' },
    ]);
    const b = make('b', 'B', [
      { id: '1', name: 'Paprika', amount: 360, unit: 'g' },
      { id: '2', name: 'Zwiebeln', amount: 2, unit: 'Stück' },
      { id: '3', name: 'Kimchi', amount: 100, unit: 'g' },
    ]);
    const list = buildShoppingList(plan(['a', 2], ['b', 2]), [a, b], localFoodTable);
    const q = Object.fromEntries(list.map((i) => [i.name, i.quantity]));
    expect(q.Paprika).toBe('510 g');       // 1 Stück (150 g) + 360 g
    expect(q.Zwiebel).toBe('3 Stück');     // gleiche Einheit
    expect(q.Kimchi).toBe('100 g + 2 EL'); // unbekannt: EL nicht erfunden, sondern getrennt
  });

  it('schreibt Einheiten in der Mehrzahl', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Knoblauch', amount: 1, unit: 'Zehe' }]);
    const b = make('b', 'B', [{ id: '1', name: 'Knoblauch', amount: 2, unit: 'Zehe' }]);
    expect(buildShoppingList(plan(['a', 2]), [a], localFoodTable)[0].quantity).toBe('1 Zehe');
    expect(buildShoppingList(plan(['a', 2], ['b', 2]), [a, b], localFoodTable)[0].quantity).toBe('3 Zehen');
  });

  it('markiert Grundvorrat, damit er ausgeblendet werden kann', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Olivenöl', amount: 2, unit: 'EL' }, { id: '2', name: 'Salz & Pfeffer' }, { id: '3', name: 'Hähnchenbrust', amount: 100, unit: 'g' }]);
    // (Reis wäre vorbelegt „Immer im Haus“ – hier geht es um den festen Grundvorrat)
    const list = buildShoppingList(plan(['a', 2]), [a], localFoodTable);
    expect(list.filter((i) => !i.pantry).map((i) => i.name)).toEqual(['Hähnchenbrust']);
  });

  it('optionale Zutaten stehen nicht drauf', () => {
    const a = make('a', 'A', [{ id: '1', name: 'Reisessig', amount: 1, unit: 'TL', optional: true }, { id: '2', name: 'Reis', amount: 100, unit: 'g' }]);
    expect(buildShoppingList(plan(['a', 2]), [a], localFoodTable).map((i) => i.name)).toEqual(['Reis']);
  });
});

describe('Gekocht im Plan', () => {
  it('schaltet um und bleibt im Plan', () => {
    const p = plan(['a', 2], ['b', 4]);
    const once = toggleCooked(p, 'a');
    expect(once.cooked).toEqual(['a']);
    expect(once.items).toHaveLength(2); // steht weiter im Plan – nur abgehakt
    expect(toggleCooked(once, 'a').cooked).toEqual([]);
  });

  it('„Fertig“ im Kochmodus hakt nur ab, nie wieder auf – und nur, was geplant ist', () => {
    const p = toggleCooked(plan(['a', 2]), 'a', true);
    expect(toggleCooked(p, 'a', true).cooked).toEqual(['a']);
    expect(toggleCooked(p, 'nicht-geplant', true)).toBe(p);
  });

  it('ältere Pläne ohne „cooked“ werden ergänzt', () => {
    expect(normalizePlan({ items: [{ recipeId: 'a', servings: 2 }], checked: [], updatedAt: 'x' }).cooked).toEqual([]);
  });
});

describe('Einkaufsliste nach Art', () => {
  it('jeder Eintrag kennt seine Art – für Gruppen wie im Laden', () => {
    const a = make('a', 'A', [
      { id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: '2', name: 'Paprika', amount: 1, unit: 'Stück' },
      { id: '3', name: 'Joghurt', amount: 150, unit: 'g' }, { id: '4', name: 'Tortillas', amount: 4, unit: 'Stück' },
    ]);
    const kinds = Object.fromEntries(buildShoppingList(plan(['a', 2]), [a], localFoodTable).map((i) => [i.name, i.kind]));
    expect(kinds).toEqual({ Hähnchenbrust: 'protein', Paprika: 'vegetable', 'Griechischer Joghurt': 'dairy', Tortillas: 'bread' });
  });
});
