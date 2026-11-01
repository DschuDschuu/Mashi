/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addToPlan, createRecipe, currentPantry, householdOf, initStore, setHousehold, setPartSwap, setSwap, whenSaved } from './store';
import { buildShoppingList } from '../domain/mealplan';
import { sideContent } from '../domain/mix';
import { foodTable } from '../services';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundenes Rezept – das Repo ist öffentlich
const pfanne = () => createRecipe({
  ...sideContent('Testpfanne'), servings: 2,
  ingredients: [{ id: 'h', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: 'p', name: 'Paprika', amount: 2, unit: 'Stück' }],
  steps: [{ id: 's1', text: 'Hähnchenbrust und Paprika anbraten.' }],
}, { source: 'selbst', status: 'kochbuch' });

describe('Store: Zutat tauschen (Julia: Tofu statt Hähnchen)', () => {
  it('tauschen → am Rezept gemerkt, Einkaufsliste mit Tofu; „Rückgängig“ → wieder Hähnchen, kein leeres Feld', async () => {
    const repo = await freshStore('swap-shop');
    const id = pfanne();
    addToPlan(id, 2);
    await whenSaved();
    const shopping = async () => buildShoppingList(await repo.loadPlan(), await repo.list(), foodTable, currentPantry())
      .map((x) => `${x.name} ${x.quantity}`).sort();
    expect(await shopping()).toEqual(['Hähnchenbrust 300 g', 'Paprika 2 Stück']);

    const undo = setSwap(id, 'h', 'tofu');
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)?.swaps).toEqual({ h: { side: 'tofu', name: 'Tofu', grams: 100 } });
    expect(await shopping()).toEqual(['Paprika 2 Stück', 'Tofu 200 g']);

    undo();
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)).not.toHaveProperty('swaps');
    expect(await shopping()).toEqual(['Hähnchenbrust 300 g', 'Paprika 2 Stück']);
  });

  it('zurücktauschen nimmt nur diesen Tausch weg – mit Rückgängig; Menge und Name aus deinen Einstellungen', async () => {
    const repo = await freshStore('swap-back');
    const hh = householdOf((await repo.loadPlan()));
    setHousehold({ ...hh, sides: { ...hh.sides, tofu: 150 }, sideFood: { ...hh.sideFood, tofu: 'Räuchertofu' } });
    const id = pfanne();
    setSwap(id, 'h', 'tofu');
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)?.swaps).toEqual({ h: { side: 'tofu', name: 'Räuchertofu', grams: 150 } });

    const undo = setSwap(id, 'h');
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)).not.toHaveProperty('swaps');
    undo();
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)?.swaps?.h?.name).toBe('Räuchertofu');
  });

  it('ganzen Teil tauschen (Julia: „Sauce als Teil“): gespeichert am Rezept, zurück mit „Original“ – beides mit Rückgängig', async () => {
    const repo = await freshStore('part-swap');
    const id = pfanne();
    const saved = async () => { await whenSaved(); return (await repo.list()).find((r) => r.id === id); };
    const undo = setPartSwap(id, 'Erdnuss-Sauce', { side: 'joghurt', name: 'Joghurt-Dip' });
    expect((await saved())?.partSwaps).toEqual({ 'Erdnuss-Sauce': { side: 'joghurt', name: 'Joghurt-Dip' } });
    undo();
    expect(await saved()).not.toHaveProperty('partSwaps');
    setPartSwap(id, 'Erdnuss-Sauce', { side: 'joghurt', name: 'Joghurt-Dip' });
    const back = setPartSwap(id, 'Erdnuss-Sauce');
    expect(await saved()).not.toHaveProperty('partSwaps');
    back();
    expect((await saved())?.partSwaps?.['Erdnuss-Sauce']?.name).toBe('Joghurt-Dip');
  });
});
