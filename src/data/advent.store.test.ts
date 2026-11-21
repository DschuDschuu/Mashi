/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import replication from 'pouchdb-replication';
import { describe, expect, it } from 'vitest';
import { ADVENT_TAG, markOpened, parseAdventJson } from '../domain/advent';
import { currentContent } from '../domain/recipe';
import { fillCalendar, initAdvent, openDoor, saveDoor } from './adventStore';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { currentRecipes, initStore, whenSaved } from './store';

PouchDB.plugin(memory).plugin(replication);

let n = 0;
const newDb = () => new PouchDB(`advent-${Date.now()}-${n++}`, { adapter: 'memory' }) as unknown as RecipeDb;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

// erfundene Rezepte – das Repo ist öffentlich
const doors = () => parseAdventJson(JSON.stringify([1, 2, 3].map((tag) => ({
  tag, titel: `Testplätzchen ${tag}`, portionen: 20, tipp: 'Luftdicht lagern.',
  zutaten: [{ name: 'Mehl', menge: 250, einheit: 'g' }], schritte: ['Kneten.', 'Ca. 10 Min. backen.'],
})))).doors;

describe('Adventskalender: speichern und abgleichen', () => {
  it('Befüllen, Öffnen, Speichern als „Zum Testen“ – und Rückgängig nimmt das Rezept wieder weg', async () => {
    const db = newDb();
    const repo = new PouchRecipeRepository(db);
    await initStore(repo);
    await initAdvent(repo);

    fillCalendar(doors(), new Date(2026, 10, 20));
    openDoor(2, new Date(2026, 11, 2));
    const res = saveDoor(2)!;
    await whenSaved();
    await tick();

    const recipe = currentRecipes().find((r) => r.id === res.recipeId)!;
    expect(recipe.status).toBe('zum_testen');
    expect(recipe.source).toBe('import');
    expect(recipe.notes).toBe('Tipp: Luftdicht lagern.');
    expect(currentContent(recipe)).toMatchObject({ title: 'Testplätzchen 2', tags: [ADVENT_TAG] });

    // liegt in der Datenbank – ein anderes Gerät (neues Repository auf derselben DB) sieht es
    const stored = await new PouchRecipeRepository(db).loadAdvent();
    expect(stored.doors).toHaveLength(3);
    expect(stored.opened['2']).toBeDefined();
    expect(stored.saved).toEqual({ 2: res.recipeId });

    res.undo();
    await whenSaved();
    await tick();
    expect(currentRecipes().some((r) => r.id === res.recipeId)).toBe(false);
    expect((await new PouchRecipeRepository(db).loadAdvent()).saved).toEqual({});
  });

  it('zwei Geräte ändern gleichzeitig – beim Speichern geht nichts verloren', async () => {
    const db = newDb();
    const phone = new PouchRecipeRepository(db);
    const filled = (await phone.saveAdvent({ ...(await phone.loadAdvent()), year: 2026, doors: doors(), filledAt: 'x', updatedAt: 'x' }));
    // Laptop öffnet Türchen 1 auf demselben Stand, Handy hat inzwischen Türchen 3 gespeichert
    await phone.saveAdvent({ ...filled, saved: { 3: 'r3' }, updatedAt: 'y' }, filled);
    const merged = await phone.saveAdvent(markOpened(filled, 1, new Date(2026, 11, 1)), filled);
    expect(merged.saved).toEqual({ 3: 'r3' });
    expect(merged.opened['1']).toBeDefined();
  });

  it('ein Änderungs-Feed für alle: eigene Änderungen melden sich bei keinem, fremde bei allen', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const pc = new PouchRecipeRepository(pcDb);
    let store = 0, advent = 0;
    const stopStore = pc.onExternalChange(() => store++);
    const stopAdvent = pc.onExternalChange(() => advent++);

    await pc.saveAdvent({ ...(await pc.loadAdvent()), year: 2026, doors: doors(), filledAt: 'a', updatedAt: 'a' });
    await tick();
    expect([store, advent]).toEqual([0, 0]);

    const phone = new PouchRecipeRepository(phoneDb);
    await phone.saveAdvent({ ...(await phone.loadAdvent()), year: 2026, filledAt: 'b', updatedAt: 'b' });
    await phoneDb.replicate.to(pcDb);
    await tick();
    expect(store).toBeGreaterThan(0);
    expect(advent).toBe(store);
    stopStore();
    stopAdvent();
  });
});
