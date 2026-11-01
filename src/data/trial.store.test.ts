/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addToPlan, createRecipe, initStore, keepTrial, updateTrial, whenSaved } from './store';
import { sideContent } from '../domain/mix';
import { currentContent } from '../domain/recipe';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundenes Gericht – das Repo ist öffentlich
const dish = (text: string) => ({ ...sideContent('Testteller'), steps: [{ id: 's', text }] });

describe('Store: Probiergericht neu fassen (Rundgang: Würze geändert → kein zweites Gericht)', () => {
  it('Probiergericht: dieselbe id, im Plan, keine zweite Version', async () => {
    const repo = await freshStore('trial-update');
    const id = createRecipe(dish('Mit Gyros-Würze braten.'), { source: 'selbst', status: 'zum_testen', trial: true });
    addToPlan(id, 2);
    expect(updateTrial(id, dish('Mit Curry-Würze braten.'))).toBe(true);
    await whenSaved();
    const all = await repo.list();
    expect(all.filter((r) => r.trial)).toHaveLength(1);
    const r = all.find((x) => x.id === id)!;
    expect(r.versions).toHaveLength(1);
    expect(currentContent(r).steps[0].text).toBe('Mit Curry-Würze braten.');
    expect((await repo.loadPlan()).items.map((i) => i.recipeId)).toEqual([id]);
  });

  it('schon im Kochbuch: bleibt, wie es ist', async () => {
    const repo = await freshStore('trial-kept');
    const id = createRecipe(dish('Mit Gyros-Würze braten.'), { source: 'selbst', status: 'zum_testen', trial: true });
    keepTrial(id);
    expect(updateTrial(id, dish('Mit Curry-Würze braten.'))).toBe(false);
    await whenSaved();
    expect(currentContent((await repo.list()).find((x) => x.id === id)!).steps[0].text).toBe('Mit Gyros-Würze braten.');
  });
});
