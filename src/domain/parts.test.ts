import { describe, expect, it } from 'vitest';
import { doneParts, extractPart, extractToBase, FINISH, forParts, partsOf, preselectParts, remainingContent, REST, stepPart } from './parts';
import type { RecipeContent } from './types';
import { describeChange, diffContent } from './versions';

// erfundenes Rezept nach Julias Beispiel: Sauce am Vortag, Nudeln und Hähnchen frisch
const c: RecipeContent = {
  title: 'Pasta mit Tomatensauce', description: '', servings: 2, prepMinutes: 10, cookMinutes: 30, difficulty: 1,
  categories: [], tags: [], devices: [],
  ingredients: [
    { id: 'i1', name: 'Passata', amount: 500, unit: 'g', part: 'Sauce' },
    { id: 'i2', name: 'Zwiebel', amount: 1, unit: 'Stück', part: 'Sauce', note: 'gewürfelt' },
    { id: 'i3', name: 'Spaghetti', amount: 200, unit: 'g' },
    { id: 'i4', name: 'Hähnchenbrust', amount: 300, unit: 'g' },
  ],
  steps: [
    { id: 's1', text: 'Zwiebel anschwitzen, Passata dazu und 20 Minuten köcheln.' },
    { id: 's2', text: 'Spaghetti kochen.' },
    { id: 's3', text: 'Hähnchenbrust anbraten.' },
    { id: 's4', text: 'Alles zusammen anrichten.', ingredientIds: ['i1', 'i3'] },
    { id: 's5', text: 'Ofen vorheizen.', part: 'Sauce' },
  ],
};
const ids = (x: { id: string }[]) => x.map((i) => i.id);

