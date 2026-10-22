import { currentContent, newId } from './recipe';
import { scaleIngredients } from './scaling';
import type { MealPlan } from './mealplan';
import type { Recipe, RecipeContent, Unit } from './types';

/**
 * Mix & Match (Julia): Soßen und Beilagen liegen als eigene Bausteine bereit und lassen sich frei kombinieren.
 * Bausteine sind ganz normale Rezepte mit gesetztem `mix` – so rechnen Einkaufsliste, Vorrat, Nährwerte und
 * Preise ohne Sonderweg mit. Sie stehen nur in Mix & Match, nicht im Kochbuch.
 */
export interface MixRole {
  id: string;
  label: string;
  plural: string;
}

/** Reihenfolge = Reihenfolge im Mix-&-Match-Bildschirm. Ein weiterer Teil (Gemüse, Topping …) = ein Eintrag hier. */
export const MIX_ROLES: MixRole[] = [
  { id: 'sosse', label: 'Soße', plural: 'Soßen' },
  { id: 'beilage', label: 'Beilage', plural: 'Beilagen' },
];

export const mixRole = (id: string): MixRole => MIX_ROLES.find((r) => r.id === id) ?? { id, label: id, plural: id };

/** Baustein für Mix & Match? Dann gehört er in keine normale Rezeptliste. */
export const isMixPart = (r: Pick<Recipe, 'mix'>): boolean => !!r.mix;

/** Passen zwei Bausteine laut „passt gut zu“ zusammen? Egal, an welchem der beiden es gesetzt ist. */
export function goesTogether(a: Pick<Recipe, 'id' | 'goesWith'>, b: Pick<Recipe, 'id' | 'goesWith'>): boolean {
  return !!a.goesWith?.includes(b.id) || !!b.goesWith?.includes(a.id);
}

/**
 * Bausteine einer Rolle zum Auswählen: archivierte nicht; Favoriten zuerst, dann nach Name.
 * Bewusst unabhängig von der Auswahl auf der anderen Seite – sonst springt die Liste bei jedem Wechsel
 * (Julia: „das ist weird“). Was passt, zeigt der Stern.
 */
export function mixChoices(recipes: readonly Recipe[], role: string): Recipe[] {
  return recipes
    .filter((r) => r.mix === role && !r.archivedAt)
    .map((r) => ({ r, title: currentContent(r).title }))
    .sort((a, b) => Number(b.r.favorite) - Number(a.r.favorite) || a.title.localeCompare(b.title, 'de'))
    .map((x) => x.r);
}

/**
 * „Passt gut zu“ an- oder abschalten. Danach passt es in KEINE Richtung mehr bzw. steht genau an einer Seite –
 * darum geben wir beide Listen zurück (sonst bliebe ein alter Eintrag an der anderen Seite stehen).
 */
export function toggleGoesWith(a: Recipe, b: Recipe): { a: string[]; b: string[] } {
  const without = (list: string[] | undefined, id: string) => (list ?? []).filter((x) => x !== id);
  if (goesTogether(a, b)) return { a: without(a.goesWith, b.id), b: without(b.goesWith, a.id) };
  return { a: [...(a.goesWith ?? []), b.id], b: b.goesWith ?? [] };
}

/** Vorbelegung für eine Beilage (Julia: „so 100 g pro Person passt“) */
export const SIDE_DEFAULT_GRAMS = 100;

/**
 * Eine Beilage wie Pasta, Reis oder Gnocchi ist kein richtiges Rezept, sondern eine Zutat mit Menge pro Portion.
 * Als Mini-Rezept (1 Portion, 1 Zutat) läuft sie trotzdem durch Plan, Einkauf und Nährwerte wie alles andere.
 * Der Zutatenname ist der Name der Beilage – so findet die Speisekammer „Pasta“ beim gleichen Lebensmittel.
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

export interface ComboResult {
  plan: MealPlan;
  /** neu im Plan */
  added: string[];
  /** stand schon im Plan – Portionen dazugezählt (Julia: Soße einmal kochen, zweimal essen) */
  more: string[];
  /** stand schon gekocht im Plan – bleibt, wie es ist (erst „Gekochtes aufräumen“) */
  cooked: string[];
}

/**
 * Eine Kombination in den Wochenplan: Jeder Baustein steht dort höchstens einmal (der Plan kennt jedes
 * Rezept nur einmal). Steht er schon drin, kommen die Portionen dazu – „nur dieses Mal“-Mengen fallen dann
 * weg, weil sie für die alten Portionen galten (wie bei setPlanServings).
 */
export function planCombo(plan: MealPlan, recipeIds: readonly string[], servings: number): ComboResult {
  const out: ComboResult = { plan, added: [], more: [], cooked: [] };
  let items = plan.items;
  for (const id of new Set(recipeIds)) {
    const there = items.find((i) => i.recipeId === id);
    if (!there) {
      items = [...items, { recipeId: id, servings }];
      out.added.push(id);
    } else if (plan.cooked.includes(id)) {
      out.cooked.push(id);
    } else {
      items = items.map((i) => (i.recipeId === id ? (({ amounts: _a, ...rest }) => ({ ...rest, servings: i.servings + servings }))(i) : i));
      out.more.push(id);
    }
  }
  out.plan = { ...plan, items };
  return out;
}

/**
 * Die Kombination als ein Gericht – nur zum Rechnen (Nährwerte pro Portion, was im Vorrat fehlt), nie gespeichert.
 * Jeder Baustein auf die gewählten Portionen umgerechnet; Zutat-IDs mit Nummer davor, damit sie eindeutig bleiben.
 */
export function comboContent(parts: readonly RecipeContent[], servings: number): RecipeContent {
  const most = (f: (c: RecipeContent) => number) => Math.max(0, ...parts.map(f));
  return {
    title: parts.map((p) => p.title).join(' + '),
    description: '',
    servings,
    // beides läuft nebeneinander – die Zeit ist die des längeren Bausteins
    prepMinutes: most((c) => c.prepMinutes),
    cookMinutes: most((c) => c.cookMinutes),
    difficulty: most((c) => c.difficulty) as RecipeContent['difficulty'] || 1,
    ingredients: parts.flatMap((p, n) => scaleIngredients(p, servings).map((i) => ({ ...i, id: `${n}:${i.id}` }))),
    steps: [],
    categories: [],
    tags: [],
    devices: [...new Set(parts.flatMap((p) => p.devices))],
  };
}
