/**
 * Prospekte von Lidl und Kaufland automatisch holen (Julia: „wie die App – die Angebote kennt sie von selbst“) – ohne KI
 * (Julia: „was braucht weniger KI“): Mashi sucht nur, welche DEINER Zutaten diese Woche im Prospekt stehen. Mehr braucht
 * es für passende Rezepte nicht. Preise liest Mashi dabei nicht – im Prospekt stehen sie kreuz und quer, sie richtig
 * zuzuordnen könnte nur die KI.
 *
 * Woher: der öffentliche Prospekt-Dienst der Schwarz-Gruppe (endpoints.leaflets.schwarz) – er erlaubt Abrufe von jeder
 * Webseite, darum holt Mashi ihn direkt im Browser. Zu jedem Prospekt gibt es ein PDF mit echtem Text; daraus liest
 * pdf.js die Seiten (services/leaflets), samt „Ab Do. 26.11.“ oben auf der Seite (Julia: „ab Montag und ab Donnerstag“).
 * Inoffiziell: Er kann sich ändern, darum prüft hier jede Funktion die Antwort, statt ihr zu vertrauen.
 */
import { cookingContent } from './homemade';
import { resolveIngredient } from './mealplan';
import { aliasesOf, normalizeName } from './nutrition/localFoods';
import type { FoodTable } from './nutrition/types';
import type { PriceRow } from './leafletPrices';
import { packFromText, type OfferDraft } from './offers';
import type { Recipe } from './types';

export type LeafletClient = 'lidl' | 'kaufland';

/** Name des Markts in Mashi */
export const CLIENT_STORE: Record<LeafletClient, string> = { lidl: 'Lidl', kaufland: 'Kaufland' };

export interface LeafletFlyer {
  name: string;
  /** Angebote gelten von – bis (JJJJ-MM-TT) */
  start: string;
  end: string;
  /** das PDF mit dem Text der Seiten – nur von assets.leaflets.schwarz */
  pdfUrl: string;
}

const HOST = 'https://endpoints.leaflets.schwarz/v4';
/** PDFs nur von hier – eine Adresse aus der Antwort, die woandershin zeigt, ruft Mashi nicht ab */
const PDF_HOST = 'https://assets.leaflets.schwarz/';

/**
 * Übersicht der Prospekte – Adresse fest gebaut.
 * @param storeId Kaufland: Wochenprospekt je Filiale; ohne: nur die bundesweiten
 */
export const overviewUrl = (client: LeafletClient, storeId?: string) =>
  // mit Filiale nur store_id – region_id zählt bei Kaufland auch als Filiale, beides zusammen lehnt der Dienst ab
  `${HOST}/overview/?${storeId ? `store_id=${encodeURIComponent(storeId)}` : 'region_id=0'}&client_locale=${client}/de-DE`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Prospekte aus der Übersicht – ohne Gültigkeit oder ohne PDF vom erwarteten Ort fallen sie weg */
export function flyersFromOverview(json: unknown): LeafletFlyer[] {
  if (!isObj(json) || !Array.isArray(json.categories)) return [];
  const out: LeafletFlyer[] = [];
  for (const c of json.categories) {
    if (!isObj(c) || !Array.isArray(c.subcategories)) continue;
    for (const s of c.subcategories) {
      if (!isObj(s) || !Array.isArray(s.flyers)) continue;
      for (const f of s.flyers) {
        if (!isObj(f)) continue;
        const start = str(f.offerStartDate), end = str(f.offerEndDate), pdfUrl = str(f.pdfUrl);
        if (!DAY.test(start) || !DAY.test(end) || !pdfUrl.startsWith(PDF_HOST) || !pdfUrl.endsWith('.pdf')) continue;
        out.push({ name: str(f.name), start, end, pdfUrl });
      }
    }
  }
  return out;
}

/** Wochenprospekte laufen Sonntag/Montag bis Samstag – Magazine, Reisen, „Dauerhaft günstiger“ laufen Wochen bis Monate */
const MAX_WEEK_DAYS = 8;
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000;

/**
 * Die Wochenprospekte, die am Einkaufstag gelten (Julia: samstags): gültig an dem Tag und höchstens eine Woche lang.
 * So braucht Mashi die Namen der Prospekte nicht zu kennen (Lidl: „Aktionsprospekt“, Kaufland: „Prospekt“, „Kaufland“).
 */
