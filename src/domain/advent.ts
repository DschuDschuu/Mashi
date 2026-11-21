import { isDataImage, MAX_IMAGE } from './dataImage';
import { localDay } from './dates';
import { timerFrom, toUnit } from './importText';
import { newId } from './recipe';
import type { Ingredient, RecipeContent, Step, Unit } from './types';

/**
 * Adventskalender (Julia: „jeden Tag im Dezember ein Rezept, das man speichern kann“): 24 Türchen, hinter jedem ein
 * Rezept aus einer JSON-Datei, die Julia selbst einspielt. Die Rezepte liegen in IHREN Daten (eigenes Dokument,
 * wird abgeglichen) und nie im öffentlichen Repo. Ins Kochbuch kommt eins erst, wenn sie am Türchen „Speichern“
 * tippt – vorher tauchte es sonst in Suche, „Überrasch mich“ und Rezept des Tages auf.
 * Format der Datei: docs/ADVENTSKALENDER.md
 */

export const ADVENT_DAYS = 24;
/** Tag, mit dem jedes gespeicherte Rezept im Kochbuch zu finden ist (Filter „Tags“) */
export const ADVENT_TAG = 'Adventskalender';

export interface AdventDoor {
  /** 1–24 */
  day: number;
  content: RecipeContent;
  /** „Tipp“ aus der Datei – landet beim Speichern in den Notizen des Rezepts */
  tip?: string;
  /**
   * Foto aus der Datei – nur der Verweis: das Foto selbst liegt in einem eigenen Dokument (Julia: A). So bleibt der
   * Kalender klein, und ein geöffnetes Türchen gleicht nur ein paar Bytes ab statt aller 24 Fotos.
   */
  imageId?: string;
}

export interface AdventCalendar {
  /** Für welchen Dezember (Jahr der Befüllung); 0 = noch nie befüllt */
  year: number;
  doors: AdventDoor[];
  /** Tag („5“) → wann geöffnet (ISO) */
  opened: Record<string, string>;
  /** Tag („5“) → ID des gespeicherten Rezepts */
  saved: Record<string, string>;
  /** Wann zuletzt befüllt – beim Abgleich gewinnt die neuere Befüllung als Ganzes */
  filledAt: string;
  updatedAt: string;
}

export const emptyAdvent = (): AdventCalendar => ({ year: 0, doors: [], opened: {}, saved: {}, filledAt: '', updatedAt: '' });

// ── Einlesen ──────────────────────────────────────────────────────

export interface AdventImport {
  doors: AdventDoor[];
  /** Fotos aus der Datei je Tag (data-URL) – werden beim Befüllen verkleinert und eigens gespeichert */
  images: Record<number, string>;
  /** Was das Einspielen verhindert (kein Titel, Tag doppelt …) */
  errors: string[];
  /** Eingespielt wird trotzdem – aber Julia sieht, was Mashi anders gemacht hat */
  warnings: string[];
}

const UNITS: readonly Unit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Glas', 'Bund', 'Handvoll', 'cm', 'Messlöffel', 'Portion'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Zahl aus der Datei – „1,5“ als Text geht auch (so schreibt man es in Deutschland), sonst undefined */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Erst genau wie in Mashi („EL“), dann die Schreibweisen, die der Text-Import kennt („Stk.“, „Liter“) */
const unitOf = (s: string): Unit | undefined => UNITS.find((u) => u === s) ?? UNITS.find((u) => u.toLowerCase() === s.toLowerCase()) ?? toUnit(s);

