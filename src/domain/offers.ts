/**
 * Angebote der Woche (Julia: „samstags gehe ich einkaufen – freitags oder morgens mit den Prospekten planen“).
 *
 * Ein Angebot kommt aus dem Prospekt (eingefügter Text, später auch vom Server gelesene Prospektseiten), wird einem
 * Lebensmittel zugeordnet – mit derselben Regel wie Zutaten (mealplan.ts: resolveName), damit „Hähnchen-Innenbrustfilets“
 * im Prospekt dein „Hähnchenbrust“ im Rezept trifft – und gilt bis zu einem Tag, meist Samstag: Prospekte laufen
 * Montag bis Samstag. Daraus entstehen passende Rezepte aus dem Kochbuch (offerRecipes) und der Hinweis „im Angebot“
 * auf der Einkaufsliste.
 *
 * Gelesen wird zweistufig (Julia: „eigene Erkennung, und wenn das fehlschlägt KI“): erst Mashi selbst
 * (parseOffersText – kostet nichts, geht offline), und nur auf Tipp die KI (buildOffersPrompt/parseOffersReply).
 * Preise erfindet Mashi nie: was weder Mashi noch die KI lesen kann, fehlt lieber.
 */
import { cookingContent } from './homemade';
import { resolveIngredient, resolveName, type Resolved } from './mealplan';
import type { FoodTable } from './nutrition/types';
import { normalizeName } from './nutrition/localFoods';
import { isPrepared, itemAsIngredient, type Pantry } from './pantry';
import type { Recipe } from './types';

export type OfferUnit = 'g' | 'ml' | 'Stück';

export interface Offer {
  id: string;
  /** Markt, z. B. „Lidl“ */
  store: string;
  /** Name wie im Prospekt */
  name: string;
  /** Angebotspreis in € (fürs ganze Angebot, z. B. die 400-g-Packung) */
  price?: number;
  /** Preis vorher („statt 5,39“) – nur, wenn er dastand */
  regular?: number;
  /** Packungsgröße – kg und l schon in g bzw. ml umgerechnet */
  amount?: number;
  unit?: OfferUnit;
  /** letzter Tag, an dem es gilt (JJJJ-MM-TT) */
  until: string;
  /** erster Tag, an dem es gilt – fehlt: sofort (Julia: Lidl hat Angebote „ab Montag“ und „ab Donnerstag“) */
  from?: string;
  /** welches Lebensmittel es ist, wenn der Name es nicht verrät (von der KI oder von dir korrigiert) */
  food?: string;
  /** woher: selbst gelesen, von der KI gelesen, vom Server aus dem Prospekt */
  source?: 'text' | 'ki' | 'prospekt';
  addedAt: string;
}

/** Ein gelesenes Angebot vor dem Übernehmen – Markt und Gültigkeit kommen beim Übernehmen dazu */
export type OfferDraft = Pick<Offer, 'name' | 'price' | 'regular' | 'amount' | 'unit' | 'food' | 'from'> & { until?: string };

/** Märkte zur Auswahl (Julia kauft dort ein) – ein anderer lässt sich eintippen */
export const STORES = ['Lidl', 'Rewe', 'Edeka', 'Kaufland'];

// ── Gültigkeit ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Bis wann ein Prospekt ohne Angabe gilt: bis Samstag dieser Woche – sonntags schon die nächste Woche, denn ab Montag
 * gilt der neue Prospekt.
 */
export function offerWeekEnd(d: Date): string {
  const weekday = (d.getDay() + 6) % 7; // 0 = Montag … 6 = Sonntag
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (weekday === 6 ? 6 : 5 - weekday));
  return dayOf(sat);
}

/** Einkaufstag (Julia: samstags) – freitags heißt es „morgen“, samstags „heute“, sonst nichts */
export function shopDayHint(d: Date): 'morgen' | 'heute' | null {
  return d.getDay() === 5 ? 'morgen' : d.getDay() === 6 ? 'heute' : null;
}

