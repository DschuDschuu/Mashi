import { describe, expect, it } from 'vitest';
import { productPrices, recipeCost, sumCosts, type PriceEntry } from './cost';
import { localFoodTable } from './nutrition/localFoods';
import { withMyProducts, type MyProduct } from './nutrition/myProducts';
import { applyImport, emptyPantry, proposeImport } from './pantry';
import { parseReceipt } from './receipt';
import type { Ingredient, RecipeContent } from './types';

const content = (ingredients: Ingredient[], servings = 2): RecipeContent => ({
  title: 'T', description: '', servings, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});
const price = (name: string, perUnit: number, unit: 'g' | 'Stück', date = '2026-09-01'): PriceEntry => ({ name, perUnit, unit, date });

describe('Was kostet ein Gericht?', () => {
  it('rechnet Gramm × Preis je Gramm und Stück × Preis je Stück – auch pro Portion', () => {
    const c = content([
      { id: '1', name: 'Hähnchenbrust', amount: 400, unit: 'g' }, // 400 × 0,0112 = 4,48
      { id: '2', name: 'Eier', amount: 2, unit: 'Stück' },        // 2 × 0,25 = 0,50
    ]);
    const cost = recipeCost(c, 2, localFoodTable, [price('Hähnchenbrust', 0.0112, 'g'), price('Eier', 0.25, 'Stück')]);
    expect(cost).toEqual({ total: 4.98, perServing: 2.49, missing: [] });
  });

  it('rechnet auf die gekochten Portionen um', () => {
    const c = content([{ id: '1', name: 'Reis', amount: 150, unit: 'g' }], 2);
    expect(recipeCost(c, 4, localFoodTable, [price('Reis', 0.002, 'g')])?.total).toBe(0.6); // 300 g
  });

  it('erfindet keine Preise: Unbekanntes steht in „missing“, Salz & Öl zählen nicht als fehlend', () => {
    const c = content([
      { id: '1', name: 'Pasta', amount: 250, unit: 'g' },
      { id: '2', name: 'Paprika', amount: 1, unit: 'Stück' },
      { id: '3', name: 'Olivenöl', amount: 2, unit: 'EL' },
      { id: '4', name: 'Salz' },
    ]);
    const cost = recipeCost(c, 2, localFoodTable, [price('Nudeln', 0.004, 'g')]); // „Nudeln“ = „Pasta“
    expect(cost).toEqual({ total: 1, perServing: 0.5, missing: ['Paprika'] });
  });

  it('ohne einen einzigen bekannten Preis: keine Angabe statt „0 €“', () => {
    expect(recipeCost(content([{ id: '1', name: 'Paprika', amount: 1, unit: 'Stück' }]), 2, localFoodTable, [])).toBeNull();
  });

  it('der neueste Preis gewinnt', () => {
    const c = content([{ id: '1', name: 'Reis', amount: 100, unit: 'g' }]);
    const cost = recipeCost(c, 2, localFoodTable, [price('Reis', 0.004, 'g', '2026-09-20'), price('Reis', 0.002, 'g', '2026-08-01')]);
    expect(cost?.total).toBe(0.4);
  });

  it('Stückpreis, Rezept in Gramm: über das Stückgewicht (Paprika ≈ 150 g)', () => {
    const c = content([{ id: '1', name: 'Paprika', amount: 300, unit: 'g' }]);
    expect(recipeCost(c, 2, localFoodTable, [price('Paprika', 0.5, 'Stück')])?.total).toBe(1);
  });

  it('Wochenplan: Summe der bekannten Gerichte, Unbekannte werden gezählt statt verschwiegen', () => {
    expect(sumCosts([{ total: 4.98, perServing: 2.49, missing: ['Paprika'] }, null, { total: 1.2, perServing: 0.6, missing: ['Paprika'] }]))
      .toEqual({ total: 6.18, missing: ['Paprika'], unknown: 1 });
  });
});

describe('Preise und Packungsgrößen vom Kassenbon und aus „Meine Produkte“', () => {
  const mozzarella: MyProduct = {
    id: 'p-mozz', name: 'Mozzarella light', replaces: ['mozzarella'], per100g: { kcal: 165, protein: 20.5, carbs: 1.5, fat: 8.5 },
    packageAmount: 125, packageUnit: 'g', updatedAt: '2026-09-01T00:00:00Z',
  };
  const table = withMyProducts(localFoodTable, [mozzarella]);
  const packageFor = (name: string) => {
    const food = table.matchName(name)?.food;
    return food?.ref.foodId === mozzarella.id ? { amount: mozzarella.packageAmount!, unit: 'g' as const } : undefined;
  };
  const bon = parseReceipt('EUR\nMozzarella light 0,85 x 2 1,70 A\nBananen 1,20 A\n0,982 kg x 1,19 EUR/kg\nZu zahlen 2,90');

  it('schon beim ersten Bon: Menge aus der Packungsgröße deines Produkts (2 × 125 g)', () => {
    const rows = proposeImport(bon, [], packageFor);
    expect(rows[0]).toMatchObject({ known: false, amount: 250, unit: 'g' });
  });

  it('merkt sich den bezahlten Preis je Gramm – und das Rezept kennt dann seine Kosten', () => {
    const pantry = applyImport(emptyPantry(), proposeImport(bon, [], packageFor), '2026-09-24T12:00:00Z');
    expect(pantry.prices.map((p) => [p.name, Math.round(p.perUnit * 10000) / 10000, p.unit])).toEqual([
      ['Mozzarella light', 0.0068, 'g'], // 1,70 € / 250 g
      ['Bananen', 0.0012, 'g'],          // 1,20 € / 982 g
    ]);
    // Rezept sagt nur „Mozzarella“ – dein Produkt verbindet beides
    const cost = recipeCost(content([{ id: '1', name: 'Mozzarella', amount: 125, unit: 'g' }]), 2, table, pantry.prices);
    expect(cost?.total).toBe(0.85);
  });

  it('Preis von Hand: Preis je Packung ÷ Packungsgröße', () => {
    expect(productPrices([{ ...mozzarella, packagePrice: 0.89 }])).toEqual([
      { name: 'Mozzarella light', perUnit: 0.89 / 125, unit: 'g', date: mozzarella.updatedAt },
    ]);
    expect(productPrices([mozzarella])).toEqual([]); // ohne Preis nichts
  });
});
