import { currentContent } from './recipe';
import type { Ingredient, Recipe, RecipeContent, Step } from './types';

/**
 * Varianten eines Rezepts (Julia: „mit Hähnchen“ oder „mit Tofu“): Das Rezept nennt seine Varianten (`choices`),
 * jede Zutat und jeder Schritt gehört zu einer davon oder – ohne `choice` – zu allen. Gekocht, geplant, eingekauft
 * und gerechnet wird immer nur die gewählte (`Recipe.choice`), sonst zählten Hähnchen UND Tofu.
 * Wie bei den Teilen (parts.ts): eine Markierung an Zutaten und Schritten, kein zweites Rezept.
 */

/** die Varianten in der Reihenfolge des Rezepts – [] = keine */
export const choicesOf = (c: Pick<RecipeContent, 'choices'>): string[] => c.choices?.filter((x) => x.trim()) ?? [];

/** die gewählte Variante – fehlt die Wahl oder gibt es die Variante nicht mehr: die erste */
export function activeChoice(r: Recipe): string | undefined {
  const list = choicesOf(currentContent(r));
  if (!list.length) return undefined;
  return r.choice && list.includes(r.choice) ? r.choice : list[0];
}

/** Gehört es zu dieser Variante? Ohne Variante oder mit einer, die es nicht mehr gibt: zu allen (nichts verschwindet) */
const inChoice = (x: Pick<Ingredient | Step, 'choice'>, choice: string, list: readonly string[]) =>
  !x.choice || x.choice === choice || !list.includes(x.choice);

/** Das Rezept in einer Variante: nur ihre Zutaten und Schritte und die für alle */
export function forChoice(c: RecipeContent, choice: string | undefined): RecipeContent {
  const list = choicesOf(c);
  if (!list.length || !choice) return c;
  return { ...c, ingredients: c.ingredients.filter((i) => inChoice(i, choice, list)), steps: c.steps.filter((s) => inChoice(s, choice, list)) };
}

/**
 * Immer dasselbe Objekt für dieselbe Fassung und Variante – die Nährwerte merken sich ihr Ergebnis je Objekt
 * (useNutrition), sonst rechnete jede Rezeptkarte bei jedem Zeichnen neu.
 */
const memo = new WeakMap<RecipeContent, Map<string, RecipeContent>>();

/** Das Rezept in der gewählten Variante – ohne Varianten genau die aktuelle Fassung */
export function chosenContent(r: Recipe): RecipeContent {
  const c = currentContent(r);
  const choice = activeChoice(r);
  if (!choice) return c;
  let byChoice = memo.get(c);
  if (!byChoice) memo.set(c, (byChoice = new Map()));
  let out = byChoice.get(choice);
  if (!out) byChoice.set(choice, (out = forChoice(c, choice)));
  return out;
}

// ── Formular ───────────────────────────────────────────────────────

/** Variante umbenennen – Zutaten und Schritte gehen mit */
export function renameChoice(c: RecipeContent, from: string, to: string): RecipeContent {
  const name = to.trim();
  if (!name || name === from || choicesOf(c).includes(name)) return c;
  const move = <T extends { choice?: string }>(x: T): T => (x.choice === from ? { ...x, choice: name } : x);
  return { ...c, choices: choicesOf(c).map((x) => (x === from ? name : x)), ingredients: c.ingredients.map(move), steps: c.steps.map(move) };
}

/** Was nur zu dieser Variante gehört – fürs Nachfragen vor dem Entfernen */
export function ownOf(c: RecipeContent, name: string): { ingredients: number; steps: number } {
  return { ingredients: c.ingredients.filter((i) => i.choice === name).length, steps: c.steps.filter((s) => s.choice === name).length };
}

/**
 * Variante entfernen – samt dem, was nur zu ihr gehört („Tofu“ weg = der Tofu auch). Bleibt nur eine Variante
 * übrig, ist es keine Wahl mehr: ihre Zutaten und Schritte gelten dann für alle.
 */
export function removeChoice(c: RecipeContent, name: string): RecipeContent {
  const rest = choicesOf(c).filter((x) => x !== name);
  const keep = rest.length > 1 ? rest : [];
  const clear = <T extends { choice?: string }>(x: T): T => {
    if (!x.choice || keep.includes(x.choice)) return x;
    const { choice: _, ...plain } = x;
    return plain as T;
  };
  const { choices: _c, ...base } = c;
  return {
    ...base, ...(keep.length ? { choices: keep } : {}),
    ingredients: c.ingredients.filter((i) => i.choice !== name).map(clear),
    steps: c.steps.filter((s) => s.choice !== name).map(clear),
  };
}
