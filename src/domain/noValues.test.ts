import { describe, expect, it } from 'vitest';
import { adoptCandidates } from './adoptFoods';
import type { SavedBon } from './bons';
import { computeNutrition } from './nutrition/engine';
import { localFoodTable } from './nutrition/localFoods';
import { fillOrAdd, isValidProduct, productsFor, withMyProducts, type MyProduct } from './nutrition/myProducts';
import type { PantryItem } from './pantry';
import { estimateDays } from './shelfLife';
import type { RecipeContent } from './types';

const NOW = '2026-10-03T10:00:00.000Z';
const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const bare = (id: string, name: string, more: Partial<MyProduct> = {}): MyProduct =>
  ({ id, name, replaces: [], per100g: ZERO, noValues: true, updatedAt: NOW, ...more });
const content = (name: string, amount = 100): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount, unit: 'g' }], steps: [], categories: [], tags: [], devices: [],
});
const kcal = (name: string, products: MyProduct[]) => computeNutrition(content(name), withMyProducts(localFoodTable, products)).perServing?.kcal;

describe('Lebensmittel ohne eigene Nährwerte (Julia: „Meine Lebensmittel“ als zentrale Stelle)', () => {
  it('rechnet mit der Tabelle – genau wie ohne Produkt', () => {
    const p = bare('p1', 'Paprika', { replaces: ['paprika'], shelfDays: 10 });
    expect(kcal('Paprika', [p])).toBeCloseTo(kcal('Paprika', [])!);
    const food = withMyProducts(localFoodTable, [p]).matchName('Paprika')!.food;
    expect(food.shelfDays).toBe(10); // … aber mit deiner Haltbarkeit
    expect(food.noValues).toBeUndefined();
  });

  it('nur ungefähr bekannt („Bio Paprika rot“ → Paprika): rechnet weiter ungefähr mit dem Treffer', () => {
    const p = bare('p2', 'Bio Paprika rot', { names: ['bio paprika rot'] });
    const m = withMyProducts(localFoodTable, [p]).matchName('Bio Paprika rot')!;
    expect(m.quality).toBe('approx');
    expect(m.food.per100g.kcal).toBeCloseTo(localFoodTable.matchName('Paprika')!.food.per100g.kcal);
  });

  it('kennt auch die Tabelle es nicht: Werte fehlen (wie vorher) – keine 0 kcal', () => {
    const n = computeNutrition(content('Kimchi'), withMyProducts(localFoodTable, [bare('p3', 'Kimchi', { names: ['kimchi'] })]));
    expect(n.items[0].status).toBe('unmatched');
  });

  it('Sorten: die ohne Werte zählen beim Durchschnitt nicht mit, wenn die Tabelle sie nicht kennt', () => {
    const own = { id: 'p4', name: 'Kimchi', brand: 'A', replaces: [], names: ['kimchi'], per100g: { kcal: 40, protein: 2, carbs: 5, fat: 1 }, updatedAt: NOW };
    const food = withMyProducts(localFoodTable, [own, bare('p5', 'Kimchi', { brand: 'B', names: ['kimchi'] })]).matchName('Kimchi')!.food;
    expect(food.per100g.kcal).toBe(40);
    expect(food.variants).toHaveLength(2);
  });

  it('wird als gültig gesichert und wieder eingelesen', () => {
    expect(isValidProduct(bare('p6', 'Paprika'))).toBe(true);
  });
});

describe('Werte nachtragen: die eine Sorte ohne Werte füllt sich', () => {
  const old = bare('alt', 'Kimchi', { names: ['kimchi'], shelfDays: 30 });
  const labelled: MyProduct = { id: 'neu', name: 'Kimchi', brand: 'Hausmarke', replaces: [], names: ['kimchi'], per100g: { kcal: 40, protein: 2, carbs: 5, fat: 1 }, updatedAt: NOW };

  it('statt zwei Sorten eine – mit der alten ID und Haltbarkeit', () => {
    const table = withMyProducts(localFoodTable, [old]);
    const group = productsFor('Kimchi', table, [old]);
    expect(group.map((p) => p.id)).toEqual(['alt']);
    const { products, saved } = fillOrAdd([old], labelled, group);
    expect(products).toHaveLength(1);
    expect(saved).toMatchObject({ id: 'alt', brand: 'Hausmarke', shelfDays: 30, per100g: { kcal: 40 } });
    expect(saved.noValues).toBeUndefined();
  });

  it('andere Marke oder schon Werte da: eine weitere Sorte', () => {
    expect(fillOrAdd([old], labelled, [{ ...old, brand: 'Andere' }]).products).toHaveLength(2);
    const valued = { ...labelled, id: 'v' };
    expect(fillOrAdd([valued], { ...labelled, brand: 'B' }, [valued]).products).toHaveLength(2);
  });
});

describe('Aus Vorrat & Bons übernehmen', () => {
  const item = (name: string, more: Partial<PantryItem> = {}): PantryItem => ({ id: name, name, amount: 1, unit: 'Stück', addedAt: NOW, ...more });
  const bon = (names: string[], more: Partial<SavedBon['lines'][number]> = {}): SavedBon =>
    ({ id: 'b', date: NOW, lines: names.map((name) => ({ bon: name, count: 1, name, ...more })), updatedAt: NOW });
  let n = 0;
  const id = () => `neu${n++}`;

  it('je Lebensmittel eins – der Name aus dem Vorrat gewinnt, ohne Werte, „gilt für“ wie im Formular', () => {
    const out = adoptCandidates([item('Paprika')], [bon(['Paprika', 'Kimchi'])], localFoodTable, [], NOW, id);
    expect(out.map((p) => p.name)).toEqual(['Paprika', 'Kimchi']);
    expect(out[0]).toMatchObject({ replaces: ['paprika'], noValues: true });
    expect(out[1]).toMatchObject({ replaces: [], names: ['kimchi'] });
  });

  it('lässt aus: schon eine Kachel, Immer im Haus/Gewürze, Vorgekochtes, übersprungene Bon-Zeilen', () => {
    const products = [bare('p', 'Paprika', { replaces: ['paprika'] })];
    const out = adoptCandidates(
      [item('Paprika'), item('Reis'), item('Chili con Carne', { recipeId: 'r1' }), item('Mozzarella', { productId: 'x' })],
      [bon(['Pfand'], { skip: true })],
      withMyProducts(localFoodTable, products), ['Reis'], NOW, id,
    );
    expect(out).toEqual([]);
  });
});

describe('Haltbarkeit: Mashis Schätzung in der Kachel', () => {
  it('Richtwert des Lebensmittels – dein eigener Wert dafür zählt nicht als Schätzung', () => {
    expect(estimateDays('Paprika', localFoodTable)).toEqual({ id: 'paprika', days: 7 });
    expect(estimateDays('Paprika', localFoodTable, { foods: { paprika: 12 } }).days).toBe(7);
  });

  it('sonst der Wert der Art (auch deiner); unbekannt = hält lange', () => {
    expect(estimateDays('Zucchini', localFoodTable, { kinds: { vegetable: 6 } }).days).toBe(6);
    expect(estimateDays('Kimchi', localFoodTable).days).toBeUndefined();
  });
});
