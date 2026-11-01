import { andList } from './cookStyle';
import type { Household } from './mealplan';
import { foodOf, sideGrams, sideOf, sidesOfKind } from './sides';
import { detectStepIngredients } from './stepIngredients';
import { canBeRaw } from './swaps';
import type { Ingredient, Recipe, RecipeContent, Unit } from './types';

/**
 * Beilagensalat (Julia: „die Möglichkeit, immer einen Salat zu einem Rezept dazu zu machen, wo man dann seine Zutaten
 * wählt“): rohes Gemüse, ein Dressing, auf Wunsch ein Topping. Er hängt am Rezept wie die Tauschplätze und läuft über
 * choices.ts: chosenContent – Einkauf, Nährwerte, Kochmodus und Abbuchen rechnen mit, auch beim spontanen Kochen.
 * Standard ist „nur fürs nächste Kochen“ (Julia: „wenn ich das nur einmal will“): er gilt, bis das Rezept nach dem
 * Dazunehmen gekocht ist (lastCookedAt nach `at`). Darum braucht „Rückgängig“ nichts Eigenes – das Kochdatum geht
 * zurück, der Salat ist wieder da. „Immer dazu“ (`keep`) bleibt.
 */

/** wie es zum Zeitpunkt der Wahl galt – Name und Menge pro Portion, so braucht das Rezept später keinen Haushalt */
export interface SaladItem { side: string; name: string; grams: number; unit?: 'Stück' }

export interface SideSalad {
  items: SaladItem[];
  /** id aus DRESSINGS – fehlt: ohne */
  dressing?: string;
  topping?: SaladItem;
  /** „immer dazu“ – sonst nur fürs nächste Kochen */
  keep?: true;
  /** wann dazugenommen (ISO) */
  at: string;
}

/**
 * Dressings nur für den Salat (nicht im Baukasten) – je Portion. Das erste ist vorgewählt: Balsamico (Julia: „mein
 * Standard-Dressing“). Seine Nährwerte kennt die Tabelle nicht – Mashi trägt keine selbst ein (nie von der KI); mit
 * Balsamico in „Meine Lebensmittel“ rechnet es mit.
 */
export const DRESSINGS: readonly { id: string; name: string; text: string; parts: readonly { name: string; amount: number; unit: Unit }[] }[] = [
  // ohne Öl (Julia)
  { id: 'balsamico', name: 'Balsamico', text: 'Balsamico mit Salz und Pfeffer verrühren', parts: [{ name: 'Balsamico', amount: 1, unit: 'EL' }] },
  { id: 'essig-oel', name: 'Essig & Öl', text: 'Olivenöl und Essig verrühren, salzen und pfeffern', parts: [{ name: 'Olivenöl', amount: 1, unit: 'EL' }, { name: 'Essig', amount: 1, unit: 'TL' }] },
  { id: 'zitrone-oel', name: 'Zitrone & Öl', text: 'Olivenöl und Zitronensaft verrühren, salzen und pfeffern', parts: [{ name: 'Olivenöl', amount: 1, unit: 'EL' }, { name: 'Zitronensaft', amount: 1, unit: 'TL' }] },
  { id: 'joghurt', name: 'Joghurt', text: 'Joghurt mit Zitronensaft glatt rühren, salzen und pfeffern', parts: [{ name: 'Joghurt', amount: 2, unit: 'EL' }, { name: 'Zitronensaft', amount: 1, unit: 'TL' }] },
  { id: 'senf-honig', name: 'Senf-Honig', text: 'Olivenöl, Senf, Honig und Essig verrühren, salzen und pfeffern', parts: [{ name: 'Olivenöl', amount: 1, unit: 'EL' }, { name: 'Senf', amount: 1, unit: 'TL' }, { name: 'Honig', amount: 1, unit: 'TL' }, { name: 'Essig', amount: 1, unit: 'TL' }] },
];

/** fürs Rohe – wo der Standard des Bausteins gart oder nicht zum Salat passt */
const RAW_PREP: Readonly<Record<string, string>> = {
  salat: 'waschen und zupfen', spinat: 'waschen', mais: 'abtropfen lassen', paprika: 'in feine Streifen schneiden', karotten: 'raspeln',
};

/** eine Beilage, keine Mahlzeit: zusammen etwa so viel Gemüse pro Portion */
const SALAD_GRAMS = 120;
/** Topping im Beilagensalat: halbe Menge */
const TOPPING_SHARE = 0.5;

/** Was in den Salat kann: Gemüse, das roh geht (swaps.ts: canBeRaw) – auch deine eigenen */
export const saladVeg = (custom: readonly string[] = []) => sidesOfKind('veg', custom).filter((s) => canBeRaw(s.id));
/** Toppings zur Wahl – ohne Ei und Cheddar-Scheibe (die gehören auf etwas Warmes) */
export const saladToppings = (custom: readonly string[] = []) => sidesOfKind('topping', custom).filter((s) => s.id !== 'ei' && s.id !== 'cheddar');