export function weekFlyers(flyers: readonly LeafletFlyer[], shopDay: string): LeafletFlyer[] {
  return flyers.filter((f) => f.start <= shopDay && shopDay <= f.end && daysBetween(f.start, f.end) <= MAX_WEEK_DAYS);
}

// ── Gültigkeit je Seite („Ab Do. 26.11. bis Sa. 28.11.“) ───────────

const WEEKDAY = String.raw`(?:mo|di|mi|do|fr|sa|so)[a-z]*\.?,?\s*`;
/** „Ab Mo. 23.11. bis Sa. 28.11.“, „AB DO. 26.11.“, „AB MONTAG, 23.11.“ */
const FROM = new RegExp(String.raw`\bab\s+${WEEKDAY}(\d{1,2})\.\s?(\d{1,2})\.(?:\s*bis\s+${WEEKDAY}(\d{1,2})\.\s?(\d{1,2})\.)?`, 'gi');

/** „26.11.“ im Jahr des Prospekts – über den Jahreswechsel („ab 2.1.“ im Dezember-Prospekt) ins nächste */
function dayIn(flyer: Pick<LeafletFlyer, 'start'>, d: string, m: string): string | undefined {
  const day = Number(d), month = Number(m);
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return undefined;
  const year = Number(flyer.start.slice(0, 4)) + (month < Number(flyer.start.slice(5, 7)) - 6 ? 1 : 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface PageValidity { from: string; until: string }

/**
 * Ab wann (und bis wann) die Angebote einer Seite gelten. Stehen mehrere „ab“ auf einer Seite (ab Mo., ab Do., ab Fr.),
 * gilt das späteste – ab dann ist alles auf der Seite zu haben (welches Angebot zu welchem Tag gehört, verrät der Text
 * nicht). Seiten ohne Angabe gehören zum Abschnitt davor (die Prospekte sind nach Tagen geordnet), die ersten zum
 * Prospekt selbst. Unplausibles (vor oder nach dem Prospekt) zählt nicht.
 */
export function pageValidity(pages: readonly string[], flyer: Pick<LeafletFlyer, 'start' | 'end'>): PageValidity[] {
  let last: PageValidity = { from: flyer.start, until: flyer.end };
  return pages.map((text) => {
    let found: PageValidity | undefined;
    for (const m of text.matchAll(FROM)) {
      const from = dayIn(flyer, m[1], m[2]);
      const until = m[3] ? dayIn(flyer, m[3], m[4]) : undefined;
      if (!from || from < flyer.start || from > flyer.end) continue;
      if (!found || from > found.from) found = { from, until: until && until >= from && until <= flyer.end ? until : flyer.end };
    }
    if (found) last = found;
    return last;
  });
}

// ── Deine Zutaten im Prospekt finden ───────────────────────────────

export interface WantedIngredient {
  /** Lebensmittel-Schlüssel wie im Rezept (mealplan.ts: resolveIngredient) */
  key: string;
  /** so heißt es bei dir */
  name: string;
  /** Schreibweisen, nach denen gesucht wird (klein, normalisiert): deine Namen und die bekannten der Tabelle */
  words: string[];
}

/** Rezepte, die beim Planen zählen (wie offers.ts) */
const live = (r: Recipe) => !r.archivedAt && !r.trial && r.status !== 'ki_entwurf';
/** kürzer findet zu viel Falsches („Ei“ in „Eis“, „Öl“) */
const MIN_WORD = 4;

/**
 * Wonach gesucht wird: jede Zutat deiner Rezepte (wie gekocht, ohne Grundvorrat wie Salz und Öl) mit deinen
 * Schreibweisen und denen aus Mashis Tabelle – „Hähnchenbrust“ findet so auch „Hähnchenbrustfilet“.
 */
export function wantedIngredients(recipes: readonly Recipe[], table: FoodTable): WantedIngredient[] {
  const byKey = new Map<string, { name: string; words: Set<string> }>();
  for (const r of recipes.filter(live)) {
    for (const ing of cookingContent(r, recipes).ingredients) {
      const x = resolveIngredient(ing, 1, table);
      if (!x || x.pantry) continue;
      const entry = byKey.get(x.key) ?? { name: x.name, words: new Set<string>() };
      const foodId = x.key.startsWith('food:') ? x.key.slice(5) : undefined;
      for (const w of [ing.name, x.name, ...(foodId ? aliasesOf(foodId) : [])]) {
        const n = normalizeName(w);
        if (n.length >= MIN_WORD) entry.words.add(n);
      }
      byKey.set(x.key, entry);
    }
  }
  return [...byKey].filter(([, e]) => e.words.size).map(([key, e]) => ({ key, name: e.name, words: [...e.words] }));
}

/**
 * Wörter einer Seite, wie sie im Laden heißen: Trennstriche am Zeilenende wieder zusammen („Hähnchen-\noberkeulen“),
 * Satzzeichen weg. Original-Schreibweise bleibt für den Namen in der Vorschau.
 */
function wordsOf(text: string): string[] {
  const raw = text.replace(/­/g, '').split(/\s+/).map((t) => t.replace(/^[^\p{L}\d]+|[^\p{L}\d-]+$/gu, '')).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    // „Hähnchen-“ + „oberkeulen“ (Silbentrennung) oder + „Oberkeulen“ (Wortteil) – ein Wort
    while (t.endsWith('-') && i + 1 < raw.length && /^\p{L}/u.test(raw[i + 1])) {
      const next = raw[++i];
      t = /^\p{Ll}/u.test(next) ? t.slice(0, -1) + next : t + next;
    }
    out.push(t.replace(/-+$/, ''));
  }
  return out;
}

/**
 * Mehrzahl weg, damit „Tomaten“ = „Tomate“ und „Zwiebeln“ = „Zwiebel“. Kein „-en“: Am echten Prospekt wurde sonst aus
 * „Reisen“ (Lidl-Reisen) Reis.
 */
const forms = (w: string) => [...new Set([w, w.replace(/n$/, ''), w.replace(/s$/, ''), w.replace(/e$/, ''), w.replace(/er$/, '')])];
/** vor einem Wortende („Rispen|tomaten“) mindestens so viele Buchstaben */
const MIN_PREFIX = 3;
/**
 * Wörter, die zufällig auf ein Lebensmittel enden – im Lidl-Prospekt stehen jede Woche „Kaffeevoll-au|tomaten“
 * und „Lidl Reise(n)“ (ohne Mehrzahl-e wäre das „Reis“)
 */
const NOT_FOOD = /automaten?$|reisen?$/;
/**
 * Steht das direkt vor der Zutat, ist es etwas anderes – im Kaufland-Prospekt: „Zahnpasta“, „Schokolinsen“,
 * „Marzipankartoffeln“. Nur davor: „Schokolade“ selbst bleibt findbar.
 */
const NOT_FOOD_BEFORE = /(?:zahn|schoko|marzipan)$/;
/**
 * Zuschnitte sind dieselbe Zutat – Lidl schreibt „Lachsfiletportionen“, „Hähnchenbrustfiletstreifen“, „Speckwürfel“.
 * Anders als „Oberkeulen“ (ein anderes Teil): Ohne dieses Ende zählt das Wort zusätzlich.
 */
const CUT = /(?:portionen|portion|stücke|streifen|würfel|scheiben|filets|filet)$/;

/**
 * Steht diese Zutat im Wort? Gezählt wird nur das Kopfwort – im Deutschen das letzte Teilwort: „Rispentomaten“ sind
 * Tomaten, „Salat-Sauce“ ist eine Sauce (kein Salat), „Hähnchen-Oberkeulen“ sind keine Hähnchenbrust. Am echten Prospekt
 * abgestimmt: ohne diese Regel kamen „Honig-Lebkuchenteig“ → Honig und „Butter-Schoko-Brötchen“ → Butter heraus.
 */
function hits(word: string, wanted: readonly string[]): boolean {
  const lower = word.toLocaleLowerCase('de-DE');
  const head = lower.split('-').pop() ?? '';
  if (head.length < MIN_WORD || NOT_FOOD.test(head)) return false;
  // was vor dem Kopfwort steht, ohne Bindestriche („Schoko-Linsen“ wie „Schokolinsen“)
  const beforeHead = lower.replace(/-/g, '').slice(0, -head.length);
  // „lachsfiletportionen“ → auch „lachsfilet“ → „lachs“ (höchstens zwei Zuschnitt-Enden)
  const once = head.replace(CUT, '');
  const twice = once.replace(CUT, '');
  const heads = [...new Set([head, once, twice])].filter((h) => h.length >= MIN_WORD);
  return heads.flatMap(forms).some((h) => wanted.some((w) => {
    if (w.includes(' ')) return false;
    const compound = w.length >= 5 && h.length - w.length >= MIN_PREFIX && h.endsWith(w);
    if (h !== w && !compound) return false;
    return !NOT_FOOD_BEFORE.test(beforeHead + (compound ? h.slice(0, -w.length) : ''));
  }));
}

/**
 * Welche deiner Zutaten stehen im Prospekt? Je Zutat ein Angebot – mit dem Wort, wie es im Prospekt steht, und ab wann
 * es gilt (die Seite verrät es). Steht eine Zutat mehrfach drin, zählt die Seite, die am frühesten gilt.
 * Mehrwortige Namen („rote linsen“) werden als Ganzes im Text gesucht.
 */
export function ingredientsInLeaflet(
  pages: readonly string[], flyer: Pick<LeafletFlyer, 'start' | 'end'>, wanted: readonly WantedIngredient[],
): OfferDraft[] {
  const validity = pageValidity(pages, flyer);
  const best = new Map<string, OfferDraft & { from: string }>();
  pages.forEach((text, i) => {
    const words = wordsOf(text);
    const flat = ` ${normalizeName(text.replace(/­/g, '').replace(/-\s+/g, '-'))} `;
    for (const w of wanted) {
      const word = words.find((t) => hits(t, w.words));
      const phrase = !word && w.words.find((p) => p.includes(' ') && flat.includes(` ${p} `));
      if (!word && !phrase) continue;
      const prev = best.get(w.key);
      if (prev && prev.from <= validity[i].from) continue;
      best.set(w.key, { name: word || w.name, food: w.name, from: validity[i].from, until: validity[i].until });
    }
  });
  return [...best.values()];
}

/** „Do. 26.11.“, „seit So. 15.11.“, „So. 15.11. bis Sa. 28.11.“ → erster gültiger Tag, nie vor dem Prospekt */
function rowFrom(validFrom: string, flyer: Pick<LeafletFlyer, 'start' | 'end'>): string {
  const m = validFrom.match(/(\d{1,2})\.(\d{1,2})\./);
  const day = m ? dayIn(flyer, m[1], m[2]) : undefined;
  return day && day > flyer.start && day <= flyer.end ? day : flyer.start;
}

/**
 * Deine Zutaten unter den Lidl-Angeboten mit Preis (leafletPrices.ts) – wie ingredientsInLeaflet, nur mit Preis,
 * Statt-Preis, Packung und Tag. Gesucht wird nur im Artikelnamen, nicht in Marke oder Beschreibung („passt zu Pasta“
 * ist keine Pasta). Je Zutat ein Angebot: das früheste, am selben Tag das günstigere. Ein Lidl-Plus-Preis sagt das im
 * Namen – er gilt nur mit der App.
 */
export function ingredientsWithPrices(
  rows: readonly PriceRow[], flyer: Pick<LeafletFlyer, 'start' | 'end'>, wanted: readonly WantedIngredient[],
): OfferDraft[] {
  const best = new Map<string, OfferDraft & { from: string; price: number }>();
  for (const r of rows) {
    if (!r.name || !(r.price > 0)) continue;
    const words = wordsOf(r.name);
    const flat = ` ${normalizeName(r.name)} `;
    const from = rowFrom(r.validFrom, flyer);
    const pack = packFromText(r.quantity);
    // „−24%“ wie gedruckt; „−1€“ (Euro statt Prozent) bleibt weg
    const pct = r.discount.match(/^[-–](\d{1,2})%$/);
    for (const w of wanted) {
      const word = words.some((t) => hits(t, w.words));
      if (!word && !w.words.some((p) => p.includes(' ') && flat.includes(` ${p} `))) continue;
      const prev = best.get(w.key);
      if (prev && (prev.from < from || (prev.from === from && prev.price <= r.price))) continue;
      best.set(w.key, {
        name: r.plus ? `${r.name} (Lidl Plus)` : r.name,
        food: w.name,
        price: r.price,
        ...(r.regular != null && r.regular > r.price ? { regular: r.regular } : {}),
        ...(pct ? { discount: Number(pct[1]) } : {}),
        ...pack,
        from,
        until: flyer.end,
      });
    }
  }
  return [...best.values()];
}
