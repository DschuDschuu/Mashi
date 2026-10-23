import { chosenContent } from './choices';
import { FINISH } from './parts';
import { currentContent } from './recipe';
import { scaleIngredients } from './scaling';
import { stepIngredients } from './stepIngredients';
import type { Ingredient, Recipe, RecipeContent } from './types';
import { withoutBases } from './weekBases';

/**
 * Zutat selbst machen (Julia: „gekaufte Gnocchi und selbstgemachte – und dann kann ich wählen“): Eine Zutat kann auf ein
 * Grundrezept zeigen (`Ingredient.recipeId`). Wird sie selbst gemacht (`Recipe.homemade`), ersetzen die Zutaten des
 * Grundrezepts die gekaufte Zutat – als eigener Teil (siehe parts.ts). So rechnen Einkaufsliste, Vorrat, Nährwerte und
 * Kochmodus ohne Sonderweg mit, und schon gemachte Gnocchi im Vorrat (Vorgekocht) zählen wie eine fertige Sauce.
 */

export interface HomemadeOption {
  ingredient: Ingredient;
  recipe: Recipe;
  chosen: boolean;
}

/**
 * „1 Portion Bolognese“ – eine Grundlage (herausgelöst oder Verwandlung, siehe week.ts). Die kann man nicht kaufen:
 * sie ist immer selbst gemacht, ohne Wahl. In einer Vorkoch-Woche kommt sie aus dem Vorgekochten (cookingContent, without).
 */
export const isBaseLink = (i: Pick<Ingredient, 'recipeId' | 'unit'>): boolean => !!i.recipeId && i.unit === 'Portion';

/** Zutaten mit Grundrezept zum Wählen (gekauft oder selbst) – nur, wenn es das Rezept noch gibt (gelöscht = wieder gekauft) */
export function homemadeOptions(r: Recipe, all: readonly Recipe[]): HomemadeOption[] {
  const chosen = new Set(r.homemade ?? []);
  // nur, was in der gewählten Variante vorkommt (siehe choices.ts); Grundlagen sind immer selbst gemacht
  return chosenContent(r).ingredients.flatMap((ingredient) => {
    if (isBaseLink(ingredient)) return [];
    const recipe = linked(ingredient, all, r.id);
    return recipe ? [{ ingredient, recipe, chosen: chosen.has(ingredient.id) }] : [];
  });
}

function linked(i: Ingredient, all: readonly Recipe[], self?: string): Recipe | undefined {
  return i.recipeId && i.recipeId !== self ? all.find((x) => x.id === i.recipeId) : undefined;
}

/** eingesetzte Zutaten und Schritte: ID der ersetzten Zutat + ID im Grundrezept – eindeutig, auch bei zwei Grundrezepten */
const subId = (ingredientId: string, id: string) => `${ingredientId}>${id}`;

/**
 * Das Rezept mit den gewählten Zutaten selbst gemacht. Das Grundrezept kommt auf die Portionen des Gerichts
 * (Gnocchi für 2 = Grundrezept für 2 – wie bei Mix & Match je Portion), seine Schritte stehen vorne. Bei einer
 * Grundlage („2 Portionen Sauce“) zählt die Menge: so viele Portionen der Grundlage.
 * Ein Schritt, der die gekaufte Zutat brauchte („Gnocchi in die Sauce“), bringt jetzt Teile zusammen → „Zum Schluss“.
 * Nur eine Ebene: Was das Grundrezept selbst wieder selbst machen könnte, bleibt gekauft.
 * @param self ID des Rezepts – zeigt eine Zutat auf das Rezept selbst, bleibt sie gekauft
 */
