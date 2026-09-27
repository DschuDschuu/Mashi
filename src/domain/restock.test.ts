import { describe, expect, it } from 'vitest';
import type { MealPlan } from './mealplan';
import type { MyProduct } from './nutrition/myProducts';
import { localFoodTable } from './nutrition/localFoods';
import { emptyPantry, type Pantry, type PantryItem } from './pantry';
import { RESTOCK_PREFIX, restockNeeds, shoppingList, type RestockRule } from './restock';
import type { Recipe } from './types';

const T = localFoodTable;
const NOW = '2026-09-27T12:00:00.000Z';
let n = 0;
const item = (name: string, amount?: number, unit?: PantryItem['unit'], extra: Partial<PantryItem> = {}): PantryItem =>
  ({ id: `i${n++}`, name, amount, unit, addedAt: NOW, ...extra });
const pantry = (items: PantryItem[], restock: RestockRule[], rest: Partial<Pantry> = {}): Pantry =>
  ({ ...emptyPantry(), items, restock, ...rest });
const TOMATEN: RestockRule = { name: 'Passierte Tomaten', below: 4, unit: 'Stück' };

describe('Nachkaufen (Mindestbestand)', () => {
  it('unter der Grenze → Hinweis mit Vorrat, an der Grenze nicht', () => {
    const [need] = restockNeeds(pantry([item('Passierte Tomaten', 3, 'Stück')], [TOMATEN]), T);
    expect(need.label).toBe('Im Vorrat 3 Stück · Nachkaufen unter 4 Stück');
    expect(restockNeeds(pantry([item('Passata', 4, 'Stück')], [TOMATEN]), T)).toEqual([]);
  });

  it('gar nichts mehr da → „Nichts mehr im Vorrat“', () => {
    expect(restockNeeds(pantry([], [TOMATEN]), T)[0].label).toBe('Nichts mehr im Vorrat · Nachkaufen unter 4 Stück');
  });

  it('Vorrat ohne Menge („vorhanden“) → lieber kein Hinweis', () => {
    expect(restockNeeds(pantry([item('Passierte Tomaten')], [TOMATEN]), T)).toEqual([]);
  });

  it('vom Bon in Gramm: rechnet mit der gelernten Packungsgröße um', () => {
    const rules = [{ key: 'mozzarella light', name: 'Mozzarella', amount: 125, unit: 'g' as const }];
    const p = pantry([item('Mozzarella', 250, 'g')], [{ name: 'Mozzarella', below: 3, unit: 'Stück' }], { rules });
    expect(restockNeeds(p, T)[0].label).toBe('Im Vorrat ca. 2 Stück · Nachkaufen unter 3 Stück');
  });

  it('Packungsgröße eines eigenen Produkts geht vor', () => {
    const mais: MyProduct = { id: 'pm', name: 'Mais', replaces: ['mais'], per100g: { kcal: 80, protein: 2.5, carbs: 14, fat: 1.2 }, packageAmount: 300, packageUnit: 'g', updatedAt: NOW };
    const p = pantry([item('Mais', 1200, 'g', { productId: 'pm' })], [{ name: 'Mais', below: 4, unit: 'Stück' }]);
    expect(restockNeeds(p, T, [mais])).toEqual([]); // 4 Dosen à 300 g
  });

  it('nicht umrechenbar (Gramm ohne bekannte Packung) → kein Hinweis statt Raten', () => {
    expect(restockNeeds(pantry([item('Mais', 500, 'g')], [{ name: 'Mais', below: 4, unit: 'Stück' }]), T)).toEqual([]);
  });

  it('zählt, was nach dem Wochenplan übrig bleibt', () => {
    const now = pantry([item('Passierte Tomaten', 5, 'Stück')], [TOMATEN]);
    const after = pantry([item('Passierte Tomaten', 3, 'Stück')], [TOMATEN]);
    expect(restockNeeds(now, T, [], after)[0].label).toBe('Nach dem Wochenplan noch 3 Stück · Nachkaufen unter 4 Stück');
  });
});

describe('Einkaufsliste mit Nachkaufen', () => {
  const plan = (items: MealPlan['items'] = []): MealPlan => ({ items, checked: [], cooked: [], updatedAt: NOW });
  const recipe: Recipe = {
    id: 'r1', status: 'bewaehrt', createdAt: NOW, updatedAt: NOW, currentVersion: 1,
    versions: [{ version: 1, createdAt: NOW, content: {
      title: 'Tomatensoße', servings: 2, tags: [], steps: [],
      ingredients: [{ id: 'a', name: 'Passierte Tomaten', amount: 1, unit: 'Dose' }],
    } }],
  } as unknown as Recipe;

  it('ohne Plan: steht trotzdem auf der Liste – eigener Schlüssel, ohne Menge', () => {
    const list = shoppingList(plan(), [], T, pantry([item('Passierte Tomaten', 2, 'Stück')], [TOMATEN]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: expect.stringMatching(new RegExp(`^${RESTOCK_PREFIX}`)), name: 'Passierte Tomaten', quantity: '', pantry: false });
    expect(list[0].restock).toContain('Nachkaufen unter 4');
  });

  it('der Plan braucht die letzte Dose: „Hast du schon“ wird zu „Nachkaufen“', () => {
    const list = shoppingList(plan([{ recipeId: 'r1', servings: 2 }]), [recipe], T, pantry([item('Passierte Tomaten', 4, 'Stück')], [TOMATEN]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ covered: false, pantry: false, quantity: '' });
    expect(list[0].restock).toBe('Nach dem Wochenplan noch 3 Stück · Nachkaufen unter 4 Stück');
  });

  it('ohne Regeln bleibt die Liste wie sie war', () => {
    expect(shoppingList(plan(), [], T, pantry([item('Passierte Tomaten', 1, 'Stück')], []))).toEqual([]);
  });
});
