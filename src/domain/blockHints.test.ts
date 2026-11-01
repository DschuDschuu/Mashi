import { describe, expect, it } from 'vitest';
import { blockHints, blockHintsOf, hintBlock, sureKind } from './blockHints';
import type { Ingredient, Recipe, RecipeContent } from './types';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const ing = (id: string, name: string, part?: string, more: Partial<Ingredient> = {}): Ingredient => ({ id, name, amount: 100, unit: 'g', ...(part ? { part } : {}), ...more });
const recipe = (id: string, title: string, ingredients: Ingredient[], extra: Partial<Recipe> = {}, c: Partial<RecipeContent> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '', currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: {
    title, description: '', servings: 2, prepMinutes: 10, cookMinutes: 10, difficulty: 1, ingredients, steps: [], categories: [], tags: [], devices: [], ...c,
  } }],
  ...extra,
});
const bowl = recipe('b', 'Testbowl', [
  ing('h', 'Hähnchenbrust', 'Knuspriges Hähnchen'), ing('st', 'Speisestärke', 'Knuspriges Hähnchen'),
  ing('e', 'Erdnussbutter', 'Erdnuss-Sauce'), ing('so', 'Sojasauce', 'Erdnuss-Sauce'), ing('r', 'Reis'),
]);

describe('Stufe am Namen – nur, wenn sie eindeutig ist', () => {
  it('das Hauptwort zählt: das letzte Wort vor „mit“, „vom“ …, bei Bindestrich das hintere', () => {
    expect(sureKind('Erdnuss-Sauce')).toBe('sauce');
    expect(sureKind('Joghurt-Dip')).toBe('sauce');
    expect(sureKind('Guacamole')).toBe('sauce');
    expect(sureKind('Ofengemüse vom Blech')).toBe('veg');
    expect(sureKind('Kartoffelsalat')).toBe('veg'); // Salat, nicht Kartoffel
    expect(sureKind('Knoblauchbrot')).toBe('carb');
    expect(sureKind('Knuspriges Hähnchen')).toBe('protein');
    expect(sureKind('Hähnchenstreifen')).toBe('protein');
    expect(sureKind('Geröstete Erdnüsse')).toBe('topping');
  });

  it('ganze Gerichte und Unbekanntes: nichts', () => {
    expect(sureKind('Hähnchen-Curry mit Reis')).toBeUndefined();
    expect(sureKind('Testbowl')).toBeUndefined();
    expect(sureKind('Füllung')).toBeUndefined();
    expect(sureKind('')).toBeUndefined();
  });
});

