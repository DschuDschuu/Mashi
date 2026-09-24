import { describe, expect, it } from 'vitest';
import { fromOpenFoodFacts, isValidEan, parseQuantity } from './openFoodFacts';

// Erfundenes Produkt im Aufbau einer Open-Food-Facts-Antwort
const RESPONSE = {
  status: 1,
  product: {
    product_name: 'Mozzarella light', brands: 'Hausmarke,Beispiel', quantity: '125 g',
    product_quantity: '125', product_quantity_unit: 'g',
    nutriments: {
      'energy-kcal_100g': 165, proteins_100g: 20.5, carbohydrates_100g: 1.5, fat_100g: 8.5,
      sugars_100g: 1.5, salt_100g: 0.5,
    },
  },
};

describe('Open Food Facts → Mein Produkt', () => {
  it('übernimmt Name, Marke, Werte je 100 g und Packungsgröße', () => {
    expect(fromOpenFoodFacts('4000000000000', RESPONSE)).toEqual({
      ean: '4000000000000',
      name: 'Mozzarella light (Hausmarke)',
      per100g: { kcal: 165, protein: 20.5, carbs: 1.5, fat: 8.5, sugar: 1.5, salt: 0.5 },
      packageAmount: 125, packageUnit: 'g',
    });
  });

  it('unbekannter Barcode oder fehlende Hauptwerte: null – dann lieber vom Etikett abtippen', () => {
    expect(fromOpenFoodFacts('1', { status: 0 })).toBeNull();
    expect(fromOpenFoodFacts('1', { status: 1, product: { product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } } })).toBeNull();
  });

  it('nur kJ angegeben: rechnet in kcal um', () => {
    const r = fromOpenFoodFacts('1', { status: 1, product: { product_name: 'Y', nutriments: { energy_100g: 1046, proteins_100g: 1, carbohydrates_100g: 2, fat_100g: 3 } } });
    expect(r?.per100g.kcal).toBe(250);
  });

  it('Packungsgröße aus dem Text: „0,5 l“, „1 kg“, „250ml“', () => {
    expect(parseQuantity('0,5 l')).toEqual({ amount: 500, unit: 'ml' });
    expect(parseQuantity('1 kg')).toEqual({ amount: 1000, unit: 'g' });
    expect(parseQuantity('250ml')).toEqual({ amount: 250, unit: 'ml' });
    expect(parseQuantity('6 Stück')).toBeUndefined();
  });

  it('Prüfziffer: echte EANs ja, vertippte nein', () => {
    expect(isValidEan('4006381333931')).toBe(true);  // EAN-13
    expect(isValidEan('96385074')).toBe(true);       // EAN-8
    expect(isValidEan('4006381333932')).toBe(false); // letzte Ziffer falsch
    expect(isValidEan('12345')).toBe(false);
  });
});
