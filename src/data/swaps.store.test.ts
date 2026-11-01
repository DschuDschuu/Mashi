/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addToPlan, cookParts, createRecipe, currentPantry, householdOf, initStore, markCooked, setHousehold, setPartSwap, setSwap, whenSaved } from './store';
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
    // mit Menge und Einkaufsname aus den Einstellungen (hier Mashis Standard) – wie beim Zutaten-Tausch
    expect((await saved())?.partSwaps).toEqual({ 'Erdnuss-Sauce': { side: 'joghurt', name: 'Joghurt-Dip', grams: 50, food: 'Joghurt' } });
    undo();
    expect(await saved()).not.toHaveProperty('partSwaps');
    setPartSwap(id, 'Erdnuss-Sauce', { side: 'joghurt', name: 'Joghurt-Dip' });
    const back = setPartSwap(id, 'Erdnuss-Sauce');
    expect(await saved()).not.toHaveProperty('partSwaps');
    back();
    expect((await saved())?.partSwaps?.['Erdnuss-Sauce']?.name).toBe('Joghurt-Dip');
  });

  it('Dip vorgekocht, im Gericht gegen Mashis Salsa getauscht: Kochen lässt den Dip stehen; deine Salsa-Menge ist gemerkt (Rundgang)', async () => {
    const repo = await freshStore('part-swap-done');
    const hh = householdOf(await repo.loadPlan());
    setHousehold({ ...hh, sides: { ...hh.sides, salsa: 80 }, sideFood: { ...hh.sideFood, salsa: 'Salsa fertig' } });
    const platte = createRecipe({
      ...sideContent('Testplatte'), servings: 4,
      ingredients: [{ id: 'j', name: 'Joghurt', amount: 400, unit: 'g', part: 'Testdip' }, { id: 'b', name: 'Brot', amount: 400, unit: 'g' }],
      steps: [{ id: 's', text: 'Joghurt verrühren.' }, { id: 't', text: 'Brot rösten.' }],
    }, { source: 'selbst', status: 'kochbuch' });
    cookParts(platte, ['Testdip'], 4); // Dip auf Vorrat
    const dip = () => currentPantry().items.filter((i) => i.part === 'Testdip').reduce((n, i) => n + (i.amount ?? 0), 0);
    const stored = dip();
    expect(stored).toBeGreaterThan(0);
    const taco = createRecipe({
      ...sideContent('Testtaco'), servings: 2,
      ingredients: [{ id: 'd', name: 'Joghurt', amount: 200, unit: 'g', part: 'Testdip' }, { id: 't', name: 'Tortillas', amount: 4, unit: 'Stück' }],
      steps: [{ id: 's', text: 'Joghurt verrühren.' }, { id: 'u', text: 'Tortillas füllen.' }],
    }, { source: 'selbst', status: 'kochbuch', partsFrom: { Testdip: platte } });
    setPartSwap(taco, 'Testdip', { side: 'salsa', name: 'Tomatensalsa' });
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === taco)?.partSwaps?.Testdip).toEqual({ side: 'salsa', name: 'Tomatensalsa', grams: 80, food: 'Salsa fertig' });
    markCooked(taco, 2);
    expect(dip()).toBe(stored); // der Dip gehört nicht mehr zum Gericht
  });
});
