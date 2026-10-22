/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addCombo, createRecipe, createSide, initStore, setMix, toggleGoesTogether, whenSaved } from './store';
import { sideContent } from '../domain/mix';

PouchDB.plugin(memory);

/** wartet, bis wirklich gespeichert ist – eine feste Wartezeit reichte unter Last nicht */
const settle = whenSaved;

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundene Bausteine – das Repo ist öffentlich
describe('Store: Mix & Match', () => {
  it('gleiche Soße zweimal kombiniert → Portionen addiert; „Rückgängig“ stellt den Stand davor her', async () => {
    const repo = await freshStore('mix-plan');
    const sauce = createRecipe({ ...sideContent('Testsoße'), servings: 2 }, { source: 'selbst', status: 'kochbuch', mix: 'sosse' });
    const pasta = createSide('Testnudeln');
    const gnocchi = createSide('Testgnocchi', 120);
    addCombo([sauce, pasta], 2);
    const second = addCombo([sauce, gnocchi], 2);
    expect(second.more).toEqual([sauce]);
    expect(second.added).toEqual([gnocchi]);
    await settle();
    const servingsOf = async () => Object.fromEntries((await repo.loadPlan()).items.map((i) => [i.recipeId, i.servings]));
    expect(await servingsOf()).toMatchObject({ [sauce]: 4, [pasta]: 2, [gnocchi]: 2 });

    second.undo();
    await settle();
    expect(await servingsOf()).toEqual({ [sauce]: 2, [pasta]: 2 });
  });

  it('Beilage wird als Baustein angelegt; verschieben und zurück', async () => {
    const repo = await freshStore('mix-move');
    const id = createSide('Testreis');
    await settle();
    expect((await repo.list()).find((r) => r.id === id)?.mix).toBe('beilage');

    const undo = setMix(id, undefined);
    await settle();
    expect((await repo.list()).find((r) => r.id === id)?.mix).toBeUndefined();
    undo();
    await settle();
    expect((await repo.list()).find((r) => r.id === id)?.mix).toBe('beilage');
  });

  it('„passt gut zu“ an und wieder aus', async () => {
    const repo = await freshStore('mix-fits');
    const sauce = createRecipe(sideContent('Testsoße'), { source: 'selbst', status: 'kochbuch', mix: 'sosse' });
    const side = createSide('Testnudeln');
    toggleGoesTogether(sauce, side);
    await settle();
    expect((await repo.list()).find((r) => r.id === sauce)?.goesWith).toEqual([side]);
    toggleGoesTogether(side, sauce);
    await settle();
    expect((await repo.list()).find((r) => r.id === sauce)?.goesWith).toBeUndefined();
  });
});
