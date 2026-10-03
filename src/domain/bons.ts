import type { PriceEntry } from './cost';
import {
  addItem, priceOf, putFrozen, receiptKey, ruleOf, sameName, samePack, stockOf, defaultId,
  type BonStock, type ImportRow, type Pantry, type PantryItem, type PantryUnit,
} from './pantry';
import type { DiscountKind, LineDiscount } from './receipt';
import type { BonSavings, ReceiptSavings } from './savings';

/**
 * Gespeicherte Kassenbons (Julia): die erkannten Zeilen – kein Foto –, damit man später nachsehen und
 * korrigieren kann (Menge, Zuordnung, Preis/Rabatt). Eine Korrektur wirkt wie ein richtig eingelesener Bon:
 * Vorrat, Preisverlauf, Ersparnis und das Gelernte für den nächsten Bon ziehen mit.
 */
export interface BonLine {
  /** so wie auf dem Bon („Rinderhack 500g“) */
  bon: string;
  count: number;
  weightKg?: number;
  /** Kilopreis vom Bon (oder von dir) – geht vor Preis ÷ Gewicht */
  perKg?: number;
  /** Preis auf dem Bon – vor Rabatt */
  price?: number;
  /** Rabattzeilen darunter */
  discounts?: LineDiscount[];
  /** beim Import übersprungen – steht nicht im Vorrat */
  skip?: boolean;
  /** Name in der Speisekammer */
  name: string;
  /** Gesamtmenge der Zeile (wie beim Import) – leer = „vorhanden“ */
  amount?: number;
  unit?: PantryUnit;
  productId?: string;
  reduced?: boolean;
  /** so viele Packungen gleich eingefroren */
  freeze?: number;
  /**
   * Nachträglich aufgenommen, nur für den Preis (Julia: übersprungene Zeile wegen des Preises) – stand nie in der
   * Speisekammer; Korrekturen an der Zeile ändern dann auch keinen Vorrat
   */
  priceOnly?: boolean;
}

export interface SavedBon {
  id: string;
  /** Einkaufstag|Endbetrag – derselbe Bon noch einmal ersetzt den alten */
  key?: string;
  /** Einkaufsdatum */
  date: string;
  /** „Zu zahlen“ */
  total?: number;
  savings?: Pick<BonSavings, 'lidlPlus' | 'offers' | 'mhd'>;
  lines: BonLine[];
  /** doppelt eingelesen – die Mengen sind wieder aus dem Vorrat genommen; Korrekturen ändern den Vorrat dann nicht */
  noStock?: boolean;
  updatedAt: string;
}

/** so viele Bons hebt Mashi auf – ältere fallen raus (der Preisverlauf bleibt) */
export const MAX_BONS = 100;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const DISCOUNT_LABEL: Record<DiscountKind, string> = { angebot: 'Angebot', lidlplus: 'Lidl Plus', mhd: 'MHD' };

export const discountOf = (l: Pick<BonLine, 'discounts'>) => round2((l.discounts ?? []).reduce((n, d) => n + d.amount, 0));
/** Was du wirklich bezahlt hast: Preis minus Rabatte */
export const paidOf = (l: Pick<BonLine, 'price' | 'discounts'>) => (l.price === undefined ? undefined : round2(l.price - discountOf(l)));

export function lineFromRow(r: ImportRow): BonLine {
  return {
    bon: r.line.name, count: r.line.count,
    ...(r.line.weightKg !== undefined ? { weightKg: r.line.weightKg } : {}),
    ...(r.line.perKg !== undefined ? { perKg: r.line.perKg } : {}),
    ...(r.line.price !== undefined ? { price: r.line.price } : {}),
    ...(r.line.discounts?.length ? { discounts: r.line.discounts } : {}),
    ...(r.skip ? { skip: true } : {}),
    name: r.name.trim(),
    ...(r.amount !== undefined ? { amount: r.amount, ...(r.unit ? { unit: r.unit } : {}) } : {}),
    ...(r.productId ? { productId: r.productId } : {}),
    ...(r.reduced ? { reduced: true } : {}),
    ...(r.freeze ? { freeze: r.freeze } : {}),
  };
}

