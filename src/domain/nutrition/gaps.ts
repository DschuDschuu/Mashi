import { cookingContent } from '../homemade';
import type { Household, Week } from '../mealplan';
import { sideContent } from '../mix';
import { currentContent } from '../recipe';
import { sideIngredient, sidesOf } from '../sides';
import type { Ingredient, Recipe } from '../types';
import { computeNutrition } from './engine';
import { normalizeName } from './localFoods';
import type { FoodTable } from './types';

/**
 * Eine Nährwert-Lücke (Julia: „Nährwert-Lücken zeigen“ – seit Tauschen und Beilagensalat steht öfter „mind. … kcal“):
 * - `unbekannt`: Mashi kennt das Lebensmittel nicht → Werte unter „Meine Lebensmittel“ eintragen,
 * - `gewicht`: bekannt, aber „1 Stück“ lässt sich nicht in Gramm umrechnen → „1 Stück wiegt“ eintragen (Dose, Bund, Glas
 *   rechnet Mashi grob um, units.ts).
 * Zutaten ohne Menge („etwas Öl“) stehen nicht hier – die korrigiert man im Rezept.
 */
export interface FoodGap {
  name: string;
  kind: 'unbekannt' | 'gewicht';
  /** wo es vorkommt – das Häufigste zuerst */
  recipes: { id: string; title: string }[];
  /** auch (oder nur) als Baustein: im Wochenplan eingeplant oder dein eigener */
  block: boolean;
  /** bei `gewicht`: in welcher Einheit es nicht geht (fast immer „Stück“) */
  units: string[];
}

/** Rezepte, die zählen: alles außer Archiv und KI-Entwürfen – Probiergerichte ja, die kochst du ja */
const counts = (r: Recipe) => !r.archivedAt && r.status !== 'ki_entwurf';

/**
 * Alle Lücken: deine Rezepte so, wie sie gekocht werden (mit Tausch, Beilagensalat und Grundlagen aufgelöst –
 * cookingContent, wie auf der Rezeptseite), dazu die Bausteine, die du nutzt – im Wochenplan eingeplant oder selbst
 * angelegt (Julia: „nur genutzte“ – Mashis Grundtabelle kennt Halloumi, Naan & Co. nicht, die stünden sonst alle da).
 * Je Lebensmittel eine Zeile (gleich geschrieben = gleich, normalizeName); zuerst, was in den meisten Rezepten fehlt.
 * Keine Zahl wird hier erfunden – nur gesucht, wo welche fehlen.
 */
export function nutritionGaps(recipes: readonly Recipe[], table: FoodTable, opts: {
  household?: Pick<Household, 'sides' | 'sideFood' | 'customSides'>; week?: Pick<Week, 'meals'>;
} = {}): FoodGap[] {
  const { household, week } = opts;
  const gaps = new Map<string, FoodGap>();
  const note = (ing: Pick<Ingredient, 'name' | 'unit'>, kind: FoodGap['kind'], where: { recipe?: Recipe; block?: true }) => {
    const key = normalizeName(ing.name);
    const gap = gaps.get(key) ?? { name: ing.name, kind, recipes: [], block: false, units: [] };
    // unbekannt wiegt schwerer: dann fehlen alle Werte, nicht nur das Gewicht
    if (kind === 'unbekannt') gap.kind = 'unbekannt';
    if (where.recipe && !gap.recipes.some((x) => x.id === where.recipe!.id)) gap.recipes.push({ id: where.recipe.id, title: currentContent(where.recipe).title });
    if (where.block) gap.block = true;
    if (kind === 'gewicht' && ing.unit && !gap.units.includes(ing.unit)) gap.units.push(ing.unit);
    gaps.set(key, gap);
  };
  const scan = (ingredients: Ingredient[], where: { recipe?: Recipe; block?: true }) => {
    const n = computeNutrition({ ...sideContent('Lücken'), ingredients }, table);
    for (const item of n.items) {
      const ing = ingredients.find((i) => i.id === item.ingredientId);
      if (!ing) continue;
      if (item.status === 'unmatched') note(ing, 'unbekannt', where);
      else if (item.status === 'no-weight') note(ing, 'gewicht', where);
    }
  };
  for (const r of recipes.filter(counts)) scan(cookingContent(r, recipes).ingredients, { recipe: r });
  const used = new Set([...(week?.meals ?? []).flatMap((m) => sidesOf(m.side).map((x) => x.id)), ...(household?.customSides ?? [])]);
  const blocks = [...used].flatMap((id) => sideIngredient(id, 1, household) ?? []);
  scan(blocks, { block: true });
  return [...gaps.values()].sort((a, b) => b.recipes.length - a.recipes.length || Number(b.block) - Number(a.block) || a.name.localeCompare(b.name, 'de'));
}
