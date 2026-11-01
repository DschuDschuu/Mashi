import { FINISH, REST, partOf, partsOf } from './parts';
import { currentContent } from './recipe';
import type { SideKind } from './sides';
import { sideOfIngredient } from './swaps';
import type { Recipe, RecipeBlock } from './types';

/**
 * Bausteine vorschlagen (Julia: Weg B – „möglichst pflegeleicht“): Teile deiner Rezepte – und ganze Rezepte mit
 * eindeutigem Namen – werden zum Baustein, wenn du den Vorschlag annimmst. Mashi schlägt nur vor, was es sicher
 * erkennt (Julia: „Teile + eindeutige“): am Hauptwort des Namens („Erdnuss-Sauce“, „Ofengemüse vom Blech“) oder bei
 * Teilen ohne sprechenden Namen an den Zutaten. Passen zwei Stufen oder keine, kommt nichts – lieber kein Vorschlag als
 * einer zum Wegklicken (anders als guessKind, das für die Auswahl im BlockPanel immer eine Stufe braucht).
 */

export interface BlockHint {
  recipeId: string;
  /** Teil des Rezepts – fehlt: das ganze Rezept */
  part?: string;
  /** wie er im Baukasten heißt: der Teil oder der Rezepttitel */
  name: string;
  kind: SideKind;
  /** steckt ein Protein in Sauce oder Gemüse (Bolognese, Kichererbsen im Ofengemüse), deckt er das mit ab */
  also?: SideKind[];
}

/** Hauptwort-Enden je Stufe (umgeschrieben wie norm: ä → ae …) – „Knoblauchbrot“ endet auf „brot“ */
const ENDINGS: Readonly<Record<SideKind, readonly string[]>> = {
  sauce: ['sauce', 'sosse', 'dip', 'salsa', 'pesto', 'creme', 'dressing', 'guacamole', 'hummus', 'mayo', 'mayonnaise', 'aioli', 'chutney', 'tzatziki', 'vinaigrette'],
  carb: ['reis', 'nudeln', 'pasta', 'kartoffeln', 'kartoffel', 'brot', 'broetchen', 'tortillas', 'wraps', 'couscous', 'bulgur', 'quinoa', 'fladen', 'spaetzle', 'gnocchi', 'knoedel', 'pueree', 'stampf', 'pommes', 'wedges', 'naan'],
  protein: ['haehnchen', 'huhn', 'streifen', 'tofu', 'tempeh', 'seitan', 'falafel', 'frikadellen', 'frikadelle', 'baellchen', 'nuggets', 'schnitzel', 'patty', 'patties', 'halloumi', 'linsen', 'kichererbsen', 'lachs', 'garnelen'],
  veg: ['salat', 'gemuese', 'kohl', 'slaw', 'pickles', 'ratatouille', 'spinat', 'brokkoli', 'blumenkohl'],
  topping: ['topping', 'crunch', 'kerne', 'nuesse', 'crumble', 'krokant', 'streusel', 'croutons', 'dukkah'],
};

const norm = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ');

/**
 * Die Stufe am Namen – nur, wenn sie eindeutig ist. Zählt das Hauptwort: das letzte Wort vor „mit“, „vom“, „und“ …
 * („Ofengemüse vom Blech“ → Ofengemüse), bei „Erdnuss-Sauce“ die Sauce. „Hähnchen-Curry mit Reis“ ist ein ganzes
 * Gericht – das Hauptwort „Curry“ passt zu keiner Stufe, also kein Vorschlag.
 */
