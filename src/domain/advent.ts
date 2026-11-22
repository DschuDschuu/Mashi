import { localDay } from './dates';
import { contentOf, isObj, num } from './recipeFile';
import type { RecipeContent } from './types';

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

/**
 * Ein Türchen aus der Datei: „tag“ plus das gemeinsame Grundformat (recipeFile.ts: contentOf – Titel, Portionen,
 * Zeiten, Zutaten, Schritte, Beschreibung, Tipp, Foto). Im Kochbuch findet man es später über das Schlagwort.
 */
function doorOf(raw: unknown, index: number, errors: string[], warnings: string[]): (AdventDoor & { image?: string }) | undefined {
  const r = isObj(raw) ? raw : {};
  const day = num(r.tag);
  const validDay = day !== undefined && Number.isInteger(day) && day >= 1 && day <= ADVENT_DAYS;
  const where = validDay ? `Tag ${day}` : `Rezept ${index + 1}`;
  const before = errors.length;
  if (!validDay) errors.push(`${where}: „tag“ muss eine Zahl von 1 bis ${ADVENT_DAYS} sein.`);
  const parsed = contentOf(r, where, errors, warnings);
  if (!parsed || errors.length > before) return undefined;
  return {
    day: day!,
    content: { ...parsed.content, tags: [ADVENT_TAG] },
    ...(parsed.tip ? { tip: parsed.tip } : {}),
    ...(parsed.image ? { image: parsed.image } : {}),
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

/**
 * Export (Julia: „exportieren, dann kann ich ihn fertig machen und kopieren“): der Kalender zurück in das Format der
 * Datei (docs/ADVENTSKALENDER.md) – mit den Fotos (`images`: Foto-ID → data-URL), ohne Fortschritt: Wer die Datei
 * einspielt, fängt mit geschlossenen Türchen an. Was beim Einlesen leer oder 0 war, bleibt weg; parseAdventJson liest
 * die Datei wieder genauso ein.
 */
export function exportAdvent(cal: AdventCalendar, images: Readonly<Record<string, string>> = {}): Record<string, unknown>[] {
  return cal.doors.map((d) => {
    const c = d.content;
    const photo = d.imageId ? images[d.imageId] : undefined;
    return {
      tag: d.day,
      titel: c.title,
      ...(c.description ? { beschreibung: c.description } : {}),
      portionen: c.servings,
      ...(c.prepMinutes ? { vorbereitung: c.prepMinutes } : {}),
      ...(c.cookMinutes ? { backzeit: c.cookMinutes } : {}),
      zutaten: c.ingredients.map((i) => ({
        name: i.name,
        ...(i.amount !== undefined ? { menge: i.amount } : {}),
        ...(i.unit ? { einheit: i.unit } : {}),
        ...(i.note ? { hinweis: i.note } : {}),
        ...(i.part ? { teil: i.part } : {}),
      })),
      schritte: c.steps.map((s) => s.text),
      ...(d.tip ? { tipp: d.tip } : {}),
      ...(photo ? { bild: photo } : {}),
    };
  });
}

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
 * (bis Heiligabend) noch leer oder vom letzten Jahr, die Erinnerung „befüllen“. Ist er für dieses Jahr befüllt,
 * zählt die Karte bis zum 1. Dezember die Tage (Julia: „es ist erst der 21. – da fehlt mir noch Vorfreude“). Sonst
 * nichts – der Kalender drängt sich den Rest des Jahres nicht auf.
 */
export type AdventHint = { kind: 'door'; day: number; opened: boolean } | { kind: 'fill' } | { kind: 'countdown'; days: number };

export function adventHint(cal: AdventCalendar, now: Date): AdventHint | undefined {
  const m = now.getMonth(), d = now.getDate();
  // befüllt, aber noch vor Dezember: Tage bis zum ersten Türchen. Kalendertage zählen (nicht 24-h-Blöcke), gerundet
  // – sonst wäre es um 23 Uhr schon „einer weniger“ bzw. verrutschte es bei der Zeitumstellung.
  if (m < 11 && !needsFilling(cal, now)) {
    const days = Math.round((new Date(now.getFullYear(), 11, 1).getTime() - new Date(now.getFullYear(), m, d).getTime()) / 86_400_000);
    return { kind: 'countdown', days };
  }
  const season = (m === 10 && d >= 15) || (m === 11 && d <= ADVENT_DAYS);
  if (!season) return undefined;
  if (needsFilling(cal, now)) return { kind: 'fill' };
  if (m !== 11) return undefined;
  return { kind: 'door', day: d, opened: !!cal.opened[d] };
}

/**
 * Kleiner Baum oben auf der Startseite (Julia: „Zum Kalender oben rechts neben dem Zahnrad“): sobald der Kalender für
 * dieses Jahr befüllt ist – bis zum 6. Januar danach, damit sich Verpasstes nachholen lässt. Sonst steht im Sommer
 * kein Tannenbaum in der Kopfzeile.
 */
export function showsTree(cal: AdventCalendar, now: Date): boolean {
  if (!cal.doors.length || !cal.year) return false;
  if (now.getFullYear() === cal.year) return true;
  return now.getFullYear() === cal.year + 1 && now.getMonth() === 0 && now.getDate() <= 6;
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
