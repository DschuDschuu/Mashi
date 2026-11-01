import { activeChoice, forChoice } from './choices';
import { partOf, partsOf, REST, stepPart } from './parts';
import { currentContent } from './recipe';
import { scaleIngredients } from './scaling';
import { foodOf, sideGrams, sideOf } from './sides';
import { stepIngredients } from './stepIngredients';
import { withSwaps } from './swaps';
import type { Ingredient, Recipe, RecipeContent, Step } from './types';

/**
 * Einen ganzen Teil tauschen (Julia: „Sauce als Teil tauschen“ – die Erdnuss-Sauce der Bowl gegen deine Teriyaki-Sauce,
 * samt ihrer Schritte). Entweder dein Rezept (ganz oder ein Teil davon, `recipeId`/`part`) oder Mashis Sauce-Baustein
 * (`side`). Verknüpft (Julia: „immer aktuell“): Zutaten und Schritte kommen bei jedem Anzeigen frisch aus der Quelle.
 */
export interface PartSwap {
  recipeId?: string;
  /** nur dieser Teil des Rezepts („Teriyaki-Sauce“ aus der Teriyaki-Bowl) – fehlt: das ganze Rezept */
  part?: string;
  /** Mashis Baustein („pesto“) statt eines deiner Rezepte */
  side?: string;
  /**
   * beim Baustein: deine Menge pro Portion und was du kaufst („Guacamole fertig“), gemerkt beim Tauschen – wie beim
   * Zutaten-Tausch (Rundgang: sonst galten Mashis Standards statt deiner Einstellungen)
   */
  grams?: number;
  food?: string;
  /** so heißt der Teil danach – Überschrift, und so nennen ihn die übrigen Schritte */
  name: string;
}

/** vor jeder id – damit getauschte Zutaten und Schritte nicht mit denen des Rezepts zusammenfallen */
const PRE = 'tausch:';

/** Zutaten und Schritte des neuen Teils, auf die Portionen des Rezepts umgerechnet – undefined: Quelle weg, Original bleibt */
function replacement(swap: PartSwap, servings: number, recipes: readonly Recipe[]): { ingredients: Ingredient[]; steps: Step[] } | undefined {
  if (swap.side) {
    const side = sideOf(swap.side);
    if (!side) return undefined;
    const i: Ingredient = { id: `${PRE}${swap.side}`, name: swap.food ?? foodOf(side), amount: (swap.grams ?? sideGrams(swap.side)) * servings, unit: side.unit ?? 'g', part: swap.name };
    const prep = side.prep;
    return {
      ingredients: [i],
      steps: prep?.text ? [{ id: `${PRE}${swap.side}:s`, text: `${side.name}: ${prep.text}`, part: swap.name, ingredientIds: [i.id], ...(prep.minutes ? { timerMinutes: prep.minutes } : {}) }] : [],
    };
  }
  const src = recipes.find((r) => r.id === swap.recipeId);
  if (!src) return undefined;
  // so, wie du die Sauce kochst: die gewählte Variante und ihr Zutaten-Tausch (Rundgang: sonst Parmesan UND Hefeflocken)
  const c = withSwaps(forChoice(currentContent(src), activeChoice(src)), src.swaps);
  if (swap.part && !partsOf(c).includes(swap.part)) return undefined;
  const pre = `${PRE}${src.id}:`;
  const mine = scaleIngredients({ ...c, ingredients: c.ingredients.filter((i) => !swap.part || partOf(i) === swap.part) }, servings);
  const ids = new Set(mine.map((i) => i.id));
  const steps = c.steps.filter((st) => st.text.trim() && (!swap.part || stepPart(st, c) === swap.part));
  return {
    ingredients: mine.map((i) => ({ ...i, id: pre + i.id, part: swap.name })),
    steps: steps.map((st) => ({
      ...st, id: pre + st.id, part: swap.name,
      ...(st.ingredientIds ? { ingredientIds: st.ingredientIds.filter((x) => ids.has(x)).map((x) => pre + x) } : {}),
    })),
  };
}

/** „Erdnuss-Sauce“ als ganzes Wort – nicht mitten in „Sojasauce“, auch nicht als Ende von „Erdnuss-Sauce“, wenn der Teil „Sauce“ heißt */
const wordOf = (name: string) => new RegExp(`(?<![\\p{L}\\-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\-])`, 'gu');

/**
 * Getauschte Teile einsetzen: Zutaten und Schritte des alten Teils fallen weg, an ihrer Stelle stehen die des neuen
 * (umgerechnet auf die Portionen). Übrige Schritte, die den alten Teil nennen („mit der Erdnuss-Sauce beträufeln“),
 * nennen den neuen. Gibt es den Teil nicht mehr oder die Quelle nicht (gelöscht): wie im Original.
 */
export function withPartSwaps(c: RecipeContent, swaps: Readonly<Record<string, PartSwap>> | undefined, recipes: readonly Recipe[]): RecipeContent {
  let out = c;
  for (const [part, swap] of Object.entries(swaps ?? {})) {
    if (part === REST || !partsOf(out).includes(part)) continue;
    const rep = replacement(swap, out.servings, recipes);
    if (!rep) continue;
    const gone = new Set(out.ingredients.filter((i) => partOf(i) === part).map((i) => i.id));
    const at = out.ingredients.findIndex((i) => gone.has(i.id));
    const ingredients = [...out.ingredients.slice(0, at), ...rep.ingredients, ...out.ingredients.slice(at).filter((i) => !gone.has(i.id))];
    const before = out;
    const isGone = (st: Step) => stepPart(st, before) === part;
    const word = wordOf(part);
    // die übrigen Schritte behalten, wozu sie gehörten und welche Zutaten sie nannten – mit dem neuen Teil (und z. B.
    // einer zweiten Sojasauce darin) rät Mashi sonst neu (Rundgang: „Zum Schluss“ rutschte nach „Frisch“); wie beim
    // Beilagensalat (sideSalad.ts)
    const kept = (st: Step): Step => ({
      ...st, text: st.text.replace(word, swap.name), part: stepPart(st, before),
      ingredientIds: stepIngredients(st, before.ingredients).map((i) => i.id).filter((x) => !gone.has(x)),
    });
    const sAt = out.steps.findIndex(isGone);
    const steps = sAt < 0
      ? [...out.steps.map(kept), ...rep.steps]
      : [...out.steps.slice(0, sAt).map(kept), ...rep.steps, ...out.steps.slice(sAt).filter((st) => !isGone(st)).map(kept)];
    out = { ...out, ingredients, steps };
  }
  return out;
}