export function withHomemade(content: RecipeContent, chosen: readonly string[], all: readonly Recipe[], self?: string): RecipeContent {
  const subs = new Map<string, { name: string; c: RecipeContent; portions: number }>();
  for (const i of content.ingredients) {
    const r = chosen.includes(i.id) ? linked(i, all, self) : undefined;
    if (r) subs.set(i.id, { name: i.name, c: chosenContent(r), portions: isBaseLink(i) && i.amount ? i.amount : content.servings });
  }
  if (!subs.size) return content;

  const ingredients = content.ingredients.flatMap((i): Ingredient[] => {
    const sub = subs.get(i.id);
    if (!sub) return [i];
    return scaleIngredients(sub.c, sub.portions).map(({ recipeId: _r, ...x }) => ({
      ...x, id: subId(i.id, x.id), part: sub.name, ...(i.optional ? { optional: true } : {}),
    }));
  });
  const subSteps = [...subs].flatMap(([id, sub]) => sub.c.steps.map((s) => ({
    ...s, id: subId(id, s.id), part: sub.name,
    // fest zuordnen – sonst fände die Erkennung „Mehl“ auch in den Schritten des Gerichts
    ingredientIds: stepIngredients(s, sub.c.ingredients).map((x) => subId(id, x.id)),
  })));
  const steps = content.steps.map((s) => {
    const used = stepIngredients(s, content.ingredients);
    const touches = used.some((x) => subs.has(x.id));
    return {
      ...s,
      ingredientIds: used.filter((x) => !subs.has(x.id)).map((x) => x.id),
      ...(touches && !s.part ? { part: FINISH } : {}),
    };
  });
  return { ...content, ingredients, steps: [...subSteps, ...steps] };
}

/**
 * So wird das Rezept gekocht: in der gewählten Variante (choices.ts), mit dem, was Julia gerade selbst macht, und mit
 * seinen Grundlagen (isBaseLink) – für Plan, Einkauf, Vorrat, Nährwerte, Kochmodus.
 * @param without Grundlagen, die schon vorgekocht sind (Vorkoch-Woche): fallen ganz weg, statt aufgelöst zu werden –
 *   sonst kämen ihre Zutaten doppelt auf die Einkaufsliste und gingen doppelt aus dem Vorrat
 */
export function cookingContent(r: Recipe, all: readonly Recipe[], without: readonly string[] = []): RecipeContent {
  const c = withoutBases(chosenContent(r), without);
  const chosen = [...(r.homemade ?? []), ...c.ingredients.filter(isBaseLink).map((i) => i.id)];
  return chosen.length ? withHomemade(c, chosen, all, r.id) : c;
}

/**
 * Grundrezepte, die zu einer Zutat passen könnten (Formular): der Name der Zutat steht als Wort im Titel
 * („Gnocchi“ → „Selbstgemachte Gnocchi“). Nur ein Vorschlag – verknüpft wird erst, wenn Julia eins wählt.
 * Vor einem Bindestrich zählt er nicht: im Deutschen steht das Hauptwort hinten – „Avocado-Pasta“ ist Pasta,
 * „Bärlauch-Pesto“ ist Pesto. Rezepte mit nur einer Zutat (gekaufte Beilagen in Mix & Match: „Reis“ = 100 g Reis)
 * sind kein Grundrezept zum Selbstmachen.
 */
export function homemadeCandidates(name: string, all: readonly Recipe[], self?: string): Recipe[] {
  const words = titleWords(name);
  if (words.join('').length < 3) return [];
  const head = words[words.length - 1];
  return all
    .filter((r) => r.id !== self && !r.archivedAt && r.status !== 'ki_entwurf' && currentContent(r).ingredients.length > 1)
    .filter((r) => {
      const title = currentContent(r).title.toLowerCase();
      const t = titleWords(title);
      return words.every((w) => t.includes(w)) && t.some((w, i) => w === head && !compoundPart(title, w, i, t));
    })
    .sort((a, b) => currentContent(a).title.localeCompare(currentContent(b).title, 'de'));
}

const titleWords = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Steht das i-te Wort des Titels direkt vor einem Bindestrich („avocado“ in „avocado-pasta“)? */
function compoundPart(title: string, word: string, i: number, words: readonly string[]): boolean {
  let at = -1;
  for (let n = 0; n <= i; n++) at = title.indexOf(words[n], at + 1);
  return title[at + word.length] === '-';
}
