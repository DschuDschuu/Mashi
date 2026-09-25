/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import replication from 'pouchdb-replication';
import { describe, expect, it } from 'vitest';
import { createMockRecipes } from './mockRecipes';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { normalizeDbUrl } from './sync';
import { mergeRecipes } from '../domain/merge';
import { withNewVersion, currentContent } from '../domain/recipe';
import type { Recipe } from '../domain/types';

PouchDB.plugin(memory).plugin(replication);

let n = 0;
const newDb = () => new PouchDB(`test-${Date.now()}-${n++}`, { adapter: 'memory' }) as unknown as RecipeDb;
const sample = (): Recipe => structuredClone(createMockRecipes()[0]); // Gochujang Bowl
const later = (iso: string, sec: number) => new Date(new Date(iso).getTime() + sec * 1000).toISOString();

/** Beide Richtungen einmal abgleichen – wie PouchDB.sync, nur ohne live */
const syncOnce = (a: RecipeDb, b: RecipeDb) => (a as unknown as PouchDB.Database).sync(b as unknown as PouchDB.Database);

describe('mergeRecipes', () => {
  it('vereinigt Versionen und Bewertungen beider Geräte und nummeriert neu', () => {
    const base = sample();
    const onPhone = withNewVersion(base, { ...currentContent(base), servings: 3 }, 'nutzer', 'Handy', later(base.updatedAt, 10));
    const onPc = withNewVersion(base, { ...currentContent(base), servings: 4 }, 'nutzer', 'PC', later(base.updatedAt, 20));
    onPhone.feedback = [...base.feedback, { id: 'f-handy', versionId: onPhone.currentVersionId, createdAt: later(base.updatedAt, 11), rating: 5, note: 'Handy' }];

    const merged = mergeRecipes(onPhone, onPc);
    expect(merged.versions.map((v) => v.label)).toEqual([...base.versions.map((v) => v.label), 'Handy', 'PC']);
    expect(merged.versions.map((v) => v.number)).toEqual(merged.versions.map((_, i) => i + 1));
    expect(merged.feedback.some((f) => f.id === 'f-handy')).toBe(true);
    // PC ist jünger → dessen aktuelle Version gewinnt, nichts geht verloren
    expect(currentContent(merged).servings).toBe(4);
  });

  it('nimmt einfache Felder von der jüngeren Fassung', () => {
    const base = sample();
    const a = { ...base, favorite: false, notes: 'alt', updatedAt: later(base.updatedAt, 5) };
    const b = { ...base, favorite: true, notes: 'neu', updatedAt: later(base.updatedAt, 9) };
    expect(mergeRecipes(a, b)).toMatchObject({ favorite: true, notes: 'neu' });
    expect(mergeRecipes(b, a)).toMatchObject({ favorite: true, notes: 'neu' }); // Reihenfolge egal
  });
});

