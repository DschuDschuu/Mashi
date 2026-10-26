/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { initStore, keepTrial, whenSaved } from './store';
import { sideContent } from '../domain/mix';
import { emptyPlan } from '../domain/mealplan';
import type { Recipe } from '../domain/types';

PouchDB.plugin(memory);

// erfundene Gerichte – das Repo ist öffentlich
const OLD = '2026-01-01T00:00:00.000Z';
const recipe = (id: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: OLD, updatedAt: OLD, status: 'zum_testen', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [], versions: [{ id: 'v', number: 1, createdAt: OLD, author: 'nutzer', content: sideContent(`Test ${id}`) }],
  ...extra,
});

describe('Store: Probiergerichte aus „Worauf hast du Lust?“', () => {
  it('beim Start: alte, nie gekochte und nicht eingeplante Probiergerichte weg – der Rest bleibt', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`trial-tidy-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await repo.save(recipe('alt', { trial: true }));
    await repo.save(recipe('neu', { trial: true, createdAt: new Date().toISOString() }));
    await repo.save(recipe('gekocht', { trial: true, lastCookedAt: OLD }));
    await repo.save(recipe('geplant', { trial: true }));
    await repo.save(recipe('normal'));
    await repo.savePlan({ ...emptyPlan(), items: [{ recipeId: 'geplant', servings: 2 }] });
    await initStore(repo);
    await whenSaved();
    expect((await repo.list()).map((r) => r.id).sort()).toEqual(['gekocht', 'geplant', 'neu', 'normal']);
  });

  it('behalten mit 5 Sternen: ins Kochbuch als „Bewährt“, mit Bewertung – Rückgängig macht es wieder zum Probiergericht (die Sterne bleiben)', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`trial-keep-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await repo.save(recipe('t', { trial: true, lastCookedAt: OLD }));
    await initStore(repo);
    const undo = keepTrial('t', 5);
    await whenSaved();
    let t = (await repo.list()).find((r) => r.id === 't')!;
    expect(t.trial).toBeUndefined();
    expect(t.status).toBe('bewaehrt');
    expect(t.feedback.map((f) => f.rating)).toEqual([5]);
    undo();
    await whenSaved();
    t = (await repo.list()).find((r) => r.id === 't')!;
    expect(t.trial).toBe(true);
    expect(t.status).toBe('zum_testen');
    // Bewertungen gehen nie verloren (mergeRecipes vereinigt sie) – auch nicht durch Rückgängig
    expect(t.feedback.map((f) => f.rating)).toEqual([5]);
  });

  it('ohne Sterne behalten: bleibt „Zum Testen“', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`trial-plain-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await repo.save(recipe('t', { trial: true, lastCookedAt: OLD }));
    await initStore(repo);
    keepTrial('t', 3);
    await whenSaved();
    const t = (await repo.list()).find((r) => r.id === 't')!;
    expect(t.status).toBe('zum_testen');
    expect(t.trial).toBeUndefined();
  });
});
