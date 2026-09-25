import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { buildShoppingList, resolveIngredient } from './mealplan';
import { localFoodTable } from './nutrition/localFoods';
import {
  alreadyImported, applyImport, bonKey, deductRecipe, emptyPantry, pantryAfterPlan, proposeImport, rememberReceipt, restock, takenBetween,
  type Pantry, type PantryItem,
} from './pantry';
import { parseIngredientLine } from './importText';
import { parseReceipt } from './receipt';
import type { Ingredient, Recipe, RecipeContent } from './types';

// Alles erfunden – keine echten Einkäufe
const NOW = '2026-09-25T10:00:00.000Z';
const item = (id: string, name: string, amount?: number, unit?: PantryItem['unit'], extra: Partial<PantryItem> = {}): PantryItem =>
  ({ id, name, ...(amount !== undefined ? { amount, unit } : {}), addedAt: NOW, boughtAt: NOW, ...extra });
const pantry = (...items: PantryItem[]): Pantry => ({ ...emptyPantry(), items });
const content = (ingredients: Ingredient[]): RecipeContent => ({
  title: 'T', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});
const base = createMockRecipes()[0];
const recipe = (id: string, ingredients: Ingredient[]): Recipe => ({
  ...structuredClone(base), id, status: 'kochbuch',
  versions: [{ ...base.versions[0], id: `${id}-v`, content: content(ingredients) }], currentVersionId: `${id}-v`,
});

describe('Abziehen über mehrere Vorräte', () => {
  it('300 g MHD + 400 g frisch, Rezept braucht 600 g → 100 g frisch bleiben', () => {
    const p = pantry(item('frisch', 'Hähnchenbrust', 400, 'g'), item('mhd', 'Hähnchenbrust', 300, 'g', { reduced: true }));
    const d = deductRecipe(p, content([{ id: '1', name: 'Hähnchenbrust', amount: 600, unit: 'g' }]), 2, localFoodTable);
    expect(d.pantry.items.map((i) => [i.id, i.amount])).toEqual([['frisch', 100]]);
    expect(d.used).toEqual(['Hähnchenbrust']);
  });

  it('verschiedene Einheiten: 1 Stück frisch + 300 g, Rezept braucht 2 Stück (je 150 g) → 150 g bleiben', () => {
    const p = pantry(item('a', 'Paprika', 1, 'Stück', { reduced: true }), item('b', 'Paprika', 300, 'g'));
    const d = deductRecipe(p, content([{ id: '1', name: 'Paprika', amount: 2, unit: 'Stück' }]), 2, localFoodTable);
    const piece = resolveIngredient({ id: 'x', name: 'Paprika', amount: 1, unit: 'Stück' }, 1, localFoodTable)!.grams!;
    expect(d.pantry.items.map((i) => [i.id, i.amount])).toEqual([['b', 300 - piece]]);
  });

  it('Dose im Rezept, Stück im Vorrat (vom Bon)', () => {
    const d = deductRecipe(pantry(item('k', 'Kokosmilch', 2, 'Stück')), content([{ id: '1', name: 'Kokosmilch', amount: 1, unit: 'Dose' }]), 2, localFoodTable);
    expect(d.pantry.items[0].amount).toBe(1);
  });
});

describe('Plan-Rest: gleiche Namen', () => {
  it('„Paprika“ ohne Menge ist verplant – „Paprika 3 Stück“ bleibt trotzdem', () => {
    const plan = { items: [{ recipeId: 'r', servings: 2 }], checked: [], cooked: [], updatedAt: '' };
    const r = recipe('r', [{ id: '1', name: 'Paprika', amount: 1, unit: 'Stück' }]);
    const rest = pantryAfterPlan(pantry(item('ohne', 'Paprika'), item('drei', 'Paprika', 3, 'Stück')), plan, [r], localFoodTable);
    // „Paprika“ ohne Menge deckt das Gericht (gilt als ausreichend) und ist damit verplant – die 3 Stück bleiben
    expect(rest.items.map((i) => [i.id, i.amount])).toEqual([['drei', 3]]);
  });
});

