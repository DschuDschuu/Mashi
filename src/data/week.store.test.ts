/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it, vi } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, addToPlan, answerLeftover, clearPlan, cookBase, createRecipe, makeBase, markCooked, scheduleRecipe, currentPantry, currentPlan, eatMeal, eatOutToday, initStore, setHousehold, setPrepInfo, setWeek, togglePlanCooked, whenSaved } from './store';
import { buildShoppingList } from '../domain/mealplan';
import { shoppingList } from '../domain/restock';
import { mealKey, suggestWeek } from '../domain/week';
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

describe('Store: Teil als Grundlage herauslösen', () => {
  it('Schnellwahl „Nur Sauce“: der Teil wird eigene Grundlage samt seiner Schritte, das Gericht nimmt sie als Zutat; Rückgängig', async () => {
    const repo = await freshStore('extract');
    const id = createRecipe({
      ...content('Testlasagne', [
        { id: 'a', name: 'Passata', amount: 500, unit: 'g', part: 'Sauce' },
        { id: 'b', name: 'Lasagneplatten', amount: 250, unit: 'g' },
      ]),
      servings: 4,
      steps: [{ id: 's1', text: 'Passata köcheln.', part: 'Sauce' }, { id: 's2', text: 'Schichten und backen.' }],
    }, { source: 'selbst', status: 'kochbuch' });
    const r = makeBase(id, 'Sauce für Testlasagne', ['a'])!;
    await whenSaved();
    const all = await repo.list();
    const base = all.find((x) => x.id === r.baseId)!;
    const dish = all.find((x) => x.id === id)!;
    expect(base.versions[0].content.ingredients.map((i) => i.name)).toEqual(['Passata']);
    expect(base.versions[0].content.steps.map((s) => s.id)).toEqual(['s1']); // dem Teil zugeordnet → wandert mit
    expect(dish.versions).toHaveLength(2);
    expect(dish.versions[1].content.ingredients.map((i) => `${i.name}${i.recipeId ? ' →' : ''}`)).toEqual(['Sauce für Testlasagne →', 'Lasagneplatten']);
    r.undo();
    await whenSaved();
    const after = await repo.list();
    expect(after.some((x) => x.id === r.baseId)).toBe(false);
    expect(after.find((x) => x.id === id)!.currentVersionId).toBe(dish.versions[0].id);
  });
  it('Grundlage daraus machen: Chili wird eigene Grundlage mit den Vorkoch-Infos, Reis bleibt im Gericht; Rückgängig', async () => {
    // Uhr eingefroren: alle Versionen entstehen in derselben Millisekunde – so war es auf dem schnellen CI-Rechner, wo
    // die Reihenfolge der Versionen nach dem Zusammenführen zufällig war (deshalb unten die aktuelle Version prüfen)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const repo = await freshStore('make-base');
    const id = createRecipe({
      ...content('Testchili mit Reis', [
        { id: 'b', name: 'Kidneybohnen', amount: 2, unit: 'Dose' },
        { id: 'r', name: 'Reis', amount: 250, unit: 'g' },
      ]),
      servings: 4,
    }, { source: 'selbst', status: 'kochbuch' });
    setPrepInfo(id, { keepsDays: 4, freezable: true });
    expect(makeBase(id, '  ', ['b'])).toBeNull();
    const r = makeBase(id, 'Testchili', ['b'])!;
    await whenSaved();
    const all = await repo.list();
    const base = all.find((x) => x.id === r.baseId)!;
    expect([base.versions[0].content.title, base.keepsDays, base.freezable]).toEqual(['Testchili', 4, true]);
    expect(all.find((x) => x.id === id)!.versions.at(-1)!.content.ingredients.map((i) => i.name)).toEqual(['Testchili', 'Reis']);
    r.undo();
    await whenSaved();
    const after = await repo.list();
    expect(after.some((x) => x.id === r.baseId)).toBe(false);
    // wieder die ursprüngliche Fassung (die Zwischenversion bleibt im Verlauf, wie beim Herauslösen)
    const dish = after.find((x) => x.id === id)!;
    expect(dish.currentVersionId).toBe(dish.versions[0].id);
  });

  it('ohne Zutat für die Grundlage oder mit unbekannten Zutaten passiert nichts', async () => {
    await freshStore('extract-no');
    const id = createRecipe(content('Testsuppe', [{ id: 'a', name: 'Kürbis', amount: 1, unit: 'Stück' }]), { source: 'selbst', status: 'kochbuch' });
    expect(makeBase(id, 'Grundlage', [])).toBeNull();
    expect(makeBase(id, 'Grundlage', ['gibt-es-nicht'])).toBeNull();
  });
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

  it('mit Beilage: Spätzle auf die Einkaufsliste, beim Essen aus der Speisekammer; „Rückgängig“ legt sie zurück', async () => {
    const repo = await freshStore('week-side');
    const bolo = createRecipe(content('Testbolo', [{ id: 'h', name: 'Hackfleisch', amount: 125, unit: 'g' }]), { source: 'selbst', status: 'kochbuch' });
    setHousehold({ portions: 1, lunchDays: [], sides: { spaetzle: 200 } });
    setWeek(suggestWeek([6], [{ baseId: bolo, meals: [mealKey(bolo, 'spaetzle')] }], () => 'b1')); // Sonntag: Bolo mit Spätzle
    await whenSaved();
    const list = shoppingList(currentPlan(), await repo.list(), foodTable, currentPantry());
    expect(list.find((x) => x.name === 'Spätzle')?.quantity).toBe('200 g');

    addPantryItem('Spätzle', 500, 'g');
    cookBase(bolo);
    const meal = eatMeal('b1')!;
    const spaetzle = () => currentPantry().items.find((i) => i.name === 'Spätzle')?.amount;
    expect(spaetzle()).toBe(300);
    meal.undo();
    expect(spaetzle()).toBe(500);
  });

  it('normaler Plan: vorgekochte Bolognese wird gegessen statt Hack abzuziehen; „Rückgängig“ legt sie zurück', async () => {
    await freshStore('base-stock');
    const bolo = createRecipe({ ...content('Testbolo', [{ id: 'h', name: 'Hackfleisch', amount: 100, unit: 'g' }]), servings: 1 }, { source: 'selbst', status: 'kochbuch' });
    const nudeln = createRecipe(content('Testnudeln mit Bolo', [
      { id: 'b', name: 'Testbolo', amount: 1, unit: 'Portion', recipeId: bolo },
      { id: 'n', name: 'Spaghetti', amount: 100, unit: 'g' },
    ]), { source: 'selbst', status: 'kochbuch' });
    addPantryItem('Hackfleisch', 500, 'g');
    addPantryItem('Spaghetti', 500, 'g');
    markCooked(bolo, 3);
    answerLeftover(3); // 3 Portionen Bolognese vorgekocht
    const amount = (name: string) => currentPantry().items.find((i) => i.name === name && !i.recipeId)?.amount;
    const prepared = () => currentPantry().items.filter((i) => i.recipeId === bolo).reduce((n, i) => n + (i.amount ?? 0), 0);
    expect([amount('Hackfleisch'), prepared()]).toEqual([200, 3]);

    const cooked = markCooked(nudeln, 2);
    expect([amount('Hackfleisch'), amount('Spaghetti'), prepared()]).toEqual([200, 300, 1]);
    expect(cooked.undo).toBeDefined();
    cooked.undo!();
    expect([amount('Hackfleisch'), amount('Spaghetti'), prepared()]).toEqual([200, 500, 3]);
  });

  it('Gericht der Woche im Plan abgehakt: die Grundlage kommt aus dem Vorgekochten – ihr Hack bleibt liegen', async () => {
    await freshStore('week-toggle');
    const bolo = createRecipe(content('Testbolo', [{ id: 'h', name: 'Hackfleisch', amount: 125, unit: 'g' }]), { source: 'selbst', status: 'kochbuch' });
    const nudeln = createRecipe(content('Testnudeln mit Bolo', [
      { id: 'b', name: 'Testbolo', amount: 1, unit: 'Portion', recipeId: bolo },
      { id: 'n', name: 'Spaghetti', amount: 100, unit: 'g' },
    ]), { source: 'selbst', status: 'kochbuch' });
    setHousehold({ portions: 1, lunchDays: [] });
    setWeek(suggestWeek([6], [{ baseId: bolo, meals: [nudeln] }], () => 't1'));
    addPantryItem('Hackfleisch', 500, 'g');
    addPantryItem('Spaghetti', 500, 'g');
    togglePlanCooked(nudeln);
    const amount = (name: string) => currentPantry().items.find((i) => i.name === name && !i.recipeId)?.amount;
    expect([amount('Hackfleisch'), amount('Spaghetti')]).toEqual([500, 400]);
  });

  it('ein Plan: „irgendwann“ auf Mittwoch legen; Woche leeren nimmt alles raus; beides rückgängig', async () => {
    await freshStore('one-plan');
    const lasagne = createRecipe({ ...content('Testlasagne', [{ id: 'p', name: 'Lasagneplatten', amount: 250, unit: 'g' }]), servings: 4 }, { source: 'selbst', status: 'kochbuch' });
    const salat = createRecipe(content('Testsalat', [{ id: 's', name: 'Gurke', amount: 1, unit: 'Stück' }]), { source: 'selbst', status: 'kochbuch' });
    setHousehold({ portions: 1, lunchDays: [] });
    addToPlan(lasagne, 4);
    addToPlan(salat, 1);
    const manual = () => currentPlan().items.filter((i) => !i.fromWeek).map((i) => i.recipeId);
    expect(manual()).toEqual([lasagne, salat]);

    const undoDay = scheduleRecipe(lasagne, 2, 4)!; // Mittwoch
    expect(manual()).toEqual([salat]);
    // 4 Portionen: Mi, Do, Fr gibt's Lasagne (hält 3 Tage), die vierte bleibt Vorrat – statt 3 einzufrieren
    expect(currentPlan().week!.meals.map((m) => [m.day, m.recipeId])).toEqual([[2, lasagne], [3, lasagne], [4, lasagne]]);
    expect(currentPlan().week!.bases[0]).toMatchObject({ recipeId: lasagne, day: 2, extra: 1 });
    expect(scheduleRecipe(salat, 2, 1)).toBeNull(); // Mittwoch ist belegt
    undoDay();
    expect(manual()).toEqual([lasagne, salat]);
    expect(currentPlan().week).toBeUndefined();

    scheduleRecipe(lasagne, 2, 4);
    const undoClear = clearPlan();
    expect([currentPlan().items.length, currentPlan().week]).toEqual([0, undefined]);
    undoClear();
    expect(manual()).toEqual([salat]);
    expect(currentPlan().week!.meals).toHaveLength(3);

    // „Was gibt's?“ → aus dem Kochbuch auf einen belegten Abend: Freitag wird Salat, Lasagne bleibt Mi + Do
    const fr = currentPlan().week!.meals.find((m) => m.day === 4)!;
    scheduleRecipe(salat, 4, 1, fr.id);
    expect(currentPlan().week!.meals.map((m) => [m.day, m.recipeId])).toEqual([[2, lasagne], [3, lasagne], [4, salat]]);
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
