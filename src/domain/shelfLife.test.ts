import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { resolveIngredient, suggestRecipes } from './mealplan';
import { FOOD_CHOICES, localFoodTable } from './nutrition/localFoods';
import { withMyProducts, type MyProduct } from './nutrition/myProducts';
import { addItem, applyImport, deductRecipe, emptyPantry, freezeItem, leftoverSuggestions, proposeImport, recipesFromPantry, thawItem, type Pantry, type PantryItem } from './pantry';
import { parseReceipt } from './receipt';
import { parseSavings } from './savings';
import { recipeOfTheDay } from './recipeOfTheDay';
import { daysLabel, daysLeft, expiringSoon, expiryLabel, setShelfDays, shelfOverview, useByOf, useUpKeys } from './shelfLife';
import type { Ingredient, Recipe } from './types';

const NOW = new Date(2026, 8, 25, 10); // 25.09.2026, Ortszeit
const iso = (d: number) => new Date(2026, 8, d, 12).toISOString();
const item = (name: string, bought: number, extra: object = {}) => ({ id: name, name, addedAt: iso(bought), boughtAt: iso(bought), ...extra });
const pantry = (...items: PantryItem[]): Pantry => ({ ...emptyPantry(), items });

const base = createMockRecipes()[0];
const recipe = (id: string, ingredients: Ingredient[]): Recipe => ({
  ...structuredClone(base), id, status: 'kochbuch', archivedAt: undefined,
  versions: [{ ...base.versions[0], id: `${id}-v`, content: { ...base.versions[0].content, servings: 2, ingredients, steps: [] } }],
  currentVersionId: `${id}-v`,
});

describe('Haltbarkeit schätzen', () => {
  it('Kaufdatum + typische Haltbarkeit: Hähnchen 2 Tage, Tomaten 5, Joghurt 10 – Pasta hält lange', () => {
    expect(daysLeft(useByOf(item('Hähnchenbrust', 24), localFoodTable)!, NOW)).toBe(1);
    expect(daysLeft(useByOf(item('Tomaten', 22), localFoodTable)!, NOW)).toBe(2);
    expect(daysLeft(useByOf(item('Joghurt', 20), localFoodTable)!, NOW)).toBe(5);
    expect(useByOf(item('Pasta', 1), localFoodTable)).toBeUndefined();
  });

  it('ein eigenes Datum geht immer vor', () => {
    const own = item('Hähnchenbrust', 24, { useBy: iso(30) });
    expect(daysLeft(useByOf(own, localFoodTable)!, NOW)).toBe(5);
  });

  it('bald verbrauchen: Abgelaufenes und die nächsten 2 Tage, dringendstes zuerst', () => {
    const p = pantry(item('Tomaten', 22), item('Hähnchenbrust', 22), item('Joghurt', 24), item('Pasta', 1));
    expect(expiringSoon(p, localFoodTable, NOW).map((e) => [e.item.name, e.daysLeft])).toEqual([
      ['Hähnchenbrust', -1], ['Tomaten', 2],
    ]);
  });

  it('neue und alte Ware zusammen: das ältere Kaufdatum zählt', () => {
    let items = addItem([], { name: 'Tomaten', amount: 3, unit: 'Stück', boughtAt: iso(20) }, iso(20));
    items = addItem(items, { name: 'Tomaten', amount: 6, unit: 'Stück', boughtAt: iso(25) }, iso(25));
    expect(items[0]).toMatchObject({ amount: 9, boughtAt: iso(20) });
  });

  it('Anzeige: heute, morgen, noch 2 Tage, drüber', () => {
    expect([0, 1, 2, -1, -3].map(daysLabel)).toEqual(['heute', 'morgen', 'noch 2 Tage', 'seit gestern drüber', 'seit 3 Tagen drüber']);
  });
});

