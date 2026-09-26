import { normalizeName, PROVIDER } from './localFoods';
import type { MyProduct } from './myProducts';
import type { FoodEntry, FoodTable } from './types';

/**
 * „Meine Lebensmittel“: alles, was du selbst über Zutaten festgelegt hast, in EINER Liste –
 * eigene Produkte (mit oder ohne Packung), „Immer im Haus“ und „Ohne Nährwerte“.
 * Eine Zeile je Zutat; mehrere Produkte für dieselbe Zutat stehen als Sorten in einer Zeile.
 */
export interface FoodRow {
  /** normalisierter Zutatenname – Schlüssel der Zeile */
  key: string;
  /** Anzeige: Produktname (eine Sorte) oder Zutat (mehrere Sorten / nur markiert) */
  name: string;
  /** die Zutat, wie sie in Rezepten heißt („Milch“) – für „Immer im Haus“/„Ohne Nährwerte“ */
  ingredient: string;
  /** eigene Produkte für diese Zutat – mehrere = Sorten */
  products: MyProduct[];
  /** Eintrag in „Immer im Haus“ / „Ohne Nährwerte“ (genau so geschrieben, wie er in der Liste steht) */
  basic?: string;
  zero?: string;
  /** Werte der allgemeinen Tabelle, wenn es kein eigenes Produkt gibt */
  table?: FoodEntry;
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('de-DE') + s.slice(1);

/** Zutat, für die ein Produkt gilt: sein erster Name – sonst das, was es ersetzt – sonst der eigene Name */
function keyOf(p: MyProduct, table: FoodTable, spelled: ReadonlyMap<string, string>): { key: string; label: string } {
  if (p.names?.length) {
    const key = normalizeName(p.names[0]);
    // gespeichert ist der Name klein („grünes pesto“) – angezeigt wie in deinen Rezepten („Grünes Pesto“)
    return { key, label: spelled.get(key) ?? cap(p.names[0]) };
  }
  const replaced = p.replaces[0] ? table.byRef({ provider: PROVIDER, foodId: p.replaces[0] }) ?? table.matchName(p.replaces[0])?.food : undefined;
  if (replaced) return { key: normalizeName(replaced.name), label: replaced.name };
  return { key: normalizeName(p.name), label: p.name };
}

/**
 * @param known Zutatennamen, wie du sie schreibst (aus Rezepten und Vorrat) – für die Anzeige
 * @param keep Zutaten, die auch ohne jede Festlegung in der Liste bleiben – z. B. gerade eben
 *   „Immer im Haus“ ausgeschaltet: sonst verschwände die Zeile unter dem Finger und ließe sich nicht zurückholen
 */
export function buildFoodList(
  products: MyProduct[], basics: string[], zero: string[], table: FoodTable, known: readonly string[] = [], keep: readonly string[] = [],
): FoodRow[] {
  const spelled = new Map(known.map((k) => [normalizeName(k), k.trim()] as const));
  type Draft = Omit<FoodRow, 'ingredient'> & { label: string };
  const rows = new Map<string, Draft>();
  for (const p of products) {
    const { key, label } = keyOf(p, table, spelled);
    const row = rows.get(key) ?? { key, name: '', label, products: [] };
    row.products.push(p);
    rows.set(key, row);
  }

  /** Name aus „Immer im Haus“/„Ohne Nährwerte“ einer Zeile zuordnen – über Zutat, Produktname, ersetzte Lebensmittel */
  const rowFor = (name: string) => {
    const n = normalizeName(name);
    const hit = rows.get(n) ?? [...rows.values()].find((r) => r.products.some((p) =>
      normalizeName(p.name) === n || p.names?.some((x) => normalizeName(x) === n)
      || p.replaces.includes(table.matchName(name)?.food.ref.foodId ?? '\u0000')));
    if (hit) return hit;
    const row: Draft = { key: n, name: '', label: name, products: [], table: table.matchName(name)?.food };
    rows.set(n, row);
    return row;
  };
  for (const b of basics) rowFor(b).basic = b;
  for (const z of zero) rowFor(z).zero = z;
  for (const k of keep) rowFor(k);

  return [...rows.values()]
    .map(({ label, ...r }) => ({ ...r, ingredient: label, name: r.products.length === 1 ? r.products[0].name : label }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Filter oben auf der Seite */
export type FoodFilter = 'alle' | 'produkte' | 'haus' | 'ohne';
export function matchesFilter(r: FoodRow, f: FoodFilter): boolean {
  if (f === 'produkte') return r.products.length > 0; // eigene Werte – mit oder ohne Packung, auch Sorten
  if (f === 'haus') return !!r.basic;
  if (f === 'ohne') return !!r.zero;
  return true;
}