describe('PouchRecipeRepository', () => {
  it('speichert, listet und löscht', async () => {
    const repo = new PouchRecipeRepository(newDb());
    const r = sample();
    await repo.save(r);
    await repo.save({ ...r, notes: 'geändert' }); // zweites Speichern braucht die aktuelle Revision
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].notes).toBe('geändert');
    expect(list[0]).not.toHaveProperty('_rev'); // keine Verwaltungsfelder nach außen
    await repo.remove(r.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it('übersteht viele schnelle Speichervorgänge desselben Rezepts (keine 409-Konflikte)', async () => {
    const repo = new PouchRecipeRepository(newDb());
    const r = sample();
    await Promise.all(Array.from({ length: 10 }, (_, i) => repo.save({ ...r, notes: `v${i}` })));
    expect((await repo.list())[0].notes).toBe('v9');
  });

  it('gleicht zwei Geräte ab und löst einen Offline-Konflikt ohne Datenverlust', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const phone = new PouchRecipeRepository(phoneDb);
    const pc = new PouchRecipeRepository(pcDb);

    const base = sample();
    await phone.save(base);
    await syncOnce(phoneDb, pcDb);
    expect((await pc.list())[0].id).toBe(base.id);

    // Beide Geräte offline, beide ändern dasselbe Rezept
    const phoneEdit = withNewVersion(base, { ...currentContent(base), servings: 3 }, 'nutzer', 'Handy', later(base.updatedAt, 10));
    const pcEdit = { ...withNewVersion(base, { ...currentContent(base), servings: 5 }, 'nutzer', 'PC', later(base.updatedAt, 20)), favorite: false };
    await phone.save(phoneEdit);
    await pc.save(pcEdit);

    // Wieder online: Abgleich → CouchDB meldet einen Konflikt
    await syncOnce(phoneDb, pcDb);
    const raw = await (pcDb as unknown as PouchDB.Database).get(base.id, { conflicts: true });
    expect(raw._conflicts?.length).toBe(1);

    // Mashi löst ihn auf: beide Versionen bleiben, jüngere Änderung gewinnt
    const [resolved] = await pc.list();
    expect(resolved.versions.map((v) => v.label)).toEqual(expect.arrayContaining(['Handy', 'PC']));
    expect(currentContent(resolved).servings).toBe(5);
    expect(resolved.favorite).toBe(false);

    // Auflösung zurück zum Handy → beide haben denselben Stand, kein Konflikt mehr
    await syncOnce(phoneDb, pcDb);
    const onPhone = await (phoneDb as unknown as PouchDB.Database).get(base.id, { conflicts: true });
    expect(onPhone._conflicts ?? []).toHaveLength(0);
    expect((await phone.list())[0].versions).toHaveLength(resolved.versions.length);
  });

  it('meldet Änderungen vom anderen Gerät, aber nicht die eigenen', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const pc = new PouchRecipeRepository(pcDb);
    let external = 0;
    const stop = pc.onExternalChange(() => external++);

    await pc.save(sample()); // eigene Änderung
    await new Promise((r) => setTimeout(r, 50));
    expect(external).toBe(0);

    await new PouchRecipeRepository(phoneDb).save({ ...createMockRecipes()[1] });
    await syncOnce(phoneDb, pcDb); // kommt „von außen“
    await new Promise((r) => setTimeout(r, 50));
    expect(external).toBeGreaterThan(0);
    stop();
  });
});

describe('normalizeDbUrl', () => {
  it('ergänzt https:// und /mashi, entfernt Schrägstriche am Ende', () => {
    expect(normalizeDbUrl('mashi-db.carapaxo.de')).toBe('https://mashi-db.carapaxo.de/mashi');
    expect(normalizeDbUrl('https://mashi-db.carapaxo.de/')).toBe('https://mashi-db.carapaxo.de/mashi');
    expect(normalizeDbUrl(' https://mashi-db.carapaxo.de/mashi/ ')).toBe('https://mashi-db.carapaxo.de/mashi');
    expect(normalizeDbUrl('http://127.0.0.1:5984/mashi')).toBe('http://127.0.0.1:5984/mashi');
  });
});

describe('Meine Produkte in PouchDB', () => {
  const product = (name: string, updatedAt: string) => ({
    id: 'p-milch', name, replaces: ['milch'], per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt,
  });

  it('speichert und lädt die Liste; ohne Liste ist sie leer', async () => {
    const repo = new PouchRecipeRepository(newDb());
    expect(await repo.loadProducts()).toEqual([]);
    await repo.saveProducts([product('Milch A', '2026-01-01')]);
    await repo.saveProducts([product('Milch B', '2026-01-02')]); // zweites Speichern braucht die Revision
    expect((await repo.loadProducts()).map((p) => p.name)).toEqual(['Milch B']);
    expect(await repo.list()).toEqual([]); // die Produktliste ist kein Rezept
  });

  it('löst einen Offline-Konflikt: dasselbe Produkt → das zuletzt geänderte, kein Konflikt bleibt', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const phone = new PouchRecipeRepository(phoneDb);
    const pc = new PouchRecipeRepository(pcDb);
    await phone.saveProducts([product('Start', '2026-01-01')]);
    await syncOnce(phoneDb, pcDb);

    await phone.saveProducts([product('Vom Handy', '2026-01-02')]);
    await new Promise((r) => setTimeout(r, 5));
    await pc.saveProducts([product('Vom PC (später)', '2026-01-03')]);
    await syncOnce(phoneDb, pcDb);

    expect((await pc.loadProducts()).map((p) => p.name)).toEqual(['Vom PC (später)']);
    const raw = await (pcDb as unknown as PouchDB.Database).get('meine-produkte', { conflicts: true });
    expect(raw._conflicts ?? []).toHaveLength(0);
  });
});

