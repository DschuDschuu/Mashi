import { describe, expect, it } from 'vitest';
import { baseSupply, coveredShare, preparedPortions } from './baseStock';
import { cookingContent } from './homemade';
import { buildShoppingList, emptyPlan, type MealPlan } from './mealplan';
import { sideContent } from './mix';
import { emptyPantry, type PantryItem } from './pantry';
import type { Ingredient, Recipe } from './types';
import { foodTable } from '../services';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const recipe = (id: string, title: string, servings: number, ingredients: Ingredient[]): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '', currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(title), servings, ingredients, steps: [] } }],
});
const bolo = recipe('bolo', 'Testbolognese', 4, [{ id: 'h', name: 'Rinderhack', amount: 400, unit: 'g' }]);
// Pasta für 4: 4 Portionen Bolognese (1 je Portion)
const pasta = recipe('pasta', 'Testpasta Bolognese', 4, [
  { id: 'l', name: 'Testbolognese', amount: 4, unit: 'Portion', recipeId: 'bolo' },
  { id: 'p', name: 'Spaghetti', amount: 400, unit: 'g' },
]);
const wraps = recipe('wraps', 'Testwraps', 1, [{ id: 'l', name: 'Testbolognese', amount: 1, unit: 'Portion', recipeId: 'bolo' }]);
const all = [bolo, pasta, wraps];
const prepared = (amount: number, extra: Partial<PantryItem> = {}): PantryItem => ({ id: `v${amount}`, name: 'Testbolognese', recipeId: 'bolo', amount, unit: 'Stück', addedAt: '', ...extra });
const plan = (...items: [string, number][]): MealPlan => ({ ...emptyPlan(), items: items.map(([recipeId, servings]) => ({ recipeId, servings })) });

describe('Vorgekochtes im normalen Plan (Julia: „die Bolognese steht schon im Kühlschrank“)', () => {
  it('Portionen je Grundlage: ganze Gerichte, auch gefroren – Teile („Sauce für …“) nicht', () => {
    expect(Object.fromEntries(preparedPortions([prepared(2), prepared(1, { id: 'f', frozenAt: 'x' }), { recipeId: 'bolo', part: 'Sauce', amount: 3 }]))).toEqual({ bolo: 3 });
  });

  it('reicht es nicht, steht dabei, wie viel da ist („nur 2 von 4“) – der Rest wird frisch gemacht', () => {
    const s = baseSupply(plan(['pasta', 4]), all, [prepared(2)]);
    expect(s.get('pasta')).toEqual([{ baseId: 'bolo', name: 'Testbolognese', need: 4, have: 2, source: 'vorrat' }]);
    // im Rezept bleiben nur die 2 fehlenden Portionen – aufgelöst die halbe Bolognese
    const c = cookingContent(pasta, all, [], coveredShare(s.get('pasta')));
    expect(c.ingredients.find((i) => i.name === 'Rinderhack')?.amount).toBe(200);
  });

  it('zwei Gerichte teilen sich das Vorgekochte in Plan-Reihenfolge; nichts da = keine Meldung', () => {
    const s = baseSupply(plan(['wraps', 2], ['pasta', 4]), all, [prepared(3)]);
    expect(s.get('wraps')![0]).toMatchObject({ need: 2, have: 2 });
    expect(s.get('pasta')![0]).toMatchObject({ need: 4, have: 1 });
    expect(baseSupply(plan(['pasta', 4]), all, []).size).toBe(0);
  });

  it('Grundlage selbst eingeplant: kommt von dort; Grundlagen der Vorkoch-Woche regelt die Woche', () => {
    expect(baseSupply(plan(['bolo', 4], ['pasta', 4]), all, []).get('pasta')![0]).toMatchObject({ source: 'plan', have: 4 });
    expect(baseSupply(plan(['pasta', 4]), all, [prepared(4)], ['bolo']).size).toBe(0);
  });

  it('Einkaufsliste: genug vorgekocht → keine Bolognese-Zutaten; zu wenig → nur für den Rest; eingeplant → nur einmal', () => {
    const hack = (p: MealPlan, items: PantryItem[] = []) =>
      buildShoppingList(p, all, foodTable, { ...emptyPantry(), items }).find((x) => x.name === 'Rinderhack')?.quantity;
    expect(hack(plan(['pasta', 4]), [prepared(4)])).toBeUndefined();
    expect(hack(plan(['pasta', 4]), [prepared(2)])).toBe('200 g');
    expect(hack(plan(['pasta', 4]))).toBe('400 g');
    expect(hack(plan(['bolo', 4], ['pasta', 4]))).toBe('400 g'); // nur die eingeplante Bolognese, nicht noch einmal für die Pasta
  });
});
