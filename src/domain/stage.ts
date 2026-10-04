import { basicsOf, keyOfName } from './mealplan';
import { normalizeName } from './nutrition/localFoods';
import { spiceName, withSpices, zeroOf } from './nutrition/noNutrition';
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

/** gleiches Lebensmittel? – über den Schlüssel („Pasta“ = „Nudeln“), sonst über die Schreibweise */
const same = (a: string, b: string, table: FoodTable) => {
  const ka = keyOfName(a, table);
  return ka ? ka === keyOfName(b, table) : normalizeName(a) === normalizeName(b);
};
/** ein Eintrag deiner Gewürze – gibt es ihn auch frisch, ist die getrocknete Form gemeint, nie der Bund (Julia) */
const sameSpice = (z: string, name: string, table: FoodTable) => same(spiceName(z, table), name, table);

export function stageOf(name: string, pantry: Stages, table: FoodTable): { stage: FoodStage; rule?: RestockRule; basic?: string; zero?: string } {
  const rule = (pantry.restock ?? []).find((r) => same(r.name, name, table));
  if (rule) return { stage: 'nachkaufen', rule };
  const zero = zeroOf(pantry).find((z) => sameSpice(z, name, table));
  if (zero) return { stage: 'ohne', zero };
  const basic = basicsOf(pantry).find((b) => same(b, name, table));
  return basic ? { stage: 'haus', basic } : { stage: 'normal' };
}

/** Neue Stufe setzen – die anderen fallen dabei weg. */
export function withStage(pantry: Stages, name: string, stage: FoodStage, table: FoodTable, rule?: Omit<RestockRule, 'name'>): Required<Stages> {
  // wird es ein Gewürz, das es auch frisch gibt: gemeint ist die getrocknete – der Bund behält seine Stufe
  const target = stage === 'ohne' ? spiceName(name, withSpices(table, [name])) : name;
  const basics = basicsOf(pantry).filter((b) => !same(b, target, table));
  const restock = (pantry.restock ?? []).filter((r) => !same(r.name, target, table));
  const noNutrition = zeroOf(pantry).filter((z) => !sameSpice(z, target, table));
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
  const basics = basicsOf(pantry);
  const zero = zeroOf(pantry);
  const keptZero = zero.filter((z) => !rules.some((r) => sameSpice(z, r.name, table)));
  const keptBasics = basics.filter((b) => !rules.some((r) => same(r.name, b, table)) && !keptZero.some((z) => sameSpice(z, b, table)));
  const out: Partial<Stages> = {
    ...(keptBasics.length !== basics.length ? { basics: keptBasics } : {}),
    ...(keptZero.length !== zero.length ? { noNutrition: keptZero } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
