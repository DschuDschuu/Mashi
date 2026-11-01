/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { createRecipe, initStore, setBlocks, skipBlockHint, whenSaved } from './store';
import { blockHintsOf, hintBlock } from '../domain/blockHints';
import { recipeChoices } from '../domain/craving';
import { sideContent } from '../domain/mix';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundenes Rezept – das Repo ist öffentlich
const blech = () => createRecipe({
  ...sideContent('Testblech'), servings: 2,
  ingredients: [
    { id: 'k', name: 'Süßkartoffel', amount: 400, unit: 'g', part: 'Gemüse' },
    { id: 'j', name: 'Joghurt', amount: 150, unit: 'g', part: 'Joghurt-Dip' },
  ],
  steps: [{ id: 's1', text: 'Süßkartoffel im Ofen rösten.', timerMinutes: 25 }, { id: 's2', text: 'Joghurt glatt rühren.' }],
}, { source: 'selbst', status: 'kochbuch' });

describe('Store: Bausteine vorschlagen (Julia: Weg B)', () => {
  it('„Nein“ → Mashi fragt nicht mehr; „Rückgängig“ → wieder gefragt, kein leeres Feld', async () => {
    const repo = await freshStore('hints-skip');
    const id = blech();
    await whenSaved();
    const now = async () => (await repo.list()).find((r) => r.id === id)!;
    expect(blockHintsOf(await now()).map((h) => h.name)).toEqual(['Gemüse', 'Joghurt-Dip']);

    const undo = skipBlockHint(id, 'Joghurt-Dip');
    await whenSaved();
    expect((await now()).notBlocks).toEqual(['Joghurt-Dip']);
    expect(blockHintsOf(await now()).map((h) => h.name)).toEqual(['Gemüse']);

    undo();
    await whenSaved();
    expect(await now()).not.toHaveProperty('notBlocks');
    expect(blockHintsOf(await now())).toHaveLength(2);
  });

  it('übernommen → als Baustein im Baukasten, mit deinen Schritten', async () => {
    const repo = await freshStore('hints-take');
    const id = blech();
    await whenSaved();
    const r = (await repo.list()).find((x) => x.id === id)!;
    setBlocks(id, blockHintsOf(r).map(hintBlock));
    await whenSaved();
    const after = (await repo.list()).find((x) => x.id === id)!;
    expect(blockHintsOf(after)).toEqual([]);
    const veg = recipeChoices([after]).find((c) => c.name === 'Gemüse')!;
    expect(veg).toMatchObject({ kind: 'veg', from: 'Testblech', steps: [{ text: 'Süßkartoffel im Ofen rösten.', timerMinutes: 25 }] });
  });
});
