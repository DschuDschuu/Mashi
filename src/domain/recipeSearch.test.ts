import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { ingredientCompletions, longNotCooked, searchRecipes } from './recipeSearch';
import type { Recipe, RecipeContent } from './types';

const base = createMockRecipes()[0];
const make = (id: string, title: string, ingredients: string[], extra: Partial<Recipe> = {}): Recipe => ({
  ...structuredClone(base), id, status: 'kochbuch', lastCookedAt: undefined, ...extra,
  versions: [{
    ...base.versions[0], id: `${id}-v`,
    content: { ...base.versions[0].content, title, ingredients: ingredients.map((name, n) => ({ id: `${n}`, name })), steps: [] } as RecipeContent,
  }],
  currentVersionId: `${id}-v`,
});

const all = [
  make('a', 'Hähnchen-Curry', ['Hähnchenbrust', 'Reis']),
  make('b', 'Crispy Hähnchen', ['Hähnchenbrust (ohne Haut)', 'Paprika']),
  make('c', 'Linsensuppe', ['Linsen', 'Möhren']),
  make('d', 'Bowl mit Reis', ['Reis', 'Hähnchenhack']),
  make('e', 'Nachhaltig kochen', ['Kartoffeln']),
];

describe('Suche beim Tippen', () => {
  it('Titelanfang vor Wortanfang vor Zutat', () => {
    const hits = searchRecipes(all, 'häh');
    expect(hits.map((h) => h.recipe.id)).toEqual(['a', 'b', 'd']);
    expect(hits[0].titleMatch).toEqual({ start: 0, end: 3 });
    expect(hits[1].titleMatch).toEqual({ start: 7, end: 10 });
    expect(hits[2].ingredient).toBe('Hähnchenhack');
    expect(hits[2].titleMatch).toBeUndefined();
  });

  it('Wortanfang schlägt Treffer mitten im Wort', () => {
    // „Nachhaltig“ enthält „halt“ nur mitten im Wort, „Hähnchen“-Rezepte gar nicht
    expect(searchRecipes([make('x', 'Halt mal', []), all[4]], 'halt').map((h) => h.recipe.id)).toEqual(['x', 'e']);
  });

  it('Groß-/Kleinschreibung egal, leere Suche liefert nichts', () => {
    expect(searchRecipes(all, 'LINSEN').map((h) => h.recipe.id)).toEqual(['c']);
    expect(searchRecipes(all, '  ')).toEqual([]);
  });
});

describe('Zutaten-Vorschläge', () => {
  it('fasst Schreibweisen zusammen und zählt Rezepte', () => {
    expect(ingredientCompletions(all, 'häh')).toEqual([
      { name: 'Hähnchenbrust', count: 2 },
      { name: 'Hähnchenhack', count: 1 },
    ]);
  });

  it('erst ab zwei Buchstaben', () => {
    expect(ingredientCompletions(all, 'h')).toEqual([]);
  });
});

describe('Lange nicht gekocht', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  it('am längsten her zuerst, kürzlich Gekochtes nicht, nie Gekochtes zum Schluss', () => {
    const list = longNotCooked([
      make('neu', 'Gestern', [], { lastCookedAt: '2026-09-23T12:00:00Z' }),
      make('alt', 'Vor 2 Monaten', [], { lastCookedAt: '2026-07-20T12:00:00Z' }),
      make('mittel', 'Vor 3 Wochen', [], { lastCookedAt: '2026-09-03T12:00:00Z' }),
      make('nie', 'Nie gekocht', []),
      make('test', 'Nur zum Testen', [], { status: 'zum_testen' }),
    ], now);
    expect(list.map((r) => r.id)).toEqual(['alt', 'mittel', 'nie']);
  });
});
