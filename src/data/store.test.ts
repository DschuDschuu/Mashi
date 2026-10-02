/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addExtra, addPantryItem, dropPriceDay, editBon, setCategory, addToPlan, answerLeftover, applyInventory, clearDoneExtras, deleteRecipe, importPantry, importReceipt, importRecipes, regenerateImage, markCooked, uncookRecipe, clearCooked, createRecipe, currentLeftoverAsk, currentPantry, eatPreparedPortions, freezePantryItem, initStore, thawPantryItem, togglePlanCooked, removeFromPlan, removePantryItem, setFoodStage, setPantryAmount, toggleShoppingItem, updatePantryItem } from './store';
import { keyOfName } from '../domain/mealplan';
import { emptyPantry } from '../domain/pantry';
import { EXTRA_PREFIX, RESTOCK_PREFIX } from '../domain/restock';
import { foodTable } from '../services';
import { createMockRecipes } from './mockRecipes';

PouchDB.plugin(memory);

const settle = () => new Promise((r) => setTimeout(r, 50));

/** frisches Kochbuch im Speicher – jeder Test für sich, der Name nur zum Wiederfinden */
async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

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
    const repo = await freshStore('restock');
    const key = RESTOCK_PREFIX + keyOfName('Passierte Tomaten', foodTable)!;
    const checked = async () => { await settle(); return (await repo.loadPlan()).checked.includes(key); };

    setFoodStage('Passierte Tomaten', 'nachkaufen', { below: 4, unit: 'Stück' });
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
    const repo = await freshStore('restock-plan');
    const k = keyOfName('Passierte Tomaten', foodTable)!;
    const checked = async () => { await settle(); return (await repo.loadPlan()).checked; };

    setFoodStage('Passierte Tomaten', 'nachkaufen', { below: 4, unit: 'Stück' });
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
    const repo = await freshStore('prep');
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

describe('Store: Inventur und eigene Einträge', () => {
  it('Inventur: Menge ändern, weg, Gewürz auffüllen → Liste; Erledigtes entfernen; Bon hakt eigenen Eintrag ab; Rückgängig', async () => {
    const repo = await freshStore('inv');
    addPantryItem('Pasta', 3, 'Stück');
    addPantryItem('Mais', 2, 'Stück');
    const [pasta, mais] = ['Pasta', 'Mais'].map((n) => currentPantry().items.find((i) => i.name === n)!.id);

    const undo = applyInventory({ amounts: { [pasta]: 1 }, remove: [mais], refill: ['Kreuzkümmel'] });
    expect(currentPantry().items.map((i) => [i.name, i.amount])).toEqual([['Pasta', 1]]);
    await settle();
    expect((await repo.loadPlan()).extra?.map((x) => [x.name, x.source])).toEqual([['Kreuzkümmel', 'inventur']]);

    undo();
    await settle();
    expect(currentPantry().items.map((i) => [i.name, i.amount])).toEqual([['Pasta', 3], ['Mais', 2]]);
    expect((await repo.loadPlan()).extra ?? []).toEqual([]);

    // selbst aufgeschrieben, abgehakt, „Erledigtes entfernen“
    addExtra('Backpapier');
    toggleShoppingItem(`${EXTRA_PREFIX}backpapier`);
    clearDoneExtras();
    await settle();
    expect((await repo.loadPlan()).extra ?? []).toEqual([]);

    // Bon: „Spülmittel“ steht drauf → vom Zettel
    addExtra('Spülmittel');
    importReceipt([{ line: { name: 'Spülmittel', count: 1, price: 1.29 }, key: 'spülmittel', known: false, skip: false, name: 'Spülmittel', amount: 1, unit: 'Stück' }]);
    await settle();
    expect((await repo.loadPlan()).extra ?? []).toEqual([]);
  });
});

describe('Store: Inventur – Einheit und gezieltes Rückgängig', () => {
  it('„vorhanden“ + Menge bekommt eine Einheit; Rückgängig lässt Neues von zwischendurch stehen', async () => {
    await freshStore('inv2');
    addPantryItem('Rinderhack');
    const id = currentPantry().items[0].id;
    const undo = applyInventory({ amounts: { [id]: 500 }, remove: [], refill: [], units: { [id]: 'g' } });
    expect(currentPantry().items[0]).toMatchObject({ amount: 500, unit: 'g' });
    addPantryItem('Pasta', 2, 'Stück'); // kommt zwischendurch dazu
    undo();
    expect(currentPantry().items.map((i) => [i.name, i.amount])).toEqual([['Rinderhack', undefined], ['Pasta', 2]]);
  });
});

