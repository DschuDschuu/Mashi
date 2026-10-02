import { useMemo } from 'react';
import { DISCOUNT_LABEL, discountOf, paidOf, purchasesOf, type BonLine, type Purchase } from '../domain/bons';
import type { PriceEntry } from '../domain/cost';
import { keyOfName } from '../domain/mealplan';
import { MY_PRODUCTS_PROVIDER } from '../domain/nutrition/myProducts';
import type { FoodTable } from '../domain/nutrition/types';
import { useFoodTable, usePantry } from '../data/store';
import { euro } from './format';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** „3 × 500 g“, „982 g“, „10 Stück“ – wie viel diese Bon-Zeile war */
export function lineAmount(l: BonLine): string {
  // gewogen, aber als Stück im Vorrat (Kürbis): beides
  if (l.weightKg !== undefined) return l.unit === 'Stück' && l.amount ? `${fmt(l.amount)} Stück · ${fmt(l.weightKg)} kg` : `${fmt(l.weightKg * 1000)} g`;
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

/** Preis und Grund getrennt: { price: „2,49 € statt 3,29 €“, why: „Angebot“ } – für enge Stellen (Zuletzt gekauft) */
export function linePriceParts(l: BonLine): { price: string; why?: string } {
  const paid = paidOf(l);
  if (paid === undefined) return { price: '' };
  const off = discountOf(l);
  if (!off || l.price === undefined) return { price: euro(paid) };
  const kinds = [...new Set((l.discounts ?? []).map((d) => d.kind))];
  return { price: `${euro(paid)} statt ${euro(l.price)}`, why: kinds.map((k) => (k === 'mhd' ? `MHD −${mhdPercent(l)} %` : DISCOUNT_LABEL[k])).join(' + ') };
}

/** Kilopreis gewogener Ware („1,49 €/kg“) – bezahlt ÷ Gewicht vom Bon; sonst leer */
export function perKg(l: BonLine): string {
  const paid = paidOf(l);
  return l.weightKg && paid !== undefined ? `${euro(paid / l.weightKg)}/kg` : '';
}

/** „2,49 € statt 3,29 € · Angebot“ – ohne Rabatt nur der Preis */
export function linePrice(l: BonLine): string {
  const { price, why } = linePriceParts(l);
  return why ? `${price} · ${why}` : price;
}

/**
 * Einkäufe und Preisverlauf eines Lebensmittels – über denselben Schlüssel wie Rezepte und Vorrat
 * („Milch“ im Vorrat = „Magermilch“ in der Tabelle), dazu jede Bon-Zeile, die einer seiner Sorten zugeordnet ist.
 */
/**
 * Welche eigenen Sorten hinter einem Namen stehen – bei mehreren Sorten alle (die Gruppe hat einen eigenen
 * Schlüssel „sorten:…“, die einzelne Sorte ihren – deshalb fand die Preis-Seite beim Kürbis mit 2 Sorten nichts).
 */
export function productIdsOfName(name: string, table: FoodTable): string[] {
  const f = table.matchName(name)?.food;
  if (!f) return [];
  if (f.variants?.length) return f.variants.map((v) => v.id);
  return f.ref.provider === MY_PRODUCTS_PROVIDER ? [f.ref.foodId] : [];
}

export function usePurchases(name: string, productIds: readonly string[] = [], opts: { byName?: boolean } = {}): { purchases: Purchase[]; history: PriceEntry[] } {
  // je Sorte (byName: false): nur, was dieser Sorte zugeordnet ist – der Name passt ja auf alle Sorten
  const byName = opts.byName ?? true;
  const pantry = usePantry();
  const table = useFoodTable();
  const ids = productIds.join('|');
  return useMemo(() => {
    const key = keyOfName(name, table);
    // die übergebenen Sorten – und mit Namen alle Sorten dieses Lebensmittels
    const own = new Set([...(ids ? ids.split('|') : []), ...(byName ? productIdsOfName(name, table) : [])]);
    // gleiches Lebensmittel: gleicher Schlüssel – oder eine seiner Sorten
    const same = (n: string) => byName && ((!!key && keyOfName(n, table) === key) || productIdsOfName(n, table).some((id) => own.has(id)));
    return {
      purchases: purchasesOf(pantry.bons, (l) => (!!l.productId && own.has(l.productId)) || same(l.name)),
      // je Sorte gemerkte Preise zählen immer mit – auch ohne passenden Namen
      history: (pantry.history ?? pantry.prices ?? []).filter((h) => (!!h.productId && own.has(h.productId)) || same(h.name)),
    };
  }, [name, ids, byName, pantry.bons, pantry.history, pantry.prices, table]);
}
