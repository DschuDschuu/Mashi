import { discountOf, paidOf, rowFromLine, type Purchase } from './bons';
import type { PriceEntry } from './cost';
import { priceOf, receiptKey } from './pantry';

/**
 * Ein Einkauf eines Lebensmittels im Preis-Diagramm (Julia): Regalpreis und bezahlter Preis (nach Rabatt) je g bzw.
 * je Stück, ob es Rabatt oder MHD-Ware war, und die Packungsgröße – größere Packungen sind oft günstiger und
 * bekommen dann eine eigene Linie.
 */
export interface FoodPricePoint {
  date: string;
  /** Sorte ('' = ohne Sorte) */
  sortId: string;
  /** Packungsgröße (500 g) – nur bei abgepackter Ware mit Menge vom Bon; lose Ware und ältere Preise: keine */
  size?: number;
  sizeUnit?: 'g' | 'ml';
  unit: 'g' | 'Stück';
  /** Regalpreis (vor Rabatt) */
  shelf: number;
  /** bezahlt (nach Rabatt) – ältere Preise ohne Bon: wie Regalpreis */
  paid: number;
  /** Angebot oder Lidl Plus */
  discount: boolean;
  /** MHD-Ware (reduziert kurz vor dem Datum) */
  mhd: boolean;
  /** der Einkauf vom Bon – fehlt bei älteren Preisen (vor dem Speichern der Bons) */
  purchase?: Purchase;
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Alle Punkte eines Lebensmittels: jeder gespeicherte Einkauf – dazu ältere Preise, zu denen es keinen Bon mehr
 * gibt (die nur mit dem Regalpreis). Ein älterer Preis ohne Sorte bekommt die Sorte vom Bon desselben Tages.
 */
export function foodPricePoints(history: readonly PriceEntry[], purchases: readonly Purchase[]): FoodPricePoint[] {
  const out: FoodPricePoint[] = [];
  for (const p of purchases) {
    const l = p.line;
    const shelf = priceOf(rowFromLine(l), p.date);
    if (!shelf || !l.price) continue;
    const paid = paidOf(l) ?? l.price;
    const mhd = !!l.reduced || (l.discounts ?? []).some((d) => d.kind === 'mhd');
    const packed = l.weightKg === undefined && l.amount !== undefined && (l.unit === 'g' || l.unit === 'ml');
    out.push({
      date: p.date, sortId: l.productId ?? '', unit: shelf.unit,
      ...(packed ? { size: Math.round((l.amount! / l.count) * 10) / 10, sizeUnit: l.unit as 'g' | 'ml' } : {}),
      shelf: shelf.perUnit,
      // bezahlt im selben Verhältnis wie der Zeilenpreis – stimmt auch bei Ware mit Kilopreis
      paid: shelf.perUnit * (paid / l.price),
      discount: (l.discounts ?? []).some((d) => d.kind !== 'mhd') && discountOf(l) > 0,
      mhd, purchase: p,
    });
  }
  for (const h of history) {
    // zu diesem Preis gibt es den Bon noch – der Einkauf steht schon oben
    const same = purchases.filter((p) => day(p.date) === day(h.date) && receiptKey(p.line.name) === receiptKey(h.name));
    if (same.some((p) => !h.productId || p.line.productId === h.productId)) continue;
    out.push({
      date: h.date, sortId: h.productId ?? same[0]?.line.productId ?? '', unit: h.unit,
      shelf: h.perUnit, paid: h.perUnit, discount: false, mhd: false,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Linie eines Punkts: je Sorte – und je Größe, wenn diese Sorte in mehreren Größen gekauft wurde (Julia: 400 g und
 * 1 kg Hähnchen nicht vermischen). Punkte ohne Größe in so einer Sorte: eigene Linie „Größe unbekannt“.
 */
export function seriesKeyOf(points: readonly FoodPricePoint[]): (p: FoodPricePoint) => { id: string; sortId: string; size?: string } {
  const sizes = new Map<string, Set<string>>();
  for (const p of points) if (p.size !== undefined) sizes.set(p.sortId, (sizes.get(p.sortId) ?? new Set()).add(`${p.size} ${p.sizeUnit}`));
  return (p) => {
    const split = (sizes.get(p.sortId)?.size ?? 0) > 1;
    const size = split ? (p.size !== undefined ? `${p.size} ${p.sizeUnit}` : '?') : undefined;
    return { id: `${p.sortId}|${size ?? ''}`, sortId: p.sortId, ...(size ? { size } : {}) };
  };
}