export function rowFromLine(l: BonLine): ImportRow {
  return {
    line: { name: l.bon, count: l.count, ...(l.weightKg !== undefined ? { weightKg: l.weightKg } : {}), ...(l.perKg !== undefined ? { perKg: l.perKg } : {}), ...(l.price !== undefined ? { price: l.price } : {}), ...(l.discounts ? { discounts: l.discounts } : {}) },
    key: receiptKey(l.bon), known: true, skip: !!l.skip, name: l.name,
    ...(l.amount !== undefined ? { amount: l.amount, unit: l.unit } : {}),
    ...(l.productId ? { productId: l.productId } : {}),
    ...(l.reduced ? { reduced: true } : {}),
    ...(l.freeze ? { freeze: l.freeze } : {}),
  };
}

export function bonFromImport(rows: ImportRow[], date: string, now: string, id: string, key?: string, savings?: BonSavings): SavedBon {
  return {
    id, ...(key ? { key } : {}), date,
    ...(savings?.total !== undefined ? { total: savings.total } : {}),
    ...(savings && (savings.lidlPlus || savings.offers || savings.mhd) ? { savings: { lidlPlus: savings.lidlPlus, offers: savings.offers, mhd: savings.mhd } } : {}),
    lines: rows.map(lineFromRow),
    updatedAt: now,
  };
}

/** Bon aufheben – derselbe Bon (gleicher Schlüssel) ersetzt den alten; nur die neuesten MAX_BONS bleiben */
export function addBon(pantry: Pantry, bon: SavedBon): Pantry {
  const others = (pantry.bons ?? []).filter((b) => !(bon.key && b.key === bon.key) && b.id !== bon.id);
  const bons = [...others, bon].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_BONS);
  return { ...pantry, bons };
}

export type BonLinePatch = Partial<Pick<BonLine, 'name' | 'amount' | 'unit' | 'productId' | 'price' | 'discounts' | 'count' | 'weightKg' | 'perKg'>>;

/**
 * Eine Zeile eines gespeicherten Bons ändern – und alles, was daraus entstanden ist, mit:
 * Vorrat (um den Unterschied; schon Verbrauchtes bleibt verbraucht), Preisverlauf, Ersparnis und
 * das Gelernte für den nächsten Bon.
 */
export function editBonLine(pantry: Pantry, bonId: string, index: number, patch: BonLinePatch, now = new Date().toISOString(), newId = defaultId): Pantry {
  const bon = pantry.bons?.find((b) => b.id === bonId);
  const old = bon?.lines[index];
  if (!bon || !old) return pantry;
  const next = cleanLine({ ...old, ...patch });
  let out = withLine(pantry, bonId, index, next, now);
  if (old.skip) return out; // stand nie im Vorrat

  const before = rowFromLine(old);
  const after = rowFromLine(next);
  // doppelt eingelesen und zurückgenommen bzw. nur für den Preis aufgenommen: nur Preise und Gelerntes
  if (!bon.noStock && !old.priceOnly) out = { ...out, items: moveStock(out.items, stockOf(before), stockOf(after), bon.date, now, newId) };
  out = { ...out, ...movePrice(out, priceOf(before, bon.date), priceOf(after, bon.date)) };
  out = { ...out, rules: out.rules.map((r) => (r.key === before.key ? ruleOf(after) : r)) };
  return withSavingsDelta(out, bonId, old, next);
}

/** ohne Menge auch ohne Einheit („vorhanden“); leere Felder ganz weg */
function cleanLine(merged: BonLine): BonLine {
  return Object.fromEntries(Object.entries(merged).filter(([k, v]) => v !== undefined && !(k === 'unit' && merged.amount === undefined)
    && !(k === 'productId' && !v) && !(k === 'discounts' && !(v as LineDiscount[]).length))) as unknown as BonLine;
}