describe('Kassenbon', () => {
  const BON = 'EUR\nEier Freiland 10er 2,49 A\nZu zahlen 2,49';

  it('lernt die Packungsgröße auch in Stück: 10er-Eier sind beim nächsten Bon wieder 10 Stück', () => {
    const [row] = proposeImport(parseReceipt(BON), []);
    const first = applyImport(emptyPantry(), [{ ...row, name: 'Eier', amount: 10, unit: 'Stück' }], NOW);
    const [again] = proposeImport(parseReceipt(BON), first.rules);
    expect([again.amount, again.unit]).toEqual([10, 'Stück']);
    expect(first.prices[0].unit).toBe('Stück');
    expect(first.prices[0].perUnit).toBeCloseTo(0.249);
  });

  it('merkt sich importierte Bons; derselbe Bon verdoppelt den Preisverlauf nicht', () => {
    const key = bonKey(NOW, 2.49);
    const p = rememberReceipt(emptyPantry(), key);
    expect(alreadyImported(p, key)).toBe(true);
    expect(alreadyImported(p, bonKey(NOW, 3.1))).toBe(false);
    expect(bonKey(NOW, undefined)).toBeUndefined();
    const [row] = proposeImport(parseReceipt(BON), []);
    const r = { ...row, name: 'Eier', amount: 10, unit: 'Stück' as const };
    const twice = applyImport(applyImport(emptyPantry(), [r], NOW, undefined, NOW), [r], NOW, undefined, NOW);
    expect(twice.history).toHaveLength(1);
  });
});

