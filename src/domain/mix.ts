import { newId } from './recipe';
import type { Recipe, RecipeContent, Unit } from './types';

/**
 * Mix & Match gibt es nicht mehr (Julia: „kann eigentlich wieder raus“ – die Vorkoch-Woche macht es besser).
 * Alte Bausteine tragen noch `mix`/`goesWith`; retireMix räumt sie einmal auf.
 */

/** Vorbelegung für eine Beilage (Julia: „so 100 g pro Person passt“) */
export const SIDE_DEFAULT_GRAMS = 100;

/**
 * Eine Beilage wie Pasta, Reis oder Gnocchi als Mini-Rezept (1 Portion, 1 Zutat) – läuft durch Plan, Einkauf und
 * Nährwerte wie alles andere. Der Zutatenname ist der Name der Beilage, damit die Speisekammer sie findet.
 */
export function sideContent(name: string, amount = SIDE_DEFAULT_GRAMS, unit: Unit = 'g'): RecipeContent {
  const title = name.trim();
  return {
    title,
    description: '',
    servings: 1,
    prepMinutes: 0,
    cookMinutes: 0,
    difficulty: 1,
    ingredients: [{ id: newId('i'), name: title, amount, unit }],
    steps: [{ id: newId('s'), text: 'Nach Packungsangabe garen.' }],
    categories: ['beilage'],
    tags: [],
    devices: ['herd'],
  };
}

/**
 * Alter Mix-Baustein → wohin jetzt? (Julia: „Saucen ins Kochbuch, Beilagen weg“): Saucen werden normale Rezepte
 * (taugen so als Grundlage für die Woche), Mini-Beilagen kommen ins Archiv – dort wiederherstellbar, nichts geht
 * verloren. undefined = nichts zu tun.
 */
export function retireMix(r: Recipe, now: string): Recipe | undefined {
  if (r.mix === undefined && r.goesWith === undefined) return undefined;
  const { mix, goesWith: _g, ...rest } = r;
  const archive = mix !== undefined && mix !== 'sosse' && !r.archivedAt;
  return { ...rest, updatedAt: now, ...(archive ? { archivedAt: now } : {}) };
}
