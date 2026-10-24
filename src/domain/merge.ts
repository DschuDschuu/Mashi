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
    // gleiche Millisekunde (z. B. „Grundlage daraus machen“ direkt nach dem Anlegen): erst die Nummer, dann die
    // zufällige id – sonst konnte Version 2 vor Version 1 rutschen (fiel in der CI auf, Test week.store „Grundlage daraus machen“)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.number - y.number || x.id.localeCompare(y.id))
    // Nummern neu vergeben: Beide Geräte können offline eine „Version 3“ angelegt haben.
    .map((v, i) => ({ ...v, number: i + 1 }));

  const feedback = unionById([...older.feedback, ...newer.feedback])
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  const lastCookedAt = [a.lastCookedAt, b.lastCookedAt].filter(Boolean).sort().pop();
  // das Datum davor gehört zum gewählten „zuletzt gekocht“ – beide kommen vom selben Gerät
  const from = [newer, older].find((x) => x.lastCookedAt === lastCookedAt) ?? newer;
  const { previousCookedAt: _p, ...rest } = newer;

  return { ...rest, versions, feedback, lastCookedAt, ...(from.previousCookedAt ? { previousCookedAt: from.previousCookedAt } : {}) };
}

function unionById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it); // später Eingetragenes gewinnt (= newer)
  return [...map.values()];
}
