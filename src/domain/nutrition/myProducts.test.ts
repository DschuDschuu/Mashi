import { describe, expect, it } from 'vitest';
import type { RecipeContent } from '../types';
import { computeNutrition } from './engine';
import { localFoodTable } from './localFoods';
import { brandOf, nameOf, packSizesOf, productLabel, sharedOf, sortTags, splitBrand, withMyProducts, withShared, type MyProduct } from './myProducts';

const milk: MyProduct = {
  id: 'p-milch', name: 'Milch 0,1 % (Test)', replaces: ['milch', 'milch-fettarm', 'magermilch'],
  per100g: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 }, updatedAt: '2026-09-24T00:00:00Z',
};
const content = (name: string, amount: number, unit: 'ml' | 'g' | 'EL'): RecipeContent => ({
  title: 't', description: '', servings: 1, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients: [{ id: 'a', name, amount, unit }], steps: [], categories: [], tags: [], devices: [],
});

describe('Meine Produkte', () => {
  const table = withMyProducts(localFoodTable, [milk]);

  it('rechnet Milch in deiner Stufe mit dem eigenen Produkt – andere Stufen mit der Tabelle', () => {
    for (const name of ['Milch', 'Magermilch (0,1 %)', 'Milch 0,1 %']) {
      const n = computeNutrition(content(name, 100, 'g'), table);
      expect(n.perServing!.kcal, name).toBeCloseTo(35);
      expect(n.items[0].food?.name, name).toBe('Milch 0,1 % · Test'); // Anzeige: Name · Marke
    }
    // ausdrücklich eine andere Fettstufe (siehe fatLevels.ts): nicht dein 0,1-%-Produkt
    expect(computeNutrition(content('Vollmilch', 100, 'g'), table).perServing!.kcal).toBeCloseTo(64);
    expect(computeNutrition(content('Fettarme Milch', 100, 'g'), table).perServing!.kcal).toBeCloseTo(47);
  });

  it('übernimmt die Dichte des ersetzten Eintrags (ml → g)', () => {
    // Milch: 1,03 g/ml → 100 ml = 103 g → 36,05 kcal
    expect(computeNutrition(content('Milch', 100, 'ml'), table).perServing!.kcal).toBeCloseTo(36.05);
  });

  it('lässt alles andere unverändert – Hafermilch ist keine Milch', () => {
    expect(computeNutrition(content('Hafermilch', 100, 'g'), table).perServing!.kcal).toBeCloseTo(45);
    expect(computeNutrition(content('Reis', 100, 'g'), table).perServing!.kcal).toBeCloseTo(350);
  });

  it('behält die Genauigkeit: ungefähre Zuordnung bleibt „geschätzt“', () => {
    const n = computeNutrition(content('Milch vom Bauernhof', 100, 'g'), table);
    expect(n.accuracy).toBe('geschaetzt');
    expect(n.items[0].food?.name).toBe('Milch 0,1 % · Test') // Anzeige: Name · Marke;
  });

  it('ohne Produkte ist die Tabelle genau die alte', () => {
    expect(withMyProducts(localFoodTable, [])).toBe(localFoodTable);
  });
});

describe('Produkte für unbekannte Zutaten', () => {
  const kimchi: MyProduct = {
    id: 'p-kimchi', name: 'Kimchi', replaces: [], names: ['kimchi'],
    per100g: { kcal: 23, protein: 1.7, carbs: 2.4, fat: 0.5 }, updatedAt: '2026-09-24T00:00:00Z',
  };
  const table = withMyProducts(localFoodTable, [kimchi]);

  it('vorher unbekannt, danach genau berechnet – auch mit Zusatz in Klammern', () => {
    expect(computeNutrition(content('Kimchi', 100, 'g'), localFoodTable).items[0].status).toBe('unmatched');
    const n = computeNutrition(content('Kimchi (vegan)', 200, 'g'), table);
    expect(n.accuracy).toBe('berechnet');
    expect(n.perServing!.kcal).toBeCloseTo(46);
  });

  it('Löffel rechnet es wie überall über 15 ml (Dichte 1)', () => {
    const n = computeNutrition(content('Kimchi', 2, 'EL'), table);
    expect(n.items[0]).toMatchObject({ status: 'exact', grams: 30 });
  });

  it('eigene Namen gewinnen vor der allgemeinen Tabelle', () => {
    const own = { ...kimchi, id: 'p-reis', name: 'Mein Reis', names: ['reis'] };
    expect(withMyProducts(localFoodTable, [own]).matchName('Reis')?.food.name).toBe('Mein Reis');
  });
});

