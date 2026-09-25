/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { addPantryItem, initStore, updatePantryItem } from './store';

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
