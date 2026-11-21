/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import replication from 'pouchdb-replication';
import { describe, expect, it } from 'vitest';
import { ADVENT_TAG, markOpened, parseAdventJson } from '../domain/advent';
import { currentContent } from '../domain/recipe';
import { fillCalendar, initAdvent, openDoor, saveDoor, setDoorPhoto } from './adventStore';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { currentRecipes, initStore, setImage, whenSaved } from './store';

PouchDB.plugin(memory).plugin(replication);

let n = 0;
const newDb = () => new PouchDB(`advent-${Date.now()}-${n++}`, { adapter: 'memory' }) as unknown as RecipeDb;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
/** ein Pixel als PNG – ein echtes eingebettetes Foto, nur winzig */
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

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

    await fillCalendar(doors(), {}, new Date(2026, 10, 20));
    openDoor(2, new Date(2026, 11, 2));
    const res = (await saveDoor(2))!;
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

  it('Fotos (Julia: A): eigene Dokumente, Türchen nur mit Verweis, beim Speichern das Bild des Rezepts', async () => {
    const db = newDb();
    const repo = new PouchRecipeRepository(db);
    await initStore(repo);
    await initAdvent(repo);

    await fillCalendar(doors(), { 1: PHOTO, 3: PHOTO }, new Date(2026, 10, 20));
    await whenSaved();
    await tick();
    const stored = await new PouchRecipeRepository(db).loadAdvent();
    const [one, two, three] = stored.doors;
    expect(one.imageId).toMatch(/^adventbild_/);
    expect(two.imageId).toBeUndefined();
    // der Kalender selbst bleibt klein: das Foto steht nicht darin
    expect(JSON.stringify(stored)).not.toContain(PHOTO);
    expect(await repo.loadAdventImage(three.imageId!)).toBe(PHOTO);

    const res = (await saveDoor(1))!;
    await whenSaved();
    expect(currentRecipes().find((r) => r.id === res.recipeId)!.image).toEqual({ kind: 'url', url: PHOTO });
  });

  it('neu befüllen räumt Fotos auf – die vom vorigen Kalender bleiben fürs Rückgängig', async () => {
    const db = newDb();
    const repo = new PouchRecipeRepository(db);
    await initStore(repo);
    await initAdvent(repo);
    const ids = async () => (await repo.loadAdvent()).doors.flatMap((d) => (d.imageId ? [d.imageId] : []));
    const photoDocs = async () => (await db.allDocs({ startkey: 'adventbild_', endkey: 'adventbild_￿' })).rows.map((r) => r.id).sort();

    await fillCalendar(doors(), { 1: PHOTO }, new Date(2026, 10, 20));
    await whenSaved();
    const first = await ids();
    await fillCalendar(doors(), { 1: PHOTO }, new Date(2026, 10, 21));
    await whenSaved();
    const second = await ids();
    const third = await fillCalendar(doors(), { 1: PHOTO }, new Date(2026, 10, 22));
    await whenSaved();
    await tick();
    const now = await ids();
    expect(await photoDocs()).toEqual([...second, ...now].sort()); // das erste ist weg
    expect(await repo.loadAdventImage(first[0])).toBeUndefined();

    third.undo(); // zurück zum zweiten – dessen Foto ist noch da
    await whenSaved();
    await tick();
    expect(await ids()).toEqual(second);
    expect(await repo.loadAdventImage(second[0])).toBe(PHOTO);
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

  it('Foto nachträglich ergänzen (Julia): Türchen bekommt es, gespeichertes Rezept auch – Rückgängig nimmt beides zurück', async () => {
    const db = newDb();
    const repo = new PouchRecipeRepository(db);
    await initStore(repo);
    await initAdvent(repo);
    await fillCalendar(doors(), {}, new Date(2026, 10, 20));
    const saved = (await saveDoor(2))!;
    await whenSaved();
    await tick(700); // das Platzhalterbild entsteht kurz nach dem Anlegen
    const recipeImage = () => currentRecipes().find((r) => r.id === saved.recipeId)!.image;
    expect(recipeImage()?.kind).toBe('placeholder');

    const undo = (await setDoorPhoto(2, PHOTO))!;
    await whenSaved();
    const cal = await new PouchRecipeRepository(db).loadAdvent();
    const id = cal.doors.find((d) => d.day === 2)!.imageId!;
    expect(await repo.loadAdventImage(id)).toBe(PHOTO);
    expect(recipeImage()).toEqual({ kind: 'url', url: PHOTO });

    undo();
    await whenSaved();
    expect((await new PouchRecipeRepository(db).loadAdvent()).doors.find((d) => d.day === 2)!.imageId).toBeUndefined();
    expect(recipeImage()?.kind).toBe('placeholder');
  });

  it('ein eigenes Foto im Kochbuch bleibt, wenn das Kalenderfoto getauscht wird', async () => {
    const db = newDb();
    const repo = new PouchRecipeRepository(db);
    await initStore(repo);
    await initAdvent(repo);
    await fillCalendar(doors(), { 1: PHOTO }, new Date(2026, 10, 20));
    const saved = (await saveDoor(1))!;
    await whenSaved();
    const own = { kind: 'url' as const, url: PHOTO.replace('iVBOR', 'iVBOr') };
    setImage(saved.recipeId, own); // selbst fotografiert
    await setDoorPhoto(1, PHOTO.replace('ASUVORK5', 'ASUVORK6'));
    await whenSaved();
    expect(currentRecipes().find((r) => r.id === saved.recipeId)!.image).toEqual(own);
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