function ingredientOf(raw: unknown, where: string, errors: string[], warnings: string[]): Ingredient | undefined {
  const z = isObj(raw) ? raw : {};
  const name = text(z.name);
  if (!name) {
    errors.push(`${where}: Zutat ohne „name“.`);
    return undefined;
  }
  let amount = num(z.menge);
  if (z.menge !== undefined && (amount === undefined || amount < 0)) {
    warnings.push(`${where}: Menge „${String(z.menge)}“ bei ${name} ist keine Zahl – weggelassen.`);
    amount = undefined;
  }
  const unitText = text(z.einheit);
  const unit = unitText ? unitOf(unitText) : undefined;
  // unbekannte Einheit („Päckchen“, „Becher“): nicht raten, sondern als Hinweis an der Zutat behalten
  const notes = [unitText && !unit ? unitText : '', text(z.hinweis)].filter(Boolean);
  if (unitText && !unit) warnings.push(`${where}: Einheit „${unitText}“ kennt Mashi nicht – steht bei ${name} als Hinweis.`);
  const part = text(z.teil);
  return {
    id: newId('i'),
    name,
    ...(amount ? { amount } : {}),
    ...(unit ? { unit } : {}),
    ...(notes.length ? { note: notes.join(', ') } : {}),
    ...(part ? { part: part.charAt(0).toLocaleUpperCase('de-DE') + part.slice(1) } : {}),
  };
}

/** „bild“: ein eingebettetes Foto – sonst ohne Foto übernehmen und sagen, warum */
function imageOf(v: unknown, where: string, warnings: string[]): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (isDataImage(v)) return v;
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^https?:/i.test(s)) warnings.push(`${where}: Links nimmt Mashi nicht – das Foto muss in der Datei stehen („data:image/jpeg;base64,…“). Ohne Foto übernommen.`);
  else if (s.startsWith('data:image/') && s.length > MAX_IMAGE) warnings.push(`${where}: Das Foto ist größer als 4 MB – bitte vorher verkleinern. Ohne Foto übernommen.`);
  else warnings.push(`${where}: „bild“ ist kein Foto (JPEG, PNG oder WebP als „data:image/…;base64,…“). Ohne Foto übernommen.`);
  return undefined;
}

function doorOf(raw: unknown, index: number, errors: string[], warnings: string[]): (AdventDoor & { image?: string }) | undefined {
  const r = isObj(raw) ? raw : {};
  const day = num(r.tag);
  const validDay = day !== undefined && Number.isInteger(day) && day >= 1 && day <= ADVENT_DAYS;
  const where = validDay ? `Tag ${day}` : `Rezept ${index + 1}`;
  const before = errors.length;
  if (!validDay) errors.push(`${where}: „tag“ muss eine Zahl von 1 bis ${ADVENT_DAYS} sein.`);
  const title = text(r.titel);
  if (!title) errors.push(`${where}: „titel“ fehlt.`);
  const servings = num(r.portionen);
  if (!servings || servings <= 0) errors.push(`${where}: „portionen“ muss eine Zahl größer 0 sein.`);
  const minutes = (key: string, v: unknown) => {
    if (v === undefined) return 0;
    const n = num(v);
    if (n === undefined || n < 0) {
      warnings.push(`${where}: „${key}“ ist keine Minutenzahl – 0 angenommen.`);
      return 0;
    }
    return Math.round(n);
  };
  const prepMinutes = minutes('vorbereitung', r.vorbereitung);
  // „backzeit“ steht im Format, „kochzeit“ ist dasselbe für Getränke und Festessen
  const cookMinutes = minutes(r.backzeit !== undefined ? 'backzeit' : 'kochzeit', r.backzeit ?? r.kochzeit);

  const rawIngredients = Array.isArray(r.zutaten) ? r.zutaten : [];
  if (!rawIngredients.length) errors.push(`${where}: „zutaten“ fehlen.`);
  const ingredients = rawIngredients.map((z) => ingredientOf(z, where, errors, warnings)).filter((i): i is Ingredient => !!i);

  const rawSteps = Array.isArray(r.schritte) ? r.schritte : [];
  const stepTexts = rawSteps.map(text).filter(Boolean);
  if (!stepTexts.length) errors.push(`${where}: „schritte“ fehlen.`);
  const steps: Step[] = stepTexts.map((t) => {
    const timer = timerFrom(t);
    return { id: newId('s'), text: t, ...(timer ? { timerMinutes: timer } : {}) };
  });

  if (errors.length > before) return undefined;
  const tip = text(r.tipp);
  const image = imageOf(r.bild, where, warnings);
  return {
    day: day!,
    content: {
      title,
      description: text(r.beschreibung),
      servings: servings!,
      prepMinutes,
      cookMinutes,
      difficulty: 1,
      ingredients,
      steps,
      categories: [],
      tags: [ADVENT_TAG],
      devices: [],
    },
    ...(tip ? { tip } : {}),
    ...(image ? { image } : {}),
  };
}