describe('Produkt an seinem eigenen Namen', () => {
  it('„Milch 0,1 % (Test)“ findet dein Produkt – samt Dichte der ersetzten Milch (ml → g)', () => {
    const table = withMyProducts(localFoodTable, [milk]);
    const n = computeNutrition(content('Milch 0,1 % (Test)', 100, 'ml'), table);
    expect(n.items[0].food?.name).toBe('Milch 0,1 % · Test') // Anzeige: Name · Marke;
    expect(n.perServing!.kcal).toBeCloseTo(36.05); // 100 ml × 1,03 g/ml
  });
});

describe('Marke', () => {
  it('trennt die Marke aus der Klammer – aber nur, wenn es nach einer Marke aussieht', () => {
    expect(splitBrand('Pesto verde (K-Classic)')).toEqual({ name: 'Pesto verde', brand: 'K-Classic' });
    expect(splitBrand('Joghurt (fettarm)')).toEqual({ name: 'Joghurt (fettarm)' });
    expect(splitBrand('Milch (1,5 %)')).toEqual({ name: 'Milch (1,5 %)' });
    expect(splitBrand('Reis (z. B. Basmati)')).toEqual({ name: 'Reis (z. B. Basmati)' });
    expect(splitBrand('Gochujang')).toEqual({ name: 'Gochujang' });
  });

  it('eingetragene Marke geht vor, ältere Namen werden beim Anzeigen getrennt', () => {
    const old = { name: 'Joghurt 0,1 % (Hausmarke)' };
    expect([nameOf(old), brandOf(old), productLabel(old)]).toEqual(['Joghurt 0,1 %', 'Hausmarke', 'Joghurt 0,1 % · Hausmarke']);
    const neu = { name: 'Pesto (grün)', brand: 'Beispiel' };
    expect([nameOf(neu), brandOf(neu), productLabel(neu)]).toEqual(['Pesto (grün)', 'Beispiel', 'Pesto (grün) · Beispiel']);
  });

  it('Zusatz einer Sorte („leicht“) steht vor der Marke – auch ohne Marke', () => {
    expect(productLabel({ name: 'Rinderhack', detail: 'leicht', brand: 'Beispiel' })).toBe('Rinderhack · leicht · Beispiel');
    expect(productLabel({ name: 'Rinderhack', detail: 'leicht' })).toBe('Rinderhack · leicht');
    expect(sortTags({ name: 'Rinderhack', detail: 'leicht', brand: 'Beispiel' })).toEqual(['leicht', 'Beispiel']);
    expect(sortTags({ name: 'Rinderhack' })).toEqual([]);
  });
});

describe('Ausnahmen bei „Gilt für“', () => {
  const skim: MyProduct = { ...milk, excludes: ['vollmilch'] };
  const t = withMyProducts(localFoodTable, [skim]);
  it('gilt nicht für ausgenommene Schreibweisen – dort rechnet der Richtwert', () => {
    expect(computeNutrition(content('Milch', 100, 'g'), t).perServing!.kcal).toBeCloseTo(35);
    const voll = computeNutrition(content('Vollmilch', 100, 'g'), t);
    expect(voll.items[0].food?.ref.provider).toBe('mashi-lokal');
    expect(voll.perServing!.kcal).not.toBeCloseTo(35);
  });
  it('erkennt die Schreibweise auch mit Zusätzen', () => {
    expect(t.matchName('frische Vollmilch')?.food.ref.provider).toBe('mashi-lokal');
  });
});