function withLine(pantry: Pantry, bonId: string, index: number, line: BonLine, now: string): Pantry {
  return { ...pantry, bons: (pantry.bons ?? []).map((b) => (b.id === bonId ? { ...b, lines: b.lines.map((l, i) => (i === index ? line : l)), updatedAt: now } : b)) };
}

/**
 * Übersprungene Zeile nachträglich aufnehmen (Julia: wegen des Preises). Der Preis kommt in den Verlauf, und Mashi
 * merkt sich den Artikel für den nächsten Bon (nicht mehr überspringen). In die Speisekammer nur, wenn du es willst –
 * bei älteren Bons ist es meist schon verbraucht (Julias Wahl: Haken, standardmäßig aus).
 * Die Ersparnis bleibt: Rabatte übersprungener Zeilen zählten beim Einlesen schon mit.
 */
export function includeBonLine(pantry: Pantry, bonId: string, index: number, patch: BonLinePatch, toStock: boolean, now = new Date().toISOString(), newId = defaultId): Pantry {
  const bon = pantry.bons?.find((b) => b.id === bonId);
  const old = bon?.lines[index];
  if (!bon || !old?.skip) return pantry;
  const stock = toStock && !bon.noStock;
  const { skip: _s, priceOnly: _p, ...rest } = { ...old, ...patch };
  const next = cleanLine({ ...rest, ...(stock ? {} : { priceOnly: true }) });
  let out = withLine(pantry, bonId, index, next, now);
  const row = rowFromLine(next);
  if (stock) {
    const st = stockOf(row);
    if (st.freshOn) out = { ...out, items: put(out.items, st, st.fresh, false, bon.date, now, newId) };
    if (st.frozenOn) out = { ...out, items: put(out.items, st, st.frozen, true, bon.date, now, newId) };
  }
  out = { ...out, ...movePrice(out, undefined, priceOf(row, bon.date)) };
  const rule = ruleOf(row);
  return { ...out, rules: [...out.rules.filter((r) => r.key !== rule.key), rule] };
}

/** Vorrat umbuchen: was der alte Stand eingebucht hat, gegen den neuen tauschen */
function moveStock(items: PantryItem[], from: BonStock, to: BonStock, date: string, now: string, newId: () => string): PantryItem[] {
  let out = items;
  if (from.freshOn) out = movePart(out, from, to, false, date, now, newId);
  if (from.frozenOn) out = movePart(out, from, to, true, date, now, newId);
  return out;
}

const sameStock = (a: BonStock, b: BonStock) => sameName(a.name, b.name) && a.productId === b.productId && a.unit === b.unit && samePack(a.pack, b.pack) && !!a.reduced === !!b.reduced;

/** der Vorrat, in den die Zeile gebucht wurde – Ungeöffnetes zuerst, sonst das Neueste */
function findStock(items: PantryItem[], s: BonStock, frozen: boolean): PantryItem | undefined {
  return items
    .filter((x) => !x.recipeId && sameName(x.name, s.name) && x.productId === s.productId && !!x.frozenAt === frozen
      && x.unit === s.unit && samePack(x.pack, s.pack) && (frozen || !!x.reduced === !!s.reduced))
    .sort((a, b) => Number(!!a.openedAt) - Number(!!b.openedAt) || b.addedAt.localeCompare(a.addedAt))[0];
}

function setAmount(items: PantryItem[], id: string, amount: number): PantryItem[] {
  const a = round1(amount);
  return a > 0 ? items.map((x) => (x.id === id ? { ...x, amount: a } : x)) : items.filter((x) => x.id !== id);
}

