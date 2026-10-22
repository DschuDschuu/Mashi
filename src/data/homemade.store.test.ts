/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, addToPlan, createRecipe, currentPantry, initStore, markCooked, setChoice, setHomemade, whenSaved } from './store';
import { buildShoppingList } from '../domain/mealplan';
import { sideContent } from '../domain/mix';
import { foodTable } from '../services';

PouchDB.plugin(memory);

/** wartet, bis wirklich gespeichert ist – eine feste Wartezeit reichte unter Last nicht */
const settle = whenSaved;

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundene Rezepte – das Repo ist öffentlich
function gnocchiDish() {
  const base = createRecipe({
    ...sideContent('Selbstgemachte Testgnocchi'), servings: 2,
    ingredients: [{ id: 'k', name: 'Kartoffeln', amount: 400, unit: 'g' }, { id: 'm', name: 'Mehl', amount: 100, unit: 'g' }],
    steps: [{ id: 'g1', text: 'Kartoffeln kochen, mit Mehl verkneten.' }],
  }, { source: 'selbst', status: 'kochbuch' });
  const dish = createRecipe({
    ...sideContent('Testgnocchi mit Soße'), servings: 2,
    ingredients: [{ id: 'i1', name: 'Gnocchi', amount: 500, unit: 'g', recipeId: base }, { id: 'i2', name: 'Passierte Tomaten', amount: 400, unit: 'g' }],
    steps: [{ id: 's1', text: 'Gnocchi in die Soße.' }],
  }, { source: 'selbst', status: 'kochbuch' });
  return { base, dish };
}

describe('Store: Zutat selbst machen', () => {
  it('umschalten → Einkaufsliste hat Kartoffeln und Mehl statt Gnocchi; „Rückgängig“ → wieder gekauft', async () => {
    const repo = await freshStore('homemade-shop');
    const { dish } = gnocchiDish();
    addToPlan(dish, 2);
    await settle();
    const shopping = async () => buildShoppingList(await repo.loadPlan(), await repo.list(), foodTable, currentPantry()).map((x) => x.name).sort();
    expect(await shopping()).toEqual(['Gnocchi', 'Passierte Tomaten']);

    const undo = setHomemade(dish, 'i1', true);
    await settle();
    expect((await repo.list()).find((r) => r.id === dish)?.homemade).toEqual(['i1']);
    expect(await shopping()).toEqual(['Kartoffeln', 'Mehl', 'Passierte Tomaten']);

    undo();
    await settle();
    expect((await repo.list()).find((r) => r.id === dish)?.homemade).toBeUndefined();
    expect(await shopping()).toEqual(['Gnocchi', 'Passierte Tomaten']);
  });

  it('Variante wählen → Einkaufsliste folgt; „Rückgängig“ → wieder die erste', async () => {
    const repo = await freshStore('choice-shop');
    const id = createRecipe({
      ...sideContent('Testbowl'), servings: 2, choices: ['Hähnchen', 'Tofu'],
      ingredients: [{ id: 'r', name: 'Reis', amount: 150, unit: 'g' }, { id: 'h', name: 'Hähnchenbrust', amount: 300, unit: 'g', choice: 'Hähnchen' }, { id: 't', name: 'Tofu', amount: 300, unit: 'g', choice: 'Tofu' }],
      steps: [],
    }, { source: 'selbst', status: 'kochbuch' });
    addToPlan(id, 2);
    await settle();
    const shopping = async () => buildShoppingList(await repo.loadPlan(), await repo.list(), foodTable, currentPantry()).map((x) => x.name).sort();
    expect(await shopping()).toEqual(['Hähnchenbrust', 'Reis']);

    const undo = setChoice(id, 'Tofu');
    await settle();
    expect(await shopping()).toEqual(['Reis', 'Tofu']);
    undo();
    await settle();
    expect((await repo.list()).find((r) => r.id === id)?.choice).toBeUndefined();
    expect(await shopping()).toEqual(['Hähnchenbrust', 'Reis']);
  });

  it('selbst gemacht gekocht → Kartoffeln gehen aus dem Vorrat, gekaufte Gnocchi bleiben liegen', async () => {
    await freshStore('homemade-cook');
    const { dish } = gnocchiDish();
    addPantryItem('Kartoffeln', 1000, 'g');
    addPantryItem('Gnocchi', 500, 'g');
    setHomemade(dish, 'i1', true);
    markCooked(dish, 2);
    await settle();
    const left = Object.fromEntries(currentPantry().items.filter((i) => !i.recipeId).map((i) => [i.name, i.amount]));
    expect(left).toMatchObject({ Kartoffeln: 600, Gnocchi: 500 });
  });
});
