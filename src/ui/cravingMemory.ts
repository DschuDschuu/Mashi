import { STAGES, type CravingState } from '../domain/craving';

/**
 * Der angefangene Stepper (Julia: die Auswahl war weg, wenn man die Seite verlassen hat) – nur auf diesem Gerät, wie
 * eine Notiz: kein Abgleich, kein Rückgängig nötig. Gehört zum Getippten (`q`), mit dem man angefangen hat, und gilt
 * nur bis Mitternacht (Julia: am nächsten Tag soll „Taco“ frisch anfangen).
 */
const KEY = 'mashi-craving-v1';

/** „Überrasch mich“ von der Startseite – die Lust-Seite würfelt dann gleich einen ganzen Teller (rollCraving) */
export const SURPRISE = 'Überrasch mich';

export interface CravingMemory {
  q: string;
  state: CravingState;
}

/** Kalendertag in Ortszeit („2026-10-26“) – Mitternacht hier, nicht in UTC */
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function loadCraving(now = new Date()): CravingMemory | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Partial<CravingMemory> & { day?: string }) | null;
    const s = raw?.state;
    // nur, was wie ein Stepper-Stand aussieht – alte oder kaputte Einträge zählen nicht
    if (typeof raw?.q !== 'string' || !s || typeof s.picks !== 'object' || !Array.isArray(s.closed)) return undefined;
    // von gestern: frisch anfangen
    if (raw.day !== dayOf(now)) return undefined;
    return { q: raw.q, state: s };
  } catch {
    return undefined;
  }
}

export function saveCraving(q: string, state: CravingState, now = new Date()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ q, state, day: dayOf(now) }));
  } catch {
    // privater Modus o. Ä.: dann merkt sich Mashi eben nichts
  }
}

/**
 * „Wie letztes Mal?“ (Julia): die zuletzt gekochten, eingeplanten oder gespeicherten Teller – die letzten 3, nur auf
 * diesem Gerät. Gemerkt wird der ganze Teller (alle Stufen erledigt), so liegt er mit einem Tipp wieder fertig da.
 */
const RECENT_KEY = 'mashi-craving-recent-v1';

export interface RecentPlate {
  title: string;
  state: CravingState;
}

/** Neu vorn; dasselbe Gericht (gleiche Richtung und Wahl, egal in welcher Reihenfolge) nur einmal; höchstens `max` */
export function withRecent(list: readonly RecentPlate[], plate: RecentPlate, max = 3): RecentPlate[] {
  const key = (p: RecentPlate) => JSON.stringify([p.state.direction ?? '', STAGES.map((k) => [...(p.state.picks[k] ?? [])].sort())]);
  return [plate, ...list.filter((p) => key(p) !== key(plate))].slice(0, max);
}

export function loadRecent(): RecentPlate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    // nur, was wie ein gemerkter Teller aussieht – alte oder kaputte Einträge zählen nicht
    return Array.isArray(raw)
      ? raw.filter((p): p is RecentPlate => typeof p?.title === 'string' && typeof p?.state?.picks === 'object' && !!p.state.picks && Array.isArray(p.state.closed))
      : [];
  } catch {
    return [];
  }
}

/** Teller merken – ohne Würfel- und „ohne“-Notizen, alle Stufen erledigt */
export function rememberPlate(state: CravingState, title: string) {
  const plate: RecentPlate = { title, state: { ...(state.direction ? { direction: state.direction } : {}), picks: state.picks, closed: [...STAGES] } };
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(loadRecent(), plate)));
  } catch {
    // privater Modus o. Ä.: dann eben ohne „Wie letztes Mal?“
  }
}

export function clearCraving() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // s. o.
  }
}

/** Teller oder Liste (Julia: „die kreative Ansicht oder beim Stepper bleiben“) – Standard Teller, gemerkt auf dem Gerät */
export type CravingView = 'plate' | 'list';
const VIEW_KEY = 'mashi-craving-view';

export function loadView(): CravingView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'plate';
  } catch {
    return 'plate';
  }
}

export function saveView(view: CravingView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // s. o.
  }
}