/**
 * Julias JSON-Datei → Türchen. Streng bei dem, was ein Rezept braucht (Titel, Portionen, Zutaten, Schritte),
 * nachsichtig bei Kleinigkeiten (unbekannte Einheit, „1,5“ als Text) – die stehen dann als Hinweis da.
 * Fehlende Tage sind erlaubt (Hinweis), das Türchen bleibt dann leer.
 */
export function parseAdventJson(json: string): AdventImport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { doors: [], images: {}, errors: ['Die Datei ist kein gültiges JSON – fehlt irgendwo ein Komma oder eine Klammer?'], warnings: [] };
  }
  // eine Liste (wie im Format) – oder { "rezepte": [...] }, falls die Datei so verpackt ist
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.rezepte) ? data.rezepte : undefined;
  if (!list?.length) return { doors: [], images: {}, errors: ['In der Datei steht keine Liste mit Rezepten.'], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const doors: AdventDoor[] = [];
  const images: Record<number, string> = {};
  list.forEach((raw, i) => {
    const parsed = doorOf(raw, i, errors, warnings);
    if (!parsed) return;
    const { image, ...door } = parsed;
    if (doors.some((d) => d.day === door.day)) {
      errors.push(`Tag ${door.day} kommt mehrmals vor.`);
      return;
    }
    doors.push(door);
    if (image) images[door.day] = image;
  });
  const missing = Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1).filter((d) => !doors.some((x) => x.day === d));
  if (!errors.length && missing.length) warnings.push(`Ohne Rezept bleiben die Türchen ${missing.join(', ')}.`);
  return { doors: doors.sort((a, b) => a.day - b.day), images, errors, warnings };
}

/** Foto-Verweise eines Kalenders – was beim Aufräumen bleiben muss */
export const imageIdsOf = (cal: AdventCalendar | undefined): string[] =>
  (cal?.doors ?? []).flatMap((d) => (d.imageId ? [d.imageId] : []));

/** Foto-Dokumente heißen so – das Aufräumen findet sie über den Anfang */
export const ADVENT_IMAGE_PREFIX = 'adventbild_';

// ── Befüllen, Öffnen, Speichern ───────────────────────────────────

/**
 * Neue Datei einspielen. Im selben Jahr bleiben geöffnete und gespeicherte Türchen erhalten (Tippfehler in der Datei
 * verbessert und neu eingespielt) – in einem neuen Jahr fängt der Kalender von vorn an.
 */
export function fillAdvent(cal: AdventCalendar, doors: AdventDoor[], now: Date): AdventCalendar {
  const year = now.getFullYear();
  const keep = (rec: Record<string, string>) =>
    cal.year === year ? Object.fromEntries(Object.entries(rec).filter(([d]) => doors.some((x) => String(x.day) === d))) : {};
  const t = now.toISOString();
  return { year, doors, opened: keep(cal.opened), saved: keep(cal.saved), filledAt: t, updatedAt: t };
}

export const doorOn = (cal: AdventCalendar, day: number): AdventDoor | undefined => cal.doors.find((d) => d.day === day);

/** Leer oder vom letzten Jahr → neu befüllen */
export const needsFilling = (cal: AdventCalendar, now: Date): boolean => !cal.doors.length || cal.year < now.getFullYear();

/**
 * Darf das Türchen auf? Wie ein echter Kalender: erst an seinem Tag (Ortszeit). Ist der Dezember des Kalenders
 * vorbei, ist alles offen – Verpasstes lässt sich nachholen.
 */
export function canOpen(cal: AdventCalendar, day: number, now: Date): boolean {
  if (!cal.year) return false;
  if (now.getFullYear() !== cal.year) return now.getFullYear() > cal.year;
  return now.getMonth() === 11 && now.getDate() >= day;
}

/**
 * Vorschau (Julia: „jetzt schon ansehen, so dev-mäßig“, #/advent?vorschau): Mashi tut so, als wäre der `day`. Dezember
 * im Jahr des Kalenders (leer: dieses Jahr), mittags – dann gehen die Türchen 1 bis `day` auf. Der Tag wird auf 1–24
 * begrenzt; Unsinn in der Adresse wird zum 1.
 */
