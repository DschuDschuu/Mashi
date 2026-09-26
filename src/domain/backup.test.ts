import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { createBackup, parseBackup } from './backup';

describe('Sicherung einspielen', () => {
  const recipes = createMockRecipes();

  it('liest eine eigene Sicherung vollständig wieder ein (Hin und zurück)', () => {
    const file = JSON.parse(JSON.stringify(createBackup(recipes)));
    const parsed = parseBackup(file);
    expect(parsed.rejected).toBe(0);
    expect(parsed.recipes).toEqual(recipes);
  });

  it('nimmt auch eine reine Liste von Rezepten an', () => {
    expect(parseBackup(recipes.slice(0, 2)).recipes).toHaveLength(2);
  });

  it('überspringt kaputte Einträge und zählt sie', () => {
    const broken = [
      recipes[0],
      { ...recipes[1], versions: [] },                              // keine Versionen
      { ...recipes[2], currentVersionId: 'gibt-es-nicht' },         // aktuelle Version fehlt
      { ...recipes[3], status: 'irgendwas' },                       // unbekannter Status
      'kein Rezept',
      null,
    ];
    const parsed = parseBackup({ app: 'mashi', recipes: broken });
    expect(parsed.recipes.map((r) => r.id)).toEqual([recipes[0].id]);
    expect(parsed.rejected).toBe(5);
  });

  it('prüft auch den Inhalt jeder Version (Titel, Zutaten, Schritte)', () => {
    const r = structuredClone(recipes[0]);
    r.versions[0].content.steps = [{ text: 'ohne id' } as never];
    expect(parseBackup([r]).rejected).toBe(1);
  });

  it('nimmt bei doppelter ID in der Datei nur den ersten Eintrag', () => {
    const parsed = parseBackup([recipes[0], { ...recipes[0], notes: 'Duplikat' }]);
    expect(parsed.recipes).toHaveLength(1);
    expect(parsed.recipes[0].notes).toBe(recipes[0].notes);
    expect(parsed.rejected).toBe(1);
  });

  it('lehnt Dateien ab, die gar keine Mashi-Sicherung sind', () => {
    expect(() => parseBackup({ hallo: 'welt' })).toThrow('keine Mashi-Sicherung');
    expect(() => parseBackup('text')).toThrow();
  });
});

describe('Sicherung – Meine Produkte', () => {
  const milk = { id: 'p-milch', name: 'Milch 0,1 %', replaces: ['milch'], per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt: '2026-09-24' };

  it('nimmt Produkte mit und liest sie wieder ein', () => {
    const file = JSON.parse(JSON.stringify(createBackup([], [milk])));
    expect(parseBackup(file).products).toEqual([milk]);
  });

  it('überspringt unvollständige Produkte (z. B. ohne Kalorien)', () => {
    const { per100g: _p, ...ohneWerte } = milk;
    const parsed = parseBackup({ app: 'mashi', recipes: [], products: [milk, ohneWerte, { id: 'x' }] });
    expect(parsed.products).toEqual([milk]);
    expect(parsed.rejected).toBe(2);
  });

  it('alte Sicherungen ohne Produkte gehen weiterhin', () => {
    expect(parseBackup({ app: 'mashi', recipes: [] }).products).toEqual([]);
  });
});

describe('Sicherung mit fehlenden Listen', () => {
  it('ergänzt fehlende Tags, Kategorien und Geräte als leer', () => {
    const [r] = createMockRecipes();
    const raw = JSON.parse(JSON.stringify(r));
    for (const v of raw.versions) { delete v.content.tags; delete v.content.categories; delete v.content.devices; }
    const [back] = parseBackup([raw]).recipes;
    for (const v of back.versions) expect([v.content.tags, v.content.categories, v.content.devices]).toEqual([[], [], []]);
  });
});
