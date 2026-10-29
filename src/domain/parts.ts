import { stepIngredients } from './stepIngredients';
import type { Ingredient, RecipeBlock, RecipeContent, Step } from './types';

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

/** vorübergehender Teil für „Grundlage daraus machen“ – kann kein echter Teilname sein */
const AS_BASE = '\u0000grundlage';

/**
 * Ganzes Rezept → Grundlage + Gericht (Julia: aus „Chili mit Reis“ wird die Grundlage „Chili“, das Gericht verweist
 * darauf): Alles außer dem, was jeden Abend frisch dazukommt (Reis), wandert in die Grundlage. Dafür werden diese Zutaten
 * kurz zu einem eigenen Teil und extractPart macht den Rest – Schritte nur mit Grundlagen-Zutaten wandern mit, gemischte
 * („Chili über den Reis“) bleiben als „Zum Schluss“ im Gericht.
 */
export function extractToBase(c: RecipeContent, baseIngredientIds: readonly string[], base: { id: string; title: string }, newId: () => string): { base: RecipeContent; dish: RecipeContent } {
  const marked = { ...c, ingredients: c.ingredients.map((i) => (baseIngredientIds.includes(i.id) ? { ...i, part: AS_BASE } : i)) };
  return extractPart(marked, AS_BASE, base, newId);
}

/**
 * Teil als Grundlage herauslösen (Julia: „aus meinen Rezepten Grundlagen exportieren“ – die Sauce der Lasagne wird
 * zur eigenen Grundlage): Ihre Zutaten und Schritte wandern in ein neues Rezept; im Gericht steht stattdessen eine
 * verknüpfte Zutat („Sauce aus Lasagne“, so viele Portionen wie das Gericht) – wie „Zutat selbst machen“, nur dass die
 * Grundlage jetzt eigenständig vorgekocht und verwandelt werden kann. Nichts steht doppelt.
 */
export function extractPart(c: RecipeContent, part: string, base: { id: string; title: string }, newId: () => string): { base: RecipeContent; dish: RecipeContent } {
  const strip = <T extends { part?: string }>(x: T): T => { const { part: _p, ...rest } = x; return rest as T; };
  const ingredients = c.ingredients.filter((i) => partOf(i) === part).map(strip);
  const steps = c.steps.filter((s) => stepPart(s, c) === part).map(strip);
  const link: Ingredient = { id: newId(), name: base.title, amount: c.servings, unit: 'Portion', recipeId: base.id };
  // im Gericht: Grundlage-Zutat vorne, die übrigen Teile bleiben; Schritte des Teils fallen weg
  const rest = c.ingredients.filter((i) => partOf(i) !== part);
  const restSteps = c.steps.filter((s) => stepPart(s, c) !== part);
  return {
    base: { ...c, title: base.title, description: '', ingredients, steps: steps.length ? steps : [{ id: newId(), text: '' }], choices: undefined },
    dish: { ...c, ingredients: [link, ...rest], steps: restSteps },
  };
}

/**
 * Baustein-Markierungen (Recipe.blocks) folgen einem umbenannten Teil (Julia: „Salsa“ heißt jetzt „Tomatensalsa“):
 * Woran man den Teil wiedererkennt, sind seine Zutaten – die behalten ihre id über Versionen. Wohin die meisten
 * gewandert sind, dorthin zieht die Markierung. Gibt es den Teil gar nicht mehr, fällt sie weg.
 */
export function followBlockParts(blocks: readonly RecipeBlock[] | undefined, before: Pick<RecipeContent, 'ingredients'>, after: Pick<RecipeContent, 'ingredients'>): RecipeBlock[] | undefined {
  if (!blocks?.length) return undefined;
  const now = new Set(partsOf(after));
  const partNow = new Map(after.ingredients.map((i) => [i.id, partOf(i)]));
  const out = blocks.flatMap((b): RecipeBlock[] => {
    if (!b.part || now.has(b.part)) return [b];
    const moved = new Map<string, number>();
    for (const i of before.ingredients) {
      const p = partOf(i) === b.part ? partNow.get(i.id) : undefined;
      if (p && p !== REST) moved.set(p, (moved.get(p) ?? 0) + 1);
    }
    const target = [...moved].sort((x, y) => y[1] - x[1])[0]?.[0];
    return target ? [{ ...b, part: target }] : [];
  });
  // zwei Teile zu einem zusammengelegt → nur eine Markierung behalten
  const unique = out.filter((b, i) => out.findIndex((o) => o.part === b.part) === i);
  return unique.length ? unique : undefined;
}

/**
 * Vorauswahl für „Was kochst du heute?“ (Julia: mehrere Teile wählbar, nicht nur „Nur Sauce kochen“):
 * Abend aus dem Wochenplan → alles Offene (du isst gleich). Sonst wie letztes Mal, soweit davon noch etwas offen ist.
 * Ohne gemerkte Wahl: beim Vorkochen alles, was sich hält (ohne „Frisch“ – das kochst du am Abend), sonst alles Offene.
 */
export function preselectParts(open: string[], how: { prep?: boolean; meal?: boolean; last?: readonly string[] }): { parts: string[]; fromLast: boolean } {
  if (how.meal) return { parts: open, fromLast: false };
  const last = open.filter((p) => how.last?.includes(p));
  if (last.length) return { parts: last, fromLast: true };
  const keeps = open.filter((p) => p !== REST);
  return { parts: how.prep && keeps.length ? keeps : open, fromLast: false };
}