export function previewDate(cal: AdventCalendar, day: number, now: Date): Date {
  const d = Math.min(ADVENT_DAYS, Math.max(1, Math.round(Number.isFinite(day) ? day : 1)));
  return new Date(cal.year || now.getFullYear(), 11, d, 12);
}

export function markOpened(cal: AdventCalendar, day: number, now: Date): AdventCalendar {
  if (cal.opened[day]) return cal;
  return { ...cal, opened: { ...cal.opened, [day]: now.toISOString() } };
}

/** Foto eines Türchens nachträglich setzen oder entfernen (Julia: „Bilder nachträglich ergänzen“) – nur der Verweis */
export function withDoorImage(cal: AdventCalendar, day: number, imageId: string | undefined): AdventCalendar {
  return {
    ...cal,
    doors: cal.doors.map((d) => {
      if (d.day !== day) return d;
      const { imageId: _, ...rest } = d;
      return imageId ? { ...rest, imageId } : rest;
    }),
  };
}

export function markSaved(cal: AdventCalendar, day: number, recipeId: string | undefined): AdventCalendar {
  const { [day]: _, ...rest } = cal.saved;
  return { ...cal, saved: recipeId ? { ...rest, [day]: recipeId } : rest };
}

/** Was beim Speichern eines Türchens ins Kochbuch kommt: das Rezept, der Tipp als Notiz */
export const doorNotes = (door: AdventDoor): string => (door.tip ? `Tipp: ${door.tip}` : '');

/**
 * Was die Startseite zeigt: vom 1. bis 24. Dezember das Türchen des Tages; ist der Kalender ab dem 15. November
 * (bis Heiligabend) noch leer oder vom letzten Jahr, die Erinnerung „befüllen“. Sonst nichts – der Kalender
 * drängt sich den Rest des Jahres nicht auf.
 */
export type AdventHint = { kind: 'door'; day: number; opened: boolean } | { kind: 'fill' };

export function adventHint(cal: AdventCalendar, now: Date): AdventHint | undefined {
  const m = now.getMonth(), d = now.getDate();
  const season = (m === 10 && d >= 15) || (m === 11 && d <= ADVENT_DAYS);
  if (!season) return undefined;
  if (needsFilling(cal, now)) return { kind: 'fill' };
  if (m !== 11) return undefined;
  return { kind: 'door', day: d, opened: !!cal.opened[d] };
}

/**
 * Täglicher Dialog (Julia: „soll täglich als Dialog aufpoppen“, einmal am Tag, solange zu): Tag des heutigen Türchens,
 * wenn es heute (1.–24.12., Kalender befüllt) eins gibt, es noch zu ist und der Dialog heute noch nicht kam.
 * `lastShown` = Tag („JJJJ-MM-TT“), an dem er zuletzt kam – je Gerät gemerkt.
 */
export function dailyDoor(cal: AdventCalendar, now: Date, lastShown?: string | null): number | undefined {
  const hint = adventHint(cal, now);
  if (hint?.kind !== 'door' || hint.opened || !doorOn(cal, hint.day)) return undefined;
  return lastShown === localDay(now) ? undefined : hint.day;
}

// ── Abgleich zwischen Geräten (wie syncMerge.ts, aber nur für dieses Dokument) ──

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Tag → Wert dreiseitig: deren Stand + unsere Zu- und Abgänge */
function merge3Record(base: Record<string, string>, ours: Record<string, string>, theirs: Record<string, string>): Record<string, string> {
  const out = { ...theirs };
  for (const [k, v] of Object.entries(ours)) if (base[k] !== v) out[k] = v;
  for (const k of Object.keys(base)) if (!(k in ours)) delete out[k];
  return out;
}

const later = (a: string, b: string) => (a > b ? a : b);

