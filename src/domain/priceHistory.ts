import type { PriceEntry } from './cost';
import { receiptKey } from './pantry';

/**
 * Preisverlauf der Artikel, die du regelmäßig kaufst. Grundlage: jeder Preis vom Kassenbon
 * (Regalpreis – Rabatte und Coupons stehen auf dem Bon in eigenen Zeilen und verfälschen nichts).
 */
export interface PricePoint {
  date: string;
  /** € je Gramm bzw. je Stück */
  perUnit: number;
}

export interface PriceTrend {
  name: string;
  /** je Sorte ein eigener Verlauf (ältere Preise ohne Sorte: undefined) */
  productId?: string;
  unit: 'g' | 'Stück';
  points: PricePoint[];
  latest: number;
  /** Änderung zum vorigen Einkauf, z. B. 0.12 = +12 % */
  change: number;
  direction: 'teurer' | 'guenstiger' | 'gleich';
}

/** Unter einem halben Prozent zählt als „gleich geblieben“ (Rundung auf dem Bon). */
const SAME = 0.005;

export function priceTrends(history: PriceEntry[], minPurchases = 2): PriceTrend[] {
  const groups = new Map<string, { name: string; unit: 'g' | 'Stück'; productId?: string; byDay: Map<string, PricePoint> }>();
  for (const e of history) {
    const key = `${receiptKey(e.name)}|${e.unit}|${e.productId ?? ''}`;
    const g = groups.get(key) ?? { name: e.name, unit: e.unit, ...(e.productId ? { productId: e.productId } : {}), byDay: new Map() };
    // Derselbe Tag zweimal (Bon doppelt importiert) zählt einmal – der zuletzt eingetragene gewinnt
    g.byDay.set(e.date.slice(0, 10), { date: e.date, perUnit: e.perUnit });
    g.name = e.name;
    groups.set(key, g);
  }

  const order = { teurer: 0, guenstiger: 1, gleich: 2 };
  return [...groups.values()]
    .map((g) => {
      const points = [...g.byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
      const latest = points[points.length - 1]?.perUnit ?? 0;
      const previous = points[points.length - 2]?.perUnit ?? latest;
      const change = previous ? (latest - previous) / previous : 0;
      const direction: PriceTrend['direction'] = change > SAME ? 'teurer' : change < -SAME ? 'guenstiger' : 'gleich';
      return { name: g.name, unit: g.unit, ...(g.productId ? { productId: g.productId } : {}), points, latest, change, direction };
    })
    .filter((t) => t.points.length >= minPurchases)
    .sort((a, b) => order[a.direction] - order[b.direction] || Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name, 'de'));
}

/** Für die Anzeige: € je kg bzw. je Stück. */
export const displayPrice = (perUnit: number, unit: 'g' | 'Stück') => (unit === 'g' ? perUnit * 1000 : perUnit);
export const displayUnit = (unit: 'g' | 'Stück') => (unit === 'g' ? 'kg' : 'Stück');

/** Eine Sorte im Verlauf eines Lebensmittels ('' = ohne Sorte) */
export interface SortSeries {
  id: string;
  points: PricePoint[];
  latest: number;
  /** Änderung zum vorigen Einkauf dieser Sorte */
  change: number;
  direction: PriceTrend['direction'];
}

/** Ein Lebensmittel mit seinen Sorten – für die Preise-Übersicht (Julia: eine Karte je Lebensmittel, Linie je Sorte) */
export interface FoodTrend {
  key: string;
  name: string;
  unit: 'g' | 'Stück';
  sorts: SortSeries[];
  /** wie die zuletzt gekaufte Sorte – danach wird einsortiert (teurer / günstiger / gleich) */
  direction: PriceTrend['direction'];
  change: number;
}

function seriesOf(id: string, byDay: Map<string, PricePoint>): SortSeries {
  const points = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = points[points.length - 1]?.perUnit ?? 0;
  const previous = points[points.length - 2]?.perUnit ?? latest;
  const change = previous ? (latest - previous) / previous : 0;
  return { id, points, latest, change, direction: change > SAME ? 'teurer' : change < -SAME ? 'guenstiger' : 'gleich' };
}

/**
 * Verläufe je Lebensmittel und Sorte. Je Lebensmittel zählt die Einheit mit den meisten Einkäufen (je kg und je Stück
 * lassen sich nicht vergleichen). Erst ab minPurchases Einkäufen insgesamt.
 * @param keyOf welches Lebensmittel („Hähnchen“ und „Hähnchenbrust“ sind dasselbe, wenn die Tabelle es sagt)
 * @param sortOf welche Sorte – ältere Preise haben keine; '' = ohne Sorte
 */
export function foodTrends(history: readonly PriceEntry[], keyOf: (name: string) => string, sortOf: (e: PriceEntry) => string | undefined, minPurchases = 2): FoodTrend[] {
  const foods = new Map<string, { name: string; date: string; entries: PriceEntry[] }>();
  for (const e of history) {
    const key = keyOf(e.name);
    const f = foods.get(key) ?? { name: e.name, date: '', entries: [] };
    f.entries.push(e);
    if (e.date >= f.date) { f.date = e.date; f.name = e.name; }
    foods.set(key, f);
  }
  const order = { teurer: 0, guenstiger: 1, gleich: 2 };
  const out: FoodTrend[] = [];
  for (const [key, f] of foods) {
    const count = (u: 'g' | 'Stück') => f.entries.filter((e) => e.unit === u).length;
    const unit: 'g' | 'Stück' = count('g') >= count('Stück') ? 'g' : 'Stück';
    const bySort = new Map<string, Map<string, PricePoint>>();
    for (const e of f.entries.filter((x) => x.unit === unit)) {
      const id = sortOf(e) ?? '';
      const days = bySort.get(id) ?? new Map<string, PricePoint>();
      days.set(e.date.slice(0, 10), { date: e.date, perUnit: e.perUnit });
      bySort.set(id, days);
    }
    const sorts = [...bySort.entries()].map(([id, days]) => seriesOf(id, days));
    if (sorts.reduce((n, s) => n + s.points.length, 0) < minPurchases) continue;
    // die zuletzt gekaufte Sorte bestimmt die Gruppe
    const last = [...sorts].sort((a, b) => b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date))[0];
    out.push({ key, name: f.name, unit, sorts, direction: last.direction, change: last.change });
  }
  return out.sort((a, b) => order[a.direction] - order[b.direction] || Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name, 'de'));
}
