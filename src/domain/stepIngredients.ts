import type { Ingredient, Step } from './types';

/**
 * Wörter, die in Zutatennamen stehen, aber keine Zutat bezeichnen – sonst würde
 * „rote Linsen“ bei jeder „roten Zwiebel“ auftauchen.
 */
const IGNORED = new Set([
  'und', 'oder', 'mit', 'ohne', 'vom', 'von', 'der', 'die', 'das', 'aus', 'nach', 'bei', 'für',
  'rot', 'rote', 'roter', 'rotes', 'gelb', 'gelbe', 'grün', 'grüne', 'bunt', 'bunte',
  'klein', 'kleine', 'groß', 'große', 'frisch', 'frische', 'frischer', 'optional',
  'gehackte', 'gehackter', 'gemahlen', 'gemahlener', 'geräuchertes', 'griechischer', 'zarte',
  'vortag', 'geschmack', 'etwas', 'stück',
]);

/** Häufige Wörter im Schritttext, die sonst als „Ei“ + Endung durchgingen. */
const NEVER_MATCH_IN_TEXT = new Set(['ein', 'eine', 'einen', 'einem', 'einer', 'eines']);

/** Erlaubte Endungen nach dem Wortstamm: Plural und Beugung – aber kein weiteres Wort. */
const ENDINGS = new Set(['', 'n', 'en', 'e', 'es', 's', 'er', 'ern', 'r']);

const words = (s: string) => s.toLocaleLowerCase('de-DE').split(/[^\p{L}]+/u).filter(Boolean);

/** Plural-Endung abschneiden, aber nur bei längeren Wörtern: „Frühlingszwiebeln“ → „frühlingszwiebel“, „Reis“ bleibt. */
const stem = (w: string) => (w.length >= 6 ? w.replace(/(en|n|e|s)$/u, '') : w);

/** Die Kennwörter einer Zutat: „Paprika (rot oder bunt)“ → [„paprika“], „Reis vom Vortag“ → [„reis“]. */
function keywords(ingredientName: string): string[] {
  const withoutBrackets = ingredientName.replace(/\(.*?\)/g, ' ');
  return words(withoutBrackets).filter((w) => w.length >= 2 && !IGNORED.has(w));
}

/**
 * Taucht eine Zutat im Schritttext auf? Ein Textwort muss aus Stamm + höchstens einer Endung bestehen:
 * „Frühlingszwiebeln“ passt zu „Frühlingszwiebel“ – aber „Reisessig“ nicht zu „Reis“
 * und „Sesamöl“ nicht zu „Sesam“.
 */
function mentions(textWords: string[], ingredientName: string): boolean {
  return keywords(ingredientName).some((k) => {
    const s = stem(k);
    return textWords.some((t) => !NEVER_MATCH_IN_TEXT.has(t) && t.startsWith(s) && ENDINGS.has(t.slice(s.length)));
  });
}

/** Automatisch erkannte Zutaten eines Schritts (in der Reihenfolge der Zutatenliste). */
export function detectStepIngredients(step: Step, ingredients: Ingredient[]): Ingredient[] {
  const textWords = words(step.text);
  return ingredients.filter((i) => mentions(textWords, i.name));
}

/** Die Zutaten, die über einem Schritt angezeigt werden: feste Zuordnung, sonst automatisch. */
export function stepIngredients(step: Step, ingredients: Ingredient[]): Ingredient[] {
  if (step.ingredientIds === undefined) return detectStepIngredients(step, ingredients);
  const chosen = new Set(step.ingredientIds);
  // Reihenfolge wie in der Zutatenliste; gelöschte Zutaten fallen still heraus.
  return ingredients.filter((i) => chosen.has(i.id));
}
