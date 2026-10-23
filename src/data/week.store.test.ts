/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, cookBase, createRecipe, currentPantry, currentPlan, eatMeal, eatOutToday, initStore, setHousehold, setPrepInfo, setWeek, whenSaved } from './store';
import { buildShoppingList } from '../domain/mealplan';
import { suggestWeek } from '../domain/week';
import { foodTable } from '../services';
import type { RecipeContent } from '../domain/types';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundene Rezepte – das Repo ist öffentlich
const content = (title: string, ingredients: RecipeContent['ingredients']): RecipeContent => ({
  title, description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1, ingredients, steps: [{ id: 's', text: 'Kochen.' }], categories: [], tags: [], devices: [],
});

describe('Store: Vorkoch-Woche (Julia: Bolo am Sonntag, unter der Woche Nudeln und Wraps)', () => {
  it('Woche → Einkauf; Kochtag legt Portionen in die Speisekammer; Abendessen isst davon; alles rückgängig', async () => {
    const repo = await freshStore('week');
    const bolo = createRecipe(content('Testbolo', [{ id: 'h', name: 'Hackfleisch', amount: 125, unit: 'g' }]), { source: 'selbst', status: 'kochbuch' });
    const nudeln = createRecipe(content('Testnudeln mit Bolo', [
      { id: 'b', name: 'Testbolo', amount: 1, unit: 'Stück', recipeId: bolo },
      { id: 'n', name: 'Spaghetti', amount: 100, unit: 'g' },
    ]), { source: 'selbst', status: 'kochbuch' });
    setPrepInfo(bolo, { keepsDays: 3, freezable: true });
    setPrepInfo(nudeln, { togo: true });
    setHousehold({ portions: 1, lunchDays: [0] }); // Montag mittags: Rest vom Sonntag
    let n = 0;
    setWeek(suggestWeek([6], [{ baseId: bolo, meals: [nudeln, nudeln] }], () => `w${++n}`)); // So + Mo abends

    await whenSaved();
    const shopping = async () => buildShoppingList(await repo.loadPlan(), await repo.list(), foodTable, currentPantry()).map((x) => x.name);
    expect(await shopping()).not.toContain('Testbolo'); // kommt aus dem Vorgekochten

    addPantryItem('Hackfleisch', 500, 'g');
    addPantryItem('Spaghetti', 500, 'g');
    const amount = (name: string) => currentPantry().items.find((i) => i.name === name && !i.recipeId)?.amount;
    const prepared = () => currentPantry().items.filter((i) => i.recipeId === bolo).map((i) => `${i.amount}${i.frozenAt ? ' gefroren' : ''}`);

    // Sonntag kochen: 2 Abende + 1 Mittag = 3 Portionen
    const cooked = cookBase(bolo)!;
    expect([cooked.fresh, cooked.frozen]).toEqual([3, 0]);
    expect(amount('Hackfleisch')).toBe(125);
    expect(prepared()).toEqual(['3']);

    // Sonntagabend: Nudeln für heute + Rest für Montagmittag
    const meal = eatMeal(currentWeekMeal(0))!;
    expect(amount('Spaghetti')).toBe(300);
    expect(prepared()).toEqual(['1']);
    meal.undo();
    expect(amount('Spaghetti')).toBe(500);
    expect(prepared()).toEqual(['3']);

    cooked.undo();
    expect(amount('Hackfleisch')).toBe(500);
    expect(prepared()).toEqual([]);
  });

  it('Heute auswärts: das Abendessen rückt einen Tag weiter, „Rückgängig“ holt es zurück', async () => {
    await freshStore('week-out');
    const suppe = createRecipe(content('Testsuppe', []), { source: 'selbst', status: 'kochbuch' });
    setWeek(suggestWeek([6], [{ baseId: suppe, meals: [suppe] }], () => 'x1')); // nur Sonntag
    const out = eatOutToday(6)!;
    expect(out.to).toBe(0); // auf Montag
    out.undo();
    expect(eatOutToday(3)).toBeNull(); // Donnerstag ist nichts geplant
  });
});

/** ID des n-ten Abendessens der aktuellen Woche (Woche ab Sonntag) */
function currentWeekMeal(index: number): string {
  const order = [6, 0, 1, 2, 3, 4, 5];
  return [...currentPlan().week!.meals].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day))[index].id;
}
