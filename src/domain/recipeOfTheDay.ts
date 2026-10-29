import { localDay as dayKey } from './dates';
import type { Recipe } from './types';

/** Einfacher, stabiler Zahlen-Fingerabdruck eines Textes (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * „Rezept des Tages“ aus Kochbuch und Bewährtem – zufällig, aber den ganzen Tag gleich
 * (auf allen Geräten, bei jedem Öffnen). Nie zweimal hintereinander dasselbe.
 * @param prefer Rezepte, die Verderbliches aufbrauchen – gibt es welche, wird unter ihnen gewählt
 * @param boost Rezepte, die öfter drankommen sollen (Halloween: Kürbis & Co.) – dreifaches Los statt nur
 *   noch sie, damit es mit nur einer Kürbissuppe nicht jeden zweiten Tag dieselbe ist (Julia)
 */
export function recipeOfTheDay(recipes: Recipe[], now = new Date(), prefer: ReadonlySet<string> = new Set(), boost: ReadonlySet<string> = new Set()): Recipe | undefined {
  const all = recipes.filter((r) => !r.archivedAt && !r.fromBase && !r.trial && (r.status === 'kochbuch' || r.status === 'bewaehrt'));
  const preferred = all.filter((r) => prefer.has(r.id));
  const sorted = (preferred.length ? preferred : all)
    .sort((a, b) => a.id.localeCompare(b.id)); // feste Reihenfolge, egal wie die Liste gerade sortiert ist
  if (!sorted.length) return undefined;
  const pool = sorted.flatMap((r) => (boost.has(r.id) ? [r, r, r] : [r]));

  // Als Kette ab einem festen Tag: jeder Tag kennt das TATSÄCHLICHE Rezept von gestern. Nur das gestrige Los zu
  // vergleichen reichte nicht – war gestern selbst weitergerückt, konnte heute genau das wieder drankommen.
  // „Nicht dasselbe“ heißt dasselbe Rezept, nicht dasselbe Los (ein Rezept kann mehrere Lose haben).
  let before: string | undefined;
  let pickToday = pool[0];
  for (let d = new Date(CHAIN_START); d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    let i = hash(dayKey(d)) % pool.length;
    for (let n = 0; sorted.length > 1 && pool[i].id === before && n < pool.length; n++) i = (i + 1) % pool.length;
    pickToday = pool[i];
    before = pickToday.id;
  }
  return pickToday;
}

/** Beginn der Kette – fest, damit gestern und heute aus derselben Rechnung kommen (ein paar hundert Schritte, kostet nichts) */
const CHAIN_START = new Date(2026, 0, 1);
