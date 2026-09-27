import { describe, expect, it } from 'vitest';
import { applyRenames, renameSuggestion, renameSuggestions } from './renames';
import type { RecipeContent } from './types';

const content: RecipeContent = {
  title: 't', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [
    { id: 'a', name: 'Spaghetti', amount: 250, unit: 'g' },
    { id: 'b', name: 'Vollmilch (3,5 %)', amount: 200, unit: 'ml' },
    { id: 'c', name: 'Sojasoße', amount: 2, unit: 'EL' },
    { id: 'd', name: 'Tomaten', amount: 3, unit: 'Stück' },
    { id: 'e', name: 'Milch', amount: 100, unit: 'ml' },
  ],
  steps: [], categories: [], tags: [], devices: [],
};

describe('Einheitliche Zutatennamen', () => {
  it('schlägt echte Synonyme und die Zusammenfassungen vor – Zusätze bleiben', () => {
    expect(renameSuggestion('Sojasoße')).toBe('Sojasauce');
    expect(renameSuggestion('Möhren')).toBe('Karotten');
    expect(renameSuggestion('Spaghetti')).toBe('Pasta');
    expect(renameSuggestion('Vollmilch (3,5 %)')).toBe('Milch 3,5 %');
    expect(renameSuggestion('Light-Frischkäse')).toBe('Frischkäse');
  });

  it('schlägt nichts vor, was nur ähnlich rechnet oder schon einheitlich ist', () => {
    expect(renameSuggestion('Tomaten')).toBeUndefined(); // ≠ Kirschtomaten
    expect(renameSuggestion('Limette')).toBeUndefined(); // ≠ Zitronensaft
    expect(renameSuggestion('Oregano')).toBeUndefined();
    expect(renameSuggestion('Milch')).toBeUndefined();
    expect(renameSuggestion('Grünes Pesto')).toBeUndefined(); // eigene Sorten hängen daran
  });

  it('respektiert ausgeblendete Vorschläge und Namen eigener Produkte', () => {
    expect(renameSuggestion('Spaghetti', { dismissed: ['spaghetti'] })).toBeUndefined();
    expect(renameSuggestion('Vollmilch', { protectedNames: new Set(['vollmilch']) })).toBeUndefined();
  });

  it('übernimmt ausgewählte Vorschläge in einen neuen Inhalt – der alte bleibt', () => {
    const all = renameSuggestions(content);
    expect(all.map((r) => r.to)).toEqual(['Pasta', 'Milch 3,5 %', 'Sojasauce']);
    const next = applyRenames(content, all.filter((r) => r.ingredientId !== 'a'));
    expect(next.ingredients.map((i) => i.name)).toEqual(['Spaghetti', 'Milch 3,5 %', 'Sojasauce', 'Tomaten', 'Milch']);
    expect(content.ingredients[1].name).toBe('Vollmilch (3,5 %)');
  });
});

describe('Fettstufen: eine Schreibweise', () => {
  it('Vollmilch → Milch 3,5 %, fettarme Milch → Milch 1,5 %, Magermilch → Milch', () => {
    expect(renameSuggestion('Vollmilch')).toBe('Milch 3,5 %');
    expect(renameSuggestion('fettarme Milch')).toBe('Milch 1,5 %');
    expect(renameSuggestion('Milch (1,5 %)')).toBe('Milch 1,5 %');
    expect(renameSuggestion('Magermilch')).toBe('Milch');
    expect(renameSuggestion('Milch 3,5 %')).toBeUndefined(); // schon einheitlich
    expect(renameSuggestion('Milch')).toBeUndefined();
  });
  it('Joghurt und Quark genauso', () => {
    expect(renameSuggestion('Magerjoghurt')).toBe('Joghurt');
    expect(renameSuggestion('Joghurt (3,5 %)')).toBe('Joghurt 3,5 %');
    expect(renameSuggestion('Naturjoghurt')).toBe('Joghurt');
    expect(renameSuggestion('Magerquark')).toBe('Quark');
    expect(renameSuggestion('Sahnequark')).toBe('Quark 40 %');
    expect(renameSuggestion('Griechischer Joghurt')).toBeUndefined();
  });
  it('dein Standard-Produkt „Milch“ blockiert nicht – ein Produkt namens „Vollmilch“ schon', () => {
    expect(renameSuggestion('Vollmilch', { protectedNames: new Set(['milch']) })).toBe('Milch 3,5 %');
    expect(renameSuggestion('Milch (1,5 %)', { protectedNames: new Set(['milch']) })).toBe('Milch 1,5 %');
    expect(renameSuggestion('Vollmilch', { protectedNames: new Set(['vollmilch']) })).toBeUndefined();
  });
});
