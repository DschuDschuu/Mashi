import { useMemo } from 'react';
import { DISCOUNT_LABEL, discountOf, paidOf, purchasesOf, type BonLine, type Purchase } from '../domain/bons';
import type { PriceEntry } from '../domain/cost';
import { keyOfName } from '../domain/mealplan';
import { useFoodTable, usePantry } from '../data/store';
import { euro } from './format';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** „3 × 500 g“, „982 g“, „10 Stück“ – wie viel diese Bon-Zeile war */
export function lineAmount(l: BonLine): string {
  if (l.weightKg !== undefined) return `${fmt(l.weightKg * 1000)} g`;
  if (l.amount === undefined) return l.count > 1 ? `${l.count} ×` : '';
  if (l.count > 1 && l.unit !== 'Stück' && l.unit !== 'Glas') return `${l.count} × ${fmt(l.amount / l.count)} ${l.unit ?? 'g'}`;
  return `${fmt(l.amount)} ${l.unit ?? 'g'}`;
}

/**
 * MHD-Rabatt in Prozent: wie auf dem Bon („RABATT 20%“) – nur wenn die Texterkennung die Zahl verschluckt hat,
 * ausgerechnet, und dann nur aus dem MHD-Rabatt (nicht zusammen mit einem Angebot)
 */
export function mhdPercent(l: Pick<BonLine, 'price' | 'discounts'>): number {
  const mhd = (l.discounts ?? []).filter((d) => d.kind === 'mhd');
  const printed = mhd.find((d) => d.percent !== undefined)?.percent;
  if (printed !== undefined) return printed;
  const off = mhd.reduce((s, d) => s + d.amount, 0);
  return l.price ? Math.round((off / l.price) * 100) : 0;
}

/** „2,49 € statt 3,29 € · Angebot“ – ohne Rabatt nur der Preis */
export function linePrice(l: BonLine): string {
  const paid = paidOf(l);
  if (paid === undefined) return '';
  const off = discountOf(l);
  if (!off || l.price === undefined) return euro(paid);
  const kinds = [...new Set((l.discounts ?? []).map((d) => d.kind))];
  const why = kinds.map((k) => (k === 'mhd' ? `MHD −${mhdPercent(l)} %` : DISCOUNT_LABEL[k])).join(' + ');
  return `${euro(paid)} statt ${euro(l.price)} · ${why}`;
}

/**
 * Einkäufe und Preisverlauf eines Lebensmittels – über denselben Schlüssel wie Rezepte und Vorrat
 * („Milch“ im Vorrat = „Magermilch“ in der Tabelle), dazu jede Bon-Zeile, die einer seiner Sorten zugeordnet ist.
 */
export function usePurchases(name: string, productIds: readonly string[] = [], opts: { byName?: boolean } = {}): { purchases: Purchase[]; history: PriceEntry[] } {
  // je Sorte (byName: false): nur, was dieser Sorte zugeordnet ist – der Name passt ja auf alle Sorten
  const byName = opts.byName ?? true;
  const pantry = usePantry();
  const table = useFoodTable();
  const ids = productIds.join('|');
  return useMemo(() => {
    const key = keyOfName(name, table);
    const own = new Set(ids ? ids.split('|') : []);
    const same = (n: string) => byName && !!key && keyOfName(n, table) === key;
    return {
      purchases: purchasesOf(pantry.bons, (l) => (!!l.productId && own.has(l.productId)) || same(l.name)),
      history: (pantry.history ?? pantry.prices ?? []).filter((h) => same(h.name)),
    };
  }, [name, ids, byName, pantry.bons, pantry.history, pantry.prices, table]);
}
