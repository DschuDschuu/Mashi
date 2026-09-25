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
  // Mit Knopf etwas länger stehen lassen – man muss ihn ja noch treffen
  timer = setTimeout(dismissToast, action ? 5000 : 2600);
}

export function dismissToast() {
  message = null;
  emit();
}

export function useToast(): ToastMessage | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => message);
}
