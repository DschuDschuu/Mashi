import { useSyncExternalStore } from 'react';

/**
 * Nachfrage im Mashi-Stil (Blatt von unten) statt des grauen Browser-Dialogs.
 * Knöpfe sagen, was passiert („Endgültig löschen“, „Zurücknehmen“) – nicht „OK“.
 */
export interface ConfirmRequest {
  title: string;
  text?: string;
  /** Beschriftung des Knopfs, der es tut */
  confirm: string;
  /** Beschriftung des Knopfs, der nichts tut */
  cancel?: string;
  /** löscht oder verwirft etwas → roter Knopf */
  danger?: boolean;
  /** statt des einen Knopfs mehrere Möglichkeiten – siehe choose() */
  choices?: { label: string; value: string }[];
}

/** Antwort: der Wert der gewählten Möglichkeit („ja“ bei ask) – null = abgebrochen */
let current: (ConfirmRequest & { resolve: (answer: string | null) => void }) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Fragen und auf die Antwort warten: true = bestätigt. Eine neue Frage beantwortet eine offene mit „nein“. */
export function ask(req: ConfirmRequest): Promise<boolean> {
  return choose({ ...req, choices: undefined }).then((answer) => answer !== null);
}

/**
 * Auswahl im selben Blatt (Julia: „5 Einkäufe – zu welcher Sorte?“): je Möglichkeit ein Knopf, darunter „Abbrechen“.
 * Gibt den Wert der gewählten Möglichkeit zurück, null = abgebrochen. Eine neue Frage bricht eine offene ab.
 */
export function choose(req: Omit<ConfirmRequest, 'confirm'> & { confirm?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { confirm: '', ...req, resolve: (answer) => { current = null; emit(); resolve(answer); } };
    emit();
  });
}

/** „Verwerfen? Deine Änderungen gehen verloren.“ → Titel = die Frage, Text = der Rest, Knopf = die Frage ohne „?“ */
export function askDiscard(question: string): Promise<boolean> {
  const i = question.indexOf('?');
  const title = i >= 0 ? question.slice(0, i + 1) : question;
  const text = i >= 0 ? question.slice(i + 1).trim() : undefined;
  return ask({ title, ...(text ? { text } : {}), confirm: title.replace(/\?$/, ''), cancel: 'Weiter bearbeiten', danger: true });
}

export function useConfirm() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
