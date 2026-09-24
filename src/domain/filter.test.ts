import { describe, expect, it } from 'vitest';
import { activeFilterCount, activeFilters, removeFilter, type RecipeFilter } from './filter';

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
