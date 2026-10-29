/**
 * Feiertagsthemen („Spezial“ in den Einstellungen): In ihrer Saison sind sie von selbst an –
 * wer eins ausschaltet, hat bis Saisonende Ruhe; außerhalb der Saison kann man es von Hand einschalten.
 * (Julia: Halloween saisonal automatisch, später genauso Weihnachten)
 */
export type SpecialId = 'halloween';

export interface Season {
  id: SpecialId;
  label: string;
  /** erster und letzter Tag als „MM-TT“ – darf über Neujahr gehen (from > to) */
  from: string;
  to: string;
}

export const SEASONS: Season[] = [{ id: 'halloween', label: 'Halloween', from: '10-15', to: '11-02' }];

/** Eigene Wahl, die die Saison überstimmt – bis einschließlich `until` („JJJJ-MM-TT“) oder für immer */
export interface SpecialOverride {
  id: SpecialId | 'aus';
  until: string | 'immer';
}

const md = (day: string) => day.slice(5, 10);
const inRange = (s: Season, day: string) =>
  s.from <= s.to ? md(day) >= s.from && md(day) <= s.to : md(day) >= s.from || md(day) <= s.to;

/** Welche Saison läuft an diesem Tag („JJJJ-MM-TT“)? */
export const seasonOn = (day: string): Season | undefined => SEASONS.find((s) => inRange(s, day));

/** Letzter Tag der Saison, in der `day` liegt – bei Saisons über Neujahr ggf. im nächsten Jahr */
export function seasonEnd(s: Season, day: string): string {
  const year = Number(day.slice(0, 4));
  const wraps = s.from > s.to && md(day) >= s.from;
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
