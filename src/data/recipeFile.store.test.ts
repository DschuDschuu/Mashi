/// <reference types="pouchdb-core" />
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { createRecipes, currentRecipes, initStore, markCooked, whenSaved } from './store';
import { currentContent, showsNew } from '../domain/recipe';
import { parseRecipeFile } from '../domain/recipeFile';

PouchDB.plugin(memory);

async function freshStore(name: string) {
  const repo = new PouchRecipeRepository(new PouchDB(`${name}-${Date.now()}`, { adapter: 'memory' }) as unknown as RecipeDb);
  await initStore(repo);
  return repo;
}

// erfundene Rezepte – das Repo ist öffentlich
const file = JSON.stringify([
  { titel: 'Testbolognese', portionen: 3, zutaten: [{ name: 'Linsen', menge: 200, einheit: 'g', teil: 'Sauce' }], schritte: ['Köcheln.'],
    haltbar_tage: 3, einfrierbar: true, aufbewahrung: 'Getrennt kühlen.' },
  { titel: 'Testsalat', portionen: 1, zutaten: [{ name: 'Gurke' }], schritte: ['Schneiden.'] },
]);

describe('Store: Rezept-Datei einspielen', () => {
  it('legt alle als „Zum Testen“ an – mit Notizen und Meal Prep; ein Rückgängig nimmt alle zurück', async () => {
    const repo = await freshStore('recipe-file');
    const { recipes } = parseRecipeFile(file);
    const { ids, undo } = createRecipes(recipes);
    await whenSaved();
    const saved = (await repo.list()).filter((r) => ids.includes(r.id));
    expect(saved).toHaveLength(2);
    const bolo = saved.find((r) => currentContent(r).title === 'Testbolognese')!;
    expect(bolo).toMatchObject({ status: 'zum_testen', source: 'import', notes: 'Aufbewahrung: Getrennt kühlen.', keepsDays: 3, freezable: true });
    expect(currentContent(bolo).ingredients[0].part).toBe('Sauce');
    const salad = saved.find((r) => currentContent(r).title === 'Testsalat')!;
    expect(salad.keepsDays).toBeUndefined();
    expect(salad.freezable).toBeUndefined();

    undo();
    await whenSaved();
    expect((await repo.list()).filter((r) => ids.includes(r.id))).toEqual([]);
  });

  it('„Neu“ auf der Karte bis zum ersten Kochen – alte Rezepte (ohne isNew) und getestete nicht', async () => {
    await freshStore('new-badge');
    const { ids } = createRecipes(parseRecipeFile(file).recipes);
    const byId = (id: string) => currentRecipes().find((r) => r.id === id)!;
    expect(ids.map((id) => showsNew(byId(id)))).toEqual([true, true]);
    markCooked(ids[0]);
    expect(ids.map((id) => showsNew(byId(id)))).toEqual([false, true]);
    const { isNew: _, ...old } = byId(ids[1]);
    expect(showsNew(old)).toBe(false);
    expect(showsNew({ ...byId(ids[1]), feedback: [{ id: 'f', versionId: 'v', createdAt: '2026-11-22T10:00:00.000Z', rating: 4, note: '' }] })).toBe(false);
  });
});