describe('Vorschläge brauchen Verderbliches zuerst auf', () => {
  const p = pantry(item('Tomaten', 22), item('Pasta', 1));
  const tomato = recipe('tomate', [{ id: '1', name: 'Tomaten', amount: 300, unit: 'g' }, { id: '2', name: 'Hähnchenbrust', amount: 300, unit: 'g' }]);
  const pasta = recipe('pasta', [{ id: '1', name: 'Pasta', amount: 250, unit: 'g' }]);

  it('„Was kann ich kochen?“: die Tomaten vor der Pasta – obwohl für die Pasta „alles da“ ist', () => {
    const keys = useUpKeys(p, localFoodTable, NOW);
    const m = recipesFromPantry(p, [pasta, tomato], localFoodTable, 8, keys);
    expect(m.map((x) => x.recipe.id)).toEqual(['tomate', 'pasta']);
    expect(m[0].useUp).toEqual(['Kirschtomaten']);
    // ohne Haltbarkeit wäre es umgekehrt
    expect(recipesFromPantry(p, [pasta, tomato], localFoodTable).map((x) => x.recipe.id)).toEqual(['pasta', 'tomate']);
  });

  it('„Passt dazu“: auch ohne gemeinsame Zutat mit dem Plan kommt das Tomaten-Rezept dazu', () => {
    const planned = recipe('plan', [{ id: '1', name: 'Reis', amount: 150, unit: 'g' }]);
    const plan = { items: [{ recipeId: 'plan', servings: 2 }], checked: [], cooked: [], updatedAt: '' };
    const keys = new Set(useUpKeys(p, localFoodTable, NOW).keys());
    expect(suggestRecipes(plan, [planned, tomato, pasta], localFoodTable, 5, keys).map((s) => s.recipe.id)).toEqual(['tomate']);
  });

  it('„Rezept des Tages“ wählt unter den Rezepten, die etwas aufbrauchen', () => {
    for (let d = 1; d <= 10; d++) expect(recipeOfTheDay([pasta, tomato], new Date(2026, 8, d), new Set(['tomate']))?.id).toBe('tomate');
  });
});

describe('Haltbarkeit selbst einstellen', () => {
  const mozzarella: MyProduct = {
    id: 'p-mozz', name: 'Mozzarella (Test)', replaces: ['mozzarella'],
    per100g: { kcal: 160, protein: 18, carbs: 1, fat: 9 }, updatedAt: '2026-09-24T00:00:00Z',
  };
  const left = (p: Pantry, name: string, table = localFoodTable) => daysLeft(useByOf(p.items.find((i) => i.name === name)!, table, p.shelfDays)!, NOW);

  it('dein Wert je Lebensmittel geht vor Mashis Richtwert – Tomaten 7 statt 5 Tage', () => {
    const p = { ...pantry(item('Tomaten', 25), item('Spinat', 25)), shelfDays: setShelfDays({}, { food: 'kirschtomaten' }, 7) };
    expect(left(p, 'Tomaten')).toBe(7);
    expect(left(p, 'Spinat')).toBe(3); // unverändert
  });

  it('dein Wert je Art gilt für alle anderen – nicht für Lebensmittel mit eigenem Richtwert', () => {
    const p = { ...pantry(item('Zucchini', 25), item('Zwiebeln', 25)), shelfDays: setShelfDays({}, { kind: 'vegetable' }, 9) };
    expect(left(p, 'Zucchini')).toBe(9);
    expect(left(p, 'Zwiebeln')).toBe(21);
    expect(left({ ...p, shelfDays: undefined }, 'Zucchini')).toBe(5); // Standard
  });

  it('eigenes Produkt: „hält 12 Tage“ gewinnt; ohne Angabe behält es den Richtwert des ersetzten Lebensmittels', () => {
    const p = pantry(item('Mozzarella', 25));
    expect(left(p, 'Mozzarella', withMyProducts(localFoodTable, [mozzarella]))).toBe(7);
    expect(left(p, 'Mozzarella', withMyProducts(localFoodTable, [{ ...mozzarella, shelfDays: 12 }]))).toBe(12);
  });

  it('leer = zurück auf Standard, leere Listen fallen weg', () => {
    const s = setShelfDays(setShelfDays({}, { food: 'spinat' }, 4), { food: 'spinat' }, undefined);
    expect(s).toEqual({});
  });

  it('Übersicht: Gemüse mit Tomaten (eigener Richtwert) und dem, was der Art folgt', () => {
    const groups = shelfOverview(FOOD_CHOICES, { kinds: { vegetable: 6 }, foods: { spinat: 2 } });
    const veg = groups.find((g) => g.kind === 'vegetable')!;
    expect(veg).toMatchObject({ days: 6, standard: 5, own: true });
    expect(veg.foods.find((f) => f.id === 'kirschtomaten')).toMatchObject({ days: 5, followsKind: false, own: false });
    expect(veg.foods.find((f) => f.id === 'spinat')).toMatchObject({ days: 2, standard: 3, own: true });
    // Nudeln & Reis: nur frische Ware
    expect(groups.find((g) => g.kind === 'staple')!.foods.map((f) => f.id)).not.toContain('pasta');
  });
});

