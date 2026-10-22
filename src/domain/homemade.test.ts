import { describe, expect, it } from 'vitest';
import { cookingContent, homemadeCandidates, homemadeOptions, withHomemade } from './homemade';
import { sideContent } from './mix';
import { FINISH, forParts, partsOf, REST } from './parts';
import { currentContent } from './recipe';
import type { Ingredient, Recipe, Step } from './types';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const recipe = (id: string, title: string, servings: number, ingredients: Ingredient[], steps: Step[], extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(title), servings, ingredients, steps } }],
  ...extra,
});

const gnocchi = recipe('g', 'Selbstgemachte Gnocchi', 4, [
  { id: 'k', name: 'Kartoffeln', amount: 800, unit: 'g' },
  { id: 'm', name: 'Mehl', amount: 200, unit: 'g' },
  { id: 'e', name: 'Ei', amount: 1, unit: 'Stück' },
], [
  { id: 'g1', text: 'Kartoffeln kochen und pressen.' },
  { id: 'g2', text: 'Mit Mehl und Ei verkneten, Gnocchi formen.' },
]);
const dish = (extra: Partial<Recipe> = {}) => recipe('d', 'Gnocchi mit Tomatensoße', 2, [
  { id: 'i1', name: 'Gnocchi', amount: 500, unit: 'g', recipeId: 'g' },
  { id: 'i2', name: 'Tomaten', amount: 400, unit: 'g' },
], [
  { id: 's1', text: 'Tomaten mit Mehl bestäuben und köcheln lassen.' },
  { id: 's2', text: 'Gnocchi in die Soße geben.' },
], extra);
const all = [gnocchi, dish()];

describe('Zutat selbst machen (Julia: gekaufte oder selbstgemachte Gnocchi)', () => {
  it('gekauft (nichts gewählt): das Rezept bleibt genau so', () => {
    const r = dish();
    expect(cookingContent(r, all)).toBe(currentContent(r));
  });

  it('selbst gemacht: die Zutaten des Grundrezepts ersetzen die Gnocchi – auf die Portionen des Gerichts', () => {
    const c = cookingContent(dish({ homemade: ['i1'] }), all);
    expect(c.ingredients.map((i) => [i.name, i.amount, i.part ?? REST])).toEqual([
      ['Kartoffeln', 400, 'Gnocchi'], ['Mehl', 100, 'Gnocchi'], ['Ei', 0.5, 'Gnocchi'], ['Tomaten', 400, REST],
    ]);
    expect(new Set(c.ingredients.map((i) => i.id)).size).toBe(4);
    expect(c.ingredients.some((i) => i.recipeId)).toBe(false);
  });

  it('Schritte: erst die Gnocchi, dann das Gericht; „Gnocchi in die Soße“ wird „Zum Schluss“', () => {
    const c = cookingContent(dish({ homemade: ['i1'] }), all);
    expect(c.steps.map((s) => s.text.split(' ')[0])).toEqual(['Kartoffeln', 'Mit', 'Tomaten', 'Gnocchi']);
    const [g1, g2, s1, s2] = c.steps;
    expect([g1.part, g2.part]).toEqual(['Gnocchi', 'Gnocchi']);
    expect(g2.ingredientIds).toEqual(['i1>m', 'i1>e']);
    // „Mehl“ im Schritt des Gerichts gehört nicht zu den Gnocchi
    expect(s1.ingredientIds).toEqual(['i2']);
    expect(s1.part).toBeUndefined();
    expect(s2.part).toBe(FINISH);
  });

  it('als Teil: Gnocchi vorkochen geht, und sind sie fertig, kommt „Zum Schluss“ beim Rest dazu', () => {
    const c = cookingContent(dish({ homemade: ['i1'] }), all);
    expect(partsOf(c)).toEqual([REST, 'Gnocchi']);
    expect(forParts(c, ['Gnocchi']).steps.map((s) => s.id)).toEqual(['i1>g1', 'i1>g2']);
    expect(forParts(c, [REST], ['Gnocchi']).steps.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('Grundrezept gelöscht oder Zutat zeigt auf das Rezept selbst → wieder gekauft', () => {
    const r = dish({ homemade: ['i1'] });
    expect(cookingContent(r, [r]).ingredients.map((i) => i.name)).toEqual(['Gnocchi', 'Tomaten']);
    const c = currentContent(r);
    expect(withHomemade({ ...c, ingredients: [{ ...c.ingredients[0], recipeId: 'd' }] }, ['i1'], all, 'd').ingredients[0].name).toBe('Gnocchi');
  });

  it('Auswahl auf der Rezeptseite: nur Zutaten mit Grundrezept, mit Julias Wahl', () => {
    expect(homemadeOptions(dish(), all).map((o) => [o.ingredient.name, o.recipe.id, o.chosen])).toEqual([['Gnocchi', 'g', false]]);
    expect(homemadeOptions(dish({ homemade: ['i1'] }), all)[0].chosen).toBe(true);
    expect(homemadeOptions(dish(), [dish()])).toEqual([]);
  });

  it('Vorschläge im Formular: der Name steht als Wort im Titel', () => {
    const two: Ingredient[] = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
    const pesto = recipe('p', 'Bärlauch-Pesto', 4, two, []);
    const soup = recipe('t', 'Tomatensuppe', 2, two, []);
    const pasta = recipe('a', 'Cremige Avocado-Pasta', 2, two, []);
    // gekaufte Beilage aus Mix & Match – nur eine Zutat, kein Grundrezept
    const rice = recipe('r', 'Reis', 1, [{ id: 'r', name: 'Reis', amount: 100, unit: 'g' }], []);
    expect(homemadeCandidates('Reis', [rice])).toEqual([]);
    const list = [gnocchi, pesto, soup, pasta, dish()];
    expect(homemadeCandidates('Gnocchi', list, 'd').map((r) => r.id)).toEqual(['g']);
    // „Avocado-Pasta“ ist Pasta, keine Avocado
    expect(homemadeCandidates('Avocado', list)).toEqual([]);
    expect(homemadeCandidates('pesto', list).map((r) => r.id)).toEqual(['p']);
    expect(homemadeCandidates('Bärlauch Pesto', list).map((r) => r.id)).toEqual(['p']);
    expect(homemadeCandidates('Tomaten', list)).toEqual([]);
    expect(homemadeCandidates('Ei', list)).toEqual([]);
  });
});
