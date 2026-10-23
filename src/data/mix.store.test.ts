/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { initStore, whenSaved } from './store';
import { sideContent } from '../domain/mix';
import type { Recipe } from '../domain/types';

PouchDB.plugin(memory);

// erfundene Bausteine – das Repo ist öffentlich
const recipe = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', status: 'kochbuch', source: 'selbst',
  favorite: false, notes: '', currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '2026-01-01T00:00:00.000Z', author: 'nutzer', content: sideContent(title) }],
  ...extra,
});

describe('Store: alte Mix-&-Match-Bausteine beim Start aufräumen', () => {
  it('Sauce ins Kochbuch, Beilage ins Archiv – gespeichert', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`mix-retire-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await repo.save(recipe('s1', 'Testsauce', { mix: 'sosse', goesWith: ['b1'] }));
    await repo.save(recipe('b1', 'Testnudeln', { mix: 'beilage' }));
    await repo.save(recipe('r1', 'Testauflauf'));
    await initStore(repo);
    await whenSaved();
    const byId = new Map((await repo.list()).map((r) => [r.id, r]));
    expect(byId.get('s1')).not.toHaveProperty('mix');
    expect(byId.get('s1')).not.toHaveProperty('goesWith');
    expect(byId.get('s1')?.archivedAt).toBeUndefined();
    expect(byId.get('b1')).not.toHaveProperty('mix');
    expect(byId.get('b1')?.archivedAt).toBeTruthy();
    expect(byId.get('r1')?.updatedAt).toBe('2026-01-01T00:00:00.000Z'); // normale Rezepte bleiben unberührt
  });
});