describe('Rezept-Teile (Julia: Sauce gestern, Nudeln und Fleisch heute)', () => {
  it('Frisch zuerst, dann die Teile in der Reihenfolge der Zutaten – ohne eigene Teile keine', () => {
    expect(partsOf(c)).toEqual([REST, 'Sauce']);
    expect(partsOf({ ingredients: c.ingredients.map(({ part: _, ...i }) => i) })).toEqual([]);
  });

  it('Schritte: Vorschlag aus den Zutaten, gemischt = zum Schluss, eigene Wahl geht vor', () => {
    expect(c.steps.map((s) => stepPart(s, c))).toEqual(['Sauce', REST, REST, FINISH, 'Sauce']);
    // ein Teil, den es nicht mehr gibt (umbenannt): wieder der Vorschlag
    expect(stepPart({ ...c.steps[1], part: 'Salat' }, c)).toBe(REST);
  });

  it('nur die Sauce: ihre Zutaten und Schritte – „zum Schluss“ noch nicht', () => {
    const sauce = forParts(c, ['Sauce']);
    expect(ids(sauce.ingredients)).toEqual(['i1', 'i2']);
    expect(ids(sauce.steps)).toEqual(['s1', 's5']);
  });

  it('am nächsten Tag der Rest: ohne Sauce-Zutaten, mit „zum Schluss“', () => {
    const rest = remainingContent(c, ['Sauce']);
    expect(ids(rest.ingredients)).toEqual(['i3', 'i4']);
    expect(ids(rest.steps)).toEqual(['s2', 's3', 's4']);
    // alles auf einmal: wie bisher
    expect(ids(forParts(c, ['Sauce', REST]).steps)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(remainingContent(c, [])).toBe(c);
  });

  it('fertige Teile kommen aus der Speisekammer (Vorgekocht mit Teil, nicht aufgegessen)', () => {
    const items = [
      { recipeId: 'r1', part: 'Sauce', amount: 2 },
      { recipeId: 'r1', amount: 3 },                  // Reste des ganzen Gerichts – kein Teil
      { recipeId: 'r1', part: 'Dressing', amount: 0 }, // aufgebraucht
      { recipeId: 'r2', part: 'Salat', amount: 1 },
    ];
    expect(doneParts(items, 'r1')).toEqual(['Sauce']);
  });

  it('neue Version: geänderter Teil und Hinweis stehen in „Was hat sich geändert?“', () => {
    const after = { ...c, ingredients: c.ingredients.map((i) => (i.id === 'i3' ? { ...i, part: 'Nudeln' } : i.id === 'i2' ? { ...i, note: 'fein gehackt' } : i)) };
    expect(diffContent(c, after).map(describeChange)).toEqual(['1 Stück Zwiebel, gewürfelt → 1 Stück Zwiebel, fein gehackt', 'Spaghetti: Teil Nudeln']);
  });

  it('Teil als Grundlage herauslösen: Zutaten und Schritte wandern, im Gericht steht die verknüpfte Grundlage', () => {
    let n = 0;
    const { base, dish } = extractPart(c, 'Sauce', { id: 'g1', title: 'Sauce für Pasta' }, () => `n${++n}`);
    expect(base.title).toBe('Sauce für Pasta');
    expect(ids(base.ingredients)).toEqual(['i1', 'i2']);
    expect(base.ingredients.every((i) => !i.part)).toBe(true);
    expect(base.ingredients[1].note).toBe('gewürfelt'); // Hinweise bleiben
    expect(ids(base.steps)).toEqual(['s1', 's5']);
    expect(dish.ingredients[0]).toEqual({ id: 'n1', name: 'Sauce für Pasta', amount: 2, unit: 'Portion', recipeId: 'g1' });
    expect(ids(dish.ingredients.slice(1))).toEqual(['i3', 'i4']);
    expect(ids(dish.steps)).toEqual(['s2', 's3', 's4']); // „Alles zusammen“ (zum Schluss) bleibt im Gericht
    expect(partsOf(dish)).toEqual([]); // keine Teile mehr
  });
});

describe('Grundlage daraus machen (Julia: aus „Chili mit Reis“ wird die Grundlage „Chili“)', () => {
  // erfundenes Rezept – keine echten (das Repo ist öffentlich)
  const chiliReis: RecipeContent = {
    title: 'Testchili mit Reis', description: '', servings: 4, prepMinutes: 10, cookMinutes: 30, difficulty: 1, categories: [], tags: [], devices: [],
    ingredients: [
      { id: 'b', name: 'Kidneybohnen', amount: 2, unit: 'Dose' },
      { id: 't', name: 'Passierte Tomaten', amount: 500, unit: 'g' },
      { id: 'r', name: 'Reis', amount: 250, unit: 'g' },
    ],
    steps: [
      { id: 's1', text: 'Kidneybohnen und Passierte Tomaten köcheln lassen.' },
      { id: 's2', text: 'Reis kochen.' },
      { id: 's3', text: 'Passierte Tomaten mit Reis anrichten.' },
    ],
  };
  let n = 0;
  const { base, dish } = extractToBase(chiliReis, ['b', 't'], { id: 'chili', title: 'Testchili' }, () => `x${++n}`);

  it('was nicht frisch dazukommt, wird die Grundlage – ohne Teil-Markierung', () => {
    expect(base.title).toBe('Testchili');
    expect(base.ingredients.map((i) => [i.name, i.part])).toEqual([['Kidneybohnen', undefined], ['Passierte Tomaten', undefined]]);
    expect(base.steps.map((s) => s.id)).toEqual(['s1']);
  });

  it('das Gericht verweist mit 4 Portionen darauf; Reis und der gemischte Schritt bleiben', () => {
    expect(dish.ingredients.map((i) => [i.name, i.amount, i.unit, i.recipeId])).toEqual([['Testchili', 4, 'Portion', 'chili'], ['Reis', 250, 'g', undefined]]);
    expect(dish.steps.map((s) => s.id)).toEqual(['s2', 's3']);
  });
});

describe('Vorauswahl „Was kochst du heute?“', () => {
  const open = [REST, 'Sauce', 'Dressing'];

  it('am Abend aus dem Plan: alles Offene – auch wenn letztes Mal etwas anderes gewählt war', () => {
    expect(preselectParts(open, { meal: true, last: ['Sauce'] })).toEqual({ parts: open, fromLast: false });
  });

  it('wie letztes Mal – nur, was noch offen ist', () => {
    expect(preselectParts(open, { last: ['Sauce', 'Dressing'] })).toEqual({ parts: ['Sauce', 'Dressing'], fromLast: true });
    expect(preselectParts([REST, 'Dressing'], { last: ['Sauce', 'Dressing'] })).toEqual({ parts: ['Dressing'], fromLast: true });
  });

  it('ist vom letzten Mal nichts mehr offen, gilt die Vorauswahl', () => {
    expect(preselectParts([REST, 'Dressing'], { last: ['Sauce'] })).toEqual({ parts: [REST, 'Dressing'], fromLast: false });
  });

  it('Vorkochen ohne gemerkte Wahl: alles außer „Frisch“; ist nur noch „Frisch“ offen, das', () => {
    expect(preselectParts(open, { prep: true })).toEqual({ parts: ['Sauce', 'Dressing'], fromLast: false });
    expect(preselectParts([REST], { prep: true })).toEqual({ parts: [REST], fromLast: false });
  });

  it('normal ohne gemerkte Wahl: alles Offene', () => {
    expect(preselectParts(open, {})).toEqual({ parts: open, fromLast: false });
  });
});
