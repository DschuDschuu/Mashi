/**
 * Feiertagsthemen („Spezial“ in den Einstellungen): In ihrer Saison sind sie von selbst an –
 * wer eins ausschaltet, hat bis Saisonende Ruhe; außerhalb der Saison kann man es von Hand einschalten.
 * (Julia: Halloween saisonal automatisch, später genauso Weihnachten)
 */
export type SpecialId = 'halloween' | 'weihnachten';

export interface Season {
  id: SpecialId;
  label: string;
  /** erster und letzter Tag als „MM-TT“ – darf über Neujahr gehen (from > to); der Anfang darf je Jahr wandern */
  from: string | ((year: number) => string);
  to: string;
}

const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 1. Advent („MM-TT“): vier Sonntage vor Weihnachten – der Sonntag 22 bis 28 Tage vor dem 25.12. (27.11. bis 3.12.) */
export function firstAdvent(year: number): string {
  const weekday = new Date(year, 11, 25).getDay(); // 0 = Sonntag
  const fourth = 25 - (weekday === 0 ? 7 : weekday); // 4. Advent: der Sonntag vor dem 25.
  return mmdd(new Date(year, 11, fourth - 21)); // Date rechnet „−1. Dezember“ selbst in den November um
}

export const SEASONS: Season[] = [
  { id: 'halloween', label: 'Halloween', from: '10-15', to: '11-02' },
  // Julia: zum 1. Advent oder 1. Dezember – was früher ist (der Adventskalender beginnt am 1.12.), endet nach den Feiertagen
  { id: 'weihnachten', label: 'Weihnachten', from: (year) => (firstAdvent(year) < '12-01' ? firstAdvent(year) : '12-01'), to: '12-26' },
];

/** Erster Tag der Saison im Jahr `year` */
export const seasonStart = (s: Season, year: number): string => (typeof s.from === 'string' ? s.from : s.from(year));

/** Eigene Wahl, die die Saison überstimmt – bis einschließlich `until` („JJJJ-MM-TT“) oder für immer */
export interface SpecialOverride {
  id: SpecialId | 'aus';
  until: string | 'immer';
}

const md = (day: string) => day.slice(5, 10);
const inRange = (s: Season, day: string) => {
  const from = seasonStart(s, Number(day.slice(0, 4)));
  return from <= s.to ? md(day) >= from && md(day) <= s.to : md(day) >= from || md(day) <= s.to;
};

/** Welche Saison läuft an diesem Tag („JJJJ-MM-TT“)? */
export const seasonOn = (day: string): Season | undefined => SEASONS.find((s) => inRange(s, day));

/** Letzter Tag der Saison, in der `day` liegt – bei Saisons über Neujahr ggf. im nächsten Jahr */
export function seasonEnd(s: Season, day: string): string {
  const year = Number(day.slice(0, 4));
  const from = seasonStart(s, year);
  const wraps = from > s.to && md(day) >= from;
  return `${wraps ? year + 1 : year}-${s.to}`;
}

/** Das Feiertagsthema, das heute gilt – oder keins */
export function activeSpecial(day: string, override?: SpecialOverride): SpecialId | undefined {
  if (override && (override.until === 'immer' || day <= override.until)) return override.id === 'aus' ? undefined : override.id;
  return seasonOn(day)?.id;
}

/**
 * Was beim Ein-/Ausschalten gespeichert wird. undefined = „wie die Saison es will“ –
 * so kommt Halloween nächstes Jahr wieder, auch wenn man es dieses Jahr ausgeschaltet hat.
 */
export function toggleSpecial(id: SpecialId, on: boolean, day: string): SpecialOverride | undefined {
  const season = seasonOn(day);
  const inSeason = season?.id === id;
  if (on) return inSeason ? undefined : { id, until: 'immer' };
  return inSeason ? { id: 'aus', until: seasonEnd(season, day) } : undefined;
}

/** Abends (18 bis 6 Uhr, Ortszeit): Mond in der Ecke, Kürbis-Laterne leuchtet */
export const isEvening = (now: Date) => now.getHours() >= 18 || now.getHours() < 6;

/** Der 31. Oktober selbst: ein bisschen mehr Halloween (Mond den ganzen Tag, dritte Fledermaus, Hexenhut) */
export const isHalloweenNight = (day: string) => day.slice(5, 10) === '10-31';

/** Heiligabend: ein bisschen mehr Weihnachten (zweiter Schlitten, dichterer Schnee) */
export const isChristmasEve = (day: string) => day.slice(5, 10) === '12-24';

/** 24. bis 26. Dezember: „Frohe Weihnachten“ unter dem Logo */
export const isChristmasDays = (day: string) => ['12-24', '12-25', '12-26'].includes(day.slice(5, 10));

/** Herbstzutaten fürs „Rezept des Tages“ in der Halloween-Saison – bewusst ohne Möhre/Apfel, die stecken in fast allem */
const AUTUMN = ['kürbis', 'hokkaido', 'butternut', 'süßkartoffel', 'maronen', 'esskastanie', 'pastinake', 'steckrübe'];

/** Passt ein Rezept zur Saison? Schaut in Titel und Zutaten. */
export function isAutumnRecipe(title: string, ingredients: string[]): boolean {
  const text = [title, ...ingredients].join(' ').toLowerCase();
  return AUTUMN.some((w) => text.includes(w));
}
