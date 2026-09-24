import type { Recipe } from './types';

/**
 * Führt zwei Fassungen DESSELBEN Rezepts zusammen – z. B. wenn es auf Handy
 * und PC offline geändert wurde und die Datenbank beim Abgleich einen Konflikt meldet.
 *
 * Regeln:
 * - Nichts geht verloren: Versionen und Testbewertungen beider Seiten werden vereinigt
 *   (sie haben eindeutige IDs und werden nie verändert – also ist das gefahrlos).
 * - Einfache Felder (Status, Favorit, Notizen, Bild …) nimmt man von der Fassung,
 *   die zuletzt geändert wurde (updatedAt).
 * - Aktuelle Version = die der jüngeren Fassung.
 */
export function mergeRecipes(a: Recipe, b: Recipe): Recipe {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];

  const versions = unionById([...older.versions, ...newer.versions])
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))
    // Nummern neu vergeben: Beide Geräte können offline eine „Version 3“ angelegt haben.
    .map((v, i) => ({ ...v, number: i + 1 }));

  const feedback = unionById([...older.feedback, ...newer.feedback])
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  const lastCookedAt = [a.lastCookedAt, b.lastCookedAt].filter(Boolean).sort().pop();

  return { ...newer, versions, feedback, lastCookedAt };
}

function unionById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it); // später Eingetragenes gewinnt (= newer)
  return [...map.values()];
}
