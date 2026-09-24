import { currentContent } from './recipe';
import type { Recipe } from './types';

/** Kleinschreibung + Umlaute unverändert: „Hähnchen“ findet „hähnchen“, „HÄHN“. */
const fold = (s: string) => s.toLocaleLowerCase('de-DE').trim();

export interface SearchHit {
  recipe: Recipe;
  /** Wo im Titel der Treffer liegt – zum Hervorheben. Fehlt bei reinem Zutatentreffer. */
  titleMatch?: { start: number; end: number };
  /** Zutat, über die das Rezept gefunden wurde („enthält: Hähnchenbrust“) */
  ingredient?: string;
}

/**
 * Suche beim Tippen (Autocomplete). Reihenfolge:
 * Titel beginnt damit → ein Wort im Titel beginnt damit → Titel enthält es → eine Zutat passt.
 * Innerhalb gleicher Güte alphabetisch, damit die Liste beim Weitertippen nicht springt.
 */
export function searchRecipes(recipes: Recipe[], query: string): SearchHit[] {
  const q = fold(query);
  if (!q) return [];
  const ranked: { hit: SearchHit; rank: number; title: string }[] = [];
  for (const recipe of recipes) {
    const c = currentContent(recipe);
    const title = fold(c.title);
    const at = title.indexOf(q);
    let rank = -1;
    if (at === 0) rank = 0;
    else if (at > 0) rank = /[\s\-–(]/.test(title[at - 1]) ? 1 : 2;
    if (rank >= 0) {
      ranked.push({ hit: { recipe, titleMatch: { start: at, end: at + q.length } }, rank, title });
      continue;
    }
    const ing = c.ingredients.find((i) => fold(i.name).includes(q));
    if (ing) ranked.push({ hit: { recipe, ingredient: ing.name }, rank: 3, title });
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'de')).map((r) => r.hit);
}

/**
 * Zutaten-Vorschläge zum Suchbegriff: „häh“ → „Hähnchenbrust · 3 Rezepte“.
 * Gleiche Zutat in verschiedenen Schreibweisen zählt einmal (ohne Klammer-Zusatz).
 */
export function ingredientCompletions(recipes: Recipe[], query: string, limit = 4): { name: string; count: number }[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const byName = new Map<string, { name: string; ids: Set<string> }>();
  for (const r of recipes) {
    for (const i of currentContent(r).ingredients) {
      const clean = i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      const key = fold(clean);
      if (!key.split(/\s+/).some((w) => w.startsWith(q)) && !key.startsWith(q)) continue;
      const entry = byName.get(key) ?? { name: clean, ids: new Set<string>() };
      entry.ids.add(r.id);
      byName.set(key, entry);
    }
  }
  return [...byName.values()]
    .map((e) => ({ name: e.name, count: e.ids.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'))
    .slice(0, limit);
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * „Lange nicht gekocht“: Bewährtes und Kochbuch-Rezepte, die du seit mindestens
 * `days` Tagen nicht gemacht hast – am längsten her zuerst. Nie gekochte kommen danach.
 */
export function longNotCooked(recipes: Recipe[], now = new Date(), days = 14): Recipe[] {
  const limit = now.getTime() - days * DAY;
  const proven = recipes.filter((r) => r.status === 'kochbuch' || r.status === 'bewaehrt');
  const cooked = proven
    .filter((r) => r.lastCookedAt && new Date(r.lastCookedAt).getTime() <= limit)
    .sort((a, b) => a.lastCookedAt!.localeCompare(b.lastCookedAt!));
  const never = proven.filter((r) => !r.lastCookedAt);
  return [...cooked, ...never];
}
