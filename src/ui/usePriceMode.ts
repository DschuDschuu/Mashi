import { useState } from 'react';

/**
 * „Regalpreis / Bezahlt“ (Julia: im Tab „Preise“ und auf der Preis-Seite eines Lebensmittels derselbe Umschalter) –
 * gemerkt auf diesem Gerät. Regalpreis: echte Preiserhöhungen; bezahlt: mit Rabatten und MHD-Ware.
 */
export type PriceMode = 'regal' | 'bezahlt';
const MODE_KEY = 'mashi-price-mode';
const readMode = (): PriceMode => { try { return localStorage.getItem(MODE_KEY) === 'bezahlt' ? 'bezahlt' : 'regal'; } catch { return 'regal'; } };

export function usePriceMode(): [PriceMode, (m: PriceMode) => void] {
  const [mode, setMode] = useState<PriceMode>(readMode);
  return [mode, (m) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* nur Komfort */ } }];
}

export const PRICE_MODES = [['regal', 'Regalpreis'], ['bezahlt', 'Bezahlt']] as const;
