import type { CravingState } from '../domain/craving';

/**
 * Der angefangene Stepper (Julia: die Auswahl war weg, wenn man die Seite verlassen hat) – nur auf diesem Gerät, wie
 * eine Notiz: kein Abgleich, kein Rückgängig nötig. Gehört zum Getippten (`q`), mit dem man angefangen hat, und gilt
 * nur bis Mitternacht (Julia: am nächsten Tag soll „Taco“ frisch anfangen).
 */
const KEY = 'mashi-craving-v1';

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

export function clearCraving() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // s. o.
  }
}