/**
 * Der Salat, wie er am Rezept gespeichert wird: Mengen nach deinem Haushalt, zusammen etwa 120 g Gemüse pro Portion
 * (drei Sorten wären sonst über 200 g – eine Mahlzeit, keine Beilage).
 */
export function makeSalad(itemIds: readonly string[], opts: {
  dressing?: string; topping?: string; keep?: boolean; household?: Pick<Household, 'sides' | 'sideFood'>; now: string;
}): SideSalad | undefined {
  const sides = itemIds.flatMap((id) => sideOf(id) ?? []);
  if (!sides.length) return undefined;
  const sum = sides.reduce((n, s) => n + sideGrams(s.id, opts.household), 0);
  const f = sum > SALAD_GRAMS ? SALAD_GRAMS / sum : 1;
  const items = sides.map((s) => ({ side: s.id, name: foodOf(s, opts.household), grams: Math.round(sideGrams(s.id, opts.household) * f) }));
  const t = opts.topping ? sideOf(opts.topping) : undefined;
  return {
    items,
    ...(opts.dressing && DRESSINGS.some((d) => d.id === opts.dressing) ? { dressing: opts.dressing } : {}),
    // halb so viel wie auf einem Baukasten-Teller – 40 g Feta je Portion sind für eine Beilage zu viel
    ...(t ? { topping: { side: t.id, name: foodOf(t, opts.household), grams: Math.round(sideGrams(t.id, opts.household) * TOPPING_SHARE * 10) / 10, ...(t.unit === 'Stück' ? { unit: 'Stück' as const } : {}) } } : {}),
    ...(opts.keep ? { keep: true as const } : {}),
    at: opts.now,
  };
}

/** gilt er gerade? „Immer dazu“ – oder seit dem Dazunehmen noch nicht gekocht */
export const activeSalad = (r: Pick<Recipe, 'salad' | 'lastCookedAt'>): SideSalad | undefined =>
  r.salad && (r.salad.keep || !r.lastCookedAt || r.lastCookedAt < r.salad.at) ? r.salad : undefined;

/** „Salat, Gurke und Tomaten · Joghurt · Feta“ – für die Zeile am Rezept */
export const saladText = (s: SideSalad): string =>
  [andList(s.items.map((i) => sideOf(i.side)?.name ?? i.name)), DRESSINGS.find((d) => d.id === s.dressing)?.name, s.topping && (sideOf(s.topping.side)?.name ?? s.topping.name)].filter(Boolean).join(' · ');

const NOTE = 'Beilagensalat';

/** gehört zum Beilagensalat – die Rezeptseite zeigt sie als eigene Gruppe */
export const isSaladIngredient = (i: Pick<Ingredient, 'id'>): boolean => i.id.startsWith('beilagensalat:');

/**
 * Das Rezept mit Salat: seine Zutaten (für die Portionen des Rezepts, mit „Beilagensalat“ dabei) und am Ende ein Schritt
 * – ohne eigenen Teil, sonst würden deine Schritte, die auch „Tomaten“ nennen, plötzlich „Zum Schluss“.
 */
export function withSalad(c: RecipeContent, s: SideSalad | undefined): RecipeContent {
  if (!s?.items.length) return c;
  const n = c.servings;
  const veg: Ingredient[] = s.items.map((i) => ({ id: `beilagensalat:${i.side}`, name: i.name, amount: Math.round(i.grams * n), unit: (i.unit ?? 'g') as Unit, note: NOTE }));
  const d = DRESSINGS.find((x) => x.id === s.dressing);
  const dressing: Ingredient[] = (d?.parts ?? []).map((p, k) => ({ id: `beilagensalat:dressing:${k}`, name: p.name, amount: p.amount * n, unit: p.unit, note: NOTE }));
  const t = s.topping;
  const topping: Ingredient[] = t ? [{ id: `beilagensalat:${t.side}`, name: t.name, amount: Math.round(t.grams * n * 10) / 10, unit: (t.unit ?? 'g') as Unit, note: NOTE }] : [];
  const cut = andList(s.items.map((i) => {
    const side = sideOf(i.side);
    return `${side?.name ?? i.name} ${RAW_PREP[i.side] ?? side?.prep?.text ?? 'klein schneiden'}`;
  }));
  const top = t ? ` – ${sideOf(t.side)?.name ?? t.name} ${sideOf(t.side)?.prep?.text ?? 'darüber'}` : '';
  const text = `Beilagensalat: ${cut}${d ? `; ${d.text} und unterheben` : ''}${top}.`;
  const all = [...veg, ...dressing, ...topping];
  // deine Schritte behalten ihre Zutaten von vorher – sonst stünden die Salat-Tomaten über „Passierte Tomaten zugeben“
  const mine = c.steps.map((st) => (st.ingredientIds === undefined ? { ...st, ingredientIds: detectStepIngredients(st, c.ingredients).map((i) => i.id) } : st));
  return { ...c, ingredients: [...c.ingredients, ...all], steps: [...mine, { id: 'beilagensalat', text, ingredientIds: all.map((i) => i.id) }] };
}
