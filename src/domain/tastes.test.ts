import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { buildRecipePrompt } from './aiRecipe';
import { summarizeTastes } from './tastes';
import type { Recipe } from './types';

/** Beispielrezept mit eigenem Titel, Stichworten, Kategorie – Rest aus den Demo-Daten */
function recipe(id: string, over: Partial<Recipe> & { title?: string; tags?: string[]; categories?: string[]; devices?: string[] }): Recipe {
  const base = createMockRecipes()[0];
  const v = base.versions[0];
  const content = { ...v.content, title: over.title ?? id, tags: over.tags ?? [], categories: over.categories ?? [], devices: over.devices ?? [] };
  return { ...base, id, favorite: false, feedback: [], archivedAt: undefined, status: 'kochbuch', ...over, versions: [{ ...v, content }], currentVersionId: v.id };
}
const rated = (rating: 1 | 2 | 3 | 4 | 5, day: number) => ({ id: `f${day}`, versionId: 'v', createdAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`, rating, note: '' });

describe('Vorlieben aus den Rezepten', () => {
  it('Favoriten und gut Bewertetes, dazu was darin oft vorkommt', () => {
    const text = summarizeTastes([
      recipe('a', { title: 'Gochujang-Bowl', favorite: true, tags: ['Koreanisch', 'Proteinreich'], categories: ['salat-bowl'], devices: ['herd'] }),
      recipe('b', { title: 'Kimchi-Reis', favorite: true, tags: ['Koreanisch'], categories: ['hauptgericht'], devices: ['herd'] }),
      recipe('c', { title: 'Linsen-Curry', feedback: [rated(5, 10)], tags: ['Proteinreich', 'Meal Prep'], categories: ['hauptgericht'] }),
      // nur einmal genannt → sagt nichts über dich
      recipe('d', { title: 'Einmal-Suppe', feedback: [rated(4, 11)], tags: ['Comfort Food'], categories: ['suppe'] }),
    ]);
    expect(text).toBe([
      'Lieblingsgerichte: Gochujang-Bowl, Kimchi-Reis',
      'Gut bewertet: Linsen-Curry, Einmal-Suppe',
      'Mag gern: Koreanisch, Proteinreich',
      'Kocht oft: Hauptgericht',
      'Nutzt gern: Herd',
    ].join('\n'));
  });

  it('zählt nur die letzte Bewertung; Archiviertes und KI-Ideen zählen nicht', () => {
    const text = summarizeTastes([
      recipe('a', { title: 'Früher gut', feedback: [rated(5, 1), rated(2, 20)] }),
      recipe('b', { title: 'Jetzt gut', feedback: [rated(2, 1), rated(4, 20)] }),
      recipe('c', { title: 'Archiviert', favorite: true, archivedAt: '2026-09-01T00:00:00.000Z' }),
      recipe('d', { title: 'KI-Idee', favorite: true, status: 'ki_entwurf' }),
    ]);
    expect(text).toBe('Gut bewertet: Jetzt gut');
  });

  it('nichts Gemochtes → leer (dann bleibt das Feld, wie es ist)', () => {
    expect(summarizeTastes([recipe('a', { feedback: [rated(3, 5)] })])).toBe('');
  });

  it('Vorlieben gehen in den KI-Auftrag – als Orientierung, nicht zum Nachkochen', () => {
    const p = buildRecipePrompt({ prompt: 'Abendessen', kitchen: { tastes: 'kein Koriander\nMag gern: Koreanisch' } });
    expect(p).toContain('kein Koriander');
    expect(p).toContain('Mag gern: Koreanisch');
    expect(p).toMatch(/Vorlieben/);
    expect(buildRecipePrompt({ prompt: 'x', kitchen: { tastes: '  ' } })).not.toMatch(/Vorlieben/);
  });
});