describe('Vorschläge eines Rezepts', () => {
  it('Teile mit sprechendem Namen – „Frisch“ nicht, das ganze Rezept nicht', () => {
    expect(blockHintsOf(bowl)).toEqual([
      { recipeId: 'b', part: 'Knuspriges Hähnchen', name: 'Knuspriges Hähnchen', kind: 'protein' },
      { recipeId: 'b', part: 'Erdnuss-Sauce', name: 'Erdnuss-Sauce', kind: 'sauce' },
    ]);
  });

  it('Protein in Sauce oder Gemüse deckt es mit ab (wie die Bolognese)', () => {
    const r = recipe('o', 'Testblech', [ing('k', 'Kichererbsen', 'Gemüse'), ing('p', 'Paprika', 'Gemüse'), ing('h', 'Hackfleisch', 'Sauce'), ing('t', 'Passierte Tomaten', 'Sauce')]);
    expect(blockHintsOf(r)).toEqual([
      { recipeId: 'o', part: 'Gemüse', name: 'Gemüse', kind: 'veg', also: ['protein'] },
      { recipeId: 'o', part: 'Sauce', name: 'Sauce', kind: 'sauce', also: ['protein'] },
    ]);
  });

  it('Teil ohne sprechenden Namen: die Zutaten – nur, wenn sie eindeutig sind', () => {
    expect(blockHintsOf(recipe('f', 'Testwrap', [ing('h', 'Hackfleisch', 'Füllung'), ing('z', 'Zwiebel', 'Füllung'), ing('w', 'Wraps')])))
      .toEqual([{ recipeId: 'f', part: 'Füllung', name: 'Füllung', kind: 'protein' }]);
    expect(blockHintsOf(recipe('f2', 'Testwrap', [ing('h', 'Hackfleisch', 'Füllung'), ing('r', 'Reis', 'Füllung'), ing('w', 'Wraps')]))).toEqual([]);
    expect(blockHintsOf(recipe('f3', 'Testwrap', [ing('z', 'Zwiebel', 'Füllung'), ing('w', 'Wraps')]))).toEqual([]);
  });

  it('ganzes Rezept ohne Teile: nur am Titel – ein Gericht mit Hähnchen ist noch kein Protein', () => {
    expect(blockHintsOf(recipe('g', 'Guacamole', [ing('a', 'Avocado')]))).toEqual([{ recipeId: 'g', name: 'Guacamole', kind: 'sauce' }]);
    expect(blockHintsOf(recipe('c', 'Hähnchen-Curry mit Reis', [ing('h', 'Hähnchenbrust'), ing('r', 'Reis')]))).toEqual([]);
    expect(blockHintsOf(recipe('c2', 'Testpfanne', [ing('h', 'Hähnchenbrust')]))).toEqual([]);
  });

  it('ganze Mahlzeiten nicht – „Testgemüse-Pasta“ ist ein Hauptgericht; ihre Teile schon, Beilagen auch', () => {
    expect(blockHintsOf(recipe('m', 'Testgemüse-Pasta', [ing('p', 'Pasta')], {}, { categories: ['hauptgericht'] }))).toEqual([]);
    expect(blockHintsOf(recipe('k', 'Knoblauchbrot', [ing('b', 'Baguette')], {}, { categories: ['beilage'] }))).toEqual([{ recipeId: 'k', name: 'Knoblauchbrot', kind: 'carb' }]);
    const meal = recipe('mb', 'Testbowl', bowl.versions[0].content.ingredients, {}, { categories: ['salat-bowl'] });
    expect(blockHintsOf(meal).map((h) => h.name)).toEqual(['Knuspriges Hähnchen', 'Erdnuss-Sauce']);
  });

  it('nicht vorgeschlagen: schon Baustein, abgelehnt, nur übernommen (partsFrom), Dessert & Co.', () => {
    expect(blockHintsOf({ ...bowl, blocks: [{ part: 'Erdnuss-Sauce', kind: 'sauce', directions: [] }] }).map((h) => h.name)).toEqual(['Knuspriges Hähnchen']);
    expect(blockHintsOf({ ...bowl, notBlocks: ['Knuspriges Hähnchen'] }).map((h) => h.name)).toEqual(['Erdnuss-Sauce']);
    expect(blockHintsOf({ ...bowl, partsFrom: { 'Erdnuss-Sauce': 'anderes' } }).map((h) => h.name)).toEqual(['Knuspriges Hähnchen']);
    const guac = recipe('g', 'Guacamole', [ing('a', 'Avocado')]);
    expect(blockHintsOf({ ...guac, notBlocks: [''] })).toEqual([]);
    expect(blockHintsOf({ ...guac, blocks: [{ kind: 'sauce', directions: [] }] })).toEqual([]);
    expect(blockHintsOf(recipe('d', 'Schokocreme', [ing('s', 'Schokolade')], {}, { categories: ['dessert'] }))).toEqual([]);
  });

  it('nichts aus Probiergerichten, Verwandlungen, KI-Entwürfen und Archiviertem', () => {
    for (const extra of [{ trial: true }, { fromBase: 'x' }, { status: 'ki_entwurf' as const }, { archivedAt: '2026-01-01' }]) {
      expect(blockHints([{ ...bowl, ...extra }]), JSON.stringify(extra)).toEqual([]);
    }
  });

  it('übernommen: ein Baustein für überall – danach kein Vorschlag mehr', () => {
    const [chicken, sauce] = blockHintsOf(bowl);
    expect(hintBlock(chicken)).toEqual({ part: 'Knuspriges Hähnchen', kind: 'protein', directions: [] });
    expect(hintBlock({ recipeId: 'o', part: 'Sauce', name: 'Sauce', kind: 'sauce', also: ['protein'] })).toEqual({ part: 'Sauce', kind: 'sauce', also: ['protein'], directions: [] });
    expect(hintBlock({ recipeId: 'g', name: 'Guacamole', kind: 'sauce' })).toEqual({ kind: 'sauce', directions: [] });
    expect(blockHintsOf({ ...bowl, blocks: [hintBlock(chicken), hintBlock(sauce)] })).toEqual([]);
  });
});