function put(items: PantryItem[], s: BonStock, amount: number | undefined, frozen: boolean, date: string, now: string, newId: () => string): PantryItem[] {
  if (frozen) return putFrozen(items, s, amount, date, now, newId);
  return addItem(items, { name: s.name, amount, unit: amount === undefined ? undefined : s.unit, pack: s.pack, boughtAt: date, reduced: s.reduced, productId: s.productId }, now, newId);
}

function movePart(items: PantryItem[], from: BonStock, to: BonStock, frozen: boolean, date: string, now: string, newId: () => string): PantryItem[] {
  const oldAmt = frozen ? from.frozen : from.fresh;
  const newAmt = frozen ? to.frozen : to.fresh;
  const it = findStock(items, from, frozen);
  if (sameStock(from, to)) {
    // nur die Menge: um den Unterschied (500 statt 5000 g – davon 300 g verkocht → 200 g)
    if (oldAmt === undefined || newAmt === undefined) {
      // „vorhanden“ bekommt eine Menge
      return it && it.amount === undefined && newAmt !== undefined ? items.map((x) => (x.id === it.id ? { ...x, amount: newAmt, unit: to.unit } : x)) : items;
    }
    const delta = newAmt - oldAmt;
    if (it?.amount !== undefined) return setAmount(items, it.id, it.amount + delta);
    return delta > 0 ? put(items, to, round1(delta), frozen, date, now, newId) : items;
  }
  // anders zugeordnet (Name, Sorte, Packung): was davon noch da ist, wandert mit – Verbrauchtes bleibt verbraucht
  if (!it) return items;
  let used = 0;
  if (it.amount === undefined || oldAmt === undefined) {
    items = items.filter((x) => x.id !== it.id);
  } else {
    const take = Math.min(it.amount, oldAmt);
    used = oldAmt - take;
    items = setAmount(items, it.id, it.amount - take);
  }
  const comparable = from.unit === to.unit && samePack(from.pack, to.pack);
  const add = newAmt === undefined ? undefined : comparable ? round1(newAmt - used) : newAmt;
  if (add !== undefined && add <= 0) return items;
  return put(items, to, add, frozen, date, now, newId);
}

const day = (iso: string) => iso.slice(0, 10);

/** Preisverlauf: der Eintrag dieses Tages wird ersetzt; „zuletzt bezahlt“ je Artikel neu aus dem Verlauf */
function movePrice(pantry: Pantry, before: PriceEntry | undefined, after: PriceEntry | undefined): Pick<Pantry, 'history' | 'prices'> {
  let history = [...(pantry.history ?? pantry.prices ?? [])];
  const at = (p: PriceEntry) => (h: PriceEntry) => receiptKey(h.name) === receiptKey(p.name) && day(h.date) === day(p.date) && h.productId === p.productId;
  if (before) history = history.filter((h) => !at(before)(h));
  if (after) history = [...history.filter((h) => !at(after)(h)), after];
  const keys = new Set([before, after].filter((p): p is PriceEntry => !!p).map((p) => receiptKey(p.name)));
  const latest = (key: string) => history.filter((h) => receiptKey(h.name) === key).sort((a, b) => a.date.localeCompare(b.date)).pop();
  const prices = [
    ...(pantry.prices ?? []).filter((p) => !keys.has(receiptKey(p.name))),
    ...[...keys].map(latest).filter((p): p is PriceEntry => !!p),
  ];
  return { history, prices };
}

const SAVING_FIELD: Record<DiscountKind, 'offers' | 'lidlPlus' | 'mhd'> = { angebot: 'offers', lidlplus: 'lidlPlus', mhd: 'mhd' };

function sums(l: BonLine): Record<'offers' | 'lidlPlus' | 'mhd', number> {
  const s = { offers: 0, lidlPlus: 0, mhd: 0 };
  for (const d of l.discounts ?? []) s[SAVING_FIELD[d.kind]] += d.amount;
  return s;
}

