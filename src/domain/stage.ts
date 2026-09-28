import { DEFAULT_BASICS, resolveIngredient } from './mealplan';
import { normalizeName } from './nutrition/localFoods';
import { DEFAULT_NO_NUTRITION } from './nutrition/noNutrition';
import type { FoodTable } from './nutrition/types';
import type { Pantry } from './pantry';
import type { RestockRule } from './restock';

/**
 * Wie behältst du ein Lebensmittel im Blick? Genau eine Stufe:
 * normal · nachkaufen (zählen, unter X auf die Liste) · immer im Haus (nicht zählen, fehlt nie) ·
 * ohne Nährwerte (wie immer im Haus, zählt dazu in Rezepten nicht mit – Gewürze & Co.).
 * Die ersten beiden pflegst du (Sorten, Werte, Grenzen), die letzten beiden stellst du einmal ein.
 */
export type FoodStage = 'normal' | 'nachkaufen' | 'haus' | 'ohne';

type Stages = Pick<Pantry, 'basics' | 'restock' | 'noNutrition'>;

const keyFor = (name: string, table: FoodTable) => resolveIngredient({ id: 'stage', name }, 1, table)?.key;
/** gleiches Lebensmittel? – über den Schlüssel („Pasta“ = „Nudeln“), sonst über die Schreibweise */
const same = (a: string, b: string, table: FoodTable) => {
  const ka = keyFor(a, table);
  return ka ? ka === keyFor(b, table) : normalizeName(a) === normalizeName(b);
};

export function stageOf(name: string, pantry: Stages, table: FoodTable): { stage: FoodStage; rule?: RestockRule; basic?: string; zero?: string } {
  const rule = (pantry.restock ?? []).find((r) => same(r.name, name, table));
  if (rule) return { stage: 'nachkaufen', rule };
  const zero = (pantry.noNutrition ?? DEFAULT_NO_NUTRITION).find((z) => same(z, name, table));
  if (zero) return { stage: 'ohne', zero };
  const basic = (pantry.basics ?? DEFAULT_BASICS).find((b) => same(b, name, table));
  return basic ? { stage: 'haus', basic } : { stage: 'normal' };
}

/** Neue Stufe setzen – die anderen fallen dabei weg. */
export function withStage(pantry: Stages, name: string, stage: FoodStage, table: FoodTable, rule?: Omit<RestockRule, 'name'>): Required<Stages> {
  const basics = (pantry.basics ?? DEFAULT_BASICS).filter((b) => !same(b, name, table));
  const restock = (pantry.restock ?? []).filter((r) => !same(r.name, name, table));
  const noNutrition = (pantry.noNutrition ?? DEFAULT_NO_NUTRITION).filter((z) => !same(z, name, table));
  return {
    basics: stage === 'haus' ? [...basics, name] : basics,
    restock: stage === 'nachkaufen' && rule ? [...restock, { name, ...rule }] : restock,
    noNutrition: stage === 'ohne' ? [...noNutrition, name] : noNutrition,
  };
}

/**
 * Einmal aufräumen, wo bisher zwei Stufen zugleich galten: „nachkaufen“ schlägt alles (die genaueste
 * Einstellung), „ohne Nährwerte“ schlägt „immer im Haus“ (ist ohnehin immer da). undefined = nichts zu tun.
 */
export function exclusiveStages(pantry: Stages, table: FoodTable): Partial<Stages> | undefined {
  const rules = pantry.restock ?? [];
  const basics = pantry.basics ?? DEFAULT_BASICS;
  const zero = pantry.noNutrition ?? DEFAULT_NO_NUTRITION;
  const keptZero = zero.filter((z) => !rules.some((r) => same(r.name, z, table)));
  const keptBasics = basics.filter((b) => !rules.some((r) => same(r.name, b, table)) && !keptZero.some((z) => same(z, b, table)));
  const out: Partial<Stages> = {
    ...(keptBasics.length !== basics.length ? { basics: keptBasics } : {}),
    ...(keptZero.length !== zero.length ? { noNutrition: keptZero } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
