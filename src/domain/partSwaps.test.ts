import { describe, expect, it } from 'vitest';
import { cookingContent } from './homemade';
import { sideContent } from './mix';
import { FINISH, REST, donePartsOf, partLabel, stepPart } from './parts';
import { withPartSwaps } from './partSwaps';
import type { Ingredient, Recipe, RecipeContent } from './types';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const ing = (id: string, name: string, amount: number, unit: Ingredient['unit'], part?: string): Ingredient => ({ id, name, amount, unit, ...(part ? { part } : {}) });
const recipe = (id: string, content: RecipeContent): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '', currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content }],
});
const SAUCE = 'Erdnuss-Sauce';
const bowl: RecipeContent = {
  ...sideContent('Testbowl'), servings: 2,
  ingredients: [
    ing('h', 'Hähnchenbrust', 250, 'g', 'Knuspriges Hähnchen'), ing('e', 'Erdnussbutter', 3, 'EL', SAUCE), ing('so', 'Sojasauce', 2, 'EL', SAUCE), ing('r', 'Reis', 150, 'g'),
  ],
  steps: [
    { id: 's1', text: 'Hähnchenbrust knusprig braten.', timerMinutes: 8 },
    { id: 's2', text: 'Erdnussbutter mit Sojasauce glatt rühren.', ingredientIds: ['e', 'so'] },
    { id: 's3', text: 'Reis kochen.' },
    { id: 's4', text: 'Alles in Schalen, mit der Erdnuss-Sauce beträufeln und etwas Sojasauce dazu.', part: FINISH, ingredientIds: ['e', 'r'] },
  ],
};
// deine Teriyaki-Sauce als eigenes Rezept (4 Portionen) – und als Teil einer anderen Bowl
const teriyaki = recipe('teri', {
  ...sideContent('Teriyaki-Sauce'), servings: 4,
  ingredients: [ing('t1', 'Sojasauce', 4, 'EL'), ing('t2', 'Honig', 2, 'EL')],
  steps: [{ id: 'ts', text: 'Sojasauce mit Honig aufkochen.', timerMinutes: 3, ingredientIds: ['t1', 't2'] }],
});
const teriBowl = recipe('tb', {
  ...sideContent('Testteriyakibowl'), servings: 2,
  ingredients: [ing('l', 'Lachs', 250, 'g', 'Lachs'), ing('t1', 'Sojasauce', 2, 'EL', 'Teriyaki-Sauce'), ing('t2', 'Honig', 1, 'EL', 'Teriyaki-Sauce')],
  steps: [{ id: 'x1', text: 'Lachs braten.' }, { id: 'x2', text: 'Sojasauce mit Honig aufkochen.' }],
});

