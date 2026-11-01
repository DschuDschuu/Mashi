import { useSyncExternalStore } from 'react';

/** Kurzer Hinweis unten – optional mit einem Knopf, z. B. „Rückgängig“. */
export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

let message: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/** wann er von selbst geht – fürs Festhalten (holdToast) */
let until = 0;
let left = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Wie lange ein Hinweis steht: so lange, wie man zum Lesen braucht (≈ 16 Zeichen je Sekunde), mit Knopf länger – man
 * muss „Rückgängig“ ja noch treffen. Etwas kürzer als früher (Julia: „die Anzeige verkürzen oder wegwischbar machen“):
 * wegwischen geht jetzt, und solange der Finger darauf liegt, bleibt er.
 */
export const toastMs = (text: string, withAction: boolean): number =>
  Math.min(10000, Math.max(withAction ? 5000 : 2000, 1500 + text.length * 60));

const run = (ms: number) => {
  clearTimeout(timer);
  until = Date.now() + ms;
  timer = setTimeout(dismissToast, ms);
};

export function toast(text: string, action?: ToastMessage['action']) {
  message = { text, action };
  emit();
  run(toastMs(text, !!action));
}

export function dismissToast() {
  clearTimeout(timer);
  message = null;
  emit();
}

/** Finger liegt darauf (oder wischt) – nicht von selbst verschwinden */
export function holdToast() {
  if (!message) return;
  clearTimeout(timer);
  left = Math.max(0, until - Date.now());
}

/** losgelassen, ohne wegzuwischen – die Restzeit läuft weiter, mindestens noch kurz zum Lesen */
export function releaseToast() {
  if (message) run(Math.max(1500, left));
}

/** der aktuelle Hinweis – für Tests ohne React */
export const currentToast = (): ToastMessage | null => message;

export function useToast(): ToastMessage | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => message);
}