/**
 * Zwei Geräte haben gleichzeitig geändert. Hat eins neu befüllt, gilt die Befüllung (Jahr + Türchen) als Ganzes –
 * bei beiden die neuere. Sonst werden die Türchen einzeln zusammengeführt: ein nachträglich ergänztes Foto bleibt,
 * auch wenn das andere Gerät gleichzeitig ein anderes Türchen geändert oder geöffnet hat. Geöffnete und gespeicherte
 * Türchen werden immer zusammengeführt. Ist die gewinnende Befüllung aus einem anderen Jahr, passen die Merklisten der
 * anderen Seite nicht dazu → die ganze neuere Fassung.
 */
export function merge3Advent(base: AdventCalendar, ours: AdventCalendar, theirs: AdventCalendar): AdventCalendar {
  if (same(base, ours)) return theirs;
  const lists = {
    opened: merge3Record(base.opened, ours.opened, theirs.opened),
    saved: merge3Record(base.saved, ours.saved, theirs.saved),
    updatedAt: later(ours.updatedAt, theirs.updatedAt),
  };
  const oursFilled = ours.filledAt !== base.filledAt;
  const theirsFilled = theirs.filledAt !== base.filledAt;
  if (oursFilled || theirsFilled) {
    const fill = oursFilled && (!theirsFilled || ours.filledAt >= theirs.filledAt) ? ours : theirs;
    return ours.year !== theirs.year ? fill : { ...fill, ...lists };
  }
  // niemand hat neu befüllt: je Türchen unseres, wenn wir es geändert haben (Foto), sonst deres
  const byDay = (c: AdventCalendar) => new Map(c.doors.map((d) => [d.day, d]));
  const b = byDay(base), o = byDay(ours), t = byDay(theirs);
  const days = [...new Set([...t.keys(), ...o.keys()])].sort((x, y) => x - y);
  const doors = days.flatMap((d) => {
    const pick = same(b.get(d), o.get(d)) ? t.get(d) : o.get(d);
    return pick ? [pick] : [];
  });
  return { ...theirs, doors, ...lists };
}

/** Offline-Konflikt ohne gemeinsamen Stand: die neuere Befüllung, Merklisten vereint (lieber zu viel als verloren) */
export function unionAdvent(a: AdventCalendar, b: AdventCalendar): AdventCalendar {
  const [newer, older] = a.filledAt > b.filledAt || (a.filledAt === b.filledAt && a.updatedAt >= b.updatedAt) ? [a, b] : [b, a];
  if (newer.year !== older.year) return newer;
  return {
    ...newer,
    opened: { ...older.opened, ...newer.opened },
    saved: { ...older.saved, ...newer.saved },
    updatedAt: later(a.updatedAt, b.updatedAt),
  };
}

const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const stringRecord = (v: unknown) => isObj(v) && Object.values(v).every((x) => typeof x === 'string');

/** Rezeptinhalt so, dass Anzeigen und Speichern nicht abstürzen – jede Liste mit passenden Einträgen (Code-Review #22) */
function isDoorContent(c: unknown): boolean {
  return isObj(c) && typeof c.title === 'string' && typeof c.description === 'string' && typeof c.servings === 'number' && c.servings > 0
    && typeof c.prepMinutes === 'number' && typeof c.cookMinutes === 'number'
    && Array.isArray(c.ingredients) && c.ingredients.every((i) => isObj(i) && typeof i.id === 'string' && typeof i.name === 'string')
    && Array.isArray(c.steps) && c.steps.every((s) => isObj(s) && typeof s.id === 'string' && typeof s.text === 'string')
    && strings(c.tags) && strings(c.categories) && strings(c.devices);
}

/** Aus einer Datei (Sicherung) oder der Datenbank: nur übernehmen, was wie ein Kalender aussieht */
export function isAdventCalendar(v: unknown): v is AdventCalendar {
  if (!isObj(v)) return false;
  return typeof v.year === 'number' && Array.isArray(v.doors) && stringRecord(v.opened) && stringRecord(v.saved)
    && typeof v.filledAt === 'string' && typeof v.updatedAt === 'string'
    && v.doors.every((d) => isObj(d) && typeof d.day === 'number' && isDoorContent(d.content)
      && (d.tip === undefined || typeof d.tip === 'string') && (d.imageId === undefined || typeof d.imageId === 'string'));
}