/** „29.11.“ (+ Jahr) → JJJJ-MM-TT; ohne Jahr das nächstliegende – „bis 2.1.“ Ende Dezember ist im neuen Jahr */
function dateFrom(day: string, month: string, year: string | undefined, today: string): string | undefined {
  const d = Number(day), m = Number(month);
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return undefined;
  const t = new Date(`${today}T12:00:00`);
  let y = year ? Number(year.length === 2 ? `20${year}` : year) : t.getFullYear();
  if (!year && new Date(y, m - 1, d, 12).getTime() < t.getTime() - 60 * 86400000) y += 1;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const WEEKDAY = String.raw`(?:mo|di|mi|do|fr|sa|so)[a-z]*\.?,?\s*`;
/** „bis Sa. 29.11.“, „gültig bis 29.11.2026“ */
const UNTIL = new RegExp(String.raw`bis\s+(?:${WEEKDAY})?(\d{1,2})\.\s?(\d{1,2})\.?(\d{4}|\d{2}(?!\d))?`, 'i');
/** „24.11. – 29.11.“ */
const RANGE = new RegExp(String.raw`\d{1,2}\.\s?\d{1,2}\.?\s*[-–]\s*(?:${WEEKDAY})?(\d{1,2})\.\s?(\d{1,2})\.?(\d{4}|\d{2}(?!\d))?`, 'i');
/** nur ein Tag („ab Mo. 24.11.“) – Überschrift, kein Angebot */
const DATE_ONLY = new RegExp(String.raw`^(?:ab\s+|gültig\s+)?(?:${WEEKDAY})?\d{1,2}\.\s?\d{1,2}\.?(?:\d{2,4})?$`, 'i');

// ── Text lesen ─────────────────────────────────────────────────────

/** Grundpreis „1 kg = 4,23“, „(100 g = 0,53 €)“, „4,23 €/kg“ – ist nicht der Preis des Angebots */
const UNIT_PRICE = [
  /\(?\s*(?:je\s+|pro\s+)?(?:\d+(?:[.,]\d+)?\s*)?(?:kg|g|l|ml|stück|stk\.?)\s*=\s*(?:€\s*)?\d+[.,]\d{2}\s*(?:€|eur)?\s*\)?/gi,
  // „€/Stück“ nicht: bei Zucchini für 0,79 €/Stück IST das der Preis
  /\d+[.,]\d{2}\s*(?:€|eur)?\s*\/\s*(?:\d+\s*)?(?:kg|g|l|ml)(?![a-zäöüß])/gi,
  /(?:kilo|grund|liter)preis\s*:?\s*(?:€\s*)?\d+[.,]\d{2}\s*(?:€|eur)?/gi,
];
/** Datum „24.11.“ – sähe sonst aus wie ein Preis von 24,11 € */
const DATE = /(?<!\d)\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?(?!\d)/g;
/** Preis vorher: „statt 2,49“, „UVP 2,49“ */
const REGULAR = /(?:statt|uvp|vorher|bisher|sonst)\s*:?\s*(?:€\s*)?(\d{1,3})[.,](\d{2})\s*(?:€|eur)?/i;
const PERCENT = /[-–]?\s*\d{1,2}\s*%/g;
/** „4 x 125 g“ */
const MULTI = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*-?\s*(kg|g|ml|l)(?![a-zäöüß])/i;
/** „400-g-Packung“, „1,5 l“, „10 Stück“ */
const PACK = /(\d+(?:[.,]\d+)?)\s*-?\s*(kg|g|ml|l|stück|stk\.?|st\.)(?![a-zäöüß])/i;
/** „10er“ (Eier) */
const PIECES = /(\d+)er(?:-?pack(?:ung)?)?(?![a-zäöüß])/i;
/** Preise: „4,29“, „4.29*“, „-.99“ (0,99), „1.-“ (1,00) */
const PRICE = /(\d{1,3})[.,](\d{2})(?!\d)|(?:^|\s)[-–]?\.(\d{2})(?!\d)|(\d{1,3})[.,][-–](?!\d)/g;

/** Wörter, die allein kein Name sind (Verpackung, Werbung, Füllwörter) */
const FILLER = new Set([
  'packung', 'pck', 'pkg', 'schale', 'beutel', 'netz', 'dose', 'glas', 'flasche', 'becher', 'kiste', 'tray', 'stück', 'stk', 'st',
  'je', 'ca', 'pro', 'aus', 'der', 'die', 'das', 'und', 'mit', 'von', 'für', 'oder', 'kg', 'g', 'l', 'ml', 'eur', 'euro',
  'preis', 'angebot', 'angebote', 'aktion', 'sparen', 'spare', 'gespart', 'statt', 'uvp', 'nur', 'ab', 'bis', 'gültig', 'woche',
  'lidl', 'plus', 'app', 'coupon', 'rabatt', 'billiger', 'günstiger', 'super', 'knaller', 'tipp', 'neu', 'hit', 'preishit',
  'superpreis', 'kilopreis', 'grundpreis', 'inhalt', 'mo', 'di', 'mi', 'do', 'fr', 'sa', 'so', 'solange', 'vorrat', 'reicht',
]);

const num = (s: string) => Number(s.replace(',', '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Packung in Mashis Einheiten: kg → g, l → ml */
function packOf(amount: number, unit: string): { amount: number; unit: OfferUnit } {
  const u = unit.toLowerCase().replace(/\.$/, '');
  if (u === 'kg') return { amount: amount * 1000, unit: 'g' };
  if (u === 'l') return { amount: amount * 1000, unit: 'ml' };
  if (u === 'g' || u === 'ml') return { amount, unit: u };
  return { amount, unit: 'Stück' };
}

/** Packungsgröße aus einer Mengenangabe („Je 5x 120 g“, „1,5 l“, „10er“) – für die Lidl-Preise aus dem Prospekt (leaflets.ts) */
export function packFromText(s: string): { amount: number; unit: OfferUnit } | undefined {
  const multi = s.match(MULTI);
  if (multi) return packOf(Number(multi[1]) * num(multi[2]), multi[3]);
  const pack = s.match(PACK);
  if (pack) return packOf(num(pack[1]), pack[2]);
  const pieces = s.match(PIECES);
  return pieces ? { amount: Number(pieces[1]), unit: 'Stück' } : undefined;
}

interface Row {
  raw: string;
  name?: string;
  prices: number[];
  regular?: number;
  amount?: number;
  unit?: OfferUnit;
}

/** Eine Zeile zerlegen: Grundpreis, „statt“, Prozente und Packung heraus – was an Zahlen bleibt, sind Preise, der Rest der Name */
function parseLine(raw: string): Row {
  let s = ` ${raw} `;
  for (const re of UNIT_PRICE) s = s.replace(re, ' ');
  s = s.replace(DATE, ' ');
  const row: Row = { raw, prices: [] };
  const reg = s.match(REGULAR);
  if (reg) {
    row.regular = num(`${reg[1]}.${reg[2]}`);
    s = s.replace(REGULAR, ' ');
  }
  s = s.replace(PERCENT, ' ');
  const multi = s.match(MULTI);
  const pack = multi ? null : s.match(PACK);
  const pieces = multi || pack ? null : s.match(PIECES);
  if (multi) Object.assign(row, packOf(Number(multi[1]) * num(multi[2]), multi[3]));
  else if (pack) Object.assign(row, packOf(num(pack[1]), pack[2]));
  else if (pieces) Object.assign(row, { amount: Number(pieces[1]), unit: 'Stück' });
  if (multi) s = s.replace(MULTI, ' ');
  else if (pack) s = s.replace(PACK, ' ');
  else if (pieces) s = s.replace(PIECES, ' ');
  for (const m of s.matchAll(PRICE)) {
    const value = m[1] ? num(`${m[1]}.${m[2]}`) : m[3] ? num(`0.${m[3]}`) : Number(m[4]);
    if (value > 0 && value < 1000) row.prices.push(value);
  }
  s = s.replace(PRICE, ' ');
  const name = s
    .replace(/€|\beur\b|\*/gi, ' ')
    .replace(/(?:\/|\bje\s)\s*(?:stück|stk\.?)/gi, ' ')
    .replace(/[|•·()=/]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '')
    .trim();
  const words = name.toLowerCase().split(/[\s/-]+/).filter(Boolean);
  if (/[a-zäöüß]{3,}/i.test(name) && words.some((w) => !FILLER.has(w.replace(/\.$/, '')))) row.name = name;
  return row;
}

export interface ParsedOffers {
  offers: OfferDraft[];
  /** Zeilen, die nach Angebot aussehen, aber nicht ganz verstanden wurden (Name ohne Preis, Preis ohne Name) */
  unread: string[];
  /** gefundene Gültigkeit („bis Sa. 29.11.“) – gilt für alle Angebote des Texts */
  until?: string;
}

/**
 * Text aus einem Prospekt oder von der Markt-Seite lesen – ohne KI.
 * Zwei Aufbauten kommen vor: alles in einer Zeile („Hähnchenbrust 1 kg 6,99“) oder auf mehrere Zeilen verteilt, wie
 * kopierter Text von Webseiten. Dort steht der Preis mal vor, mal nach dem Namen: Was zuerst kommt, entscheidet für den
 * ganzen Text (eine Seite ist in sich gleich aufgebaut). Zwei Preise an einem Angebot: der kleinere ist das Angebot,
 * der größere der Preis vorher.
 * @param today heute (JJJJ-MM-TT) – für Jahreszahlen, die im Prospekt fehlen
 */
export function parseOffersText(text: string, today: string): ParsedOffers {
  let until: string | undefined;
  const rows: Row[] = [];
  for (const line of text.replace(/ /g, ' ').replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const u = t.match(UNTIL) ?? t.match(RANGE);
    const row = parseLine(t);
    // Gültigkeitszeile („Angebote gültig bis Sa. 29.11.“) und Datumsüberschriften sind kein Angebot
    if (u && !row.prices.length) {
      until = dateFrom(u[1], u[2], u[3], today) ?? until;
      continue;
    }
    if (DATE_ONLY.test(t)) continue;
    rows.push(row);
  }

  const first = rows.find((r) => r.name || r.prices.length);
  const priceFirst = !!first && !first.name;
  /** raw: nur Zeilen mit Inhalt (Name, Preis, Packung) – Werbezeilen wie „-20 %“ gehören nicht in „nicht verstanden“ */
  type Seg = { name?: string; nameRaw?: string; raw: string[]; prices: number[]; regular?: number; amount?: number; unit?: OfferUnit };
  const segs: Seg[] = [];
  const unread: string[] = [];
  let carry: Seg = { raw: [], prices: [] };
  const take = (into: Seg, r: Row) => {
    if (r.prices.length || r.amount !== undefined) into.raw.push(r.raw);
    into.prices.push(...r.prices);
    if (r.regular !== undefined) into.regular = r.regular;
    if (r.amount !== undefined && into.amount === undefined) Object.assign(into, { amount: r.amount, unit: r.unit });
  };
  for (const r of rows) {
    const cur = segs[segs.length - 1];
    if (r.name) {
      // Preis zuerst: was seit dem letzten Namen an Preisen kam, gehört zu diesem Namen
      const seg: Seg = priceFirst ? carry : { raw: [], prices: [] };
      seg.name = r.name;
      seg.nameRaw = r.raw;
      take(seg, r);
      segs.push(seg);
      carry = { raw: [], prices: [] };
    } else if (!priceFirst) {
      if (cur) take(cur, r);
      else if (r.prices.length) unread.push(r.raw);
    } else if (cur && !r.prices.length && !carry.prices.length) {
      // Packung gleich nach dem Namen („400-g-Packung“) gehört noch zu ihm
      take(cur, r);
    } else take(carry, r);
  }
  if (carry.prices.length) unread.push(...carry.raw);

  const offers: OfferDraft[] = [];
  for (const s of segs) {
    if (!s.prices.length) {
      unread.push(s.nameRaw!);
      continue;
    }
    const price = Math.min(...s.prices);
    const higher = Math.max(...s.prices);
    const regular = s.regular ?? (higher > price ? higher : undefined);
    offers.push({
      name: s.name!,
      price: round2(price),
      ...(regular !== undefined && regular > price ? { regular: round2(regular) } : {}),
      ...(s.amount !== undefined ? { amount: s.amount, unit: s.unit } : {}),
    });
  }
  return { offers, unread, ...(until ? { until } : {}) };
}

// ── Zuordnung zu Lebensmitteln ─────────────────────────────────────

/**
 * Welches Lebensmittel ist das Angebot? Erst wie eine Zutat (resolveName), dann mit Bindestrichen als Leerzeichen
 * („Hähnchen-Innenbrustfilets“ → Hähnchen), dann das Ende zusammengesetzter Wörter – im Deutschen steht das
 * Eigentliche hinten („Rispentomaten“ → Tomaten, „Cocktailtomaten“ → Tomaten). Nur genaue Treffer der Wortenden zählen:
 * lieber nicht zugeordnet als falsch. undefined = Mashi kennt es nicht (Werkzeug, Deko …).
 * @param ingredientKeys Schlüssel deiner Zutaten (ingredientKeys): Kennt die Tabelle etwas nicht (Brokkoli), heißt es im
 *   Rezept aber genauso, haben beide denselben Namens-Schlüssel – das zählt dann auch. Ohne diese Liste: nur die Tabelle.
 */
export function matchOffer(name: string, table: FoodTable, ingredientKeys?: ReadonlySet<string>): Resolved | undefined {
  const known = (r: Resolved | null) => (r?.food || (r && ingredientKeys?.has(r.key)) ? r : undefined);
  const direct = known(resolveName(name, table)) ?? known(resolveName(name.replace(/-/g, ' '), table));
  if (direct) return direct;
  const words = normalizeName(name.replace(/-/g, ' ')).split(' ').filter((w) => w.length >= 6).sort((a, b) => b.length - a.length);
  for (const w of words) {
    for (let i = 1; i <= w.length - 4; i++) {
      const hit = table.matchName(w.slice(i));
      const r = hit?.quality === 'exact' ? known(resolveName(w.slice(i), table)) : undefined;
      if (r) return r;
    }
  }
  return undefined;
}

/** Rezepte, die beim Planen zählen: nicht archiviert, keine KI-Idee, kein Probiergericht */
const live = (r: Recipe) => !r.archivedAt && !r.trial && r.status !== 'ki_entwurf';

/** Zutaten eines Rezepts, wie gekocht (Selbstgemachtes, Tauschplätze), ohne Grundvorrat – jede nur einmal */
function partsOf(recipe: Recipe, all: readonly Recipe[], table: FoodTable): Resolved[] {
  const parts = cookingContent(recipe, all).ingredients
    .map((i) => resolveIngredient(i, 1, table))
    .filter((x): x is Resolved => !!x && !x.pantry);
  // Knoblauch für Sauce UND Dip ist eine Zutat, nicht zwei
  return [...new Map(parts.map((p) => [p.key, p])).values()];
}

/** Schlüssel aller Zutaten deiner Rezepte – für matchOffer (Brokkoli, den die Tabelle nicht kennt) */
export function ingredientKeys(recipes: readonly Recipe[], table: FoodTable): Set<string> {
  return new Set(recipes.filter(live).flatMap((r) => partsOf(r, recipes, table).map((p) => p.key)));
}

/** Lebensmittel je Angebot (Angebot-id → Zuordnung) – einmal ausrechnen, dann für Liste, Rezepte und Einkauf nutzen */
export function offerFoods(offers: readonly Offer[], table: FoodTable, ingredientKeys?: ReadonlySet<string>): Map<string, Resolved> {
  const memo = new Map<string, Resolved | undefined>();
  const out = new Map<string, Resolved>();
  for (const o of offers) {
    const name = o.food?.trim() || o.name;
    if (!memo.has(name)) memo.set(name, matchOffer(name, table, ingredientKeys) ?? (o.food ? matchOffer(o.name, table, ingredientKeys) : undefined));
    const r = memo.get(name);
    if (r) out.set(o.id, r);
  }
  return out;
}

/** Packung zum Anzeigen: „400 g“, „1,5 kg“, „750 ml“, „1 l“, „10 Stück“ */
export function offerPackLabel(o: Pick<Offer, 'amount' | 'unit'>): string {
  if (o.amount === undefined || !o.unit) return '';
  const de = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (o.unit === 'g' && o.amount >= 1000) return `${de(o.amount / 1000)} kg`;
  if (o.unit === 'ml' && o.amount >= 1000) return `${de(o.amount / 1000)} l`;
  return `${de(o.amount)} ${o.unit}`;
}

/** feste Kurzformen – toLocaleDateString schreibt je nach Umgebung „Do“ oder „Do.“ */
const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

/** „ab Do.“ – nur, solange der Tag noch nicht da ist (danach gilt es einfach) */
export function offerFromLabel(o: Pick<Offer, 'from'>, today: string): string {
  if (!o.from || o.from <= today) return '';
  return `ab ${WEEKDAYS[new Date(`${o.from}T12:00:00`).getDay()]}`;
}

/**
 * Was für den nächsten Einkauf zählt: gilt heute noch und hat bis zum Einkaufstag (Samstag) angefangen – „ab Do.“ zählt
 * für Samstag mit, ein Angebot erst ab nächster Woche noch nicht.
 */
export const activeOffers = (offers: readonly Offer[] | undefined, today: string): Offer[] => {
  const shopDay = offerWeekEnd(new Date(`${today}T12:00:00`));
  return (offers ?? []).filter((o) => o.until >= today && (!o.from || o.from <= shopDay));
};

/** Preis je g/ml/Stück – nur vergleichbar bei gleicher Einheit */
const perUnit = (o: Offer) => (o.price !== undefined && o.amount ? o.price / o.amount : undefined);

/**
 * Bestes Angebot je Lebensmittel (Schlüssel → Angebot): gibt es Hähnchen bei Lidl und Rewe, das günstigere je Gramm;
 * sonst das erste.
 */
export function offersByKey(offers: readonly Offer[], foods: ReadonlyMap<string, Resolved>): Map<string, Offer> {
  const out = new Map<string, Offer>();
  for (const o of offers) {
    const key = foods.get(o.id)?.key;
    if (!key) continue;
    const prev = out.get(key);
    const a = perUnit(o), b = prev && perUnit(prev);
    if (!prev || (a !== undefined && b !== undefined && o.unit === prev.unit && a < b)) out.set(key, o);
  }
  return out;
}

// ── Übernehmen und aufräumen ───────────────────────────────────────

/**
 * Gelesene Angebote übernehmen: Abgelaufenes fliegt raus, dasselbe Angebot desselben Markts (gleicher Name) wird
 * ersetzt statt doppelt – liest du den Prospekt zweimal ein, steht nichts zweimal da.
 */
export function addOffers(
  existing: readonly Offer[] | undefined, drafts: readonly OfferDraft[], store: string, until: string, today: string,
  now: string, newId: () => string, source: Offer['source'] = 'text',
): Offer[] {
  const same = (o: Pick<Offer, 'store' | 'name'>) => `${o.store.toLowerCase()}|${normalizeName(o.name)}`;
  const fresh = drafts.map((d): Offer => ({
    id: newId(), store, name: d.name.trim(), until: d.until && d.until >= today ? d.until : until, source, addedAt: now,
    ...(d.price !== undefined ? { price: d.price } : {}),
    ...(d.regular !== undefined ? { regular: d.regular } : {}),
    ...(d.amount !== undefined && d.unit ? { amount: d.amount, unit: d.unit } : {}),
    ...(d.food?.trim() ? { food: d.food.trim() } : {}),
    ...(d.from && d.from <= (d.until ?? until) ? { from: d.from } : {}),
  }));
  const replaced = new Set(fresh.map(same));
  // nur Abgelaufenes weg – was erst später anfängt (nächste Woche), bleibt
  return [...(existing ?? []).filter((o) => o.until >= today && !replaced.has(same(o))), ...fresh];
}

// ── Passende Rezepte ───────────────────────────────────────────────

export interface OfferMatch {
  recipe: Recipe;
  score: number;
  /** Zutaten, die gerade im Angebot sind – mit dem besten Angebot */
  onOffer: { name: string; offer: Offer }[];
  /** schon in der Speisekammer */
  have: string[];
  /** müsste ohne Angebot gekauft werden */
  missing: string[];
  /** muss bald weg (rote Uhr) */
  useUp: string[];
}

/** gut bewertet = die letzte Bewertung hat mindestens 4 Sterne (wie tastes.ts) */
const liked = (r: Recipe) => {
  const last = [...r.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return !!last && last.rating >= 4;
};

/**
 * Welche Rezepte aus dem Kochbuch passen zu den Angeboten? Gezählt wird wie bei den Vorschlägen im Plan nach Gewicht
 * der Zutat (KIND_WEIGHT: Hähnchen, Käse, Reis ×3, Gemüse ×0,3, Grundvorrat gar nicht). Angebote zählen ganz – gespart
 * wird am Hähnchen, nicht an der Zwiebel; ein Anteil wäre falsch, sonst stünde ein Salat mit Tomaten im Angebot vor dem
 * Curry mit Hähnchen im Angebot. Schon Vorrätiges zählt als Anteil (0–1) dazu.
 * Dazu deine Vorlieben – Favoriten und gut Bewertetes vorn, was bald weg muss auch, und was du diese Woche schon
 * gekocht hast, rutscht nach hinten (sonst gäbe es jede Woche dasselbe).
 * Ohne mindestens eine Zutat im Angebot taucht ein Rezept nicht auf.
 */
export function offerRecipes(recipes: readonly Recipe[], offers: readonly Offer[], table: FoodTable, opts: {
  today: string;
  pantry?: Pantry;
  useUp?: ReadonlyMap<string, number>;
  /** schon im Plan – muss niemand vorschlagen */
  planned?: ReadonlySet<string>;
  limit?: number;
}): OfferMatch[] {
  const active = activeOffers(offers, opts.today);
  if (!active.length) return [];
  // Verwandlungen (Bolo-Wraps) hängen an ihrer Grundlage – vorgeschlagen wird die Grundlage selbst
  const candidates = recipes
    .filter((r) => live(r) && !r.fromBase && !opts.planned?.has(r.id))
    .map((recipe) => ({ recipe, unique: partsOf(recipe, recipes, table) }));
  const byKey = offersByKey(active, offerFoods(active, table, new Set(candidates.flatMap((c) => c.unique.map((p) => p.key)))));
  if (!byKey.size) return [];
  // Vorgekochtes ist keine Zutat (wie recipesFromPantry)
  const inStock = new Set((opts.pantry?.items ?? []).filter((i) => !isPrepared(i)).map((i) => itemAsIngredient(i, table)?.key).filter(Boolean));
  const weekAgo = dayOf(new Date(new Date(`${opts.today}T12:00:00`).getTime() - 7 * 86400000));
  return candidates
    .map(({ recipe, unique }): OfferMatch & { weight: number; recent: boolean } => {
      const weight = (xs: Resolved[]) => xs.reduce((s, p) => s + p.weight, 0);
      const onOffer = unique.filter((p) => byKey.has(p.key));
      const have = unique.filter((p) => !byKey.has(p.key) && inStock.has(p.key));
      const useUp = unique.filter((p) => opts.useUp?.has(p.key));
      const score = weight(onOffer) + weight(have) / (weight(unique) || 1)
        + (useUp.length ? 0.5 : 0) + (recipe.favorite ? 0.3 : liked(recipe) ? 0.2 : 0);
      return {
        recipe, score, weight: onOffer.length,
        recent: !!recipe.lastCookedAt && recipe.lastCookedAt.slice(0, 10) > weekAgo,
        onOffer: onOffer.map((p) => ({ name: p.name, offer: byKey.get(p.key)! })),
        have: have.map((p) => p.name),
        missing: unique.filter((p) => !byKey.has(p.key) && !inStock.has(p.key)).map((p) => p.name),
        useUp: useUp.map((p) => p.name),
      };
    })
    .filter((m) => m.weight > 0)
    // diese Woche schon gekocht: ganz nach hinten, egal wie gut es passt
    .sort((a, b) => Number(a.recent) - Number(b.recent) || b.score - a.score || a.missing.length - b.missing.length)
    .slice(0, opts.limit ?? 8)
    .map(({ weight: _w, recent: _r, ...m }) => m);
}

// ── KI als Notlösung ───────────────────────────────────────────────

/** so viel Prospekt-Text geht an die KI (der Server nimmt 16 000 Zeichen Auftrag, der Rest ist die Anleitung) */
export const MAX_OFFER_TEXT = 14000;

/**
 * Auftrag an die KI, wenn Mashi den Text nicht ganz versteht – der ganze Text, nicht nur die übrigen Zeilen: kopierter
 * Text verteilt ein Angebot oft auf mehrere Zeilen, einzelne Zeilen ohne Zusammenhang versteht auch die KI nicht.
 * `food` = das allgemeine Lebensmittel – damit die Zuordnung zu deinen Rezepten sicherer klappt als über den Prospektnamen.
 */
export function buildOffersPrompt(text: string, store: string, today: string): string {
  return [
    `Hier ist Text aus einem Supermarkt-Prospekt${store.trim() ? ` von ${store.trim()}` : ''}. Heute ist ${today}.`,
    'Liste alle Lebensmittel-Angebote darin auf – keine Haushaltswaren, Kleidung, Technik oder Deko.',
    'Antworte NUR mit einem JSON-Array, ohne Text davor oder danach, kompakt ohne Zeilenumbrüche, je Angebot ein Objekt, z. B.:',
    '[{"name":"Hähnchen-Innenbrustfilets","food":"Hähnchenbrust","price":4.29,"regular":5.39,"amount":400,"unit":"g","until":"2026-11-28"}]',
    'name = wie im Prospekt. food = das allgemeine Lebensmittel auf Deutsch (z. B. Tomaten, Hackfleisch, Joghurt).',
    'price = Angebotspreis in Euro. regular = Preis vorher, nur wenn er dasteht.',
    'amount und unit = Packungsgröße; unit nur g, ml oder Stück (kg und l umrechnen).',
    'until = letzter Gültigkeitstag als JJJJ-MM-TT, nur wenn er dasteht.',
    'Was nicht dasteht, weglassen – nichts schätzen oder erfinden.',
    '',
    'Text:',
    text.trim().slice(0, MAX_OFFER_TEXT),
  ].join('\n');
}

export class OffersReplyError extends Error {}

/**
 * Antwort der KI lesen. Objekt für Objekt statt als Ganzes: Ist die Antwort abgeschnitten (lange Prospekte), bleiben
 * die vollständigen Angebote erhalten. Unplausibles (Preis 0, negative Mengen, falsches Datum) fällt weg.
 */
export function parseOffersReply(reply: string): OfferDraft[] {
  const out: OfferDraft[] = [];
  for (const m of reply.matchAll(/\{[^{}]*\}/g)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) continue;
    const n = (v: unknown) => {
      const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
      return Number.isFinite(x) && x > 0 ? x : undefined;
    };
    const price = n(o.price);
    const regular = n(o.regular);
    const amount = n(o.amount);
    const unitRaw = typeof o.unit === 'string' ? o.unit.trim().toLowerCase().replace(/\.$/, '') : '';
    // nur echte Einheiten – „Packung“ oder „Schale“ sagt nichts über die Menge
    const pack = amount !== undefined && ['g', 'kg', 'ml', 'l', 'stück', 'stk'].includes(unitRaw) ? packOf(amount, unitRaw) : undefined;
    const until = typeof o.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.until) ? o.until : undefined;
    const food = typeof o.food === 'string' && o.food.trim() ? o.food.trim() : undefined;
    out.push({
      name,
      ...(price !== undefined && price < 1000 ? { price: round2(price) } : {}),
      ...(regular !== undefined && price !== undefined && regular > price && regular < 1000 ? { regular: round2(regular) } : {}),
      ...(pack ? { amount: pack.amount, unit: pack.unit } : {}),
      ...(until ? { until } : {}),
      ...(food ? { food } : {}),
    });
  }
  if (!out.length) throw new OffersReplyError('Die KI hat keine Angebote gefunden.');
  return out;
}
