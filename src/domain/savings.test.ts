import { describe, expect, it } from 'vitest';
import { emptyPantry } from './pantry';
import { monthSavings, parseSavings, recordSavings } from './savings';

// Erfundener Bon im Lidl-Aufbau – inklusive Sammelkasten unten, der NICHT doppelt zählen darf
const BON = `EUR
Hähnchenbrustfilet 6,99 A
Preisvorteil -1,50
Speisequark mager 0,79 x 3 2,37 A
Lidl Plus Rabatt -0,40
Zu zahlen 7,46
Gesamter Preisvorteil
1,90 EUR gespart
Mit Lidl Plus
0,40 EUR gespart`;

describe('Ersparnis vom Kassenbon', () => {
  it('trennt Lidl Plus und Angebote – ohne die Sammelzeilen doppelt zu zählen', () => {
    expect(parseSavings(BON)).toEqual({ lidlPlus: 0.4, offers: 1.5, mhd: 0, total: 7.46 });
  });

  it('verschlucktes Minus der Texterkennung zählt trotzdem als Ersparnis', () => {
    expect(parseSavings('Preisvorteil 2,00\nLidl Plus Rabatt 0,70\nZu zahlen 20,21')).toEqual({ lidlPlus: 0.7, offers: 2, mhd: 0, total: 20.21 });
  });

  it('Coupons zählen zu Lidl Plus', () => {
    expect(parseSavings('Lidl Plus Coupon -1,00').lidlPlus).toBe(1);
  });

  it('derselbe Bon zweimal importiert zählt einmal; Monate getrennt', () => {
    let p = recordSavings(emptyPantry(), parseSavings(BON), '2026-09-15T12:00:00.000Z');
    p = recordSavings(p, parseSavings(BON), '2026-09-15T12:00:00.000Z'); // doppelt
    p = recordSavings(p, { lidlPlus: 0.7, offers: 2, mhd: 0, total: 20.21 }, '2026-09-20T12:00:00.000Z');
    p = recordSavings(p, { lidlPlus: 1, offers: 0, mhd: 0, total: 5 }, '2026-08-30T12:00:00.000Z');
    expect(monthSavings(p.savings!, 2026, 8)).toEqual({ lidlPlus: 1.1, offers: 3.5, mhd: 0, receipts: 2 }); // September
    expect(monthSavings(p.savings!, 2026, 7)).toEqual({ lidlPlus: 1, offers: 0, mhd: 0, receipts: 1 });     // August
  });

  it('Bon ohne Rabatte legt keinen Eintrag an', () => {
    expect(recordSavings(emptyPantry(), { lidlPlus: 0, offers: 0, mhd: 0 }, '2026-09-15T12:00:00.000Z').savings).toBeUndefined();
  });
});