describe('Art am Namen – ohne Konserven und Saucen', () => {
  const kind = (name: string) => resolveIngredient({ id: '1', name }, 1, localFoodTable)?.kind;
  it('Frisches ja', () => {
    expect(['Putenschnitzel', 'Lachsfilet', 'Thunfischsteak', 'Ricotta'].map(kind)).toEqual(['protein', 'protein', 'protein', 'dairy']);
  });
  it('Brühe, Fischsauce, Thunfisch (Dose), Kondensmilch, Kokosmilch nein', () => {
    expect(['Rinderbrühe', 'Fischsauce', 'Thunfisch', 'Kondensmilch', 'Kokosmilch'].map(kind)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('Text-Import: Wörter sind keine Einheiten', () => {
  const brief = (line: string) => {
    const i = parseIngredientLine(line);
    return [i.amount, i.unit, i.name].filter((v) => v !== undefined).join(' | ');
  };
  it('„gehäufter“, „gestrichener“, „gepresste“, „lauchzwiebeln“', () => {
    expect(brief('1 gehäufter EL Mehl')).toBe('1 | gehäufter EL Mehl');
    expect(brief('1 gestrichener TL Salz')).toBe('1 | gestrichener TL Salz');
    expect(brief('1 gepresste Knoblauchzehe')).toBe('1 | gepresste Knoblauchzehe');
    expect(brief('2 lauchzwiebeln')).toBe('2 | lauchzwiebeln');
  });
  it('„Liter“ ist eine Einheit; zaubermix-Klebungen gehen weiter', () => {
    expect(brief('1 Liter Milch')).toBe('1 | l | Milch');
    expect(brief('30 ggeriebener Parmesan')).toBe('30 | g | geriebener Parmesan');
    expect(brief('200 geingelegte Paprika')).toBe('200 | g | eingelegte Paprika');
  });
});

describe('Einkaufsliste mit Speisekammer', () => {
  const r = recipe('h', [
    { id: '1', name: 'Hähnchenbrust', amount: 600, unit: 'g' },
    { id: '2', name: 'Paprika', amount: 2, unit: 'Stück' },
    { id: '3', name: 'Salz' },
  ]);
  const plan = (cooked: string[] = []) => ({ items: [{ recipeId: 'h', servings: 2 }], checked: [], cooked, updatedAt: '' });
  const list = (p?: Pantry, cooked?: string[]) => buildShoppingList(plan(cooked), [r], localFoodTable, p);
  const find = (items: ReturnType<typeof list>, name: string) => items.find((i) => i.name === name)!;

  it('600 g geplant, 500 g da → „100 g“ mit „500 g vorrätig“', () => {
    const h = find(list(pantry(item('a', 'Hähnchenbrust', 500, 'g'))), 'Hähnchenbrust');
    expect([h.quantity, h.have, !!h.covered]).toEqual(['100 g', '500 g', false]);
  });

  it('reicht der Vorrat, ist der Eintrag „covered“ – auch über mehrere Vorräte und Einheiten', () => {
    const items = list(pantry(item('a', 'Hähnchenbrust', 400, 'g'), item('b', 'Hähnchenbrust', 300, 'g', { frozenAt: NOW }), item('p', 'Paprika', 3, 'Stück')));
    expect(find(items, 'Hähnchenbrust')).toMatchObject({ covered: true, have: '400 g + 300 g (gefroren)' });
    expect(find(items, 'Paprika')).toMatchObject({ covered: true, have: '3 Stück' });
  });

  it('Vorrat ohne Menge ist nur ein Hinweis – außer das Rezept nennt selbst keine Menge', () => {
    const items = list(pantry(item('a', 'Hähnchenbrust'), item('s', 'Salz', 500, 'g')));
    expect(find(items, 'Hähnchenbrust')).toMatchObject({ quantity: '600 g', have: 'vorhanden' });
    expect(find(items, 'Hähnchenbrust').covered).toBeUndefined();
    expect(find(items, 'Salz').covered).toBe(true);
  });

  it('„Doch kaufen“: volle Menge, Vorrat nur als Hinweis', () => {
    const items = buildShoppingList({ ...plan(), buy: ['food:haehnchenbrust'] }, [r], localFoodTable, pantry(item('a', 'Hähnchenbrust', 700, 'g')));
    expect(find(items, 'Hähnchenbrust')).toMatchObject({ quantity: '600 g', have: '700 g' });
    expect(find(items, 'Hähnchenbrust').covered).toBeUndefined();
  });

  it('schon Gekochtes steht nicht mehr auf der Liste', () => {
    expect(list(undefined, ['h'])).toEqual([]);
  });
});

describe('Gekocht zurücknehmen', () => {
  it('legt genau das zurück, was genommen wurde – auch ganz Aufgebrauchtes', () => {
    const before = pantry(item('a', 'Hähnchenbrust', 300, 'g', { reduced: true }), item('b', 'Hähnchenbrust', 400, 'g'), item('c', 'Paprika'));
    const r = recipe('h', [{ id: '1', name: 'Hähnchenbrust', amount: 600, unit: 'g' }, { id: '2', name: 'Paprika', amount: 1, unit: 'Stück' }]);
    const after = deductRecipe(before, r.versions[0].content, 2, localFoodTable).pantry;
    const taken = takenBetween(before, after);
    expect(taken.map((t) => [t.item.id, t.amount])).toEqual([['a', 300], ['b', 300], ['c', undefined]]);
    const back = restock(after, taken);
    expect(back.items.map((i) => [i.id, i.amount, !!i.check, !!i.reduced]).sort()).toEqual([
      ['a', 300, false, true], ['b', 400, false, false], ['c', undefined, false, false],
    ]);
  });

  it('relativ: was inzwischen dazukam, bleibt', () => {
    const before = pantry(item('b', 'Hähnchenbrust', 400, 'g'));
    const taken = [{ item: before.items[0], amount: 300 }];
    const meanwhile = pantry(item('b', 'Hähnchenbrust', 600, 'g')); // 100 g Rest + 500 g vom neuen Bon
    expect(restock(meanwhile, taken).items[0].amount).toBe(900);
  });
});
