import { describe, expect, it } from 'vitest';
import { sameContent } from './recipe';
import type { RecipeContent } from './types';

const base: RecipeContent = {
  title: 'Linsensuppe', description: 'Schnell und sättigend', servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
  ingredients: [{ id: 'i1', name: 'Rote Linsen', amount: 250, unit: 'g' }],
  steps: [{ id: 's1', text: 'Alles kochen.', timerMinutes: 20 }],
  categories: [], tags: ['Suppe'], devices: [],
};

describe('Gleicher Rezeptinhalt (keine neue Version ohne Änderung)', () => {
  it('ignoriert die Reihenfolge der Felder', () => {
    // alle Felder in umgekehrter Reihenfolge – auch innerhalb der Zutaten
    const reversed = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).reverse()) as T;
    const shuffled = reversed({ ...base, ingredients: base.ingredients.map(reversed) });
    expect(Object.keys(shuffled)[0]).toBe('devices');
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(base)); // der alte Vergleich hätte hier „geändert“ gemeldet
    expect(sameContent(base, shuffled)).toBe(true);
  });

  it('zählt fehlende Listen und Texte wie leere', () => {
    const { categories: _c, devices: _d, ...rest } = base;
    expect(sameContent(rest as RecipeContent, base)).toBe(true);
    expect(sameContent({ ...base, tags: [] }, { ...base, tags: undefined as unknown as string[] })).toBe(true);
    expect(sameContent({ ...base, description: '' }, { ...base, description: undefined as unknown as string })).toBe(true);
  });

  it('ignoriert Leerzeichen am Rand', () => {
    expect(sameContent({ ...base, title: 'Linsensuppe ' }, base)).toBe(true);
  });

  it('erkennt echte Änderungen', () => {
    expect(sameContent({ ...base, servings: 3 }, base)).toBe(false);
    expect(sameContent({ ...base, ingredients: [{ ...base.ingredients[0], amount: 300 }] }, base)).toBe(false);
    expect(sameContent({ ...base, steps: [{ ...base.steps[0], ingredientIds: ['i1'] }] }, base)).toBe(false);
    expect(sameContent({ ...base, tags: ['Suppe', 'Winter'] }, base)).toBe(false);
  });
});
