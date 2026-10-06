import { stepIngredients } from './stepIngredients';
import type { Ingredient, RecipeContent, Step } from './types';

/**
 * Rezept-Teile (Julia: „Sauce gestern gekocht, Nudeln und Fleisch mache ich heute frisch“): Zutaten und Schritte
 * gehören zu einem Teil („Sauce“, „Salat“). Im Kochmodus wählst du, welche Teile du heute kochst – Zutaten,
 * Schritte und das Abziehen aus dem Vorrat richten sich danach; ein fertiger Teil steht als Vorgekocht in der
 * Speisekammer („Sauce für Lasagne“), bis der Rest gekocht ist.
 */

/** „Frisch“: Zutaten ohne eigenen Teil (Nudeln, Fleisch …) – das, was frisch gekocht wird, während die Sauce schon in der Speisekammer steht (Julia). Auf der Rezeptseite ohne Überschrift ganz oben */
export const REST = '-';
/** Schritt, der Teile zusammenbringt („Sauce über die Nudeln“) – kommt dran, wenn das Gericht damit fertig wird */
export const FINISH = '*';

export const partOf = (i: Pick<Ingredient, 'part'>): string => i.part?.trim() || REST;
export const partLabel = (p: string): string => (p === REST ? 'Frisch' : p === FINISH ? 'Zum Schluss' : p);

/** Die Teile eines Rezepts: „Frisch“ zuerst (Julia: „Alles andere“ klang abwertend), dann die Teile in der Reihenfolge der Zutatenliste – ohne eigene Teile: [] */
export function partsOf(c: Pick<RecipeContent, 'ingredients'>): string[] {
  const parts = [...new Set(c.ingredients.map(partOf))];
  if (!parts.some((p) => p !== REST)) return [];
  return [...(parts.includes(REST) ? [REST] : []), ...parts.filter((p) => p !== REST)];
}

/**
 * Zu welchem Teil ein Schritt gehört: selbst gewählt – sonst Mashis Vorschlag aus seinen Zutaten (nur Sauce-Zutaten →
 * Sauce). Mischt er Teile, oder hat er keine Zutaten und es gibt keine frischen Zutaten: „Zum Schluss“.
 */
export function stepPart(step: Step, c: Pick<RecipeContent, 'ingredients'>): string {
  const parts = partsOf(c);
  if (step.part && (step.part === FINISH || parts.includes(step.part))) return step.part;
  return suggestedPart(step, c);
}

/** Mashis Vorschlag für einen Schritt (ohne eigene Wahl) – für den Editor („automatisch: Sauce“) */
export function suggestedPart(step: Step, c: Pick<RecipeContent, 'ingredients'>): string {
  const used = new Set(stepIngredients(step, c.ingredients).map(partOf));
  if (used.size === 1) return [...used][0];
  if (!used.size && partsOf(c).includes(REST)) return REST;
  return FINISH;
}

/**
 * Nur diese Teile kochen: ihre Zutaten und Schritte. „Zum Schluss“ kommt dazu, wenn das Gericht damit fertig wird
 * (alle übrigen Teile sind schon fertig). Ohne Teile: das ganze Rezept.
 * @param done Teile, die schon fertig sind (Vorgekocht in der Speisekammer)
 */
export function forParts<C extends RecipeContent>(c: C, chosen: readonly string[], done: readonly string[] = []): C {
  const all = partsOf(c);
  if (!all.length) return c;
  const pick = new Set(chosen);
  const completes = all.every((p) => pick.has(p) || done.includes(p));
  return {
    ...c,
    ingredients: c.ingredients.filter((i) => pick.has(partOf(i))),
    steps: c.steps.filter((s) => { const p = stepPart(s, c); return p === FINISH ? completes : pick.has(p); }),
  };
}

/** Was noch zu kochen ist, wenn diese Teile schon fertig sind – für Einkaufsliste, Reservierung und den Rest */
export function remainingContent<C extends RecipeContent>(c: C, done: readonly string[]): C {
  const all = partsOf(c);
  if (!done.length || !all.length) return c;
  return forParts(c, all.filter((p) => !done.includes(p)), done);
}

/** Schon fertige Teile eines Gerichts: Vorgekochtes mit Teil in der Speisekammer (eingefroren zählt mit) */
export function doneParts(items: readonly { recipeId?: string; part?: string; amount?: number }[], recipeId: string): string[] {
  return [...new Set(items.filter((i) => i.recipeId === recipeId && i.part && (i.amount === undefined || i.amount > 0)).map((i) => i.part!))];
}