describe('Store: Haken eines eigenen Eintrags wandert mit', () => {
  it('„Milch“ selbst aufgeschrieben und abgehakt, dann braucht ein Rezept Milch → der Haken bleibt', async () => {
    const repo = await freshStore('extra');
    addExtra('Milch');
    toggleShoppingItem(`${EXTRA_PREFIX}milch`);
    const rid = createRecipe({
      title: 'Pfannkuchen', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
      ingredients: [{ id: 'a', name: 'Milch', amount: 250, unit: 'ml' }], steps: [], categories: [], tags: [], devices: [],
    }, { source: 'selbst', status: 'kochbuch' });
    addToPlan(rid, 2);
    await settle();
    const key = keyOfName('Milch', foodTable)!;
    expect((await repo.loadPlan()).checked).toEqual([key]);
  });
});

describe('Store: teilweise auftauen mit Rückgängig', () => {
  it('2 von 3 auftauen, Rückgängig → wieder alle 3 gefroren in einem Eintrag', async () => {
    await freshStore('thaw');
    addPantryItem('Rinderhack', 3, 'Stück');
    const id = currentPantry().items[0].id;
    freezePantryItem(id);
    const undo = thawPantryItem(id, 2);
    expect(currentPantry().items.map((i) => [i.amount, !!i.frozenAt])).toEqual([[1, true], [2, false]]);
    undo();
    expect(currentPantry().items.map((i) => [i.id, i.amount, !!i.frozenAt])).toEqual([[id, 3, true]]);
  });
});

describe('Store: Haken zurück schließt die Frage „Was ist übrig?“', () => {
  it('abgehakt → Frage offen; Haken zurück → Frage weg', async () => {
    await freshStore('ask');
    const id = createRecipe({
      title: 'Curry', description: '', servings: 4, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
      ingredients: [], steps: [], categories: [], tags: [], devices: [],
    }, { source: 'selbst', status: 'kochbuch' });
    addToPlan(id, 4);
    togglePlanCooked(id);
    expect(currentLeftoverAsk()).toMatchObject({ title: 'Curry' });
    togglePlanCooked(id);
    expect(currentLeftoverAsk()).toBeNull();
  });
});

describe('Store: „Heute gekocht“ ohne Wochenplan zurücknehmen', () => {
  it('Zutaten zurück, „zuletzt gekocht“ wieder das alte Datum, Frage „Was ist übrig?“ weg', async () => {
    const repo = await freshStore('uncook');
    const curry = createMockRecipes().find((r) => r.id === 'linsen-curry')!; // zuletzt gekocht vor 5 Tagen
    importRecipes([curry]);
    addPantryItem('Rote Linsen', 500, 'g');
    const linsen = () => currentPantry().items.find((i) => i.name === 'Rote Linsen')?.amount;

    markCooked(curry.id, 4);
    expect(linsen()).toBeLessThan(500);
    expect(currentLeftoverAsk()).not.toBeNull();

    const res = uncookRecipe(curry.id);
    expect(res?.restored).toEqual(['Rote Linsen']);
    expect(linsen()).toBe(500);
    expect(currentLeftoverAsk()).toBeNull();
    await settle();
    expect((await repo.list()).find((r) => r.id === curry.id)?.lastCookedAt).toBe(curry.lastCookedAt);
  });
});

describe('Store: Menge von Hand – die richtige Meldung', () => {
  it('letzte Packung angebrochen ist nicht „alle“ (Julias Joghurt), 0 schon; Rückgängig bringt die Packung zurück', async () => {
    await freshStore('menge');
    const p = currentPantry();
    importPantry({ ...p, items: [...p.items, { id: 'j', name: 'Testjoghurt', amount: 1, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: '2026-09-28T10:00:00.000Z' }] });
    await settle();
    // 500 g → 300 g: aus der einen Packung wird ein offener Rest mit neuer ID
    const { undo, result } = setPantryAmount('j', 300 / 500);
    expect(result).toBe('angebrochen');
    const rest = currentPantry().items.filter((i) => i.name === 'Testjoghurt');
    expect(rest).toMatchObject([{ amount: 300, unit: 'g' }]);
    expect(rest[0].openedAt).toBeTruthy();
    undo();
    expect(currentPantry().items.filter((i) => i.name === 'Testjoghurt')).toMatchObject([{ id: 'j', amount: 1, pack: { amount: 500 } }]);
    expect(setPantryAmount('j', 0).result).toBe('alle');
    // offene Ware weniger: nur „geändert“ (sie war schon angebrochen)
    addPantryItem('Testsahne', 200, 'ml');
    const s = currentPantry().items.find((i) => i.name === 'Testsahne')!;
    expect(setPantryAmount(s.id, 150).result).toBe('angebrochen');
    expect(setPantryAmount(s.id, 100).result).toBe('geändert');
  });
});

