import { aliasesOf, guessMatch, normalizeName, PROVIDER } from './localFoods';
import { nameOf, type MyProduct } from './myProducts';
import { isDried } from './noNutrition';
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

/**
 * Zutat, für die ein Produkt gilt: was es in der Tabelle ersetzt („Joghurt“) – sonst sein erster
 * eigener Zutatenname („grünes pesto“) – sonst der eigene Name. Die Tabelle zuerst, weil ein
 * zusätzlicher freier Name („Skyr-Dessert“) die Zeile sonst unter diesen Namen verschieben würde.
 */
function keyOf(p: Pick<MyProduct, 'name' | 'replaces' | 'names'>, table: FoodTable, spelled: ReadonlyMap<string, string>): { key: string; label: string } {
  const replaced = p.replaces[0] ? table.byRef({ provider: PROVIDER, foodId: p.replaces[0] }) ?? table.matchName(p.replaces[0])?.food : undefined;
  if (replaced) {
    // Einträge mit Fettstufe („Milch 3,5 %“) haben meist auch den schlichten Namen („milch“) – den nehmen
    const plain = /\d/.test(replaced.name) ? aliasesOf(replaced.ref.foodId).find((a) => !/\d/.test(a)) : undefined;
    const label = plain ? plain.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase()) : replaced.name;
    return { key: normalizeName(label), label };
  }
  if (p.names?.length) {
    const key = normalizeName(p.names[0]);
    // gespeichert ist der Name klein („grünes pesto“) – angezeigt wie in deinen Rezepten („Grünes Pesto“)
    return { key, label: spelled.get(key) ?? cap(p.names[0]) };
  }
  return { key: normalizeName(p.name), label: p.name };
}

/**
 * @param known Zutatennamen, wie du sie schreibst (aus Rezepten und Vorrat) – für die Anzeige
 * @param keep Zutaten, die auch ohne jede Festlegung in der Liste bleiben – z. B. gerade eben
 *   „Immer im Haus“ ausgeschaltet: sonst verschwände die Zeile unter dem Finger und ließe sich nicht zurückholen
 * @param spiceNameOf wie ein Gewürz heißt – gibt es es auch frisch: „Petersilie getrocknet“ (siehe spiceName), eigene Zeile
 */
