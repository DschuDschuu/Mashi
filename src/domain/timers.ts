/**
 * Kochmodus: mehrere Timer gleichzeitig – je Schritt mit Zeitangabe einer, dazu eigene („Ofen“).
 * Reine Rechnerei ohne React, damit sie testbar bleibt; die Uhrzeit kommt immer von außen (now).
 */
export interface CookTimer {
  id: string;
  /** „Schritt 3“ oder ein eigener Name („Ofen“) */
  label: string;
  /** gehört zu diesem Schritt (Index) – eigene Timer haben keinen */
  step?: number;
  totalMs: number;
  /** Solange er läuft: Endzeitpunkt. Pausiert: Restzeit. So bleibt er genau, auch wenn der Tab kurz schläft. */
  endsAt?: number;
  remainingMs: number;
}

export const remainingOf = (t: CookTimer, now: number) => (t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs);
export const isDone = (t: CookTimer, now: number) => remainingOf(t, now) === 0;
export const isRunning = (t: CookTimer, now: number) => !!t.endsAt && !isDone(t, now);

export function startTimer(list: CookTimer[], t: { id: string; label: string; minutes: number; step?: number }, now: number): CookTimer[] {
  const ms = Math.round(t.minutes * 60_000);
  if (!(ms > 0)) return list;
  // je Schritt nur einer – ein zweiter Start ersetzt ihn
  const rest = t.step === undefined ? list : list.filter((x) => x.step !== t.step);
  return [...rest, { id: t.id, label: t.label, ...(t.step !== undefined ? { step: t.step } : {}), totalMs: ms, remainingMs: ms, endsAt: now + ms }];
}

export function pauseTimer(list: CookTimer[], id: string, now: number): CookTimer[] {
  return list.map((t) => (t.id === id && t.endsAt ? { ...t, endsAt: undefined, remainingMs: remainingOf(t, now) } : t));
}

export function resumeTimer(list: CookTimer[], id: string, now: number): CookTimer[] {
  return list.map((t) => (t.id === id && !t.endsAt && t.remainingMs > 0 ? { ...t, endsAt: now + t.remainingMs } : t));
}

export const removeTimer = (list: CookTimer[], id: string) => list.filter((t) => t.id !== id);

/** Gerade fertig geworden und noch nicht geklingelt – so klingelt jeder genau einmal, auch wenn zwei zugleich ablaufen */
export const newlyDone = (list: CookTimer[], rung: ReadonlySet<string>, now: number) => list.filter((t) => isDone(t, now) && !rung.has(t.id)).map((t) => t.id);

/** Für die Leiste: Fertiges zuerst (will Aufmerksamkeit), dann was als Nächstes abläuft, Pausiertes zuletzt */
export function byUrgency(list: CookTimer[], now: number): CookTimer[] {
  const rank = (t: CookTimer) => (isDone(t, now) ? -1 : t.endsAt ? remainingOf(t, now) : Infinity);
  return [...list].sort((a, b) => rank(a) - rank(b));
}