describe('Store: Bild entsteht, Rezept wird inzwischen gelöscht', () => {
  it('kein Fehler „nicht gefunden“, das Rezept bleibt weg', async () => {
    await freshStore('bild');
    const id = createRecipe(createMockRecipes()[0].versions[0].content, { source: 'selbst', status: 'kochbuch' });
    const pending = regenerateImage(id);
    deleteRecipe(id); // noch bevor das Bild fertig ist
    await expect(pending).resolves.toBeUndefined();
    await settle();
    expect(currentPantry()).toBeTruthy();
  });
});

describe('Store: gespeicherter Bon – korrigieren mit Rückgängig', () => {
  it('Import hebt den Bon auf; Menge ändern zieht den Vorrat mit, Rückgängig stellt alles her', async () => {
    await freshStore('bon');
    importReceipt([{ line: { name: 'Haferflocken', count: 2, price: 1.58 }, key: 'haferflocken', known: false, skip: false, name: 'Haferflocken', amount: 1000, unit: 'g' }],
      '2026-10-02T12:00:00.000Z', { lidlPlus: 0, offers: 0, mhd: 0, total: 1.58 });
    const bon = currentPantry().bons![0];
    expect(bon.lines[0]).toMatchObject({ bon: 'Haferflocken', name: 'Haferflocken', count: 2, amount: 1000 });
    expect(currentPantry().items[0]).toMatchObject({ amount: 2, pack: { amount: 500, unit: 'g' } });
    const undo = editBon(bon.id, 0, { count: 3, amount: 1500 });
    expect(currentPantry().items[0]).toMatchObject({ amount: 3, pack: { amount: 500, unit: 'g' } });
    undo();
    expect(currentPantry().items[0]).toMatchObject({ amount: 2, pack: { amount: 500, unit: 'g' } });
    expect(currentPantry().bons![0].lines[0]).toEqual(bon.lines[0]);
  });
});

describe('Store: Kategorie ändern mit Rückgängig', () => {
  it('eigene Wahl gilt, Rückgängig → wieder Mashis Vorschlag', async () => {
    await freshStore('kat');
    const undo = setCategory('Kimchi', 'konserven');
    expect(Object.values(currentPantry().categories ?? {})).toEqual([]); // Kimchi ist schon Konserve – nichts zu merken
    const undo2 = setCategory('Kimchi', 'sonstiges');
    expect(Object.values(currentPantry().categories ?? {})).toEqual(['sonstiges']);
    undo2();
    undo();
    expect(currentPantry().categories).toBeUndefined();
  });
});

describe('Store: alter Bon nur für den Preisverlauf', () => {
  it('Preise und Bon kommen an, die Speisekammer bleibt leer – Korrekturen ändern sie auch später nicht', async () => {
    await freshStore('verlauf');
    importReceipt([{ line: { name: 'Haferflocken', count: 2, price: 1.58 }, key: 'haferflocken', known: false, skip: false, name: 'Haferflocken', amount: 1000, unit: 'g' }],
      '2026-08-15T12:00:00.000Z', { lidlPlus: 0, offers: 0, mhd: 0, total: 1.58 }, { historyOnly: true });
    const p = currentPantry();
    expect(p.items).toEqual([]);
    expect(p.history!.map((h) => [h.name, h.date.slice(0, 10)])).toEqual([['Haferflocken', '2026-08-15']]);
    expect(p.bons![0].noStock).toBe(true);
    editBon(p.bons![0].id, 0, { count: 3, amount: 1500 });
    expect(currentPantry().items).toEqual([]);
  });
});

describe('Store: alten Tag aus dem Preisverlauf löschen mit Rückgängig', () => {
  it('weg und wieder da', async () => {
    await freshStore('tag');
    // wie vor dem Update eingelesen: Preise, Ersparnis, Merker – aber kein Bon gespeichert
    const day = '2026-09-01T12:00:00.000Z';
    importPantry({
      ...emptyPantry(), updatedAt: day,
      history: [{ name: 'Quark', perUnit: 0.79, unit: 'Stück', date: day }], prices: [{ name: 'Quark', perUnit: 0.79, unit: 'Stück', date: day }],
      savings: [{ key: '2026-09-01|0.59', date: day, lidlPlus: 0.2, offers: 0 }], receipts: ['2026-09-01|0.59'],
    });
    const before = currentPantry();
    expect(before.history).toHaveLength(1);
    const undo = dropPriceDay('2026-09-01');
    expect(currentPantry().history).toEqual([]);
    expect(currentPantry().savings).toEqual([]);
    undo();
    expect(currentPantry().history).toEqual(before.history);
    expect(currentPantry().savings).toEqual(before.savings);
    expect(currentPantry().prices).toEqual(before.prices);
  });
});