describe('Wochenplan in PouchDB', () => {
  const plan = (recipeId: string, updatedAt: string) => ({ items: [{ recipeId, servings: 4 }], checked: ['food:reis'], cooked: [], updatedAt });

  it('ohne Plan leer; gespeicherter Plan kommt unverändert zurück und ist kein Rezept', async () => {
    const repo = new PouchRecipeRepository(newDb());
    expect((await repo.loadPlan()).items).toEqual([]);
    await repo.savePlan(plan('a', '2026-01-01T00:00:00.000Z'));
    await repo.savePlan(plan('b', '2026-01-02T00:00:00.000Z'));
    expect(await repo.loadPlan()).toEqual(plan('b', '2026-01-02T00:00:00.000Z'));
    expect(await repo.list()).toEqual([]);
  });

  it('Offline auf zwei Geräten geändert: beide Pläne werden vereint, der zuletzt geänderte zuerst', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const phone = new PouchRecipeRepository(phoneDb);
    const pc = new PouchRecipeRepository(pcDb);
    await phone.savePlan(plan('start', '2026-01-01T00:00:00.000Z'));
    await syncOnce(phoneDb, pcDb);
    await pc.savePlan(plan('pc-spaeter', '2026-01-03T00:00:00.000Z'));
    await phone.savePlan(plan('handy-frueher', '2026-01-02T00:00:00.000Z'));
    await syncOnce(phoneDb, pcDb);
    expect((await phone.loadPlan()).items.map((i) => i.recipeId)).toEqual(['pc-spaeter', 'handy-frueher']);
    expect((await pc.loadPlan()).items.map((i) => i.recipeId)).toEqual(['pc-spaeter', 'handy-frueher']);
  });
});

describe('Speisekammer in PouchDB', () => {
  const pantry = (name: string, updatedAt: string) => ({
    items: [{ id: 'i1', name, amount: 500, unit: 'g' as const, addedAt: updatedAt }],
    rules: [{ key: 'speisequark mager', name: 'Magerquark', amount: 250, unit: 'g' as const }],
    prices: [{ name: 'Magerquark', perUnit: 0.0032, unit: 'g' as const, date: updatedAt }],
    updatedAt,
  });

  it('leer ohne Dokument; gespeichert kommt sie samt gelernter Artikel zurück und ist kein Rezept', async () => {
    const repo = new PouchRecipeRepository(newDb());
    expect(await repo.loadPantry()).toMatchObject({ items: [], rules: [] });
    await repo.savePantry(pantry('Magerquark', '2026-01-01T00:00:00.000Z'));
    expect(await repo.loadPantry()).toEqual(pantry('Magerquark', '2026-01-01T00:00:00.000Z'));
    expect(await repo.list()).toEqual([]);
  });

  it('Offline auf zwei Geräten geändert: gleicher Vorrat → die zuletzt geänderte Fassung', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const phone = new PouchRecipeRepository(phoneDb);
    const pc = new PouchRecipeRepository(pcDb);
    await phone.savePantry(pantry('Start', '2026-01-01T00:00:00.000Z'));
    await syncOnce(phoneDb, pcDb);
    await pc.savePantry(pantry('PC später', '2026-01-03T00:00:00.000Z'));
    await phone.savePantry(pantry('Handy früher', '2026-01-02T00:00:00.000Z'));
    await syncOnce(phoneDb, pcDb);
    expect((await phone.loadPantry()).items[0].name).toBe('PC später');
  });
});

