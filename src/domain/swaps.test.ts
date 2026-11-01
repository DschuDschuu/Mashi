import { describe, expect, it } from 'vitest';
import { chosenContent } from './choices';
import { sideContent } from './mix';
import { sideOfIngredient, swapChecks, swapFor, swapSlots, swapTargetOfIngredient, withSwaps } from './swaps';
import type { Ingredient, Recipe, RecipeContent } from './types';

// erfundenes Rezept – keine echten (das Repo ist öffentlich)
const ing = (id: string, name: string): Ingredient => ({ id, name, amount: 100, unit: 'g' });
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

  it('kein Treffer mitten im Wort', () => {
    expect(sideOfIngredient('Kartoffelstärke')).toBeUndefined();
    expect(sideOfIngredient('Reisessig')).toBeUndefined();
    expect(sideOfIngredient('Paprikapulver')).toBeUndefined();
    expect(sideOfIngredient('Sesamöl')).toBeUndefined();
    expect(sideOfIngredient('Zwiebel')).toBeUndefined(); // würzt nur – kein Baustein
    expect(sideOfIngredient('grüne Bohnen')).toBeUndefined(); // nicht die schwarzen
  });

  it('jede Stufe (Julia: „alles innerhalb jeder Stufe“): Gemüse, Sauce, Topping', () => {
    expect(sideOfIngredient('Kirschtomaten')?.id).toBe('tomaten');
    expect(sideOfIngredient('Möhren')?.id).toBe('karotten');
    expect(sideOfIngredient('Salatgurke')?.id).toBe('gurke');
    expect(sideOfIngredient('rote Zwiebel')?.id).toBe('zwiebeln');
    expect(sideOfIngredient('Basilikumpesto')?.id).toBe('pesto');
    expect(sideOfIngredient('Erdnuss-Sauce')?.id).toBe('erdnuss');
    expect(sideOfIngredient('Parmesan')?.id).toBe('parmesan');
    expect(sideOfIngredient('Koriander')?.id).toBe('koriander');
  });

  it('Schutzregeln: Dosentomaten, Schmand, Ei, gemahlener Koriander tauschen nicht', () => {
    expect(sideOfIngredient('Passierte Tomaten')).toBeUndefined();
    expect(sideOfIngredient('gehackte Tomaten (Dose)')).toBeUndefined();
    expect(sideOfIngredient('getrocknete Tomaten')).toBeUndefined();
    expect(sideOfIngredient('Schmand')).toBeUndefined();
    expect(sideOfIngredient('Ei')).toBeUndefined();
    expect(sideOfIngredient('Koriander, gemahlen')).toBeUndefined();
    expect(sideOfIngredient('Kräuter der Provence')).toBeUndefined();
  });

  it('nur bestimmte Stufen, wenn gefragt (Baustein-Vorschläge: Kohlenhydrat und Protein)', () => {
    expect(sideOfIngredient('Paprika', [], ['carb', 'protein'])).toBeUndefined();
    expect(sideOfIngredient('Hackfleisch', [], ['carb', 'protein'])?.id).toBe('hack');
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

  it('was schon im Rezept liegt, steht nicht zur Wahl – getauscht zählt der neue Baustein', () => {
    const c: RecipeContent = { ...content(), ingredients: [ing('p', 'Paprika'), ing('a', 'Avocado'), ing('z', 'Zucchini')], steps: [] };
    const opts = (swaps = {}) => swapSlots(c, swaps)[0].options.map((o) => o.id);
    expect(opts()).not.toContain('avocado');
    expect(opts()).not.toContain('zucchini');
    expect(opts({ z: swapFor('brokkoli')! })).toContain('zucchini'); // Zucchini ist jetzt Brokkoli – also wieder frei
    expect(opts({ z: swapFor('brokkoli')! })).not.toContain('brokkoli');
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

  it('Gemüse tauscht nur gegen Gemüse – Topping nur gegen Topping', () => {
    const c: RecipeContent = { ...content(), ingredients: [ing('b', 'Brokkoli'), ing('pm', 'Parmesan'), ing('t', 'Passierte Tomaten')], steps: [] };
    const slots = swapSlots(c);
    expect(slots.map((x) => x.ingredient.id)).toEqual(['b', 'pm']); // Dosentomaten nicht
    expect(slots[0].options.every((o) => o.kind === 'veg')).toBe(true);
    expect(slots[1].options.map((o) => o.id)).toContain('feta');
    expect(slots[1].options.some((o) => o.id === 'ei')).toBe(true); // als Ziel geht Ei – nur die Zutat Ei tauscht nicht
  });

  it('die Zubereitung passend zum Schritt: Ofen bleibt Ofen – Tipp und Timer nach ihr (Julia: „das Rezept checkt das“)', () => {
    const veg: RecipeContent = { ...content(), ingredients: [ing('b', 'Brokkoli')], steps: [
      { id: 'v1', text: 'Brokkoli im Ofen rösten.', timerMinutes: 25 },
    ] };
    const z = withSwaps(veg, { b: swapFor('zucchini')! });
    expect(z.steps[0].text).toBe('Zucchini im Ofen rösten. (Tipp: Zucchini in Stücken im Ofen rösten, 20 Min.)');
    expect(z.steps[0].timerMinutes).toBe(20); // nicht der Standard „anbraten, 6 Min.“
    expect(swapChecks(veg, { b: swapFor('zucchini')! })).toEqual({});
  });

  it('passt die Garart nicht: gelb mit dem Schritt zum Anschauen – dein Timer bleibt', () => {
    const veg: RecipeContent = { ...content(), ingredients: [ing('b', 'Brokkoli')], steps: [
      { id: 'v1', text: 'Brokkoli 5 Min. dämpfen.', timerMinutes: 5 },
      { id: 'v2', text: 'Brokkoli abtropfen lassen.' },
    ] };
    const swap = { b: swapFor('gurke')! };
    expect(swapChecks(veg, swap)).toEqual({ b: ['Gurke 5 Min. dämpfen.'] }); // „abtropfen“ gart nicht – nichts zu prüfen
    expect(withSwaps(veg, swap).steps[0].timerMinutes).toBe(5);
    const carb: RecipeContent = { ...content(), ingredients: [ing('k', 'Kartoffeln')], steps: [{ id: 'k1', text: 'Kartoffeln in Salzwasser kochen.', timerMinutes: 20 }] };
    expect(swapChecks(carb, { k: swapFor('schupfnudeln')! })).toEqual({ k: ['Schupfnudeln in Salzwasser kochen.'] });
    expect(swapChecks(carb, { k: swapFor('pasta')! })).toEqual({});
    expect(withSwaps(carb, { k: swapFor('pasta')! }).steps[0].timerMinutes).toBe(10);
  });

  it('Gemüse gegart oder roh (Julia: „Brokkoli mit Salat ergibt keinen Sinn“) – was beides kann, nach deinem Rezept', () => {
    const ids = (c: RecipeContent) => swapSlots(c)[0].options.map((o) => o.id);
    const gebraten: RecipeContent = { ...content(), ingredients: [ing('p', 'Paprika')], steps: [{ id: 'x', text: 'Paprika in Streifen anbraten.' }] };
    expect(ids(gebraten)).toEqual(expect.arrayContaining(['brokkoli', 'zucchini', 'karotten']));
    expect(ids(gebraten)).not.toEqual(expect.arrayContaining(['salat']));
    expect(ids(gebraten).some((id) => ['salat', 'gurke', 'avocado'].includes(id))).toBe(false);
    const roh: RecipeContent = { ...content(), ingredients: [ing('p', 'Paprika')], steps: [{ id: 'x', text: 'Paprika in feine Streifen schneiden.' }] };
    expect(ids(roh)).toEqual(expect.arrayContaining(['gurke', 'salat', 'karotten']));
    expect(ids(roh).some((id) => ['brokkoli', 'zucchini'].includes(id))).toBe(false);
    // ohne Schritt, der es nennt: was mit ihm eine Art teilt – Brokkoli nie mit Salat
    const brokkoli: RecipeContent = { ...content(), ingredients: [ing('b', 'Brokkoli')], steps: [] };
    expect(ids(brokkoli)).toContain('zucchini');
    expect(ids(brokkoli).some((id) => ['salat', 'gurke', 'avocado'].includes(id))).toBe(false);
    const salat: RecipeContent = { ...content(), ingredients: [ing('s', 'Salat')], steps: [] };
    expect(ids(salat)).toContain('gurke');
    expect(ids(salat).some((id) => ['brokkoli', 'zucchini'].includes(id))).toBe(false);
  });

  it('Milchprodukte (Julia: Schmand ↔ Frischkäse, Joghurt, Milch): erkannt, untereinander tauschbar – Kokosmilch nicht', () => {
    expect(swapTargetOfIngredient('Schmand')?.id).toBe('zutat:schmand');
    expect(swapTargetOfIngredient('Doppelrahmfrischkäse')?.id).toBe('zutat:frischkaese');
    expect(swapTargetOfIngredient('griechischer Joghurt')?.id).toBe('zutat:joghurt');
    expect(swapTargetOfIngredient('saure Sahne')?.id).toBe('zutat:sauresahne');
    expect(swapTargetOfIngredient('Sahnesauce')?.id).toBe('sahnesauce'); // die Sauce bleibt Sauce
    expect(swapTargetOfIngredient('Joghurt-Dip')?.id).toBe('joghurt');
    expect(swapTargetOfIngredient('Kokosmilch')).toBeUndefined();
    expect(sideOfIngredient('Schmand')).toBeUndefined(); // als Baustein (Sauce) weiter nicht
    const c: RecipeContent = { ...content(), ingredients: [ing('s', 'Schmand'), ing('h', 'Hähnchenbrust')], steps: [] };
    const opts = swapSlots(c)[0].options.map((o) => o.id);
    expect(opts).toEqual(expect.arrayContaining(['zutat:frischkaese', 'zutat:joghurt', 'zutat:milch', 'zutat:sahne']));
    expect(opts.every((id) => id.startsWith('zutat:'))).toBe(true);
  });

  it('Milchprodukte: deine Menge bleibt, flüssig ↔ fest wechselt g und ml; kein Tipp, keine Ampel', () => {
    const c: RecipeContent = { ...content(), ingredients: [{ id: 's', name: 'Schmand', amount: 200, unit: 'g' }, { id: 'm', name: 'Sahne', amount: 100, unit: 'ml' }, { id: 'e', name: 'Joghurt', amount: 2, unit: 'EL' }], steps: [
      { id: 'x', text: 'Den Schmand unterrühren und kurz köcheln lassen.', timerMinutes: 3 },
    ] };
    expect(swapFor('zutat:milch')).toEqual({ side: 'zutat:milch', name: 'Milch', same: true });
    const out = withSwaps(c, { s: swapFor('zutat:milch')!, m: swapFor('zutat:frischkaese')!, e: swapFor('zutat:schmand')! });
    expect(out.ingredients).toMatchObject([
      { name: 'Milch', amount: 200, unit: 'ml' }, { name: 'Frischkäse', amount: 100, unit: 'g' }, { name: 'Schmand', amount: 2, unit: 'EL' },
    ]);
    expect(out.steps[0]).toMatchObject({ text: 'Milch unterrühren und kurz köcheln lassen.', timerMinutes: 3 });
    expect(swapChecks(c, { s: swapFor('zutat:milch')! })).toEqual({});
  });

  it('Toppings und Saucen behalten die Menge deines Rezepts (Julia: nicht 160 g Feta statt 50 g Parmesan)', () => {
    expect(swapFor('feta')).toEqual({ side: 'feta', name: 'Feta', same: true });
    expect(swapFor('feta', { sideFood: { feta: 'Hirtenkäse' } })).toEqual({ side: 'feta', name: 'Hirtenkäse', same: true });
    const c: RecipeContent = { ...content(), servings: 4, ingredients: [
      { id: 'p', name: 'Parmesan', amount: 50, unit: 'g' }, { id: 'k', name: 'Kokos-Currysauce', amount: 200, unit: 'ml' }, { id: 'h', name: 'Hackfleisch', amount: 500, unit: 'g' },
    ], steps: [] };
    const out = withSwaps(c, { p: swapFor('feta')!, k: swapFor('erdnuss')!, h: swapFor('tofu')! });
    expect(out.ingredients).toMatchObject([
      { name: 'Feta', amount: 50, unit: 'g' }, { name: 'Erdnusssauce', amount: 200, unit: 'ml' },
      { name: 'Tofu', amount: 400, unit: 'g' }, // Protein: weiter die Baustein-Menge (100 g × 4)
    ]);
  });

  it('Garfamilien machen die Ampel genauer: Bratkartoffeln → Gnocchi knusprig, Brokkoli im Ofen → dein Kürbis geröstet', () => {
    const carb: RecipeContent = { ...content(), ingredients: [ing('k', 'Kartoffeln')], steps: [{ id: 'k1', text: 'Kartoffeln in der Pfanne braten.', timerMinutes: 15 }] };
    expect(swapChecks(carb, { k: swapFor('gnocchi')! })).toEqual({}); // früher gelb: Gnocchi kannten nur „kochen“
    expect(withSwaps(carb, { k: swapFor('gnocchi')! }).steps[0]).toMatchObject({ text: 'Gnocchi in der Pfanne braten. (Tipp: Gnocchi in der Pfanne knusprig braten, 8 Min.)', timerMinutes: 8 });
    const veg: RecipeContent = { ...content(), ingredients: [ing('b', 'Brokkoli')], steps: [{ id: 'v1', text: 'Brokkoli im Ofen rösten.' }] };
    const custom = ['eigen:veg:Kürbis'];
    expect(swapChecks(veg, { b: swapFor('eigen:veg:Kürbis')! }, custom)).toEqual({});
    expect(withSwaps(veg, { b: swapFor('eigen:veg:Kürbis')! }, custom).steps[0].text).toBe('Kürbis im Ofen rösten. (Tipp: Kürbis in Stücke schneiden, mit Öl im Ofen rösten, 25 Min.)');
  });

  it('zwei Tausche im selben Schritt: ein Tipp für beide', () => {
    const c: RecipeContent = { ...content(), ingredients: [ing('h', 'Hackfleisch'), ing('k', 'Karotten')], steps: [{ id: 'x', text: 'Karotten anschwitzen, Hack krümelig braten.' }] };
    expect(withSwaps(c, { h: swapFor('tofu')!, k: swapFor('zucchini')! }).steps[0].text)
      .toBe('Zucchini anschwitzen, Tofu krümelig braten. (Tipp: Tofu würfeln und knusprig braten, 10 Min.; Zucchini in Scheiben anbraten, 6 Min.)');
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
