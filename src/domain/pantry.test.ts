import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { localFoodTable } from './nutrition/localFoods';
import { addItem, applyImport, deductRecipe, emptyPantry, pantryAfterPlan, proposeImport, recipesFromPantry, type Pantry } from './pantry';
import { suggestPantryUnit } from './packs';
import { parseReceipt } from './receipt';
import { buildShoppingList, type MealPlan } from './mealplan';
import { withMyProducts, type MyProduct } from './nutrition/myProducts';
import { currentContent } from './recipe';
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
  it('erster Bon: nichts bekannt – loses Gewicht in g, sonst die Stückzahl vom Bon', () => {
    const rows = proposeImport(BON, []);
    expect(rows.map((r) => [r.name, r.known, r.amount, r.unit])).toEqual([
      ['Bananen', false, 982, 'g'],
      ['Speisequark mager', false, 3, 'Stück'],
      ['Cola Zero', false, 6, 'Stück'],
    ]);
  });

  it('Größe im Bon-Namen: „500g“, „1kg“, „1,5L“ – je Stück, mal Anzahl', () => {
    const rows = proposeImport(parseReceipt(`EUR
Rinderhack 500g 4,49 x 4 17,96 A
Cola 1,5L 0,99 x 2 1,98 B
Milch 3,5% 1,19 A
Zu zahlen 21,13`), []);
    expect(rows.map((r) => [r.amount, r.unit])).toEqual([[2000, 'g'], [3000, 'ml'], [1, 'Stück']]);
  });

  it('merkt sich Name, Packungsgröße und „Überspringen“ – der nächste Bon ist fertig ausgefüllt', () => {
    const rows = proposeImport(BON, []);
    rows[1] = { ...rows[1], name: 'Magerquark', amount: 750, unit: 'g' }; // 3 × 250 g
    rows[2] = { ...rows[2], skip: true };
    const after = applyImport(emptyPantry(), rows, NOW, id);
    // lose Ware in g, Packungsware als „3 × 250 g“
    expect(after.items.map((i) => [i.name, i.amount, i.unit, i.pack])).toEqual([['Bananen', 982, 'g', undefined], ['Magerquark', 3, 'Stück', { amount: 250, unit: 'g' }]]);

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

describe('Was nach dem Wochenplan übrig bleibt', () => {
  const planned = recipe('geplant', [{ id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: '2', name: 'Paprika', amount: 1, unit: 'Stück' }]);
  const other = recipe('neu', [{ id: '1', name: 'Hähnchenbrust', amount: 300, unit: 'g' }, { id: '2', name: 'Reis', amount: 150, unit: 'g' }]);
  const plan = (cooked: string[] = []) => ({ items: [{ recipeId: 'geplant', servings: 2 }], checked: [], cooked, updatedAt: '' });

  it('zieht geplante, noch nicht gekochte Gerichte gedanklich ab – ohne die echte Speisekammer zu ändern', () => {
    const p = stock(['Hähnchenbrust', 300, 'g'], ['Reis', 500, 'g'], ['Paprika', undefined, undefined]);
    const rest = pantryAfterPlan(p, plan(), [planned, other], localFoodTable);
    expect(rest.items.map((i) => [i.name, i.amount])).toEqual([['Reis', 500]]); // Hähnchen verplant, Paprika (ohne Menge) auch
    expect(p.items).toHaveLength(3); // unverändert
    // Das neue Gericht findet jetzt nur noch den Reis – das Hähnchen ist fürs geplante Gericht
    expect(recipesFromPantry(rest, [other], localFoodTable)[0]).toMatchObject({ have: ['Reis'], missing: ['Hähnchenbrust'] });
  });

  it('schon Gekochtes ist schon abgezogen und wird nicht doppelt verplant', () => {
    const p = stock(['Hähnchenbrust', 300, 'g']);
    expect(pantryAfterPlan(p, plan(['geplant']), [planned], localFoodTable).items).toHaveLength(1);
  });
});

describe('Einheit beim Eintragen', () => {
  const unit = (name: string, product?: { packageUnit?: 'g' | 'ml' | 'Stück' }) => suggestPantryUnit(localFoodTable.matchName(name)?.food, product);
  it('ohne Packungsgröße g – außer Pesto im Glas, Eier als Stück, Milch in ml', () => {
    expect(unit('Grünes Pesto')).toBe('Glas');
    // Stückgewicht in der Tabelle ≠ man zählt es (Julias Karotten)
    expect(unit('Paprika')).toBe('g');
    expect(unit('Karotten')).toBe('g');
    expect(unit('Eier')).toBe('Stück');
    expect(unit('Milch')).toBe('ml');
    expect(unit('Pasta')).toBe('g');
    expect(unit('Unbekanntes Zeug')).toBe('g');
  });
  it('ein Produkt mit Packung „Stück“ geht vor', () => {
    expect(unit('Pasta', { packageUnit: 'Stück' })).toBe('Stück');
  });
});

describe('1 Stück = 1 Packung (Produkt mit Packungsgröße)', () => {
  const T0 = '2026-09-27T12:00:00.000Z';
  const milch: MyProduct = { id: 'pm', name: 'Milch', replaces: ['milch'], per100g: { kcal: 35, protein: 3.4, carbs: 4.9, fat: 0.1 }, packageAmount: 1000, packageUnit: 'ml', updatedAt: T0 };
  const table = withMyProducts(localFoodTable, [milch]);
  const pantry: Pantry = { ...emptyPantry(), items: [{ id: 'm1', name: 'Milch', amount: 3, unit: 'Stück', addedAt: T0, productId: 'pm' }] };
  const pfannkuchen = recipe('pf', [{ id: 'a', name: 'Milch', amount: 250, unit: 'ml' }]);
  const plan: MealPlan = { items: [{ recipeId: 'pf', servings: 2 }], checked: [], cooked: [], updatedAt: T0 };

  it('3 Stück Milch à 1000 ml gegen 250 ml im Rezept: nur ¼ verplant, der Rest bleibt frei', () => {
    const rest = pantryAfterPlan(pantry, plan, [pfannkuchen], table).items;
    expect(rest).toHaveLength(1);
    expect(rest[0].amount).toBeCloseTo(2.8, 2); // Vorrat wird auf eine Stelle gerundet (2,75 → 2,8)
  });

  it('Einkaufsliste: Milch reicht („Hast du schon“)', () => {
    const [m] = buildShoppingList(plan, [pfannkuchen], table, pantry);
    expect(m).toMatchObject({ name: 'Milch', covered: true, have: '3 Stück' });
  });

  it('Kochen zieht ¼ Packung ab', () => {
    const r = deductRecipe(pantry, currentContent(pfannkuchen), 2, table);
    expect(r.pantry.items[0].amount).toBeCloseTo(2.8, 2);
  });

  it('eigenes Stückgewicht der Tabelle bleibt: 500-g-Netz Paprika ≠ eine Paprika mit 500 g', () => {
    const netz: MyProduct = { id: 'pp', name: 'Paprika', replaces: ['paprika'], per100g: { kcal: 30, protein: 1, carbs: 6, fat: 0.3 }, packageAmount: 500, packageUnit: 'g', updatedAt: T0 };
    expect(withMyProducts(localFoodTable, [netz]).matchName('Paprika')?.food.portions?.Stück).toBe(150);
  });
});

describe('Kilopreis vom Bon', () => {
  it('gewogen, aber als Stück im Vorrat (2 Kürbisse): der Preisverlauf rechnet trotzdem je kg', () => {
    const [line] = parseReceipt(['EUR', 'Butternuss-Kürbis 3,49 A', '2,345 kg x 1,49 EUR/kg', 'Zu zahlen 3,49'].join('\n'));
    const p = applyImport(emptyPantry(), [{ line, key: 'butternuss-kürbis', known: false, skip: false, name: 'Kürbis', amount: 2, unit: 'Stück' }], NOW, id);
    expect(p.items[0]).toMatchObject({ name: 'Kürbis', amount: 2, unit: 'Stück' });
    expect(p.history![0].unit).toBe('g');
    expect(p.history![0].perUnit * 1000).toBeCloseTo(3.49 / 2.345);
  });
});

describe('Preise je Sorte (Julia: fair vergleichen)', () => {
  it('leicht und normal am selben Tag: beide Preise bleiben, je Sorte ein Verlauf', () => {
    const line = (name: string, price: number) => ({ name, count: 1, price });
    const p = applyImport(emptyPantry(), [
      { line: line('Rinderhack 500g', 3.29), key: 'rinderhack 500g', known: false, skip: false, name: 'Rinderhack', amount: 500, unit: 'g', productId: 'normal' },
      { line: line('Rinderhack leicht 500g', 3.99), key: 'rinderhack leicht 500g', known: false, skip: false, name: 'Rinderhack', amount: 500, unit: 'g', productId: 'leicht' },
    ], NOW, id);
    expect(p.history!.map((h) => [h.productId, Math.round(h.perUnit * 500 * 100) / 100])).toEqual([['normal', 3.29], ['leicht', 3.99]]);
  });
});
