import { describe, expect, it } from 'vitest';
import type { MealPlan } from './mealplan';
import type { MyProduct } from './nutrition/myProducts';
import { emptyPantry, type Pantry, type PantryItem } from './pantry';
import { merge3Pantry, merge3Plan, merge3Products, unionPantry, unionPlan, unionProducts } from './syncMerge';

// Erfundene Daten – zwei Geräte, „Handy“ (ours) und „Tablet“ (theirs)
const T = '2026-09-25T10:00:00.000Z';
const item = (id: string, name: string, amount?: number, unit: PantryItem['unit'] = 'g'): PantryItem =>
  ({ id, name, ...(amount !== undefined ? { amount, unit } : {}), addedAt: T });
const pantry = (items: PantryItem[], extra: Partial<Pantry> = {}): Pantry => ({ ...emptyPantry(), items, updatedAt: T, ...extra });
const amounts = (p: Pantry) => Object.fromEntries(p.items.map((i) => [i.name, i.amount ?? 'da']));

describe('Speisekammer: Änderung auf neueren Stand anwenden (merge3)', () => {
  const base = pantry([item('h', 'Hähnchenbrust', 400), item('q', 'Quark', 500)]);

  it('Bon auf dem Tablet, „Gekocht“ auf dem Handy: beides bleibt – Mengen werden verrechnet', () => {
    const tablet = pantry([item('h', 'Hähnchenbrust', 900), item('q', 'Quark', 500), item('m', 'Milch', 1000, 'ml')]); // +500 g, Milch neu
    const handy = pantry([item('q', 'Quark', 500)]); // Hähnchen ganz verkocht
    expect(amounts(merge3Pantry(base, handy, tablet))).toEqual({ Hähnchenbrust: 500, Quark: 500, Milch: 1000 });
  });

  it('nur eine Seite hat geändert → deren Stand', () => {
    const tablet = pantry([item('h', 'Hähnchenbrust', 400)]); // Quark entfernt
    expect(amounts(merge3Pantry(base, base, tablet))).toEqual({ Hähnchenbrust: 400 });
    expect(amounts(merge3Pantry(base, tablet, base))).toEqual({ Hähnchenbrust: 400 });
  });

  it('beide verbrauchen vom selben Vorrat → beides abgezogen; alles weg → Eintrag weg', () => {
    const handy = pantry([item('h', 'Hähnchenbrust', 100), item('q', 'Quark', 500)]);   // −300
    const tablet = pantry([item('h', 'Hähnchenbrust', 200), item('q', 'Quark', 300)]);  // −200, Quark −200
    expect(amounts(merge3Pantry(base, handy, tablet))).toEqual({ Quark: 300 });
  });

  it('gelernte Bon-Artikel, Bons und Preisverlauf beider Seiten bleiben', () => {
    const handy = pantry(base.items, { rules: [{ key: 'eier 10er', name: 'Eier', amount: 10, unit: 'Stück' }], receipts: ['2026-09-24|12.3'] });
    const tablet = pantry(base.items, { history: [{ name: 'Quark', perUnit: 0.003, unit: 'g', date: T }], receipts: ['2026-09-25|8.1'] });
    const m = merge3Pantry(base, handy, tablet);
    expect(m.rules.map((r) => r.key)).toEqual(['eier 10er']);
    expect(m.history).toHaveLength(1);
    expect(m.receipts).toEqual(['2026-09-25|8.1', '2026-09-24|12.3']);
  });
});

describe('Wochenplan: merge3', () => {
  const base: MealPlan = { items: [{ recipeId: 'a', servings: 2 }], checked: [], cooked: [], updatedAt: T };

  it('Handy plant ein Gericht ein, Tablet hakt Einkäufe ab und kocht – alles bleibt', () => {
    const handy: MealPlan = { ...base, items: [...base.items, { recipeId: 'b', servings: 4 }] };
    const tablet: MealPlan = { ...base, checked: ['food:reis'], cooked: ['a'] };
    const m = merge3Plan(base, handy, tablet);
    expect(m.items.map((i) => i.recipeId)).toEqual(['a', 'b']);
    expect([m.checked, m.cooked]).toEqual([['food:reis'], ['a']]);
  });

  it('Haken auf einer Seite zurückgenommen, auf der anderen etwas anderes abgehakt', () => {
    const b2: MealPlan = { ...base, checked: ['food:reis'] };
    const handy: MealPlan = { ...b2, checked: [] };
    const tablet: MealPlan = { ...b2, checked: ['food:reis', 'food:ei'] };
    expect(merge3Plan(b2, handy, tablet).checked).toEqual(['food:ei']);
  });
});

describe('Meine Produkte: merge3', () => {
  const p = (id: string, name: string, updatedAt = T): MyProduct => ({ id, name, replaces: [], per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, updatedAt });
  it('neu auf beiden Seiten → beide; dasselbe geändert → das zuletzt geänderte', () => {
    const base = [p('1', 'Milch')];
    const handy = [p('1', 'Milch 0,1 %', '2026-09-25T11:00:00.000Z'), p('2', 'Quark')];
    const tablet = [p('1', 'Milch 1,5 %', '2026-09-25T12:00:00.000Z'), p('3', 'Joghurt')];
    expect(merge3Products(base, handy, tablet).map((x) => x.name)).toEqual(['Milch 1,5 %', 'Joghurt', 'Quark']);
  });
});

describe('Offline-Konflikt ohne gemeinsamen Stand: vereinen', () => {
  it('Speisekammer: beide Bons bleiben; gleicher Eintrag → der neueren Fassung', () => {
    const a = pantry([item('h', 'Hähnchenbrust', 900), item('m', 'Milch', 1000, 'ml')], { updatedAt: '2026-09-25T12:00:00.000Z' });
    const b = pantry([item('h', 'Hähnchenbrust', 100), item('e', 'Eier', 10, 'Stück')], { updatedAt: '2026-09-25T11:00:00.000Z' });
    expect(amounts(unionPantry(a, b))).toEqual({ Hähnchenbrust: 900, Milch: 1000, Eier: 10 });
    expect(amounts(unionPantry(b, a))).toEqual({ Hähnchenbrust: 900, Milch: 1000, Eier: 10 });
  });
  it('Wochenplan und Produkte: nichts geht verloren', () => {
    const a: MealPlan = { items: [{ recipeId: 'x', servings: 2 }], checked: ['k1'], cooked: [], updatedAt: '2' };
    const b: MealPlan = { items: [{ recipeId: 'y', servings: 2 }], checked: ['k2'], cooked: ['y'], updatedAt: '1' };
    const m = unionPlan(a, b);
    expect([m.items.map((i) => i.recipeId), m.checked, m.cooked]).toEqual([['x', 'y'], ['k1', 'k2'], ['y']]);
    const pa = { id: '1', name: 'A', replaces: [], per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, updatedAt: '2' };
    expect(unionProducts([pa], [{ ...pa, name: 'A alt', updatedAt: '1' }, { ...pa, id: '2', name: 'B' }]).map((x) => x.name)).toEqual(['A', 'B']);
  });
});