describe('Reste mitverbrauchen (nur dieses Mal)', () => {
  const ing = (name: string, amount: number, unit: Ingredient['unit']): Ingredient => ({ id: name, name, amount, unit });

  it('2 Tomaten im Rezept, 3 da → „alle 3“', () => {
    const s = leftoverSuggestions(pantry(item('Tomaten', 24, { amount: 3, unit: 'Stück' })), [ing('Tomaten', 2, 'Stück')], localFoodTable);
    expect(s).toEqual([{ ingredientId: 'Tomaten', name: 'Tomaten', amount: 3, planned: 2, unit: 'Stück' }]);
  });

  it('rechnet in der Einheit des Rezepts: 200 g Spinat geplant, 250 g da → 250 g', () => {
    const s = leftoverSuggestions(pantry(item('Spinat', 24, { amount: 250, unit: 'g' })), [ing('Spinat', 200, 'g')], localFoodTable);
    expect(s[0]).toMatchObject({ amount: 250, planned: 200 });
  });

  it('kein Vorschlag: Haltbares, winziger Rest, oder mehr als doppelt so viel', () => {
    const p = pantry(
      item('Pasta', 24, { amount: 5000, unit: 'g' }),
      item('Spinat', 24, { amount: 205, unit: 'g' }),
      item('Hähnchenbrust', 24, { amount: 1000, unit: 'g' }),
    );
    expect(leftoverSuggestions(p, [ing('Pasta', 250, 'g'), ing('Spinat', 200, 'g'), ing('Hähnchenbrust', 300, 'g')], localFoodTable)).toEqual([]);
  });

  it('„Gekocht“ zieht die geänderte Menge ab – das Rezept bleibt, wie es ist', () => {
    const p = pantry(item('Tomaten', 24, { amount: 3, unit: 'Stück' }));
    const r = recipe('t', [ing('Tomaten', 2, 'Stück')]);
    const content = r.versions[0].content;
    expect(deductRecipe(p, content, 2, localFoodTable).pantry.items[0].amount).toBe(1);
    expect(deductRecipe(p, content, 2, localFoodTable, { Tomaten: 3 }).pantry.items).toEqual([]);
    expect(content.ingredients[0].amount).toBe(2);
  });
});

describe('Obst und Gemüse am Namen erkennen', () => {
  it('Frisches ja, Dose/Glas/Tube nein', () => {
    const kind = (name: string) => resolveIngredient({ id: '1', name }, 1, localFoodTable)?.kind;
    expect(['Zucchini', 'Brokkoli', 'Champignons', 'Äpfel', 'Himbeeren'].map(kind)).toEqual(['vegetable', 'vegetable', 'vegetable', 'fruit', 'fruit']);
    expect(['Apfelmus', 'Orangensaft', 'Tomatenmark', 'Kürbiskerne'].map(kind)).not.toContain('vegetable');
    expect(kind('Apfelmus')).toBeUndefined();
  });
});

