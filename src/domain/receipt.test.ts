import { describe, expect, it } from 'vitest';
import { mergeSameLines, parseReceipt } from './receipt';

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
      // der Preisvorteil gehört zum Artikel darüber – price bleibt der Preis davor
      { name: 'Sprudel', count: 6, price: 2.94, discounts: [{ kind: 'angebot', amount: 2 }] },
    ]);
  });

  it('Rabattzeilen gehören zum Artikel direkt darüber – nicht über eine andere Zeile hinweg', () => {
    const lines = parseReceipt([
      'EUR',
      'Rinderhack 500g 3,29 A',
      'Preisvorteil -0,80',
      'Lidl Plus Rabatt -0,30',
      'Joghurt 0,99 A',
      'RABATT 20% -0,20',
      'Cola 1,19 B',
      'Pfand 0,25 B',
      'Coupon -0,50',
      'Zu zahlen 5,02',
    ].join('\n'));
    expect(lines).toEqual([
      { name: 'Rinderhack 500g', count: 1, price: 3.29, discounts: [{ kind: 'angebot', amount: 0.8 }, { kind: 'lidlplus', amount: 0.3 }] },
      { name: 'Joghurt', count: 1, price: 0.99, reduced: true, discounts: [{ kind: 'mhd', amount: 0.2, percent: 20 }] },
      // Pfand dazwischen: der Coupon gehört keinem Artikel (zählt nur in der Summe, siehe savings.ts)
      { name: 'Cola', count: 1, price: 1.19 },
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

describe('Gewichtszeile über den Preis zuordnen (Julia: Kürbis)', () => {
  const W = '3,242 kg x 1,99 EUR/kg'; // 3,242 × 1,99 = 6,45 €
  it('darunter (wie bisher)', () => {
    expect(parseReceipt(['EUR', 'Milch 0,99 A', 'Butternuss-Kürbis 6,45 A', W, 'Zu zahlen'].join('\n')).map((l) => [l.name, l.weightKg])).toEqual([['Milch', undefined], ['Butternuss-Kürbis', 3.242]]);
  });
  it('darüber: gehört zum Artikel darunter, dessen Preis passt – nicht zur Milch', () => {
    expect(parseReceipt(['EUR', 'Milch 0,99 A', W, 'Butternuss-Kürbis 6,45 A', 'Zu zahlen'].join('\n')).map((l) => [l.name, l.weightKg])).toEqual([['Milch', undefined], ['Butternuss-Kürbis', 3.242]]);
  });
  it('zwei Kürbisse, je mit Gewicht darüber', () => {
    const lines = parseReceipt(['EUR', W, 'Butternuss-Kürbis 6,45 A', '1,500 kg x 1,99 EUR/kg', 'Butternuss-Kürbis 2,99 A', 'Zu zahlen'].join('\n'));
    expect(lines.map((l) => l.weightKg)).toEqual([3.242, 1.5]);
  });
  it('passt nirgends (Preis verlesen): bleibt beim Artikel darüber', () => {
    expect(parseReceipt(['EUR', 'Bananen 1,20 A', '0,982 kg x 1,19 EUR/kg', 'Zu zahlen'].join('\n'))[0].weightKg).toBe(0.982);
  });
});

describe('Gleiche Zeilen zusammenfassen', () => {
  it('derselbe Artikel zweimal einzeln → eine Zeile mit Anzahl; anderer Preis, MHD und lose Ware bleiben für sich', () => {
    const lines = parseReceipt(['EUR', 'Joghurt 0,99 A', 'Butter 1,99 A', 'joghurt 0,99 A', 'Preisvorteil -0,20', 'Joghurt 0,79 A',
      'Joghurt 0,99 A', 'RABATT 20% -0,20', 'Bananen 1,20 A', '0,982 kg x 1,19 EUR/kg', 'Bananen 1,20 A', '0,982 kg x 1,19 EUR/kg', 'Zu zahlen'].join('\n'));
    expect(mergeSameLines(lines)).toEqual([
      { name: 'Joghurt', count: 2, price: 1.98, discounts: [{ kind: 'angebot', amount: 0.2 }] },
      { name: 'Butter', count: 1, price: 1.99 },
      { name: 'Joghurt', count: 1, price: 0.79 },
      { name: 'Joghurt', count: 1, price: 0.99, reduced: true, discounts: [{ kind: 'mhd', amount: 0.2, percent: 20 }] },
      { name: 'Bananen', count: 1, price: 1.2, weightKg: 0.982, perKg: 1.19 },
      { name: 'Bananen', count: 1, price: 1.2, weightKg: 0.982, perKg: 1.19 },
    ]);
    // die Eingabe bleibt unverändert
    expect(lines[0]).toEqual({ name: 'Joghurt', count: 1, price: 0.99 });
  });
});


describe('Kilopreis vom Bon (Julia: Banane zweimal 1,99 €/kg, Verlauf zeigte +0,1 %)', () => {
  it('der Kilopreis der Gewichtszeile wird gemerkt – nicht Preis ÷ Gewicht', () => {
    const [a] = parseReceipt(['EUR', 'Bananen 2,37 A', '1,190 kg x 1,99 EUR/kg', 'Zu zahlen'].join('\n'));
    const [b] = parseReceipt(['EUR', 'Bananen 1,79 A', '0,898 kg x 1,99 EUR/kg', 'Zu zahlen'].join('\n'));
    expect([a.perKg, b.perKg]).toEqual([1.99, 1.99]);
    // gerechnet wären es 1,9916 bzw. 1,9933 €/kg – also ein „Anstieg“
    expect(a.price! / a.weightKg!).not.toBeCloseTo(b.price! / b.weightKg!, 4);
  });
});
