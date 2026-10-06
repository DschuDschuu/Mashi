import { describe, expect, it } from 'vitest';
import { categoryOf, groupByCategory, guessCategory, withCategory } from './categories';
import { localFoodTable } from './nutrition/localFoods';
import { withMyProducts, type MyProduct } from './nutrition/myProducts';

const T = localFoodTable;
const product = (p: Partial<MyProduct> & Pick<MyProduct, 'id' | 'name'>): MyProduct => ({
  replaces: [], per100g: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, updatedAt: '2026-10-02T12:00:00.000Z', ...p,
});

describe('Kategorien wie im Laden', () => {
  it('aus der Tabelle: Art und eigene Zuordnung', () => {
    expect(guessCategory('Karotten', T)).toBe('obst-gemuese');
    expect(guessCategory('Rinderhack', T)).toBe('fleisch-fisch');
    expect(guessCategory('Eier', T)).toBe('milch-eier');
    expect(guessCategory('Magermilch', T)).toBe('milch-eier');
    expect(guessCategory('Spaghetti', T)).toBe('nudeln-reis-brot');
    // die Tabelle kennt es, sagt aber über die Art nichts – oder das Falsche (Mais ist Gemüse, kommt aber aus der Dose)
    expect(guessCategory('Passata', T)).toBe('konserven');
    expect(guessCategory('Mais', T)).toBe('konserven');
    expect(guessCategory('Pesto', T)).toBe('konserven');
    expect(guessCategory('Sojasauce', T)).toBe('saucen');
    expect(guessCategory('Mehl', T)).toBe('backen');
    expect(guessCategory('Erbsen', T)).toBe('tiefkuehl');
  });

  it('Unbekanntes am Namen – Tiefkühl und Getränke vor der Art, Würzen vor Fleisch', () => {
    expect(guessCategory('TK-Spinat', T)).toBe('tiefkuehl');
    expect(guessCategory('Orangensaft', T)).toBe('getraenke');
    expect(guessCategory('Kidneybohnen', T)).toBe('konserven');
    expect(guessCategory('Rinderbrühe', T)).toBe('saucen');
    expect(guessCategory('Erdnussbutter', T)).toBe('backen');
    // Julia: eigene Abteilung „Müsli, Nüsse & Kerne“ – Aufstriche (Erdnussbutter oben) bleiben beim Süßen
    expect(guessCategory('Haselnüsse', T)).toBe('muesli-nuesse');
    expect(guessCategory('Nüsse', T)).toBe('muesli-nuesse');
    for (const n of ['Haferflocken', 'Knuspermüsli', 'Granola', 'Kürbiskerne', 'Leinsamen', 'Chiasamen', 'Mandeln', 'Studentenfutter']) {
      expect([n, guessCategory(n, T)]).toEqual([n, 'muesli-nuesse']);
    }
    expect(guessCategory('Nussmus', T)).toBe('backen');
    expect(guessCategory('Haselnusscreme', T)).toBe('backen');
    expect(guessCategory('Chiliflocken', T)).toBe('saucen');
    // „nuss“ im Namen ist noch keine Nuss (Julia)
    expect(guessCategory('Butternuss-Kürbis', T)).toBe('obst-gemuese');
    expect(guessCategory('Butternusskürbis', T)).toBe('obst-gemuese');
    expect(guessCategory('Zucchini', T)).toBe('obst-gemuese');
    expect(guessCategory('Putenbrust', T)).toBe('fleisch-fisch');
    expect(guessCategory('Spülmittel', T)).toBe('sonstiges');
  });

  it('eigenes Produkt: wie das, was es ersetzt – sonst am Namen', () => {
    const table = withMyProducts(T, [
      product({ id: 'p1', name: 'Milch', replaces: ['magermilch'] }),
      product({ id: 'p2', name: 'Kimchi', names: ['kimchi'] }),
    ]);
    expect(guessCategory('Milch', table)).toBe('milch-eier');
    expect(guessCategory('Kimchi', table)).toBe('konserven');
  });

  it('deine Wahl gilt für alle Schreibweisen – und fällt weg, wenn sie dem Vorschlag entspricht', () => {
    const own = withCategory(undefined, 'Passata', 'saucen', T);
    expect(categoryOf('Passierte Tomaten', T, own)).toBe('saucen');
    expect(withCategory(own, 'Passata', 'konserven', T)).toBeUndefined();
  });

  it('Gruppen in fester Reihenfolge, leere fallen weg', () => {
    const groups = groupByCategory(['Mehl', 'Karotten', 'Butter', 'Karotte'], (n) => guessCategory(n, T));
    expect(groups.map((g) => [g.title, g.items])).toEqual([
      ['Obst & Gemüse', ['Karotten', 'Karotte']],
      ['Milchprodukte & Eier', ['Butter']],
      ['Backen & Süßes', ['Mehl']],
    ]);
  });
});
