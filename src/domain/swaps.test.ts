import { describe, expect, it } from 'vitest';
import { chosenContent } from './choices';
import { sideContent } from './mix';
import { sideOfIngredient, swapFor, swapSlots, withSwaps } from './swaps';
import type { Recipe, RecipeContent } from './types';

// erfundenes Rezept – keine echten (das Repo ist öffentlich)
const content = (): RecipeContent => ({
  ...sideContent('Testpfanne'), servings: 2,
  ingredients: [
    { id: 'r', name: 'Basmatireis', amount: 150, unit: 'g' },
    { id: 'h', name: 'Hähnchenbrustfilet', amount: 300, unit: 'g', note: 'in Streifen', foodRef: { provider: 'lokal', foodId: 'huhn' } },
    { id: 'z', name: 'Zwiebel', amount: 1, unit: 'Stück' },
    { id: 'g', name: 'Gnocchi', amount: 500, unit: 'g', recipeId: 'selbstgemacht' },
  ],
  steps: [
    { id: 's1', text: 'Den Reis waschen und kochen.', timerMinutes: 15 },
    { id: 's2', text: 'Die Hähnchenbrust salzen und mit der Zwiebel anbraten.', timerMinutes: 8 },
    { id: 's3', text: 'Hähnchen mit Hähnchenbrühe ablöschen, zum Reis geben.' },
    { id: 's4', text: 'Hähnchen ruhen lassen.', timerMinutes: 5 },
  ],
});
const recipe = (extra: Partial<Recipe> = {}, c: RecipeContent = content()): Recipe => ({
  id: 'p', createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [], versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: c }],
  ...extra,
});
const tofu = swapFor('tofu')!;

describe('Zutaten als Baustein erkennen (Julia: Tofu statt Hähnchen)', () => {
  it('ganzes Wort oder Wortende – das längste gewinnt', () => {
    expect(sideOfIngredient('Basmatireis')?.id).toBe('reis');
    expect(sideOfIngredient('Hähnchenbrustfilet')?.id).toBe('haehnchen');
    expect(sideOfIngredient('Süßkartoffeln')?.id).toBe('suesskartoffel');
    expect(sideOfIngredient('festkochende Kartoffeln')?.id).toBe('kartoffeln');
    expect(sideOfIngredient('Hack-Patty')?.id).toBe('patty');
    expect(sideOfIngredient('Rinderhack')?.id).toBe('hack');
  });

  it('nur Kohlenhydrat und Protein – kein Treffer mitten im Wort', () => {
    expect(sideOfIngredient('gehackte Tomaten')).toBeUndefined();
    expect(sideOfIngredient('Kartoffelstärke')).toBeUndefined();
    expect(sideOfIngredient('Reisessig')).toBeUndefined();
    expect(sideOfIngredient('Zwiebel')).toBeUndefined();
    expect(sideOfIngredient('Parmesan')).toBeUndefined(); // ein Topping
    expect(sideOfIngredient('grüne Bohnen')).toBeUndefined(); // Gemüse, nicht die schwarzen
  });

  it('eigene Bausteine zählen mit', () => {
    expect(sideOfIngredient('Seitan', ['eigen:protein:Seitan'])?.id).toBe('eigen:protein:Seitan');
  });
});

describe('Tauschplätze', () => {
  it('je erkannter Zutat ein Platz mit den anderen Bausteinen derselben Stufe; verknüpfte Rezepte nicht', () => {
    const slots = swapSlots(content());
    expect(slots.map((s) => [s.ingredient.id, s.side.id])).toEqual([['r', 'reis'], ['h', 'haehnchen']]);
    const protein = slots[1].options.map((o) => o.id);
    expect(protein).toContain('tofu');
    expect(protein).not.toContain('haehnchen');
    expect(slots[0].options.some((o) => o.kind !== 'carb')).toBe(false);
  });

  it('der aktuelle Tausch steht am Platz', () => {
    expect(swapSlots(content(), { h: tofu })[1].current).toEqual(tofu);
    expect(swapSlots(content(), { h: tofu })[0].current).toBeUndefined();
  });

  it('gespeichert mit deiner Menge und deinem Namen aus den Einstellungen', () => {
    expect(tofu).toEqual({ side: 'tofu', name: 'Tofu', grams: 100 });
    expect(swapFor('tofu', { sides: { tofu: 150 }, sideFood: { tofu: 'Räuchertofu' } })).toEqual({ side: 'tofu', name: 'Räuchertofu', grams: 150 });
    expect(swapFor('tortillas')).toEqual({ side: 'tortillas', name: 'Tortillas', grams: 2, unit: 'Stück' });
    expect(swapFor('gibtsnicht')).toBeUndefined();
  });
});

