import { describe, expect, it } from 'vitest';
import { parseReceipt } from './receipt';

// Erfundener Bon im Lidl-Aufbau (keine echten Daten)
const BON = `
Musterstraße 1
12345 Musterstadt
EUR
Bananen 1,20 A
0,982 kg x 1,19 EUR/kg
Speisequark mager 0,79 x 3 2,37 A
Hähnchenbrustfilet 6,49 A
Preisvorteil -1,00
Cola Zero 0,69 x 6 4,14 B
Pfand 0,25 EM 0,25 x 6 1,50 B
Spaghetti 0,99 A
Lidl Plus Rabatt -0,50
Zu zahlen 15,19
Kreditkarte 15,19
MWST% MWST + Netto = Brutto
A 7 % 0,63 9,00 9,63
`;

describe('Kassenbon lesen', () => {
  const lines = parseReceipt(BON);

  it('findet nur die Artikel – ohne Adresse, Pfand, Rabatte und alles nach „Zu zahlen“', () => {
    expect(lines.map((l) => l.name)).toEqual(['Bananen', 'Speisequark mager', 'Hähnchenbrustfilet', 'Cola Zero', 'Spaghetti']);
  });

  it('liest Stückzahl und Preis', () => {
    expect(lines[1]).toMatchObject({ name: 'Speisequark mager', count: 3, price: 2.37 });
    expect(lines[2]).toMatchObject({ name: 'Hähnchenbrustfilet', count: 1, price: 6.49 });
  });

  it('hängt die Gewichtszeile an den Artikel davor', () => {
    expect(lines[0]).toMatchObject({ name: 'Bananen', count: 1, weightKg: 0.982 });
  });

  it('verzeiht typische Lesefehler der Texterkennung', () => {
    const ocr = parseReceipt(`EUR
Bananen 1.20 A
0.982 kg x 1.19 EUR/kg
Speisequark  mager   0,79 x3   2,37
Zu zahlen 3,57`);
    expect(ocr).toEqual([
      expect.objectContaining({ name: 'Bananen', weightKg: 0.982, price: 1.2 }),
      expect.objectContaining({ name: 'Speisequark mager', count: 3, price: 2.37 }),
    ]);
  });

  it('Steuerbuchstabe als Ziffer gelesen („1,70 A“ → „1,704“) und „0,85x 2“ ohne Leerzeichen', () => {
    expect(parseReceipt('EUR\nSpeisequark mager 0,79x 2 1,584\nButter 1,994\nSprudel 0,49 x 6 2,94 8\nPreisvorteil 2,00\nZu zahlen')).toEqual([
      { name: 'Speisequark mager', count: 2, price: 1.58 },
      { name: 'Butter', count: 1, price: 1.99 },
      { name: 'Sprudel', count: 6, price: 2.94 },
    ]);
  });

  it('verschlucktes „x“: Einzelpreis raus aus dem Namen, Anzahl aus den Preisen', () => {
    expect(parseReceipt('EUR\nMozzarella light 0,85 2 1,70 A\nCola Zero 0,69 1,38 B\nZu zahlen')).toEqual([
      expect.objectContaining({ name: 'Mozzarella light', count: 2 }),
      expect.objectContaining({ name: 'Cola Zero', count: 2 }),
    ]);
  });

  it('ohne „EUR“-Kopf: fängt beim ersten Artikel an', () => {
    expect(parseReceipt('Spaghetti 0,99 A\nZu zahlen 0,99').map((l) => l.name)).toEqual(['Spaghetti']);
  });

  it('ignoriert Überschriften aus der App und Leerzeilen', () => {
    expect(parseReceipt('LIDL\n\nEUR\nSpaghetti 0,99 A\n\nZu zahlen 0,99')).toHaveLength(1);
  });
});
