import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { localFoodTable } from './nutrition/localFoods';
import { addItem, applyImport, deductRecipe, emptyPantry, proposeImport, recipesFromPantry, type Pantry } from './pantry';
import { parseReceipt } from './receipt';
import type { Ingredient, Recipe, RecipeContent } from './types';

const NOW = '2026-09-24T12:00:00.000Z';
let n = 0;
const id = () => `id${n++}`;
const BON = parseReceipt(`EUR
Bananen 1,20 A
0,982 kg x 1,19 EUR/kg
Speisequark mager 0,79 x 3 2,37 A
Cola Zero 0,69 x 6 4,14 B
Zu zahlen 7,71`);

const content = (ingredients: Ingredient[], servings = 2): RecipeContent => ({
  title: 'T', description: '', servings, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});
const base = createMockRecipes()[0];
const recipe = (rid: string, ingredients: Ingredient[]): Recipe => ({
  ...structuredClone(base), id: rid, status: 'kochbuch',
  versions: [{ ...base.versions[0], id: `${rid}-v`, content: content(ingredients) }], currentVersionId: `${rid}-v`,
});
const stock = (...items: [string, number | undefined, 'g' | 'ml' | 'Stück' | undefined][]): Pantry => ({
  ...emptyPantry(),
  items: items.map(([name, amount, unit]) => ({ id: id(), name, ...(amount !== undefined ? { amount, unit } : {}), addedAt: NOW })),
});

describe('Kassenbon in die Speisekammer', () => {
  it('erster Bon: nichts bekannt – nur das Gewicht loser Ware ist schon ausgefüllt', () => {
    const rows = proposeImport(BON, []);
    expect(rows.map((r) => [r.name, r.known, r.amount, r.unit])).toEqual([
      ['Bananen', false, 982, 'g'],
      ['Speisequark mager', false, undefined, undefined],
      ['Cola Zero', false, undefined, undefined],
    ]);
  });

  it('merkt sich Name, Packungsgröße und „Überspringen“ – der nächste Bon ist fertig ausgefüllt', () => {
    const rows = proposeImport(BON, []);
    rows[1] = { ...rows[1], name: 'Magerquark', amount: 750, unit: 'g' }; // 3 × 250 g
    rows[2] = { ...rows[2], skip: true };
    const after = applyImport(emptyPantry(), rows, NOW, id);
    expect(after.items.map((i) => [i.name, i.amount, i.unit])).toEqual([['Bananen', 982, 'g'], ['Magerquark', 750, 'g']]);

    const next = proposeImport(parseReceipt('EUR\nSpeisequark mager 0,79 x 2 1,58 A\nCola Zero 0,69 x 2 1,38 B\nZu zahlen'), after.rules);
    expect(next.map((r) => [r.name, r.known, r.skip, r.amount])).toEqual([
      ['Magerquark', true, false, 500], // 2 × 250 g – je Packung gelernt
      ['Cola Zero', true, true, undefined],
    ]);
  });

  it('zählt gleiche Vorräte zusammen statt sie doppelt zu führen', () => {
    let items = addItem([], { name: 'Magerquark', amount: 500, unit: 'g' }, NOW, id);
    items = addItem(items, { name: 'magerquark', amount: 250, unit: 'g' }, NOW, id);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(750);
  });
});

describe('Gekocht → aus der Speisekammer', () => {
  it('zieht ab, rechnet Einheiten um und nimmt Aufgebrauchtes heraus', () => {
    const p = stock(['Magerquark', 750, 'g'], ['Nudeln', 250, 'g'], ['Eier', 6, 'Stück'], ['Joghurt', 500, 'g']);
    const r = deductRecipe(p, content([
      { id: '1', name: 'Magerquark', amount: 250, unit: 'g' },
      { id: '2', name: 'Pasta', amount: 125, unit: 'g' },   // „Pasta“ = „Nudeln“
      { id: '3', name: 'Eier', amount: 2, unit: 'Stück' },
      { id: '4', name: 'Joghurt', amount: 2, unit: 'EL' },   // 2 EL = 30 ml ≈ 30 g
    ], 1), 2, localFoodTable);                                // für 2 Portionen gekocht: alles doppelt
    expect(r.pantry.items.map((i) => [i.name, i.amount])).toEqual([['Magerquark', 250], ['Eier', 2], ['Joghurt', 440]]);
    expect(r.used).toEqual(['Magerquark', 'Nudeln', 'Eier', 'Joghurt']);
  });

  it('ohne Menge in der Speisekammer: nicht raten, sondern „Noch da?“ fragen', () => {
    const r = deductRecipe(stock(['Paprika', undefined, undefined]), content([{ id: '1', name: 'Paprika', amount: 1, unit: 'Stück' }]), 2, localFoodTable);
    expect(r.pantry.items[0]).toMatchObject({ name: 'Paprika', check: true });
    expect(r.toCheck).toEqual(['Paprika']);
  });

  it('Stück im Vorrat, Gramm im Rezept: über das Stückgewicht (1 Paprika ≈ 150 g)', () => {
    const r = deductRecipe(stock(['Paprika', 3, 'Stück']), content([{ id: '1', name: 'Paprika', amount: 300, unit: 'g' }]), 2, localFoodTable);
    expect(r.pantry.items[0].amount).toBe(1);
  });

  it('lässt unbeteiligte Vorräte und Salz & Co. in Ruhe', () => {
    const p = stock(['Reis', 1000, 'g'], ['Salz', 500, 'g']);
    const r = deductRecipe(p, content([{ id: '1', name: 'Salz', amount: 1, unit: 'TL' }]), 2, localFoodTable);
    expect(r.pantry.items.map((i) => i.amount)).toEqual([1000, 500]);
  });
});

describe('Was kann ich kochen?', () => {
  const recipes = [
    recipe('alles', [{ id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: '2', name: 'Reis', amount: 150, unit: 'g' }, { id: '3', name: 'Salz' }]),
    recipe('halb', [{ id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: '2', name: 'Pasta', amount: 150, unit: 'g' }]),
    recipe('gemuese', [{ id: '1', name: 'Paprika', amount: 1, unit: 'Stück' }, { id: '2', name: 'Pasta', amount: 150, unit: 'g' }]),
    recipe('nichts', [{ id: '1', name: 'Linsen', amount: 200, unit: 'g' }]),
  ];

  it('sortiert nach Übereinstimmung – Salz zählt nicht, Hähnchen mehr als Paprika', () => {
    const m = recipesFromPantry(stock(['Hähnchenbrust', 400, 'g'], ['Reis', 500, 'g'], ['Paprika', 2, 'Stück']), recipes, localFoodTable);
    expect(m.map((x) => x.recipe.id)).toEqual(['alles', 'halb', 'gemuese']);
    expect(m[0]).toMatchObject({ share: 1, missing: [] });
    expect(m[1].missing).toEqual(['Pasta']);
  });

  it('leere Speisekammer: keine Vorschläge', () => {
    expect(recipesFromPantry(emptyPantry(), recipes, localFoodTable)).toEqual([]);
  });
});
