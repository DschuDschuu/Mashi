/**
 * „Wie letztes Mal“ im Kochmodus (Julia): welche Rezept-Teile du zuletzt gekocht hast – je Rezept, getrennt für
 * Vorkochen und normales Kochen (sonst käme die Sonntags-Auswahl am Mittwochabend wieder). Nur auf diesem Gerät,
 * wie eine Notiz: kein Abgleich, kein Rückgängig nötig.
 */
const KEY = 'mashi-cook-parts-v1';

export type CookHow = 'vorkochen' | 'normal';
type Memory = Record<string, Partial<Record<CookHow, string[]>>>;

function load(): Memory {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Memory) : {};
  } catch {
    return {}; // privater Modus oder kaputter Eintrag: dann eben ohne Erinnerung
  }
}

export function lastParts(recipeId: string, how: CookHow): string[] | undefined {
  const v = load()[recipeId]?.[how];
  // nur, was wie eine Teile-Liste aussieht – alte oder kaputte Einträge zählen nicht
  return Array.isArray(v) && v.every((p) => typeof p === 'string') ? v : undefined;
}

export function rememberParts(recipeId: string, how: CookHow, parts: string[]) {
  try {
    const m = load();
    m[recipeId] = { ...m[recipeId], [how]: parts };
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // s. o.
  }
}
