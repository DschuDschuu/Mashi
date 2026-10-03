/**
 * „Neu überlegen“ und „Auftrag anpassen“ (Julia): Was im KI-Formular stand, merkt sich Mashi je KI-Idee –
 * nur auf diesem Gerät und für diese Sitzung (sessionStorage), das reicht für „gleich nochmal“.
 * Beides läuft durchs Formular: „Neu überlegen“ erzeugt dort sofort neu, „Auftrag anpassen“ öffnet es nur.
 * Das Ergebnis ersetzt die alte Idee.
 */
import { navigate } from '../router';

export interface KiForm {
  prompt: string;
  /** null = nicht angefasst */
  servings: number | null;
  devices: string[];
  wishes: string[];
  time: string[];
  withPantry: boolean;
  withTastes: boolean;
  /** Makro-Ziel mitschicken (ältere gemerkte Aufträge: fehlt → an) */
  withMacros?: boolean;
}

export interface KiAgain {
  form: KiForm;
  /** diese KI-Idee nach dem Erzeugen löschen (sie wird ersetzt) */
  replaces: string;
  /** gleich erzeugen („Neu überlegen“) statt nur das Formular zu zeigen */
  auto: boolean;
}

const FORMS = 'mashi-ki-forms';
const AGAIN = 'mashi-ki-again';
/** so viele Ideen merkt sich Mashi – ältere fallen raus */
const KEEP = 20;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // privater Modus o. Ä. – dann gibt es die Knöpfe eben nicht
  }
}

export function rememberForm(recipeId: string, form: KiForm) {
  const all = read<[string, KiForm][]>(FORMS) ?? [];
  write(FORMS, [...all.filter(([id]) => id !== recipeId), [recipeId, form]].slice(-KEEP));
}

export function formOf(recipeId: string): KiForm | undefined {
  return (read<[string, KiForm][]>(FORMS) ?? []).find(([id]) => id === recipeId)?.[1];
}

/** Zurück ins Formular – mit dem Auftrag dieser Idee */
export function startAgain(recipeId: string, auto: boolean) {
  const form = formOf(recipeId);
  if (!form) return;
  write(AGAIN, { form, replaces: recipeId, auto } satisfies KiAgain);
  navigate('/neu/ki');
}

/** Nur lesen (React ruft Anfangswerte im StrictMode doppelt auf – Löschen erst mit clearAgain) */
export const peekAgain = () => read<KiAgain>(AGAIN);
export const clearAgain = () => write(AGAIN, null);
