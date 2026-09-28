/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, addToPlan, answerLeftover, clearCooked, createRecipe, currentLeftoverAsk, currentPantry, eatPreparedPortions, initStore, togglePlanCooked, removeFromPlan, removePantryItem, setPantryRestock, toggleShoppingItem, updatePantryItem } from './store';
import { resolveIngredient } from '../domain/mealplan';
import { RESTOCK_PREFIX } from '../domain/restock';
import { foodTable } from '../services';

PouchDB.plugin(memory);

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('Store: Änderung vom anderen Gerät wird nicht überschrieben', () => {
  it('Tablet mit altem Stand ändert die Speisekammer – der Bon vom Handy bleibt erhalten', async () => {
    const db = new PouchDB(`store-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb;
    const tablet = new PouchRecipeRepository(db);
    await initStore(tablet);
    addPantryItem('Hähnchenbrust', 400, 'g');
    await settle();
    const before = await tablet.loadPantry();
    const chicken = before.items.find((i) => i.name === 'Hähnchenbrust')!;

    // Abgleich bringt einen Bon vom Handy – der Store des Tablets hat das noch nicht neu geladen
    await new PouchRecipeRepository(db).savePantry({
      ...before, items: [...before.items, { id: 'milch', name: 'Milch', amount: 1000, unit: 'ml', addedAt: before.updatedAt }],
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });

    // Tablet ändert etwas an seinem (alten) Stand
    updatePantryItem(chicken.id, { amount: 250 });
    await settle();

    const after = await tablet.loadPantry();
    expect(Object.fromEntries(after.items.map((i) => [i.name, i.amount]))).toEqual({ Hähnchenbrust: 250, Milch: 1000 });
  });
});

describe('Store: Nachkaufen – Haken', () => {
  it('abgehakt, Vorrat reicht wieder → Haken weg; fällt er wieder darunter, steht es offen auf der Liste', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`restock-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await initStore(repo);
    const key = RESTOCK_PREFIX + resolveIngredient({ id: 'x', name: 'Passierte Tomaten' }, 1, foodTable)!.key;
    const checked = async () => { await settle(); return (await repo.loadPlan()).checked.includes(key); };

    setPantryRestock([{ name: 'Passierte Tomaten', below: 4, unit: 'Stück' }]);
    addPantryItem('Passierte Tomaten', 3, 'Stück');
    toggleShoppingItem(key);
    expect(await checked()).toBe(true);

    // noch zu wenig (2 statt 4) → Haken bleibt, es liegt ja im Wagen
    const id = currentPantry().items[0].id;
    updatePantryItem(id, { amount: 2 });
    expect(await checked()).toBe(true);

    // eingekauft: reicht wieder → Haken weg
    updatePantryItem(id, { amount: 14 });
    expect(await checked()).toBe(false);

    // aufgebraucht → wieder auf der Liste, aber NICHT „Im Wagen“
    removePantryItem(id);
    expect(await checked()).toBe(false);
  });
});

describe('Store: Nachkaufen – Haken wandert mit dem Plan', () => {
  it('im Wagen, dann kommt ein Rezept dazu und wieder weg: der Haken bleibt erhalten', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`restock-plan-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await initStore(repo);
    const k = resolveIngredient({ id: 'x', name: 'Passierte Tomaten' }, 1, foodTable)!.key;
    const checked = async () => { await settle(); return (await repo.loadPlan()).checked; };

    setPantryRestock([{ name: 'Passierte Tomaten', below: 4, unit: 'Stück' }]);
    addPantryItem('Passierte Tomaten', 3, 'Stück');
    toggleShoppingItem(RESTOCK_PREFIX + k);
    expect(await checked()).toEqual([RESTOCK_PREFIX + k]);

    const rid = createRecipe({
      title: 'Soße', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
      ingredients: [{ id: 'a', name: 'Passierte Tomaten', amount: 1, unit: 'Dose' }], steps: [], categories: [], tags: [], devices: [],
    }, { source: 'selbst', status: 'kochbuch' });
    addToPlan(rid, 2);
    expect(await checked()).toEqual([k]); // jetzt auch fürs Rezept – liegt schon im Wagen

    removeFromPlan(rid);
    expect(await checked()).toEqual([RESTOCK_PREFIX + k]); // wieder nur Nachkaufen – weiter im Wagen
  });
});

describe('Store: Vorgekocht', () => {
  it('kochen → „was ist übrig?“ → Reste in der Speisekammer; essen; „Gekocht“ zurück nimmt sie wieder weg; aufräumen lässt Reste stehen', async () => {
    const repo = new PouchRecipeRepository(new PouchDB(`prep-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
    await initStore(repo);
    const content = (title: string) => ({
      title, description: '', servings: 5, prepMinutes: 0, cookMinutes: 0, difficulty: 1 as const,
      ingredients: [], steps: [], categories: [], tags: [], devices: [],
    });
    const bolo = createRecipe(content('Bolognese'), { source: 'selbst', status: 'kochbuch' });
    const curry = createRecipe(content('Curry'), { source: 'selbst', status: 'kochbuch' });
    addToPlan(bolo, 5);
    addToPlan(curry, 2);

    togglePlanCooked(bolo);
    expect(currentLeftoverAsk()).toMatchObject({ title: 'Bolognese', servings: 5, planned: true });
    answerLeftover(4);
    expect(currentLeftoverAsk()).toBeNull();
    const prep = () => currentPantry().items.filter((i) => i.recipeId === bolo);
    expect(prep().map((i) => i.amount)).toEqual([4]);

    eatPreparedPortions(prep()[0].id);
    expect(prep().map((i) => i.amount)).toEqual([3]);

    // „Gekocht“ zurück → die beim Kochen entstandenen Reste verschwinden
    togglePlanCooked(bolo);
    expect(prep()).toEqual([]);

    // nochmal kochen, Reste eintragen, dann „Gekochtes aufräumen“: Curry (nicht gekocht) bleibt im Plan, Reste bleiben
    togglePlanCooked(bolo);
    answerLeftover(2);
    clearCooked();
    await settle();
    const plan = await repo.loadPlan();
    expect(plan.items.map((i) => i.recipeId)).toEqual([curry]);
    expect(prep().map((i) => i.amount)).toEqual([2]);
  });
});
