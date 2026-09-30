/**
 * Vorlieben für die KI aus deinen Rezepten – ohne KI, direkt auf dem Gerät (Julia: „Mashi fasst selbst
 * zusammen“, nichts verlässt das Gerät). Nimmt Favoriten und gut Bewertetes, dazu, welche Stichworte,
 * Kategorien und Geräte darin oft vorkommen. Notizen („zu scharf“) versteht es nicht – die schreibt
 * man selbst dazu. Das Ergebnis ist ein Vorschlag im Textfeld, frei änderbar.
 */
import { CATEGORIES, DEVICES } from './catalog';
import { currentContent } from './recipe';
import type { Recipe } from './types';

/** gut bewertet = die letzte Bewertung hat mindestens 4 Sterne */
const liked = (r: Recipe) => {
  const last = [...r.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return !!last && last.rating >= 4;
};

/** die häufigsten Einträge, mindestens zweimal (sonst sagt es nichts über dich) */
function top(xs: string[], n: number): string[] {
  const count = new Map<string, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, n).map(([x]) => x);
}

export function summarizeTastes(recipes: readonly Recipe[]): string {
  const live = recipes.filter((r) => !r.archivedAt && r.status !== 'ki_entwurf');
  const fav = live.filter((r) => r.favorite);
  const good = live.filter((r) => !r.favorite && liked(r));
  const basis = [...fav, ...good];
  if (!basis.length) return '';
  const title = (r: Recipe) => currentContent(r).title;
  const lines: string[] = [];
  if (fav.length) lines.push(`Lieblingsgerichte: ${fav.slice(0, 8).map(title).join(', ')}`);
  if (good.length) lines.push(`Gut bewertet: ${good.slice(0, 8).map(title).join(', ')}`);
  const contents = basis.map(currentContent);
  const tags = top(contents.flatMap((c) => c.tags), 5);
  if (tags.length) lines.push(`Mag gern: ${tags.join(', ')}`);
  const label = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
  const cats = top(contents.flatMap((c) => c.categories), 3).map((id) => label(CATEGORIES, id));
  if (cats.length) lines.push(`Kocht oft: ${cats.join(', ')}`);
  const devs = top(contents.flatMap((c) => c.devices), 2).map((id) => label(DEVICES, id));
  if (devs.length) lines.push(`Nutzt gern: ${devs.join(', ')}`);
  return lines.join('\n');
}