describe('Kein stilles Überschreiben mehr (Speichern mit dem vorherigen Stand)', () => {
  const T0 = '2026-09-25T10:00:00.000Z';
  const item = (id: string, name: string, amount: number) => ({ id, name, amount, unit: 'g' as const, addedAt: T0 });
  const pantry = (items: ReturnType<typeof item>[], updatedAt = T0) => ({ items, rules: [], prices: [], updatedAt });

  it('Speisekammer: Tablet hat alten Stand, Handy-Bon kam per Abgleich – beides bleibt, Mengen verrechnet', async () => {
    const db = newDb();
    const tablet = new PouchRecipeRepository(db);
    const p0 = pantry([item('h', 'Hähnchenbrust', 400)]);
    await tablet.savePantry(p0);
    const loaded = await tablet.loadPantry();
    // Abgleich bringt den Bon vom Handy in dieselbe Datenbank (anderes Repository = anderes Gerät)
    await new PouchRecipeRepository(db).savePantry(pantry([item('h', 'Hähnchenbrust', 900), item('m', 'Milch', 1000)], later(T0, 60)));
    // Tablet (noch mit altem Stand im Speicher) verkocht 300 g
    const stored = await tablet.savePantry(pantry([item('h', 'Hähnchenbrust', 100)], later(T0, 120)), loaded);
    const names = (p: { items: { name: string; amount?: number }[] }) => Object.fromEntries(p.items.map((i) => [i.name, i.amount]));
    expect(names(stored)).toEqual({ Hähnchenbrust: 600, Milch: 1000 });
    expect(names(await tablet.loadPantry())).toEqual({ Hähnchenbrust: 600, Milch: 1000 });
  });

  it('Wochenplan: Einplanen auf dem einen, Abhaken auf dem anderen Gerät – beides bleibt', async () => {
    const db = newDb();
    const a = new PouchRecipeRepository(db);
    const base = { items: [{ recipeId: 'x', servings: 2 }], checked: [], cooked: [], updatedAt: T0 };
    await a.savePlan(base);
    await new PouchRecipeRepository(db).savePlan({ ...base, checked: ['food:reis'], updatedAt: later(T0, 60) });
    const stored = await a.savePlan({ ...base, items: [...base.items, { recipeId: 'y', servings: 4 }], updatedAt: later(T0, 120) }, base);
    expect([stored.items.map((i) => i.recipeId), stored.checked]).toEqual([['x', 'y'], ['food:reis']]);
  });

  it('Rezept: Favorit hier, Notiz vom anderen Gerät – beides bleibt', async () => {
    const db = newDb();
    const a = new PouchRecipeRepository(db);
    const r0 = { ...sample(), favorite: false, notes: '' };
    await a.save(r0);
    await new PouchRecipeRepository(db).save({ ...r0, notes: 'Mehr Knoblauch', updatedAt: later(r0.updatedAt, 60) });
    const stored = await a.save({ ...r0, favorite: true, updatedAt: later(r0.updatedAt, 120) }, r0);
    expect([stored.favorite, stored.notes]).toEqual([true, 'Mehr Knoblauch']);
  });

  it('Offline-Konflikt: beide Speisekammern werden vereint statt eine zu verwerfen', async () => {
    const phoneDb = newDb();
    const pcDb = newDb();
    const phone = new PouchRecipeRepository(phoneDb);
    const pc = new PouchRecipeRepository(pcDb);
    await phone.savePantry(pantry([item('q', 'Quark', 500)]));
    await syncOnce(phoneDb, pcDb);
    await phone.savePantry(pantry([item('q', 'Quark', 500), item('e', 'Eier', 600)], later(T0, 60)));
    await pc.savePantry(pantry([item('q', 'Quark', 500), item('m', 'Milch', 1000)], later(T0, 120)));
    await syncOnce(phoneDb, pcDb);
    expect((await phone.loadPantry()).items.map((i) => i.name).sort()).toEqual(['Eier', 'Milch', 'Quark']);
  });
});