describe('Sauce als ganzen Teil tauschen (Julia: Erdnuss-Sauce der Bowl gegen deine Teriyaki-Sauce)', () => {
  it('dein Rezept: Zutaten auf die Portionen umgerechnet, an derselben Stelle; seine Schritte statt der alten; übrige nennen den neuen Namen', () => {
    const c = withPartSwaps(bowl, { [SAUCE]: { recipeId: 'teri', name: 'Teriyaki-Sauce' } }, [teriyaki]);
    expect(c.ingredients.map((i) => `${i.amount} ${i.unit} ${i.name} [${i.part ?? ''}]`)).toEqual([
      '250 g Hähnchenbrust [Knuspriges Hähnchen]', '2 EL Sojasauce [Teriyaki-Sauce]', '1 EL Honig [Teriyaki-Sauce]', '150 g Reis []',
    ]);
    expect(c.steps.map((s) => s.text)).toEqual([
      'Hähnchenbrust knusprig braten.', 'Sojasauce mit Honig aufkochen.', 'Reis kochen.',
      'Alles in Schalen, mit der Teriyaki-Sauce beträufeln und etwas Sojasauce dazu.', // „Sojasauce“ bleibt
    ]);
    const neu = c.steps[1];
    expect(neu).toMatchObject({ part: 'Teriyaki-Sauce', timerMinutes: 3 });
    expect(neu.ingredientIds?.map((id) => c.ingredients.find((i) => i.id === id)?.name)).toEqual(['Sojasauce', 'Honig']);
    expect(c.steps[3].ingredientIds).toEqual(['r']); // die alte Erdnussbutter hängt nicht mehr dran
    expect(partLabel(stepPart(neu, c))).toBe('Teriyaki-Sauce');
  });

  it('ein Teil eines anderen Rezepts: nur dessen Zutaten und Schritte', () => {
    const c = withPartSwaps(bowl, { [SAUCE]: { recipeId: 'tb', part: 'Teriyaki-Sauce', name: 'Teriyaki-Sauce' } }, [teriBowl]);
    expect(c.ingredients.map((i) => i.name)).toEqual(['Hähnchenbrust', 'Sojasauce', 'Honig', 'Reis']);
    expect(c.steps.map((s) => s.text)).not.toContain('Lachs braten.');
    expect(c.steps[1].text).toBe('Sojasauce mit Honig aufkochen.');
  });

  it('Mashis Baustein: seine Menge pro Portion und seine Zubereitung', () => {
    const c = withPartSwaps(bowl, { [SAUCE]: { side: 'joghurt', name: 'Joghurt-Dip' } }, []);
    expect(c.ingredients.find((i) => i.part === 'Joghurt-Dip')).toMatchObject({ name: 'Joghurt', amount: 100, unit: 'g' }); // 50 g × 2
    expect(c.steps[1]).toMatchObject({ text: 'Joghurt-Dip: Joghurt mit Knoblauch und Salz verrühren', part: 'Joghurt-Dip', timerMinutes: 3 });
  });

  it('Quelle gelöscht oder Teil nicht mehr da: wie im Original', () => {
    expect(withPartSwaps(bowl, { [SAUCE]: { recipeId: 'weg', name: 'Teriyaki-Sauce' } }, [])).toEqual(bowl);
    expect(withPartSwaps(bowl, { Dip: { recipeId: 'teri', name: 'Teriyaki-Sauce' } }, [teriyaki])).toEqual(bowl);
    expect(withPartSwaps(bowl, { [SAUCE]: { recipeId: 'tb', part: 'Gibtsnicht', name: 'X' } }, [teriBowl])).toEqual(bowl);
    expect(withPartSwaps(bowl, undefined, [])).toBe(bowl);
  });

  it('ein Teil, der nur „Sauce“ heißt: nur das ganze Wort wird umbenannt – „Sojasauce“ und „Erdnuss-Sauce“ bleiben', () => {
    const c: RecipeContent = {
      ...bowl, ingredients: [ing('e', 'Erdnussbutter', 3, 'EL', 'Sauce'), ing('r', 'Reis', 150, 'g')],
      steps: [{ id: 'a', text: 'Erdnussbutter glatt rühren.' }, { id: 'b', text: 'Mit der Sauce, Sojasauce und Erdnuss-Sauce servieren.', part: FINISH }],
    };
    expect(withPartSwaps(c, { Sauce: { recipeId: 'teri', name: 'Teriyaki-Sauce' } }, [teriyaki]).steps[1].text)
      .toBe('Mit der Teriyaki-Sauce, Sojasauce und Erdnuss-Sauce servieren.');
  });

  it('deine Sauce mit Varianten: nur die gewählte, mit ihrem Zutaten-Tausch (Rundgang: sonst Parmesan UND Hefeflocken)', () => {
    const pesto = recipe('pe', {
      ...sideContent('Testpesto'), servings: 2,
      ingredients: [ing('b', 'Basilikum', 30, 'g'), { ...ing('p', 'Parmesan', 30, 'g'), choice: 'klassisch' }, { ...ing('f', 'Hefeflocken', 10, 'g'), choice: 'vegan' }],
      steps: [{ id: 'x', text: 'Alles pürieren.' }],
      choices: ['klassisch', 'vegan'],
    });
    const c = withPartSwaps(bowl, { [SAUCE]: { recipeId: 'pe', name: 'Testpesto' } }, [{ ...pesto, choice: 'vegan' }]);
    expect(c.ingredients.filter((i) => i.part === 'Testpesto').map((i) => i.name)).toEqual(['Basilikum', 'Hefeflocken']);
  });

  it('übrige Schritte behalten ihren Teil und ihre Zutaten von vorher (Rundgang: „Zum Schluss“ rutschte nach „Frisch“, Sojasauce sprang)', () => {
    const c: RecipeContent = {
      ...bowl,
      ingredients: [ing('h', 'Hähnchenbrust', 250, 'g'), ing('so', 'Sojasauce', 2, 'EL'), ing('e', 'Erdnussbutter', 3, 'EL', SAUCE), ing('n', 'Nudeln', 200, 'g')],
      steps: [
        { id: 'a', text: 'Hähnchenbrust mit Sojasauce marinieren.' },
        { id: 'b', text: 'Erdnussbutter glatt rühren.' },
        { id: 'c', text: 'Nudeln mit der Erdnuss-Sauce mischen.', ingredientIds: ['n', 'e'] },
      ],
    };
    const label = (cc: RecipeContent, id: string) => partLabel(stepPart(cc.steps.find((s) => s.id === id)!, cc));
    expect([label(c, 'a'), label(c, 'c')]).toEqual([partLabel(REST), partLabel(FINISH)]);
    const swapped = withPartSwaps(c, { [SAUCE]: { recipeId: 'teri', name: 'Teriyaki-Sauce' } }, [teriyaki]); // bringt eine zweite Sojasauce mit
    expect([label(swapped, 'a'), label(swapped, 'c')]).toEqual([partLabel(REST), partLabel(FINISH)]);
    expect(swapped.steps.find((s) => s.id === 'a')?.ingredientIds).toEqual(['h', 'so']); // die eigene, nicht die der Sauce
  });

  it('Mashis Sauce mit deinen Einstellungen – Menge und „Kaufst du als“, gemerkt beim Tauschen wie beim Zutaten-Tausch', () => {
    const c = withPartSwaps(bowl, { [SAUCE]: { side: 'guacamole', name: 'Guacamole', grams: 80, food: 'Guacamole fertig' } }, []);
    expect(c.ingredients.find((i) => i.part === 'Guacamole')).toMatchObject({ name: 'Guacamole fertig', amount: 160, unit: 'g' });
  });

  it('weggetauschter Teil ist nicht mehr „fertig“ – sonst würde der vorgekochte Dip trotzdem verbraucht (Rundgang)', () => {
    const items = [{ recipeId: 'platte', part: 'Testdip', amount: 4 }, { recipeId: 'b', part: 'Knuspriges Hähnchen', amount: 2 }];
    const r = { id: 'b', partsFrom: { Testdip: 'platte' } };
    expect(donePartsOf(items, r)).toEqual(['Testdip', 'Knuspriges Hähnchen']);
    expect(donePartsOf(items, { ...r, partSwaps: { Testdip: { side: 'salsa', name: 'Tomatensalsa' } } })).toEqual(['Knuspriges Hähnchen']);
  });

  it('verknüpft (Julia: „immer aktuell“): auf der Rezeptseite und beim Kochen – und änderst du die Sauce, ändert es sich mit', () => {
    const r: Recipe = { ...recipe('b', bowl), partSwaps: { [SAUCE]: { recipeId: 'teri', name: 'Teriyaki-Sauce' } } };
    expect(cookingContent(r, [r, teriyaki]).ingredients.map((i) => i.name)).toContain('Honig');
    const better = recipe('teri', { ...teriyaki.versions[0].content, ingredients: [...teriyaki.versions[0].content.ingredients, ing('t3', 'Ingwer', 4, 'g')] });
    expect(cookingContent(r, [r, better]).ingredients.find((i) => i.name === 'Ingwer')?.amount).toBe(2);
  });
});
