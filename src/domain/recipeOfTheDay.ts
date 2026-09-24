import type { Recipe } from './types';

/** „2026-09-24“ in Ortszeit – der Tag wechselt um Mitternacht bei dir, nicht in London. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Einfacher, stabiler Zahlen-Fingerabdruck eines Textes (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * „Rezept des Tages“ aus Kochbuch und Bewährtem – zufällig, aber den ganzen Tag gleich
 * (auf allen Geräten, bei jedem Öffnen). Nie zweimal hintereinander dasselbe.
 */
export function recipeOfTheDay(recipes: Recipe[], now = new Date()): Recipe | undefined {
  const pool = recipes
    .filter((r) => !r.archivedAt && (r.status === 'kochbuch' || r.status === 'bewaehrt'))
    .sort((a, b) => a.id.localeCompare(b.id)); // feste Reihenfolge, egal wie die Liste gerade sortiert ist
  if (!pool.length) return undefined;

  const pick = (d: Date) => hash(dayKey(d)) % pool.length;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let i = pick(now);
  if (pool.length > 1 && i === pick(yesterday)) i = (i + 1) % pool.length;
  return pool[i];
}
