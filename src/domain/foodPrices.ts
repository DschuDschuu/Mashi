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
  /** älterer Preis ohne Bon: der Eintrag im Verlauf – darüber lässt er sich einer Sorte zuordnen */
  entry?: PriceEntry;
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Alle Punkte eines Lebensmittels: jeder gespeicherte Einkauf – dazu ältere Preise, zu denen es keinen Bon mehr
 * gibt (die nur mit dem Regalpreis). Ein älterer Preis ohne Sorte bekommt die Sorte vom Bon desselben Tages.
 */
export function foodPricePoints(history: readonly PriceEntry[], purchases: readonly Purchase[], known?: ReadonlySet<string>): FoodPricePoint[] {
  // eine entfernte Sorte zählt als „ohne Sorte“ – sonst stünde eine zweite Linie „ohne Sorte“ da
  const sortOf = (id: string | undefined) => (id && (!known || known.has(id)) ? id : '');
  const out: FoodPricePoint[] = [];
  for (const p of purchases) {
    const l = p.line;
    const shelf = priceOf(rowFromLine(l), p.date);
    if (!shelf || !l.price) continue;
    const paid = paidOf(l) ?? l.price;
    const mhd = !!l.reduced || (l.discounts ?? []).some((d) => d.kind === 'mhd');
    const packed = l.weightKg === undefined && l.amount !== undefined && (l.unit === 'g' || l.unit === 'ml');
    out.push({
      date: p.date, sortId: sortOf(l.productId), unit: shelf.unit,
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
      date: h.date, sortId: sortOf(h.productId ?? same[0]?.line.productId), unit: h.unit,
      shelf: h.perUnit, paid: h.perUnit, discount: false, mhd: false, entry: h,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Linie eines Punkts: je Sorte – und je Größe, wenn diese Sorte in mehreren Größen gekauft wurde (Julia: 400 g und
 * 1 kg Hähnchen nicht vermischen). Punkte ohne Größe in so einer Sorte: eigene Linie „Größe unbekannt“.
 */
/** Linienart je Packungsgröße einer Sorte (Julia): Hauptgröße durchgezogen, die nächste gestrichelt, dann gepunktet … */
export const SIZE_DASHES: readonly (string | undefined)[] = [undefined, '6 4', '0.5 4', '8 3 0.5 3', '2 2'];

/** Hauptgröße einer Sorte = ihre gespeicherte Packungsgröße („500 g“) – ihre Linie ist durchgezogen */
export const mainSizeOf = (products: readonly { id: string; packageAmount?: number; packageUnit?: string }[]) => (sortId: string): string | undefined => {
  const p = products.find((x) => x.id === sortId);
  return p?.packageAmount && p.packageUnit !== 'Stück' ? `${p.packageAmount} ${p.packageUnit ?? 'g'}` : undefined;
};

/**
 * Rang jeder Linie innerhalb ihrer Sorte (0 = durchgezogen): zuerst die Hauptgröße – die Packungsgröße der Sorte
 * („500 g“), sonst die meistgekaufte –, dann die übrigen nach Häufigkeit, „Größe unbekannt“ zuletzt.
 */
export function sizeRanks(points: readonly FoodPricePoint[], mainOf: (sortId: string) => string | undefined): Map<string, number> {
  const key = seriesKeyOf(points);
  const lines = new Map<string, { sortId: string; size?: string; n: number }>();
  for (const p of points) {
    const k = key(p);
    const l = lines.get(k.id) ?? { sortId: k.sortId, size: k.size, n: 0 };
    l.n++;
    lines.set(k.id, l);
  }
  const ranks = new Map<string, number>();
  for (const sortId of new Set([...lines.values()].map((l) => l.sortId))) {
    const main = mainOf(sortId);
    const score = (l: { size?: string; n: number }) => (l.size === '?' ? -1 : l.size === main ? Infinity : l.n);
    [...lines.entries()].filter(([, l]) => l.sortId === sortId)
      .sort(([, a], [, b]) => score(b) - score(a))
      .forEach(([id], i) => ranks.set(id, i));
  }
  return ranks;
}

export function seriesKeyOf(points: readonly FoodPricePoint[]): (p: FoodPricePoint) => { id: string; sortId: string; size?: string } {
  const sizes = new Map<string, Set<string>>();
  for (const p of points) if (p.size !== undefined) sizes.set(p.sortId, (sizes.get(p.sortId) ?? new Set()).add(`${p.size} ${p.sizeUnit}`));
  return (p) => {
    const split = (sizes.get(p.sortId)?.size ?? 0) > 1;
    const size = split ? (p.size !== undefined ? `${p.size} ${p.sizeUnit}` : '?') : undefined;
    return { id: `${p.sortId}|${size ?? ''}`, sortId: p.sortId, ...(size ? { size } : {}) };
  };
}

/**
 * Preise-Übersicht (Julia: derselbe Umschalter und dieselben Linien wie auf der Preis-Seite eines Lebensmittels):
 * je Lebensmittel die Punkte wie dort, je Linie (Sorte, ggf. Größe) als Preis-Eintrag – foodTrends rechnet daraus
 * teurer/günstiger. productId = die Linie („Sorte|Größe“), perUnit = Regalpreis oder bezahlt.
 * Dazu je Lebensmittel die Linienart (sizeRanks) und je Linie und Tag Rabatt/MHD für die Ringe und Rauten.
 */
export function overviewEntries(
  history: readonly PriceEntry[], purchases: readonly Purchase[], keyOf: (name: string) => string, mode: 'regal' | 'bezahlt',
  known?: ReadonlySet<string>, mainOf: (sortId: string) => string | undefined = () => undefined,
): { entries: PriceEntry[]; ranks: Map<string, Map<string, number>>; marks: Map<string, 'rabatt' | 'mhd'> } {
  const foods = new Map<string, { history: PriceEntry[]; purchases: Purchase[] }>();
  const food = (name: string) => {
    const key = keyOf(name);
    const f = foods.get(key) ?? { history: [], purchases: [] };
    foods.set(key, f);
    return f;
  };
  for (const h of history) food(h.name).history.push(h);
  for (const p of purchases) food(p.line.name).purchases.push(p);
  const entries: PriceEntry[] = [];
  const ranks = new Map<string, Map<string, number>>();
  const marks = new Map<string, 'rabatt' | 'mhd'>();
  for (const [key, f] of foods) {
    const points = foodPricePoints(f.history, f.purchases, known);
    const line = seriesKeyOf(points);
    ranks.set(key, sizeRanks(points, mainOf));
    for (const p of points) {
      const id = line(p).id;
      entries.push({ name: p.purchase?.line.name ?? p.entry!.name, perUnit: mode === 'bezahlt' ? p.paid : p.shelf, unit: p.unit, date: p.date, productId: id });
      const mark = mode === 'bezahlt' ? (p.mhd ? 'mhd' : p.discount ? 'rabatt' : undefined) : undefined;
      const at = `${key}|${id}|${day(p.date)}`;
      // je Tag zählt der letzte Einkauf (wie in foodTrends)
      if (mark) marks.set(at, mark);
      else marks.delete(at);
    }
  }
  return { entries, ranks, marks };
}

/**
 * „Zuletzt gekauft“ in der Kachel (Julia): je Packungsgröße der letzte Einkauf – nach Größe sortiert, klein nach groß.
 * Lose Ware (gewogen) und Einkäufe ohne Größe je eine Zeile dahinter. Ältere Preise ohne Bon nur, wenn es gar keinen
 * Bon-Einkauf gibt (dann der letzte).
 */
export function lastBySize(points: readonly FoodPricePoint[]): FoodPricePoint[] {
  const bought = points.filter((p) => p.purchase);
  if (!bought.length) return points.length ? [points.reduce((a, b) => (b.date > a.date ? b : a))] : [];
  const kindOf = (p: FoodPricePoint) => (p.size !== undefined ? `${p.size} ${p.sizeUnit}` : p.purchase!.line.weightKg !== undefined ? 'lose' : 'ohne');
  const last = new Map<string, FoodPricePoint>();
  for (const p of bought) if (!last.has(kindOf(p)) || last.get(kindOf(p))!.date <= p.date) last.set(kindOf(p), p);
  // ml wie g; lose und ohne Größe ans Ende
  const order = (p: FoodPricePoint) => (p.size !== undefined ? p.size : kindOf(p) === 'lose' ? Infinity : Number.MAX_VALUE);
  return [...last.values()].sort((a, b) => order(a) - order(b));
}
