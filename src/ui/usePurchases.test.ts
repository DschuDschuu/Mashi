import { describe, expect, it } from 'vitest';
import { linePrice as price, mhdPercent } from './usePurchases';

/** € steht hinter einem geschützten Leerzeichen – \s erfasst es, für den Vergleich ein normales */
const linePrice = (...a: Parameters<typeof price>) => price(...a).replace(/\s/g, ' ');

const line = (price: number, discounts: { kind: 'angebot' | 'lidlplus' | 'mhd'; amount: number; percent?: number }[]) => ({ bon: 'X', count: 1, name: 'X', price, discounts });

describe('MHD-Rabatt in Prozent', () => {
  it('wie auf dem Bon – auch wenn Ausrechnen wegen Rundung danebenläge (0,08 von 0,39 € = 21 %)', () => {
    expect(mhdPercent(line(0.39, [{ kind: 'mhd', amount: 0.08, percent: 20 }]))).toBe(20);
    expect(linePrice(line(0.39, [{ kind: 'mhd', amount: 0.08, percent: 20 }]))).toBe('0,31 € statt 0,39 € · MHD −20 %');
  });

  it('Zahl verschluckt: ausgerechnet – nur aus dem MHD-Rabatt, nicht zusammen mit dem Angebot', () => {
    const l = line(2, [{ kind: 'angebot', amount: 0.5 }, { kind: 'mhd', amount: 0.4 }]);
    expect(mhdPercent(l)).toBe(20);
    expect(linePrice(l)).toBe('1,10 € statt 2,00 € · Angebot + MHD −20 %');
  });
});
