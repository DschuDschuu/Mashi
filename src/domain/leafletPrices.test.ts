import { describe, expect, it } from 'vitest';
import { glyphsOfPage, priceRows, type LayoutWord, type LeafletLayout } from './leafletPrices';

// Eine erfundene Prospektseite, aufgebaut wie bei Lidl (Lage in PDF-Punkten, wie sie der Server liefert):
// links der Artikel (Marke, Name, kleine Beschreibung), rechts daneben der große Preis mit Sternchen,
// darüber der Rabatt, daneben klein der Statt-Preis. Schriften: [Größe, Name].
const FONTS: LeafletLayout['fonts'] = [[10, 'Cond'], [8, 'Book'], [40, 'Price'], [20, 'Pro'], [9, 'Old']];
const [COND, BOOK, PRICE, PRO, OLD] = [0, 1, 2, 3, 4];
/** Wort mit Breite ~ 0,5 × Größe je Buchstabe, Höhe 1,2 × Größe */
const w = (text: string, x: number, top: number, font: number, width?: number): LayoutWord =>
  [text, x, top, width ?? text.length * 0.5 * FONTS[font][0], 1.2 * FONTS[font][0], font];
/** mehrere Wörter in einer Zeile, mit normaler Wortlücke */
const line = (text: string, x: number, top: number, font: number): LayoutWord[] => {
  const out: LayoutWord[] = [];
  for (const t of text.split(' ')) {
    const word = w(t, x, top, font);
    out.push(word);
    x += word[3] + 0.3 * FONTS[font][0];
  }
  return out;
};

const page: LayoutWord[] = [
  ...line('Ab Do. 26.11.', 20, 10, PRO),
  // Kachel 1: Nudeln
  ...line('TESTMARKE', 50, 100, COND),
  ...line('Feine Testnudeln', 50, 111.5, COND),
  ...line('Je 500 g', 50, 124, BOOK),
  ...line('1 kg = 2.38', 50, 134, BOOK),
  w('-20%', 150, 70, PRO),
  // großer Preis in zwei Wörtern, die Cent etwas versetzt (wie pdftotext sie liefert)
  w('1.', 150, 100, PRICE, 20), w('19*', 168, 100, PRICE, 34),
  w('1.49', 210, 105, OLD),
  // Kachel 2: Trennzeichen am Zeilenende („Lachsfilet­|portionen“)
  ...line('MEERESTEST', 50, 300, COND),
  w('Lachsfilet­', 50, 311.5, COND), ...line('portionen', 50, 323, COND),
  ...line('Je 5x 120 g', 50, 336, BOOK),
  w('8.99*', 150, 300, PRICE),
  // Kachel 3: unsichtbare Trennstelle – „Leber“ und „käse“ berühren sich, also ein Wort
  ...line('WURSTTEST', 320, 300, COND),
  w('Mini-Leber', 320, 311.5, COND, 50), w('käse', 370, 311.5, COND, 20),
  ...line('Je 450 g', 320, 324, BOOK),
  w('2.99*', 420, 300, PRICE),
];
const layout: LeafletLayout = { fonts: FONTS, pages: [[], page] };

describe('Lidl-Preise aus der Lage auf der Seite', () => {
  const rows = priceRows(layout);

  it('Preis, Artikel, Marke, Menge, Statt-Preis, Rabatt, Grundpreis und „ab Do.“ – Seite für Seite', () => {
    const nudeln = rows.find((r) => r.name === 'Feine Testnudeln');
    expect(nudeln).toMatchObject({
      page: 2, brand: 'TESTMARKE', quantity: '500 g', price: 1.19, regular: 1.49, discount: '-20%',
      basePrice: '1 kg = 2.38', validFrom: 'Do. 26.11.', plus: false, check: '',
    });
  });

  it('Trennzeichen am Zeilenende und unsichtbare Trennstellen ergeben ganze Wörter', () => {
    expect(rows.map((r) => [r.name, r.price])).toEqual(expect.arrayContaining([
      ['Lachsfiletportionen', 8.99],
      ['Mini-Leberkäse', 2.99],
    ]));
    expect(rows.find((r) => r.name === 'Lachsfiletportionen')?.quantity).toBe('5x 120 g');
    expect(rows).toHaveLength(3);
  });

  it('Preis-Hälften: nur direkt nebeneinander auf derselben Grundlinie', () => {
    const fonts: LeafletLayout['fonts'] = [[40, 'Price']];
    const glued = glyphsOfPage([['4.', 10, 10, 20, 48, 0], ['99*', 28, 10, 30, 48, 0]], fonts);
    expect(glued.map((g) => g.str)).toEqual(['4.99*']);
    // weit weg oder eine Zeile tiefer: zwei Wörter
    expect(glyphsOfPage([['4.', 10, 10, 20, 48, 0], ['99*', 80, 10, 30, 48, 0]], fonts)).toHaveLength(2);
    expect(glyphsOfPage([['4.', 10, 10, 20, 48, 0], ['99*', 28, 60, 30, 48, 0]], fonts)).toHaveLength(2);
  });

  it('kaputte oder fremde Antworten: nichts statt Absturz', () => {
    expect(priceRows(null)).toEqual([]);
    expect(priceRows({ fonts: 'x', pages: [] })).toEqual([]);
    // kaputte Wörter fallen weg; das eine gültige ist ein Preis ohne Artikel (unbekannte Schrift: Größe aus der Höhe)
    const odd = priceRows({ fonts: [[10, 'A'], 'kaputt'], pages: [[['Text', 'x', 0, 1, 1, 0], null, ['9.99*', 0, 0, 40, 48, 7]], 'Seite'] });
    expect(odd.map((r) => [r.name, r.price, r.check])).toEqual([['', 9.99, 'kein Artikel gefunden']]);
  });
});
