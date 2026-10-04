import type { PriceEntry } from './cost';
import type { Pantry } from './pantry';

/**
 * Wo eine Sorte überall steht: Vorrat, Bon-Zeilen, Gelerntes vom Bon und Preisverlauf. Zum Umhängen, wenn eine Sorte
 * entfernt wird (Julia: beim Entfernen fragen, wohin ihre Einkäufe gehen), und zum Zuordnen alter Preise ohne Sorte
 * (Julia: „Hackfleisch ohne Sorte, obwohl alles zugeordnet ist“).
 */
type Tagged = { productId?: string };

/** Ein Preis hat keine ID – Name, Zeitpunkt und Preis machen ihn eindeutig genug */
const priceKey = (e: PriceEntry) => `price:${e.name}|${e.date}|${e.perUnit}`;

function spots(p: Pantry): [string, Tagged][] {
  return [
    ...p.items.map((i): [string, Tagged] => [`item:${i.id}`, i]),
    ...(p.bons ?? []).flatMap((b) => b.lines.map((l, n): [string, Tagged] => [`line:${b.id}#${n}`, l])),
    ...p.rules.map((r): [string, Tagged] => [`rule:${r.key}`, r]),
    ...[...(p.history ?? []), ...p.prices].map((e): [string, Tagged] => [priceKey(e), e]),
  ];
}

/** jede Stelle bekommt die Sorte, die sortFor sagt (undefined = ohne Sorte); geänderte Bons gelten als neuer (Abgleich) */
function retag(p: Pantry, sortFor: (key: string, current: string | undefined) => string | undefined, now: string): Pantry {
  const fix = <T extends Tagged>(key: string, x: T): T => {
    const id = sortFor(key, x.productId);
    if (id === x.productId) return x;
    const { productId: _, ...rest } = x;
    return (id ? { ...rest, productId: id } : rest) as T;
  };
  return {
    ...p,
    items: p.items.map((i) => fix(`item:${i.id}`, i)),
    rules: p.rules.map((r) => fix(`rule:${r.key}`, r)),
    prices: p.prices.map((e) => fix(priceKey(e), e)),
    ...(p.history ? { history: p.history.map((e) => fix(priceKey(e), e)) } : {}),
    ...(p.bons ? {
      bons: p.bons.map((b) => {
        const lines = b.lines.map((l, n) => fix(`line:${b.id}#${n}`, l));
        return lines.some((l, n) => l !== b.lines[n]) ? { ...b, lines, updatedAt: now } : b;
      }),
    } : {}),
  };
}

/** Wie viel an einer Sorte hängt – Einkäufe (Bon-Zeilen, ohne Bon: gemerkte Preise) und Vorrat */
export function sortUses(p: Pantry, id: string): { purchases: number; stock: number } {
  const lines = (p.bons ?? []).reduce((n, b) => n + b.lines.filter((l) => !l.skip && l.productId === id).length, 0);
  return {
    purchases: lines || (p.history ?? p.prices).filter((e) => e.productId === id).length,
    stock: p.items.filter((i) => i.productId === id).length,
  };
}

/**
 * Alles von Sorte „from“ zu Sorte „to“ (oder ohne Sorte). undo setzt genau diese Stellen zurück –
 * was sich dazwischen sonst geändert hat, bleibt.
 */
export function moveSort(p: Pantry, from: string, to: string | undefined, now: string): { next: Pantry; undo: (q: Pantry) => Pantry } {
  const keys = new Set(spots(p).filter(([, x]) => x.productId === from).map(([k]) => k));
  return {
    next: retag(p, (k, id) => (keys.has(k) && id === from ? to : id), now),
    undo: (q) => retag(q, (k, id) => (keys.has(k) && id === to ? from : id), now),
  };
}

/** Preise (ohne Sorte oder mit einer entfernten) einer Sorte zuordnen – mit undo wie bei moveSort */
export function assignPrices(p: Pantry, entries: readonly PriceEntry[], to: string, now: string): { next: Pantry; undo: (q: Pantry) => Pantry } {
  const was = new Map(entries.map((e) => [priceKey(e), e.productId]));
  return {
    next: retag(p, (k, id) => (was.has(k) && id === was.get(k) ? to : id), now),
    undo: (q) => retag(q, (k, id) => (was.has(k) && id === to ? was.get(k) : id), now),
  };
}