export function buildFoodList(
  products: MyProduct[], basics: string[], zero: string[], table: FoodTable, known: readonly string[] = [], keep: readonly string[] = [],
  spiceNameOf: (name: string) => string = (z) => z,
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
      // „Basilikum getrocknet“ ist nicht das frische Basilikum, auch wenn die Tabelle es so zuordnet
      || (!isDried(name) && p.replaces.includes(table.matchName(name)?.food.ref.foodId ?? '\u0000'))));
    if (hit) return hit;
    const row: Draft = { key: n, name: '', label: name, products: [], table: table.matchName(name)?.food };
    rows.set(n, row);
    return row;
  };
  for (const b of basics) rowFor(b).basic = b;
  for (const z of zero) rowFor(spiceNameOf(z)).zero = z;
  for (const k of keep) rowFor(k);

  return [...rows.values()]
    .map(({ label, ...r }) => ({ ...r, ingredient: label, name: r.products.length === 1 ? nameOf(r.products[0]) : label }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Tabs: Produkte = was du pflegst (normal und nachkaufen – Sorten, Werte, Grenzen).
 * Im Haus und Gewürze (= ohne Nährwerte) = was du einmal einstellst.
 */
export type FoodFilter = 'produkte' | 'haus' | 'ohne';
export function matchesFilter(r: FoodRow, f: FoodFilter): boolean {
  if (f === 'ohne') return !!r.zero;
  if (f === 'haus') return !r.zero && !!r.basic;
  return !r.zero && !r.basic;
}

/** In welchem Tab die Zeile steht – für „gibt es schon unter …“ und um dorthin zu springen */
export const tabOf = (r: FoodRow): FoodFilter => (r.zero ? 'ohne' : r.basic ? 'haus' : 'produkte');

/**
 * Unter welchem Schlüssel ein neues Produkt mit diesem Namen in der Liste stünde – genau wie beim Speichern:
 * das Formular füllt „gilt für“ aus dem Namen (guessMatch), die Liste ordnet über keyOf zu.
 */
export function rowKeyOf(name: string, table: FoodTable): string {
  const m = guessMatch(name);
  return keyOf({ name: name.trim(), replaces: m.replaces, ...(m.names.length ? { names: m.names } : {}) }, table, new Map()).key;
}

/**
 * Grob angeglichene Schreibweisen eines Namens: ae/oe/ue wie ä/ö/ü, ß wie ss, ohne Leerzeichen und Bindestriche –
 * und dazu je eine ohne Plural-Endung (en, n, s, e). Zwei Namen gelten als gleich geschrieben, wenn sich ihre Formen
 * treffen: Haferflocke = Haferflocken, Kimchis = Kimchi, Gruene Bohnen = Grüne Bohnen, Rinder-Hack = Rinderhack.
 * Endungen nur ab 4 Buchstaben Rest – sonst wäre „Eis“ ein „Ei“ und „Reis“ ein „Rei“.
 */
function spellings(name: string): string[] {
  const s = normalizeName(name).replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ß/g, 'ss').replace(/[\s\-/]/g, '');
  return [s, ...['en', 'n', 's', 'e'].filter((e) => s.endsWith(e) && s.length - e.length >= 4).map((e) => s.slice(0, -e.length))];
}
export function sameSpelling(a: string, b: string): boolean {
  const as = spellings(a);
  return !!as[0] && spellings(b).some((x) => as.includes(x));
}

/** Was gefunden wurde – siehe findExisting */
export interface ExistingFood {
  row: FoodRow;
  /**
   * dasselbe Lebensmittel: Speichern landete in genau dieser Zeile (als zweite, gleichnamige Sorte) oder doppelt daneben.
   * Dann gibt es kein „Nein, eigenes Lebensmittel“ (Julia: nicht doppelt anlegen) – false: nur ähnlich („Rinderhack leicht“).
   */
  same: boolean;
  /** nur an der Schreibweise erkannt („Kimchis“) – Rezepte mit dieser Schreibweise fänden die Zeile noch nicht */
  spelling?: boolean;
}

/**
 * Gibt es dieses Lebensmittel schon – mit Sorten, nur „Immer im Haus“ oder als Gewürz? Für den Hinweis beim Anlegen,
 * überall gleich (Liste, Bon, Rezept, Vorrat). Der Reihe nach:
 * 1. derselbe Schlüssel wie beim Speichern oder genau dieser Name (auch der einer Sorte, „Immer im Haus“, Gewürz)
 * 2. dasselbe Lebensmittel laut Tabelle (Hackfleisch → dein Rinderhack)
 * 3. andere Schreibweise (siehe sameSpelling)
 * 4. nur ähnlich: der Name enthält einen vorhandenen als ganze Wörter (Julia: „Rinderhack leicht 500g“ vom Bon) –
 *    der längste gewinnt; nur Zeilen mit Sorten, ein Gewürz hat keine
 * @param skip ausgeschlossen („Nein, eigenes Lebensmittel“ gewählt)
 */
export function findExisting(rows: readonly FoodRow[], name: string, table: FoodTable, skip = ''): ExistingFood | undefined {
  const k = normalizeName(name);
  if (!k || k === skip) return undefined;
  const namesOf = (r: FoodRow) => [r.key, r.name, r.ingredient, r.basic, r.zero, ...r.products.flatMap((p) => [nameOf(p), ...(p.names ?? [])])]
    .filter((n): n is string => !!n).map(normalizeName).filter(Boolean);
  const key = rowKeyOf(name, table);
  const exact = rows.find((r) => r.key === key) ?? rows.find((r) => namesOf(r).includes(k));
  if (exact) return { row: exact, same: true };
  // nur ein sicherer Treffer – ein ungefährer („Rinderhack leicht 500g“) bekäme beim Speichern eine eigene Zeile
  const hit = table.matchName(name);
  if (hit?.quality === 'exact') {
    // eigene Produkte stehen auch in der Tabelle – dann ist der Treffer die Sorte selbst
    const ids = new Set([hit.food.ref.foodId, ...(hit.food.variants?.map((v) => v.id) ?? [])]);
    const byTable = rows.find((r) => r.products.some((p) => ids.has(p.id) || p.replaces.some((x) => ids.has(x))));
    if (byTable) return { row: byTable, same: true };
  }
  const loose = rows.find((r) => namesOf(r).some((n) => sameSpelling(n, k)));
  if (loose) return { row: loose, same: true, spelling: true };
  const words = ` ${k.replace(/[-/]/g, ' ')} `;
  const contained = rows
    .filter((r) => r.products.length > 0 && !r.zero)
    .map((r) => ({ r, len: Math.max(0, ...namesOf(r).filter((n) => words.includes(` ${n.replace(/[-/]/g, ' ')} `)).map((n) => n.length)) }))
    .filter((x) => x.len > 0)
    .sort((a, b) => b.len - a.len)[0];
  return contained ? { row: contained.r, same: false } : undefined;
}

/** Die Zeile mit Sorten zu diesem Namen (Nährwert-Lücken: „1 Stück wiegt“ in deren Kachel) – siehe findExisting */
export function findFoodRow(rows: readonly FoodRow[], name: string, table: FoodTable, skip = ''): FoodRow | undefined {
  return findExisting(rows.filter((r) => r.products.length > 0), name, table, skip)?.row;
}

/**
 * Was an einem Namen über den vorhandenen hinausgeht – als Zusatz der neuen Sorte: „Milch 1,5 %“ zu „Milch“ → „1,5 %“,
 * „Rinderhack leicht“ → „leicht“. Steht der vorhandene Name nicht als ganze Wörter darin: nichts.
 */
export function extraWords(typed: string, base: string): string | undefined {
  const b = base.trim();
  if (!b) return undefined;
  const at = typed.toLocaleLowerCase('de-DE').search(new RegExp(`(^|\\s)${b.toLocaleLowerCase('de-DE').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`));
  if (at < 0) return undefined;
  const start = at === 0 && !/^\s/.test(typed) ? 0 : at + 1;
  const rest = `${typed.slice(0, start)} ${typed.slice(start + b.length)}`.replace(/\s+/g, ' ').trim();
  return rest || undefined;
}
