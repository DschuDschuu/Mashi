import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { recipeOfTheDay } from './recipeOfTheDay';
import type { Recipe } from './types';

const base = createMockRecipes()[0];
const make = (id: string, extra: Partial<Recipe> = {}): Recipe => ({ ...structuredClone(base), id, status: 'kochbuch', archivedAt: undefined, ...extra });
const day = (d: number, h = 12) => new Date(2026, 8, d, h); // September 2026, Ortszeit

describe('Rezept des Tages', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => make(id));

  it('bleibt den ganzen Tag gleich – morgens wie abends, egal wie die Liste sortiert ist', () => {
    const morning = recipeOfTheDay(pool, day(24, 7));
    expect(recipeOfTheDay([...pool].reverse(), day(24, 23))?.id).toBe(morning?.id);
  });

  it('nie zweimal hintereinander dasselbe', () => {
    for (let d = 1; d < 30; d++) {
      expect(recipeOfTheDay(pool, day(d + 1))?.id, `Tag ${d + 1}`).not.toBe(recipeOfTheDay(pool, day(d))?.id);
    }
  });

  it('wechselt über einen Monat durch verschiedene Rezepte', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, d) => recipeOfTheDay(pool, day(d + 1))?.id));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('nur Kochbuch und Bewährtes, nichts Archiviertes', () => {
    const only = [
      make('test', { status: 'zum_testen' }), make('idee', { status: 'ki_entwurf' }),
      make('alt', { archivedAt: '2026-01-01T00:00:00Z' }), make('ok', { status: 'bewaehrt' }),
    ];
    expect(recipeOfTheDay(only, day(24))?.id).toBe('ok');
    expect(recipeOfTheDay([make('x', { status: 'zum_testen' })], day(24))).toBeUndefined();
  });
});
