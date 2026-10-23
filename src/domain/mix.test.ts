import { describe, expect, it } from 'vitest';
import { retireMix, sideContent } from './mix';
import type { Recipe } from './types';

// erfundene Bausteine – keine echten Rezepte (das Repo ist öffentlich)
const recipe = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: sideContent(title) }],
  ...extra,
});
const NOW = '2026-10-23T10:00:00.000Z';

describe('Beilage als Mini-Rezept', () => {
  it('1 Portion und eine Zutat (Julia: 100 g pro Person)', () => {
    const c = sideContent('  Gnocchi ');
    expect(c.title).toBe('Gnocchi');
    expect(c.servings).toBe(1);
    expect(c.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit }))).toEqual([{ name: 'Gnocchi', amount: 100, unit: 'g' }]);
    expect(sideContent('Reis', 80).ingredients[0].amount).toBe(80);
  });
});

describe('Mix & Match aufräumen (Julia: Saucen ins Kochbuch, Beilagen weg)', () => {
  it('Sauce wird ein normales Rezept – ohne mix und „passt gut zu“', () => {
    const r = retireMix(recipe('s1', 'Tomatensauce', { mix: 'sosse', goesWith: ['b1'] }), NOW)!;
    expect(r.mix).toBeUndefined();
    expect(r.goesWith).toBeUndefined();
    expect(r.archivedAt).toBeUndefined();
    expect(r.updatedAt).toBe(NOW);
  });

  it('Beilage kommt ins Archiv', () => {
    const r = retireMix(recipe('b1', 'Pasta', { mix: 'beilage' }), NOW)!;
    expect(r.mix).toBeUndefined();
    expect(r.archivedAt).toBe(NOW);
  });

  it('schon archiviert: Archiv-Datum bleibt', () => {
    expect(retireMix(recipe('b2', 'Reis', { mix: 'beilage', archivedAt: '2026-01-01' }), NOW)!.archivedAt).toBe('2026-01-01');
  });

  it('normales Rezept: nichts zu tun', () => {
    expect(retireMix(recipe('r1', 'Ofengemüse'), NOW)).toBeUndefined();
  });
});
