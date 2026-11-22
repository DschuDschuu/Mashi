import { describe, expect, it } from 'vitest';
import { duplicatesOf, parseRecipeFile } from './recipeFile';

// Erfundene Rezepte – das Repo ist öffentlich
const soup = {
  titel: 'Linsensuppe',
  portionen: 4,
  zutaten: [{ name: 'Rote Linsen', menge: 250, einheit: 'g' }],
  schritte: ['Linsen 15 Min. köcheln.'],
};
const parse = (v: unknown) => parseRecipeFile(JSON.stringify(v));

describe('Rezept-Datei einlesen', () => {
  it('ein Rezept, eine Liste oder { rezepte: [...] }', () => {
    expect(parse(soup).recipes).toHaveLength(1);
    expect(parse([soup, { ...soup, titel: 'Erbsensuppe' }]).recipes).toHaveLength(2);
    expect(parse({ rezepte: [soup] }).recipes).toHaveLength(1);
  });

  it('nur das Nötigste: Rest mit Voreinstellungen, Timer aus dem Text', () => {
    const { recipes, errors, warnings } = parse(soup);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    const r = recipes[0];
    expect(r.content).toMatchObject({ title: 'Linsensuppe', servings: 4, prepMinutes: 0, cookMinutes: 0, difficulty: 1, categories: [], devices: [], tags: [] });
    expect(r.content.steps[0].timerMinutes).toBe(15);
    expect(r.notes).toBe('');
    expect(r.keepsDays).toBeUndefined();
    expect(r.freezable).toBeUndefined();
  });

  it('Einordnung: Kategorie und Geräte als Name oder Kürzel, Schwierigkeit als Wort oder Zahl, Schlagworte', () => {
    const { recipes, warnings } = parse({
      ...soup, kategorie: ['Suppe & Eintopf', 'hauptgericht', 'Eintopf'], geraete: ['Herd', 'monsieur-cuisine', 'Heißluftfritteuse'],
      schwierigkeit: 'mittel', schlagworte: ['vegetarisch'], vorbereitung: 10, kochzeit: '20',
    });
    expect(warnings).toEqual([]);
    expect(recipes[0].content).toMatchObject({
      categories: ['suppe', 'hauptgericht'], devices: ['herd', 'monsieur-cuisine', 'airfryer'], difficulty: 2, tags: ['vegetarisch'],
      prepMinutes: 10, cookMinutes: 20,
    });
    expect(parse({ ...soup, schwierigkeit: 3 }).recipes[0].content.difficulty).toBe(3);
  });

  it('Unbekanntes geht nicht verloren: Kategorie wird Schlagwort, Gerät und Schwierigkeit mit Hinweis', () => {
    const { recipes, warnings } = parse({ ...soup, kategorie: 'Vorspeise', geraete: ['Thermomix'], schwierigkeit: 'Profi' });
    expect(recipes[0].content).toMatchObject({ categories: [], tags: ['Vorspeise'], devices: [], difficulty: 1 });
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('„Linsensuppe“');
  });

  it('Meal Prep: haltbar (bei „2 bis 3“ die kleinere Zahl), einfrierbar, Aufbewahrung und Tipp in die Notizen', () => {
    const r = parse({ ...soup, haltbar_tage: '2 bis 3', einfrierbar: 'ja', aufbewahrung: 'Luftdicht kühlen.', tipp: 'Mit Zitrone abschmecken.' }).recipes[0];
    expect(r.keepsDays).toBe(2);
    expect(r.freezable).toBe(true);
    expect(r.notes).toBe('Tipp: Mit Zitrone abschmecken.\nAufbewahrung: Luftdicht kühlen.');
    expect(parse({ ...soup, haltbar_tage: 4, einfrierbar: false }).recipes[0]).toMatchObject({ keepsDays: 4, freezable: false });
    const bad = parse({ ...soup, haltbar_tage: 'lange', einfrierbar: 'vielleicht' });
    expect(bad.recipes[0].keepsDays).toBeUndefined();
    expect(bad.warnings).toHaveLength(2);
  });

  it('Teile an Zutaten und Schritten (groß geschrieben), optional, Mengen ohne Zahl ohne Hinweis', () => {
    const c = parse({
      ...soup,
      zutaten: [
        { name: 'Linsen', menge: 250, einheit: 'g', teil: 'suppe' },
        { name: 'Knoblauch', menge: 2, einheit: 'Zehen', teil: 'Suppe' },
        { name: 'Joghurt', menge: 100, einheit: 'g', teil: 'dip', optional: true },
        { name: 'Salz', menge: null, hinweis: 'nach Geschmack' },
      ],
      schritte: [{ text: 'Linsen kochen.', teil: 'suppe' }, { text: 'Joghurt würzen.', teil: 'Dip' }, 'Servieren.'],
    });
    expect(c.warnings).toEqual([]);
    const { ingredients, steps } = c.recipes[0].content;
    expect(ingredients.map((i) => i.part)).toEqual(['Suppe', 'Suppe', 'Dip', undefined]);
    expect(ingredients[1]).toMatchObject({ amount: 2, unit: 'Zehe' });
    expect(ingredients[2].optional).toBe(true);
    expect(ingredients[3]).toMatchObject({ name: 'Salz', note: 'nach Geschmack' });
    expect(ingredients[3].amount).toBeUndefined();
    expect(steps.map((s) => s.part)).toEqual(['Suppe', 'Dip', undefined]);
  });

  it('ein kaputtes Rezept hält die anderen nicht auf', () => {
    const { recipes, errors } = parse([soup, { titel: 'Ohne Zutaten', portionen: 2, schritte: ['Kochen.'] }, { portionen: 2 }]);
    expect(recipes.map((r) => r.content.title)).toEqual(['Linsensuppe']);
    expect(errors).toContain('„Ohne Zutaten“: „zutaten“ fehlen.');
    expect(errors).toContain('Rezept 3: „titel“ fehlt.');
  });

  it('Foto nur in der Datei – Links nicht', () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(parse({ ...soup, bild: photo }).recipes[0].image).toBe(photo);
    const link = parse({ ...soup, bild: 'https://example.org/suppe.jpg' });
    expect(link.recipes[0].image).toBeUndefined();
    expect(link.warnings[0]).toContain('Links nimmt Mashi nicht');
  });

  it('kein JSON, keine Rezepte, Mashi-Sicherung: klare Meldung', () => {
    expect(parseRecipeFile('{ titel: ').errors[0]).toContain('kein gültiges JSON');
    expect(parse({ hallo: 1 }).errors[0]).toContain('kein Rezept');
    expect(parse({ app: 'mashi', recipes: [] }).errors[0]).toContain('Einstellungen → Sicherung');
  });
});

describe('Doppelte Rezepte', () => {
  it('gleicher Titel im Kochbuch (Groß/klein egal) oder weiter oben in der Datei', () => {
    const { recipes } = parse([soup, { ...soup, titel: 'Erbsensuppe' }, { ...soup, titel: 'linsensuppe ' }]);
    expect([...duplicatesOf(recipes, [])]).toEqual([2]);
    expect([...duplicatesOf(recipes, ['Erbsensuppe'])].sort()).toEqual([1, 2]);
  });
});
