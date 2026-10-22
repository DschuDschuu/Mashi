import { describe, expect, it } from 'vitest';
import { activeChoice, chosenContent, choicesOf, forChoice, ownOf, removeChoice, renameChoice } from './choices';
import { cookingContent } from './homemade';
import { sideContent } from './mix';
import type { Recipe, RecipeContent } from './types';

// erfundenes Rezept – keine echten (das Repo ist öffentlich)
const content = (): RecipeContent => ({
  ...sideContent('Testbowl'), servings: 2,
  choices: ['Hähnchen', 'Tofu'],
  ingredients: [
    { id: 'reis', name: 'Reis', amount: 150, unit: 'g' },
    { id: 'h', name: 'Hähnchenbrust', amount: 300, unit: 'g', choice: 'Hähnchen' },
    { id: 't', name: 'Tofu', amount: 300, unit: 'g', choice: 'Tofu' },
    { id: 'st', name: 'Stärke', amount: 1, unit: 'EL', choice: 'Tofu' },
  ],
  steps: [
    { id: 's1', text: 'Reis kochen.' },
    { id: 's2', text: 'Hähnchen anbraten.', choice: 'Hähnchen' },
    { id: 's3', text: 'Tofu in Stärke wenden und knusprig braten.', choice: 'Tofu' },
  ],
});
const recipe = (extra: Partial<Recipe> = {}, c: RecipeContent = content()): Recipe => ({
  id: 'b', createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [], versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: c }],
  ...extra,
});
const names = (c: RecipeContent) => c.ingredients.map((i) => i.name);

describe('Varianten im Rezept (Julia: mit Hähnchen oder mit Tofu)', () => {
  it('ohne Wahl gilt die erste Variante; gewählt: nur ihre Zutaten und Schritte und die für alle', () => {
    expect(activeChoice(recipe())).toBe('Hähnchen');
    expect(names(chosenContent(recipe()))).toEqual(['Reis', 'Hähnchenbrust']);
    const tofu = chosenContent(recipe({ choice: 'Tofu' }));
    expect(names(tofu)).toEqual(['Reis', 'Tofu', 'Stärke']);
    expect(tofu.steps.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('Variante gibt es nicht mehr → die erste; Rezept ohne Varianten bleibt genau so', () => {
    expect(activeChoice(recipe({ choice: 'Rind' }))).toBe('Hähnchen');
    const { choices: _, ...plain } = content();
    const r = recipe({}, plain);
    expect(activeChoice(r)).toBeUndefined();
    expect(chosenContent(r)).toBe(r.versions[0].content);
  });

  it('Zutat mit einer Variante, die es nicht mehr gibt, zählt für alle – nichts verschwindet still', () => {
    const c = content();
    expect(names(forChoice({ ...c, ingredients: [...c.ingredients, { id: 'x', name: 'Sesam', choice: 'Rind' }] }, 'Tofu'))).toContain('Sesam');
  });

  it('dasselbe Objekt bei gleicher Fassung und Variante (für den Nährwert-Speicher)', () => {
    const r = recipe({ choice: 'Tofu' });
    expect(chosenContent(r)).toBe(chosenContent({ ...r }));
  });

  it('Kochen, Einkauf & Co. rechnen mit der gewählten Variante', () => {
    expect(names(cookingContent(recipe({ choice: 'Tofu' }), []))).toEqual(['Reis', 'Tofu', 'Stärke']);
  });

  it('umbenennen: Zutaten und Schritte gehen mit; doppelte oder leere Namen ändern nichts', () => {
    const c = renameChoice(content(), 'Tofu', 'Tempeh');
    expect(choicesOf(c)).toEqual(['Hähnchen', 'Tempeh']);
    expect(c.ingredients.filter((i) => i.choice === 'Tempeh').map((i) => i.id)).toEqual(['t', 'st']);
    expect(c.steps.find((s) => s.id === 's3')?.choice).toBe('Tempeh');
    expect(renameChoice(content(), 'Tofu', 'Hähnchen')).toEqual(content());
    expect(renameChoice(content(), 'Tofu', '  ')).toEqual(content());
  });

  it('entfernen: was nur zu ihr gehört, geht mit; bleibt eine übrig, gilt sie für alle', () => {
    expect(ownOf(content(), 'Tofu')).toEqual({ ingredients: 2, steps: 1 });
    const c = removeChoice(content(), 'Tofu');
    expect(c.choices).toBeUndefined();
    expect(names(c)).toEqual(['Reis', 'Hähnchenbrust']);
    expect(c.ingredients.some((i) => i.choice) || c.steps.some((s) => s.choice)).toBe(false);
    const three = removeChoice({ ...content(), choices: ['Hähnchen', 'Tofu', 'Rind'] }, 'Tofu');
    expect(three.choices).toEqual(['Hähnchen', 'Rind']);
    expect(three.ingredients.find((i) => i.id === 'h')?.choice).toBe('Hähnchen');
  });
});
