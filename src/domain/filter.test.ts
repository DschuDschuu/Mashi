import { describe, expect, it } from 'vitest';
import { activeFilterCount, activeFilters, filterRecipes, removeFilter, type RecipeFilter } from './filter';
import { sideContent } from './mix';
import type { NutritionResult } from './nutrition/types';
import type { Recipe } from './types';
import { transformCounts } from './week';

describe('Aktive Filter als Badges', () => {
  const f: RecipeFilter = {
    query: 'reis', // Suche ist sichtbar im Feld → kein Badge
    devices: ['airfryer', 'backofen'],
    categories: ['hauptgericht'],
    maxMinutes: 30,
    minProtein: 25,
    tags: ['Koreanisch'],
    favoritesOnly: true,
  };

  it('zeigt jeden gesetzten Filter einzeln mit lesbarem Namen', () => {
    expect(activeFilters(f).map((a) => a.label)).toEqual([
      'Airfryer', 'Backofen', 'Hauptgericht', '≤ 30 Min.', '≥ 25 g Protein', 'Koreanisch', 'Favoriten',
    ]);
  });

  it('entfernt genau einen Filter und lässt alle anderen stehen', () => {
    const airfryer = activeFilters(f)[0];
    const next = removeFilter(f, airfryer);
    expect(next.devices).toEqual(['backofen']);
    expect(next).toMatchObject({ query: 'reis', maxMinutes: 30, favoritesOnly: true, categories: ['hauptgericht'] });
    expect(activeFilters(next)).toHaveLength(6);
  });

  it('entfernt Zahlen-Filter und Favoriten vollständig', () => {
    const minutes = activeFilters(f).find((a) => a.kind === 'maxMinutes')!;
    const fav = activeFilters(f).find((a) => a.kind === 'favorites')!;
    expect(removeFilter(f, minutes).maxMinutes).toBeUndefined();
    expect(removeFilter(f, fav).favoritesOnly).toBe(false);
  });

  it('keine Filter → keine Badges, Zahl 0; Zahl = Anzahl Badges', () => {
    expect(activeFilters({ query: 'x' })).toEqual([]);
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount(f)).toBe(7);
  });

  it('funktioniert mit dem, was die Startseite schickt (nur ein Gerät)', () => {
    expect(activeFilters({ devices: ['monsieur-cuisine'] }).map((a) => a.label)).toEqual(['Monsieur Cuisine']);
  });
});

describe('Segment „Grundlagen“ (Julia: im Kochbuch sehen, woraus Gerichte entstehen)', () => {
  // erfundene Rezepte – keine echten (das Repo ist öffentlich)
  const recipe = (id: string, links: string[] = [], extra: Partial<Recipe> = {}): Recipe => ({
    id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '', currentVersionId: 'v', feedback: [],
    versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(id), ingredients: links.map((l) => ({ id: `i-${l}`, name: l, amount: 1, unit: 'Portion', recipeId: l })) } }],
    ...extra,
  });
  const all = [
    recipe('bolo'), recipe('wraps', ['bolo'], { fromBase: 'bolo' }), recipe('pasta', ['bolo']), // herausgelöst: ohne fromBase
    recipe('chili'), recipe('alt', ['chili'], { archivedAt: '2026-01-01' }), // nur Archiviertes zeigt auf Chili
    recipe('salat'),
  ];
  const noNutrition = () => ({}) as NutritionResult;

  it('Grundlage = woraus mindestens ein (nicht archiviertes) Gericht gemacht wird – gezählt für die Karte', () => {
    expect(Object.fromEntries(transformCounts(all))).toEqual({ bolo: 2 });
    expect(filterRecipes(all, { basesOnly: true }, noNutrition).map((r) => r.id)).toEqual(['bolo']);
    // ohne den Filter: alles außer Verwandlungen und Archiv
    expect(filterRecipes(all, {}, noNutrition).map((r) => r.id)).toEqual(['bolo', 'pasta', 'chili', 'salat']);
  });
});
