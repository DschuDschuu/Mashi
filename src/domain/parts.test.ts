import { describe, expect, it } from 'vitest';
import { doneParts, FINISH, forParts, partsOf, remainingContent, REST, stepPart } from './parts';
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
});