export function sureKind(name: string): SideKind | undefined {
  const head = name.split(/\s+(?:mit|vom|von|aus|und|an|auf|nach)\s+|[,&(–]/i)[0];
  const word = norm(head).trim().split(/\s+/).pop() ?? '';
  if (!word) return undefined;
  const kinds = (Object.keys(ENDINGS) as SideKind[]).filter((k) => ENDINGS[k].some((e) => word.endsWith(e)));
  return kinds.length === 1 ? kinds[0] : undefined;
}

/** Kategorien, aus denen kein Abendessen-Baustein kommt (catalog.ts) */
const NOT_MEALS: ReadonlySet<string> = new Set(['dessert', 'backen', 'getraenke', 'fruehstueck']);

/** Kategorien ganzer Mahlzeiten – als Ganzes kein Baustein, ihre Teile schon */
const WHOLE_MEALS: ReadonlySet<string> = new Set(['hauptgericht', 'suppe', 'salat-bowl']);

/** Welche Stufen die Zutaten zeigen (Kohlenhydrat, Protein) – verknüpfte Rezepte zählen nicht */
const kindsIn = (names: readonly string[]): Set<SideKind> => new Set(names.flatMap((n) => sideOfIngredient(n)?.kind ?? []));

/** Vorschlag für einen Teil oder ein ganzes Rezept – undefined: nicht sicher */
function hintFor(r: Recipe, part: string | undefined, name: string, ingredients: readonly string[]): BlockHint | undefined {
  let kind = sureKind(name);
  // ganzes Rezept: nur am Namen – ein Gericht hat fast immer Hähnchen oder Reis, das sagt nichts
  if (!kind && !part) return undefined;
  // die Zutaten nur, wenn sie etwas entscheiden (die Erkennung ist nicht billig – im Kochbuch für alle Rezepte)
  const found = !kind || kind === 'sauce' || kind === 'veg' ? kindsIn(ingredients) : new Set<SideKind>();
  // ohne sprechenden Namen („Füllung“): die Zutaten – aber nur, wenn sie eindeutig sind
  if (!kind && found.size === 1) kind = [...found][0];
  if (!kind) return undefined;
  const also: SideKind[] = (kind === 'sauce' || kind === 'veg') && found.has('protein') ? ['protein'] : [];
  return { recipeId: r.id, ...(part ? { part } : {}), name, kind, ...(also.length ? { also } : {}) };
}

/**
 * Die offenen Vorschläge eines Rezepts: Teile, die noch kein Baustein sind – hat es keine Teile, das ganze Rezept.
 * Nicht vorgeschlagen: was du abgelehnt hast (Recipe.notBlocks), Teile, die ein Baukasten-Gericht nur aus einem anderen
 * Rezept übernommen hat (partsFrom – sonst gäbe es den Dip doppelt), Verwandlungen (Bolo-Wraps), Probiergerichte,
 * KI-Entwürfe und Archiviertes.
 */
export function blockHintsOf(r: Recipe): BlockHint[] {
  if (r.archivedAt || r.trial || r.fromBase || r.status === 'ki_entwurf') return [];
  const c = currentContent(r);
  // „Schokocreme“ ist keine Sauce und „Bananenbrot“ keine Beilage
  if (c.categories.some((k) => NOT_MEALS.has(k))) return [];
  const taken = new Set((r.blocks ?? []).map((b) => b.part ?? ''));
  const off = new Set(r.notBlocks ?? []);
  const open = (key: string) => !taken.has(key) && !off.has(key);
  const parts = partsOf(c).filter((p) => p !== REST && p !== FINISH && !r.partsFrom?.[p]);
  if (parts.length) {
    return parts.filter(open).flatMap((p) => hintFor(r, p, p, c.ingredients.filter((i) => partOf(i) === p && !i.recipeId).map((i) => i.name)) ?? []);
  }
  // ganzes Rezept (ohne Teile): am Titel, siehe hintFor – aber keine ganze Mahlzeit („Cremige Avocado-Pasta“ ist ein
  // Hauptgericht, kein Kohlenhydrat); deren Teile schlägt Mashi oben trotzdem vor
  if (!open('') || taken.size || c.categories.some((k) => WHOLE_MEALS.has(k))) return [];
  const hint = hintFor(r, undefined, c.title, c.ingredients.filter((i) => !i.recipeId).map((i) => i.name));
  return hint ? [hint] : [];
}

/** Alle offenen Vorschläge – für die Liste im Kochbuch */
export const blockHints = (recipes: readonly Recipe[]): BlockHint[] => recipes.flatMap(blockHintsOf);

/** Der Vorschlag als Markierung – „überall“ (keine Richtung), wie ein neuer Baustein im BlockPanel */
export const hintBlock = (h: BlockHint): RecipeBlock => ({ ...(h.part ? { part: h.part } : {}), kind: h.kind, ...(h.also ? { also: h.also } : {}), directions: [] });