describe('Sorten: Name und „gilt für“ gemeinsam', () => {
  const sort = (id: string, extra: Partial<MyProduct>): MyProduct => ({
    id, name: 'Pesto', replaces: [], per100g: { kcal: 400, protein: 5, carbs: 6, fat: 40 }, updatedAt: '2026-09-01T00:00:00.000Z', ...extra,
  });

  it('alte, abweichende Sorten: Name vom Favoriten, Namen und Ersetztes zusammen, Ausnahmen nur gemeinsame', () => {
    const a = sort('a', { name: 'Pesto', brand: 'K-Classic', names: ['pesto'], excludes: ['pesto rosso'] });
    const b = sort('b', { name: 'Grünes Pesto (Barilla)', names: ['grünes pesto'], favorite: true, excludes: ['pesto rosso', 'x'] });
    expect(sharedOf([a, b])).toEqual({ name: 'Grünes Pesto', replaces: [], names: ['pesto', 'grünes pesto'], excludes: ['pesto rosso'] });
  });

  it('beim Vereinheitlichen bleibt die Marke – auch wenn sie bisher im Namen stand', () => {
    const b = sort('b', { name: 'Grünes Pesto (Barilla)', names: ['grünes pesto'] });
    const shared = { name: 'Pesto', replaces: [], names: ['pesto', 'grünes pesto'], excludes: [] };
    const out = withShared(b, shared, 'T');
    expect(out).toMatchObject({ name: 'Pesto', brand: 'Barilla', names: ['pesto', 'grünes pesto'], updatedAt: 'T' });
    expect(out.excludes).toBeUndefined();
    expect(productLabel(out)).toBe('Pesto · Barilla');
  });

  it('Haltbarkeit gilt für alle Sorten: vom Favoriten, sonst von der ersten mit Angabe', () => {
    const a = sort('a', { brand: 'A' });
    const b = sort('b', { brand: 'B', shelfDays: 5 });
    const c = sort('c', { brand: 'C', shelfDays: 9, favorite: true });
    expect(sharedOf([a, b]).shelfDays).toBe(5);
    expect(sharedOf([a, b, c]).shelfDays).toBe(9);
    expect(sharedOf([a]).shelfDays).toBeUndefined();
    // aufs Gemeinsame geschrieben: alle gleich – und ohne Angabe fällt sie bei allen weg
    const s = sharedOf([a, b]);
    expect([a, b, c].map((p) => withShared(p, s, 'T').shelfDays)).toEqual([5, 5, 5]);
    expect(withShared(b, { ...s, shelfDays: undefined }, 'T').shelfDays).toBeUndefined();
  });
});

describe('Packungsgrößen je Sorte', () => {
  it('übliche Größe zuerst, weitere dahinter, ohne Doppelte', () => {
    expect(packSizesOf({ packageAmount: 1200, packageSizes: [1000, 1400, 1200] })).toEqual([1200, 1000, 1400]);
    expect(packSizesOf({})).toEqual([]);
  });
});

describe('Sorten mit gleichem Namen (Julia: Sortenwahl fehlte)', () => {
  const sort = (id: string, fat: number, detail?: string): MyProduct => ({
    id, name: 'Rinderhack', ...(detail ? { detail } : {}), replaces: ['rinderhack'], per100g: { kcal: 100 + fat * 9, protein: 20, carbs: 0, fat }, updatedAt: '2026-10-02T12:00:00.000Z',
  });
  it('„Rinderhack“ im Rezept findet BEIDE Sorten – als Gruppe mit Durchschnitt, nicht nur die letzte', () => {
    const table = withMyProducts(localFoodTable, [sort('normal', 20), sort('leicht', 8, 'leicht')]);
    const food = table.matchName('Rinderhack')!.food;
    expect(food.variants?.map((v) => v.id).sort()).toEqual(['leicht', 'normal']);
    expect(food.per100g.fat).toBe(14);
  });
  it('eine Sorte: wie bisher das Produkt selbst', () => {
    const table = withMyProducts(localFoodTable, [sort('normal', 20)]);
    expect(table.matchName('Rinderhack')!.food.ref.foodId).toBe('normal');
  });
});
