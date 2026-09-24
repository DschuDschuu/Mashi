import { formatQuantity } from './scaling';
import type { Ingredient, RecipeContent } from './types';

export type ContentChange =
  | { kind: 'ingredient-changed'; name: string; before: string; after: string }
  | { kind: 'ingredient-added'; name: string; after: string }
  | { kind: 'ingredient-removed'; name: string; before: string }
  | { kind: 'step-changed'; index: number }
  | { kind: 'step-added'; index: number }
  | { kind: 'step-removed'; index: number }
  | { kind: 'field-changed'; field: 'Titel' | 'Portionen' | 'Zubereitungszeit' | 'Kochzeit'; before: string; after: string };

const label = (i: Ingredient) => [formatQuantity(i), i.name].filter(Boolean).join(' ');

/**
 * Vergleicht zwei Rezeptinhalte und listet die Unterschiede in Alltagssprache.
 * Zutaten werden über ihre ID zugeordnet, damit „300 g → 350 g Hähnchenhack“
 * als Änderung erkannt wird und nicht als „gelöscht + neu“.
 */
export function diffContent(before: RecipeContent, after: RecipeContent): ContentChange[] {
  const changes: ContentChange[] = [];

  const field = (f: 'Titel' | 'Portionen' | 'Zubereitungszeit' | 'Kochzeit', a: string | number, b: string | number) => {
    if (a !== b) changes.push({ kind: 'field-changed', field: f, before: String(a), after: String(b) });
  };
  field('Titel', before.title, after.title);
  field('Portionen', before.servings, after.servings);
  field('Zubereitungszeit', before.prepMinutes, after.prepMinutes);
  field('Kochzeit', before.cookMinutes, after.cookMinutes);

  // Mengen auf dieselbe Portionszahl bringen, sonst wäre jede Portionsänderung eine Mengenänderung.
  const factor = after.servings / before.servings;
  const beforeById = new Map(before.ingredients.map((i) => [i.id, i]));
  const afterIds = new Set(after.ingredients.map((i) => i.id));

  for (const ing of after.ingredients) {
    const old = beforeById.get(ing.id);
    if (!old) {
      changes.push({ kind: 'ingredient-added', name: ing.name, after: label(ing) });
      continue;
    }
    const oldScaled = old.amount === undefined ? old : { ...old, amount: old.amount * factor };
    const a = label(oldScaled);
    const b = label(ing);
    if (a !== b) changes.push({ kind: 'ingredient-changed', name: ing.name, before: a, after: b });
  }
  for (const ing of before.ingredients) {
    if (!afterIds.has(ing.id)) changes.push({ kind: 'ingredient-removed', name: ing.name, before: label(ing) });
  }

  const n = Math.max(before.steps.length, after.steps.length);
  for (let i = 0; i < n; i++) {
    const a = before.steps[i];
    const b = after.steps[i];
    if (!a) changes.push({ kind: 'step-added', index: i });
    else if (!b) changes.push({ kind: 'step-removed', index: i });
    else if (a.text.trim() !== b.text.trim() || a.timerMinutes !== b.timerMinutes || !sameIds(a.ingredientIds, b.ingredientIds)) {
      changes.push({ kind: 'step-changed', index: i });
    }
  }

  return changes;
}

export function describeChange(c: ContentChange): string {
  switch (c.kind) {
    case 'ingredient-changed': return `${c.before} → ${c.after}`;
    case 'ingredient-added': return `Neu: ${c.after}`;
    case 'ingredient-removed': return `Entfernt: ${c.before}`;
    case 'step-changed': return `Schritt ${c.index + 1} angepasst`;
    case 'step-added': return `Schritt ${c.index + 1} hinzugefügt`;
    case 'step-removed': return `Schritt ${c.index + 1} entfernt`;
    case 'field-changed': return `${c.field}: ${c.before} → ${c.after}`;
  }
}

/** Gleiche Zutaten-Zuordnung? undefined (automatisch) ist etwas anderes als [] (keine). */
function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((id) => b.includes(id));
}
