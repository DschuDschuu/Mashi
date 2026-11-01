/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, addToPlan, createRecipe, currentPantry, initStore, markCooked, setSalad, whenSaved } from './store';
import { buildShoppingList } from '../domain/mealplan';
import { sideContent } from '../domain/mix';
import { activeSalad, makeSalad } from '../domain/sideSalad';
import { foodTable } from '../services';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundenes Rezept – das Repo ist öffentlich
const auflauf = () => createRecipe({
  ...sideContent('Testauflauf'), servings: 2,
  ingredients: [{ id: 'n', name: 'Nudeln', amount: 250, unit: 'g' }],
  steps: [{ id: 's1', text: 'Nudeln in die Form geben und backen.' }],
}, { source: 'selbst', status: 'kochbuch' });
const now = () => new Date(Date.now() - 1000).toISOString();

describe('Store: Beilagensalat (Julia: nur fürs nächste Kochen)', () => {
  it('dazu → auf der Einkaufsliste; „Rückgängig“ → wieder weg, kein leeres Feld', async () => {
    const repo = await freshStore('salad-shop');
    const id = auflauf();
    addToPlan(id, 2);
    const undo = setSalad(id, makeSalad(['gurke'], { dressing: 'essig-oel', now: now() }));
    await whenSaved();
    const shopping = async () => buildShoppingList(await repo.loadPlan(), await repo.list(), foodTable, currentPantry()).map((x) => x.name).sort();
    // die Liste nennt Lebensmittel wie die Nährwert-Tabelle: Essig als Apfelessig, Nudeln als Pasta – bei jedem Rezept
    expect(await shopping()).toEqual(['Apfelessig', 'Gurke', 'Olivenöl', 'Pasta']);
    undo();
    await whenSaved();
    expect((await repo.list()).find((r) => r.id === id)).not.toHaveProperty('salad');
    expect(await shopping()).toEqual(['Pasta']);
  });

  it('gekocht → die Gurke geht mit vom Vorrat, danach ist der Salat weg; „Rückgängig“ → wieder da', async () => {
    const repo = await freshStore('salad-cook');
    const id = auflauf();
    addPantryItem('Gurke', 300, 'g');
    setSalad(id, makeSalad(['gurke'], { now: now() }));
    await whenSaved();
    const gurke = () => currentPantry().items.find((x) => x.name === 'Gurke')?.amount;
    const r = async () => (await repo.list()).find((x) => x.id === id)!;
    expect(activeSalad(await r())).toBeDefined();

    const cooked = markCooked(id, 2);
    await whenSaved();
    expect(gurke()).toBe(150); // 75 g × 2 Portionen
    expect(activeSalad(await r())).toBeUndefined();
    expect((await r()).salad).toBeDefined(); // gemerkt fürs „wie letztes Mal“

    cooked.undo?.();
    await whenSaved();
    expect(gurke()).toBe(300);
    expect(activeSalad(await r())).toBeDefined();
  });

  it('„immer dazu“ bleibt nach dem Kochen', async () => {
    const repo = await freshStore('salad-keep');
    const id = auflauf();
    setSalad(id, makeSalad(['gurke'], { keep: true, now: now() }));
    markCooked(id, 2);
    await whenSaved();
    expect(activeSalad((await repo.list()).find((x) => x.id === id)!)).toBeDefined();
  });
});