describe('Rezept mit Tausch – die Schritte bleiben', () => {
  it('die Zutat wird der Baustein: Name, Menge × Portionen, ohne den alten Lebensmittel-Verweis', () => {
    const c = withSwaps(content(), { h: tofu });
    const t = c.ingredients.find((i) => i.id === 'h')!;
    expect(t).toMatchObject({ name: 'Tofu', amount: 200, unit: 'g', note: 'in Streifen' });
    expect(t.foodRef).toBeUndefined(); // sonst rechnete der Tofu mit den Nährwerten vom Hähnchen
    expect(c.ingredients.map((i) => i.id)).toEqual(['r', 'h', 'z', 'g']);
  });

  it('Stück-Bausteine kommen mit Stück', () => {
    const c = withSwaps(content(), { r: swapFor('tortillas')! });
    expect(c.ingredients[0]).toMatchObject({ name: 'Tortillas', amount: 4, unit: 'Stück' });
  });

  it('in den Schritten steht der neue Name – Artikel davor fällt weg, Wörter mittendrin bleiben; ein Tipp am ersten', () => {
    const c = withSwaps(content(), { h: tofu });
    expect(c.steps[0].text).toBe('Den Reis waschen und kochen.');
    expect(c.steps[1].text).toBe('Tofu salzen und mit der Zwiebel anbraten. (Tipp: Tofu würfeln und knusprig braten, 10 Min.)');
    expect(c.steps[2].text).toBe('Tofu mit Hähnchenbrühe ablöschen, zum Reis geben.');
  });

  it('ein Timer, der nur die getauschte Zutat gart, nimmt die Zeit des Bausteins – mit anderem zusammen bleibt er', () => {
    const pasta = withSwaps(content(), { r: swapFor('pasta')! });
    expect(pasta.steps[0].timerMinutes).toBe(10); // Reis 15 Min. → Pasta 10 Min.
    const t = withSwaps(content(), { h: tofu });
    expect(t.steps[1].timerMinutes).toBe(8); // die Zwiebel brät mit – dein Timer bleibt
    expect(t.steps[3].timerMinutes).toBe(10);
    expect(t.steps[2]).not.toHaveProperty('timerMinutes'); // ohne Timer kommt keiner dazu
    // ausdrücklich zugeordnete Zutaten zählen auch: mit der Zwiebel bleibt der Timer
    const fixed: RecipeContent = { ...content(), steps: [{ id: 'x', text: 'Hähnchen ruhen lassen.', timerMinutes: 5, ingredientIds: ['h', 'z'] }] };
    expect(withSwaps(fixed, { h: tofu }).steps[0].timerMinutes).toBe(5);
  });

  it('zwei Tausche zugleich', () => {
    const c = withSwaps(content(), { h: tofu, r: swapFor('quinoa')! });
    expect(c.steps[0].text).toMatch(/^Quinoa waschen und kochen\. \(Tipp: Quinoa/);
    expect(c.steps[2].text).toBe('Tofu mit Hähnchenbrühe ablöschen, zum Quinoa geben.');
  });

  it('ohne Tausch – oder Zutat/Baustein nicht mehr da – bleibt das Rezept genau so', () => {
    const c = content();
    expect(withSwaps(c, undefined)).toBe(c);
    expect(withSwaps(c, {})).toBe(c);
    expect(withSwaps(c, { weg: tofu })).toBe(c);
    expect(withSwaps(c, { h: { ...tofu, side: 'gelöscht' } })).toBe(c);
  });
});

describe('Am Rezept gemerkt (Recipe.swaps) – über chosenContent für Einkauf, Nährwerte, Kochmodus', () => {
  it('chosenContent tauscht; ohne swaps bleibt es die Fassung selbst', () => {
    const plain = recipe();
    expect(chosenContent(plain)).toBe(plain.versions[0].content);
    const r = recipe({ swaps: { h: tofu } });
    expect(chosenContent(r).ingredients.map((i) => i.name)).toEqual(['Basmatireis', 'Tofu', 'Zwiebel', 'Gnocchi']);
    expect(chosenContent(r)).toBe(chosenContent(r)); // gemerkt – kein neues Objekt bei jedem Zeichnen
    const empty = recipe({ swaps: {} }); // alles zurückgetauscht
    expect(chosenContent(empty)).toBe(empty.versions[0].content);
  });

  it('Variante und Tausch zusammen', () => {
    const c: RecipeContent = {
      ...content(), choices: ['Mild', 'Scharf'],
      ingredients: [...content().ingredients, { id: 'chili', name: 'Chili', amount: 1, unit: 'Stück', choice: 'Scharf' }],
    };
    const r = recipe({ choice: 'Scharf', swaps: { h: tofu } }, c);
    expect(chosenContent(r).ingredients.map((i) => i.name)).toEqual(['Basmatireis', 'Tofu', 'Zwiebel', 'Gnocchi', 'Chili']);
  });
});
