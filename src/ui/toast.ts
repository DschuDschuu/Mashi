import { useSyncExternalStore } from 'react';

/** Kurzer Hinweis unten – optional mit einem Knopf, z. B. „Rückgängig“. */
export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

let message: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, action?: ToastMessage['action']) {
  message = { text, action };
  emit();
  clearTimeout(timer);
  // so lange, wie man zum Lesen braucht (≈ 15 Zeichen je Sekunde), mit Knopf länger – man muss ihn ja noch treffen
  const read = 1800 + text.length * 65;
  timer = setTimeout(dismissToast, Math.min(10000, Math.max(action ? 7000 : 2600, read)));
}

export function dismissToast() {
  message = null;
  emit();
}

export function useToast(): ToastMessage | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => message);
}