/** Rabatt geändert → die Ersparnis des Bons (und des Monats) um den Unterschied */
function withSavingsDelta(pantry: Pantry, bonId: string, old: BonLine, next: BonLine): Pantry {
  const a = sums(old), b = sums(next);
  const delta = { offers: b.offers - a.offers, lidlPlus: b.lidlPlus - a.lidlPlus, mhd: b.mhd - a.mhd };
  if (!delta.offers && !delta.lidlPlus && !delta.mhd) return pantry;
  const bon = pantry.bons!.find((x) => x.id === bonId)!;
  const add = <T extends { offers: number; lidlPlus: number; mhd?: number }>(s: T): T => ({
    ...s, offers: round2(Math.max(0, s.offers + delta.offers)), lidlPlus: round2(Math.max(0, s.lidlPlus + delta.lidlPlus)), mhd: round2(Math.max(0, (s.mhd ?? 0) + delta.mhd)),
  });
  const bonSavings = add(bon.savings ?? { offers: 0, lidlPlus: 0, mhd: 0 });
  const key = `${day(bon.date)}|${bon.total ?? ''}`;
  const all = pantry.savings ?? [];
  const entry: ReceiptSavings = add(all.find((s) => s.key === key) ?? { key, date: bon.date, offers: 0, lidlPlus: 0 });
  return {
    ...pantry,
    bons: pantry.bons!.map((x) => (x.id === bonId ? { ...x, savings: bonSavings } : x)),
    savings: [...all.filter((s) => s.key !== key), entry],
  };
}

/** Ein Einkauf eines Lebensmittels – für „Zuletzt gekauft“ und die Preis-Seite */
export interface Purchase {
  bonId: string;
  index: number;
  date: string;
  line: BonLine;
}