describe('MHD-Ware und Gefrorenes', () => {
  // Erfundener Bon im Lidl-Format: RABATT 20% direkt unter dem Artikel (bei loser Ware unter dem Gewicht)
  const BON = `EUR
Lachsfilet 5,49 A
RABATT 20% -1,10
Putenbrust lose 4,20 A
0,300 kg x 13,99 EUR/kg
RABATT 20% -0,84
Birnen lose 2,10 A
1,050 kg x 1,99 EUR/kg
Preisvorteil -0,40
Lidl Plus Rabatt -0,20
Vollkornbrot 1,29 A
Zu zahlen 11,54`;

  it('Bon: RABATT 20% markiert den Artikel darüber – Preisvorteil und Lidl Plus nicht', () => {
    expect(parseReceipt(BON).map((l) => [l.name, !!l.reduced])).toEqual([
      ['Lachsfilet', true], ['Putenbrust lose', true], ['Birnen lose', false], ['Vollkornbrot', false],
    ]);
  });

  it('Ersparnis getrennt: Lidl Plus · Angebote · MHD-Ware', () => {
    expect(parseSavings(BON)).toEqual({ lidlPlus: 0.2, offers: 0.4, mhd: 1.94, total: 11.54 });
  });

  it('Import: MHD-Ware bleibt ein eigener Eintrag und hält 1 Tag (einstellbar)', () => {
    const rows = proposeImport(parseReceipt(BON), []);
    expect(rows[0].reduced).toBe(true);
    let p = { ...pantry(item('Lachsfilet', 20)), items: addItem([], { name: 'Lachsfilet', amount: 200, unit: 'g' }, iso(25)) };
    p = { ...p, items: addItem(p.items, { name: 'Lachsfilet', amount: 250, unit: 'g', boughtAt: iso(25), reduced: true }, iso(25)) };
    expect(p.items.map((i) => [i.amount, !!i.reduced])).toEqual([[200, false], [250, true]]);
    const fish = p.items[1];
    expect(daysLeft(useByOf(fish, localFoodTable)!, NOW)).toBe(1);
    expect(daysLeft(useByOf(fish, localFoodTable, setShelfDays({}, { special: 'reduced' }, 2))!, NOW)).toBe(2);
    // aber nie länger, als die Ware ohnehin hielte
    expect(daysLeft(useByOf({ ...item('Spinat', 25), reduced: true }, localFoodTable, { reduced: 5 })!, NOW)).toBe(3);
  });

  it('Kochen nimmt zuerst die MHD-Ware, Gefrorenes zuletzt', () => {
    const frozen = { ...item('Hähnchenbrust', 1, { amount: 500, unit: 'g' }), id: 'tk', frozenAt: iso(2) };
    const fresh = { ...item('Hähnchenbrust', 25, { amount: 500, unit: 'g' }), id: 'frisch' };
    const mhd = { ...item('Hähnchenbrust', 25, { amount: 400, unit: 'g' }), id: 'mhd', reduced: true };
    const r = recipe('h', [{ id: '1', name: 'Hähnchenbrust', amount: 400, unit: 'g' }]);
    const left = deductRecipe(pantry(frozen, fresh, mhd), r.versions[0].content, 2, localFoodTable).pantry.items.map((i) => i.id);
    expect(left).toEqual(['tk', 'frisch']);
  });

  it('Einfrieren: Uhr steht, Hinweis erst nach 90 Tagen; auch nur ein Teil', () => {
    const hack = { ...item('Rinderhack', 25, { amount: 2000, unit: 'g' }), id: 'hack' };
    const items = freezeItem([hack], 'hack', iso(25), 1500, () => 'tk');
    expect(items.map((i) => [i.id, i.amount, !!i.frozenAt])).toEqual([['hack', 500, false], ['tk', 1500, true]]);
    const p = pantry(...items);
    expect(expiringSoon(p, localFoodTable, NOW).map((e) => e.item.id)).toEqual(['hack']);
    const later = new Date(2026, 11, 23, 10); // 89 Tage später
    const e = expiringSoon(p, localFoodTable, later).find((x) => x.item.id === 'tk')!;
    expect(expiryLabel(e, later)).toBe('seit 3 Monaten eingefroren');
  });

  it('Auftauen: hält dann noch 1 Tag', () => {
    const tk = { ...item('Rinderhack', 1, { amount: 500, unit: 'g' }), id: 'tk', frozenAt: iso(2) };
    const [thawed] = thawItem([tk], 'tk', NOW.toISOString(), 1);
    expect(thawed.frozenAt).toBeUndefined();
    expect(daysLeft(useByOf(thawed, localFoodTable)!, NOW)).toBe(1);
  });

  it('Reste-Vorschlag im Kochmodus lässt Gefrorenes aus', () => {
    const tk = { ...item('Spinat', 20, { amount: 250, unit: 'g' }), frozenAt: iso(20) };
    expect(leftoverSuggestions(pantry(tk), [{ id: 's', name: 'Spinat', amount: 200, unit: 'g' }], localFoodTable)).toEqual([]);
  });
});

describe('Direkt aus dem Kassenbon einfrieren', () => {
  const BON = `EUR
Rinderhack 500g 4,49 x 4 17,96 A
RABATT 20% -3,59
Putenbrust lose 4,20 A
0,300 kg x 13,99 EUR/kg
Zu zahlen 22,16`;
  const rows = () => proposeImport(parseReceipt(BON), []).map((r) => ({ ...r, amount: r.amount ?? 2000, unit: r.unit ?? ('g' as const) }));

  it('nie vorausgewählt', () => {
    expect(proposeImport(parseReceipt(BON), []).every((r) => r.freeze === undefined)).toBe(true);
  });

  it('3 von 4 Packungen einfrieren: 1.500 g gefroren, 500 g frisch – beide MHD-Ware', () => {
    const [hack, pute] = rows();
    const p = applyImport(emptyPantry(), [{ ...hack, freeze: 3 }, pute], iso(25), (() => { let n = 0; return () => `id${n++}`; })(), iso(24));
    expect(p.items.map((i) => [i.name, i.amount, !!i.frozenAt, !!i.reduced])).toEqual([
      ['Rinderhack 500g', 500, false, true], ['Rinderhack 500g', 1500, true, true], ['Putenbrust lose', 300, false, false],
    ]);
    expect(p.items[1].frozenAt).toBe(iso(24)); // eingefroren am Einkaufstag
  });

  it('lose Ware oder alle Packungen: alles gefroren, nichts frisch', () => {
    const [hack, pute] = rows();
    const p = applyImport(emptyPantry(), [{ ...hack, freeze: 4 }, { ...pute, freeze: 1 }], iso(25));
    expect(p.items.map((i) => [i.amount, !!i.frozenAt])).toEqual([[2000, true], [300, true]]);
  });
});
