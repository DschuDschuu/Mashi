import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { buildShoppingList, type MealPlan } from './mealplan';
import { localFoodTable as T } from './nutrition/localFoods';
import { deductRecipe, emptyPantry, type Pantry, type PantryItem } from './pantry';
import { addPrepared, eatPrepared, preparedOf } from './prepared';
import { amountLabel } from './pantryLabel';
import { useByOf, useUpKeys } from './shelfLife';
import type { Ingredient, Recipe } from './types';

const NOW = '2026-09-28T12:00:00.000Z';
let n = 0;
const id = () => `x${n++}`;
const base = createMockRecipes()[0];
const recipe = (rid: string, title: string, ingredients: Ingredient[]): Recipe => ({
  ...structuredClone(base), id: rid, status: 'kochbuch',
  versions: [{ ...base.versions[0], id: `${rid}-v`, content: { ...base.versions[0].content, title, servings: 2, ingredients } }], currentVersionId: `${rid}-v`,
});
const prepared = (name: string, portions: number, extra: Partial<PantryItem> = {}): PantryItem =>
  ({ id: id(), name, amount: portions, unit: 'Stück', addedAt: NOW, boughtAt: NOW, recipeId: 'r-prep', ...extra });

describe('Vorgekocht', () => {
  it('übrige Portionen eintragen: „3 Portionen“; 0 übrig → nichts', () => {
    const { items, item } = addPrepared([], { id: 'r1', title: 'Bolognese' }, 3, NOW, id);
    expect(items.map(amountLabel)).toEqual(['3 Portionen']);
    expect(item?.recipeId).toBe('r1');
    expect(addPrepared([], { id: 'r1', title: 'Bolognese' }, 0, NOW, id).items).toEqual([]);
  });

  it('gegessen: 3 → 2, die letzte Portion → weg', () => {
    const p = prepared('Bolognese', 3);
    expect(eatPrepared([p], p.id).map(amountLabel)).toEqual(['2 Portionen']);
    expect(eatPrepared([{ ...p, amount: 1 }], p.id)).toEqual([]);
  });

  it('frisch und gefroren getrennt gezählt', () => {
    const p: Pantry = { ...emptyPantry(), items: [prepared('Curry', 2, { recipeId: 'c' }), prepared('Curry', 3, { recipeId: 'c', frozenAt: NOW })] };
    expect(preparedOf(p, 'c')).toMatchObject({ fresh: 2, frozen: 3 });
  });

  it('hält im Kühlschrank 3 Tage (einstellbar), eingefroren 3 Monate', () => {
    const day = (d?: Date) => d?.toISOString().slice(0, 10);
    expect(day(useByOf(prepared('Bolognese', 3), T))).toBe('2026-10-01');
    expect(day(useByOf(prepared('Bolognese', 3), T, { prepared: 2 }))).toBe('2026-09-30');
    expect(day(useByOf(prepared('Bolognese', 3, { frozenAt: NOW }), T))).toBe('2026-12-27');
  });

  it('ist nie eine Zutat: vorgekochtes „Pesto“ wird beim Pesto-Rezept nicht abgezogen und deckt keinen Einkauf', () => {
    const p: Pantry = { ...emptyPantry(), items: [prepared('Pesto', 3)] };
    const pasta = recipe('r2', 'Pasta', [{ id: 'a', name: 'Pesto', amount: 1, unit: 'Glas' }]);
    const d = deductRecipe(p, pasta.versions[0].content, 2, T);
    expect(d.pantry.items.map(amountLabel)).toEqual(['3 Portionen']);
    expect(d.stock.get('a')).toBe('fehlt');
    const plan: MealPlan = { items: [{ recipeId: 'r2', servings: 2 }], checked: [], cooked: [], updatedAt: NOW };
    const [item] = buildShoppingList(plan, [pasta], T, p);
    expect(item.covered).toBeUndefined();
    expect(item.have).toBeUndefined();
  });

  it('macht kein Rezept „passend zum Aufbrauchen“', () => {
    const p: Pantry = { ...emptyPantry(), items: [prepared('Pesto', 1, { boughtAt: '2026-09-25T12:00:00.000Z' })] };
    expect(useUpKeys(p, T, new Date(NOW)).size).toBe(0);
  });
});
