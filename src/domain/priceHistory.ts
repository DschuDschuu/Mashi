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
  const groups = new Map<string, { name: string; unit: 'g' | 'Stück'; byDay: Map<string, PricePoint> }>();
  for (const e of history) {
    const key = `${receiptKey(e.name)}|${e.unit}`;
    const g = groups.get(key) ?? { name: e.name, unit: e.unit, byDay: new Map() };
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
      return { name: g.name, unit: g.unit, points, latest, change, direction };
    })
    .filter((t) => t.points.length >= minPurchases)
    .sort((a, b) => order[a.direction] - order[b.direction] || Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name, 'de'));
}

/** Für die Anzeige: € je kg bzw. je Stück. */
export const displayPrice = (perUnit: number, unit: 'g' | 'Stück') => (unit === 'g' ? perUnit * 1000 : perUnit);
export const displayUnit = (unit: 'g' | 'Stück') => (unit === 'g' ? 'kg' : 'Stück');