/** Alle Einkäufe, auf die match passt – neueste zuerst */
export function purchasesOf(bons: readonly SavedBon[] | undefined, match: (l: BonLine) => boolean): Purchase[] {
  return (bons ?? [])
    .flatMap((b) => b.lines.map((line, index) => ({ bonId: b.id, index, date: b.date, line })))
    .filter((p) => !p.line.skip && match(p.line))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Einen schon importierten Bon ersetzen (Julia: alter Import vor dem Speichern der Bons war falsch):
 * die Preise dieses Einkaufstags fallen weg – außer denen eines anderen gespeicherten Bons vom selben Tag –,
 * „zuletzt bezahlt“ rechnet neu. Danach den Bon mit applyImport(…, { stock: false }) einlesen.
 */
export function dropDayPrices(pantry: Pantry, date: string, key?: string): Pantry {
  const d = day(date);
  const others = new Set((pantry.bons ?? []).filter((b) => day(b.date) === d && b.key !== key).flatMap((b) => b.lines.map((l) => receiptKey(l.name))));
  const gone = (h: PriceEntry) => day(h.date) === d && !others.has(receiptKey(h.name));
  const all = pantry.history ?? pantry.prices ?? [];
  const history = all.filter((h) => !gone(h));
  const touched = new Set(all.filter(gone).map((h) => receiptKey(h.name)));
  const latest = (k: string) => history.filter((h) => receiptKey(h.name) === k).sort((a, b) => a.date.localeCompare(b.date)).pop();
  const prices = [
    ...(pantry.prices ?? []).filter((p) => !touched.has(receiptKey(p.name))),
    ...[...touched].map(latest).filter((p): p is PriceEntry => !!p),
  ];
  return { ...pantry, history, prices };
}

/**
 * Gibt es für diesen Einkaufstag schon etwas vom Bon – Preise, einen gespeicherten Bon, einen gemerkten Import?
 * Erkennt einen Bon wieder, wenn die Texterkennung den Endbetrag diesmal anders gelesen hat (Julia: kein Hinweis,
 * alles doppelt). Unsicher – darum fragt Mashi dann nur nach („derselbe Bon?“).
 */
export function importedOnDay(pantry: Pantry, date: string | undefined): boolean {
  if (!date) return false;
  const d = day(date);
  return (pantry.bons ?? []).some((b) => day(b.date) === d)
    || (pantry.receipts ?? []).some((k) => k.startsWith(`${d}|`))
    || (pantry.history ?? []).some((h) => day(h.date) === d);
}

/**
 * Beim Ersetzen: der schon gespeicherte Bon desselben Einkaufs – gleicher Tag, mindestens die Hälfte gleicher
 * Artikel (der Endbetrag kann anders gelesen sein). Ein anderer Einkauf am selben Tag bleibt unberührt.
 */
export function sameBonOf(pantry: Pantry, date: string, rows: readonly Pick<ImportRow, 'key'>[]): SavedBon | undefined {
  const keys = new Set(rows.map((r) => r.key));
  return (pantry.bons ?? [])
    .filter((b) => day(b.date) === day(date))
    .map((b) => ({ b, same: b.lines.filter((l) => keys.has(receiptKey(l.bon))).length }))
    .filter(({ b, same }) => same > 0 && same * 2 >= Math.max(b.lines.length, keys.size))
    .sort((x, y) => y.same - x.same)[0]?.b;
}

/**
 * Doppelt eingelesen (Julia): die Mengen dieses Bons wieder aus dem Vorrat nehmen – nur, was noch da ist.
 * „Vorhanden“ ohne Menge bleibt (das ist auch der erste Einkauf). Bon und Preise bleiben.
 */
export function withdrawBonStock(pantry: Pantry, bonId: string, now = new Date().toISOString()): Pantry {
  const bon = pantry.bons?.find((b) => b.id === bonId);
  if (!bon || bon.noStock) return pantry;
  let items = pantry.items;
  for (const l of bon.lines) {
    if (l.skip || l.priceOnly) continue;
    const st = stockOf(rowFromLine(l));
    for (const frozen of [false, true]) {
      const amount = frozen ? st.frozen : st.fresh;
      if (!(frozen ? st.frozenOn : st.freshOn) || amount === undefined) continue;
      const it = findStock(items, st, frozen);
      if (it?.amount !== undefined) items = setAmount(items, it.id, it.amount - amount);
    }
  }
  return { ...pantry, items, bons: pantry.bons!.map((b) => (b.id === bonId ? { ...b, noStock: true, updatedAt: now } : b)) };
}

/** Einkaufstage im Preisverlauf ohne gespeicherten Bon (vor dem Update eingelesen) – neueste zuerst */
export function unsavedDays(pantry: Pantry): { day: string; names: string[] }[] {
  const saved = new Set((pantry.bons ?? []).map((b) => day(b.date)));
  const by = new Map<string, Set<string>>();
  for (const h of pantry.history ?? pantry.prices ?? []) {
    const d = day(h.date);
    if (saved.has(d)) continue;
    by.set(d, (by.get(d) ?? new Set()).add(h.name));
  }
  return [...by.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([d, names]) => ({ day: d, names: [...names] }));
}

/**
 * Einen solchen Tag ganz löschen (Julia: alter Bon mit falschem Datum) – Preise, Ersparnis und das „schon importiert“
 * dieses Tages. Danach den Bon mit richtigem Datum (und „Nur für den Preisverlauf“) neu einlesen.
 */
export function dropUnsavedDay(pantry: Pantry, d: string): Pantry {
  if ((pantry.bons ?? []).some((b) => day(b.date) === d)) return pantry; // dafür gibt es den Bon
  const out = dropDayPrices(pantry, `${d}T12:00:00.000Z`);
  return {
    ...out,
    ...(pantry.savings ? { savings: pantry.savings.filter((s) => !s.key.startsWith(`${d}|`)) } : {}),
    ...(pantry.receipts ? { receipts: pantry.receipts.filter((k) => !k.startsWith(`${d}|`)) } : {}),
  };
}
