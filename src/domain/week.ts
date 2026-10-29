import { DEFAULT_HOUSEHOLD, keyOfName, type Household, type Week, type WeekBase, type WeekMeal, type Weekday } from './mealplan';
import type { FoodTable } from './nutrition/types';
import type { PantryItem } from './pantry';
import { currentContent } from './recipe';
import { SPECIAL_DAYS } from './shelfLife';
import { weekBaseIds, withoutBases } from './weekBases';
import { comboText, sideIngredient, sidesOf } from './sides';

export { weekBaseIds, withoutBases };
import type { Ingredient, Recipe } from './types';

/**
 * Vorkoch-Woche (Julia: „nicht 5 unterschiedliche Gerichte kochen – eine Bolo machen und daraus einmal Nudeln,
 * einmal Wraps“): An wählbaren Kochtagen werden Grundlagen gekocht, an den Abenden danach daraus verschiedene
 * Gerichte gemacht. Mittage sind Plätze wie die Abende (Julia: „der Mittag soll sich gleich verhalten wie der Abend“) –
 * an den Mittagstagen des Haushalts, mit Kärtchen aus dem Kühlschrank; Mashi rechnet dort nichts mehr selbst aus.
 *
 * Gespeichert wird nur das Ergebnis (welcher Platz welches Gericht) – Alter, Einfrieren und Portionen
 * rechnet weekView jedes Mal neu. So bleibt alles stimmig, wenn Julia tauscht, verschiebt oder Kochtage ändert.
 *
 * Grundlage = jedes Rezept, das an einem Kochtag gekocht wird (auch eine Suppe, die man direkt isst).
 * Verwandlung = ein Rezept mit einer Zutat, die auf die Grundlage zeigt (Ingredient.recipeId, wie „Zutat selbst machen“).
 */

export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

/** Wochentag eines Datums (0 = Montag) */
export const weekdayOf = (d: Date): Weekday => (d.getDay() + 6) % 7;

/** Die Woche beginnt am Wochenend-Kochtag: Sa vor So vor Mo … (Julia: mal Samstag statt Sonntag kochen) */
export const sortCookDays = (days: readonly Weekday[]): Weekday[] => [...new Set(days)].sort((a, b) => ((a + 2) % 7) - ((b + 2) % 7));

/** Die sieben Tage ab dem Wochenanfang (fest gemerkt, sonst der erste Kochtag) – in dieser Reihenfolge wird gegessen */
export function weekOrder(week: Pick<Week, 'cookDays' | 'start'>): Weekday[] {
  const start = week.start ?? sortCookDays(week.cookDays)[0] ?? 0;
  return Array.from({ length: 7 }, (_, i) => (start + i) % 7);
}

/** Ein Platz im Wochenplan: Tag und mittags oder abends */
export interface Slot {
  day: Weekday;
  lunch?: boolean;
}
export const slotOf = (m: Pick<WeekMeal, 'day' | 'lunch'>): Slot => (m.lunch ? { day: m.day, lunch: true } : { day: m.day });
export const sameSlot = (a: Slot, b: Slot): boolean => a.day === b.day && !!a.lunch === !!b.lunch;
const slotKey = (s: Slot) => `${s.day}${s.lunch ? 'm' : ''}`;
/** Das Essen auf einem Platz */
export const mealAt = (week: Week, s: Slot): WeekMeal | undefined => week.meals.find((m) => sameSlot(slotOf(m), s));
/** ein Essen auf einen anderen Platz (ohne `lunch: false` im Speicher) */
function moveTo(m: WeekMeal, s: Slot): WeekMeal {
  const { lunch: _l, ...rest } = m;
  return s.lunch ? { ...rest, day: s.day, lunch: true } : { ...rest, day: s.day };
}
/** Reihenfolge der Plätze: mittags vor abends */
export const slotIndex = (order: readonly Weekday[], s: Slot) => order.indexOf(s.day) * 2 + (s.lunch ? 0 : 1);

/**
 * so viele Tage später ist frisch Gekochtes (Nudeln, Reis …) noch gut, das für später mitgekocht wird – carbCarry und
 * Mitkochen ohne eigene Haltbarkeit am Gericht (cookDay.ts: freshDaysOf)
 */
export const FRESH_DAYS = 2;
/**
 * Frühester Platz für Essen aus einer Grundlage: gekocht wird am Kochtag zwischen Mittag und Abend – mittags am Kochtag
 * ist also noch nichts da. Schon Gekochtes (aus der Speisekammer) geht ab dem Mittag seines Tages.
 */
const earliest = (order: readonly Weekday[], base: Pick<WeekBase, 'day' | 'cooked'>) => order.indexOf(base.day) * 2 + (base.cooked ? 0 : 0.5);
/** Darf ein Essen aus dieser Grundlage auf diesen Platz? */
const fits = (order: readonly Weekday[], base: Pick<WeekBase, 'day' | 'cooked'> | undefined, s: Slot) => !base || slotIndex(order, s) >= earliest(order, base);
/** Mittags-Plätze dieser Woche: Mittagstage des Haushalts ohne die abgewählten */
export const lunchDaysOf = (week: Pick<Week, 'noLunch'>, household: Household): Weekday[] => household.lunchDays.filter((d) => !(week.noLunch ?? []).includes(d));

/** Wie lange es gekocht hält – eigener Wert am Rezept, sonst der für Vorgekochtes (Standard 3 Tage) */
export const keepsOf = (r: Recipe | undefined, fallback: number = SPECIAL_DAYS.prepared): number => r?.keepsDays ?? fallback;

/** Aus welcher Grundlage stammt ein Gericht? Die Grundlage selbst – oder eine Zutat, die auf sie zeigt. */
export function baseIdOf(recipe: Recipe, baseIds: readonly string[]): string | undefined {
  if (baseIds.includes(recipe.id)) return recipe.id;
  return currentContent(recipe).ingredients.find((i) => i.recipeId && baseIds.includes(i.recipeId))?.recipeId;
}

/** Verwandlungen einer Grundlage: alle Rezepte mit einer Zutat, die auf sie zeigt (archivierte nicht) */
export function transformsOf(baseId: string, recipes: readonly Recipe[]): Recipe[] {
  return recipes.filter((r) => r.id !== baseId && !r.archivedAt && currentContent(r).ingredients.some((i) => i.recipeId === baseId));
}

/**
 * Was zu einer Grundlage dazukommt (Julia: „man sieht nicht, dass Cocktailtomaten, Hähnchen und Pasta dazukommen“) –
 * aus den Zutaten des Gerichts ohne die Grundlage gerechnet, damit nichts extra gepflegt werden muss.
 */
export function extrasOf(dish: Recipe, baseId: string): string[] {
  // Würze und Wasser hat man da – sonst wird die Zeile lang und das Wesentliche (Hähnchen, Pasta) geht unter
  const basic = /^(salz|pfeffer|salz (&|und) pfeffer|wasser)$|öl$|gewürz|knoblauch/i;
  return [...new Set(currentContent(dish).ingredients.filter((i) => i.recipeId !== baseId && !basic.test(i.name.trim())).map((i) => i.name))];
}

/**
 * Wie viele Gerichte aus jeder Grundlage entstehen (gleiche Regel wie transformsOf) – fürs Kochbuch: Segment
 * „Grundlagen“ und „3 Gerichte daraus“ auf der Karte. Einmal für alle, statt je Karte alle Rezepte zu durchsuchen.
 */
export function transformCounts(recipes: readonly Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of recipes) {
    if (r.archivedAt) continue;
    const bases = new Set(currentContent(r).ingredients.flatMap((i) => (i.recipeId && i.recipeId !== r.id ? [i.recipeId] : [])));
    for (const id of bases) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Julias Auswahl: eine Grundlage und was sie daraus macht – dasselbe Gericht zweimal = zwei Abende.
 * Ein Eintrag ist eine Rezept-ID oder „Rezept+Beilage“ (mealKey) – so bleibt die Auswahl eine einfache Liste zum Zählen.
 */
export interface WeekChoice {
  baseId: string;
  meals: string[];
}

/** „bolo+spaetzle“ = Bolognese mit Spätzle (Beilage siehe sides.ts); ohne Beilage nur die Rezept-ID */
export const mealKey = (recipeId: string, side?: string): string => (side ? `${recipeId}+${side}` : recipeId);
export function splitMealKey(key: string): { recipeId: string; side?: string } {
  const at = key.lastIndexOf('+');
  return at > 0 ? { recipeId: key.slice(0, at), side: key.slice(at + 1) } : { recipeId: key };
}

/** „Bolognese mit Spätzle“ – der Titel eines Abendessens, mit seiner Beilage */
export function mealTitle(meal: Pick<WeekMeal, 'side'>, recipe: Recipe | undefined): string {
  const title = recipe ? currentContent(recipe).title : 'Gelöschtes Rezept';
  const side = comboText(meal.side);
  return side ? `${title} mit ${side}` : title;
}

/**
 * Was Julia am Abend noch tun muss, wenig zuerst (Julia: „aufsteigend nach Aufwand“): Zeit (Vorbereitung + Kochen),
 * dann Schwierigkeit, dann Name. Die Grundlage selbst ist nur aufwärmen und steht deshalb vor allen.
 */
export function byEffort(recipes: readonly Recipe[], baseId?: string): Recipe[] {
  const key = (r: Recipe) => { const c = currentContent(r); return { base: r.id === baseId, minutes: c.prepMinutes + c.cookMinutes, diff: c.difficulty, title: c.title }; };
  return [...recipes].map((r) => ({ r, k: key(r) }))
    .sort((a, b) => Number(b.k.base) - Number(a.k.base) || a.k.minutes - b.k.minutes || a.k.diff - b.k.diff || a.k.title.localeCompare(b.k.title, 'de'))
    .map((x) => x.r);
}

/**
 * Mashis Vorschlag: die erste Grundlage am ersten Kochtag, die zweite am zweiten … (mehr Grundlagen als Kochtage:
 * die übrigen am letzten). Ihre Gerichte belegen die Abende ab dem Kochtag, freie Abende werden übersprungen.
 */
export function suggestWeek(cookDays: readonly Weekday[], choices: readonly WeekChoice[], newId: () => string): Week {
  const cook = sortCookDays(cookDays);
  const order = weekOrder({ cookDays: cook });
  const taken = new Set<Weekday>();
  const bases: WeekBase[] = [];
  const meals: WeekMeal[] = [];
  choices.forEach((c, i) => {
    const day = cook[Math.min(i, cook.length - 1)] ?? 0;
    bases.push({ recipeId: c.baseId, day });
    let k = order.indexOf(day);
    for (const key of c.meals) {
      while (k < 7 && taken.has(order[k])) k++;
      if (k >= 7) break;
      const { recipeId, side } = splitMealKey(key);
      meals.push({ id: newId(), day: order[k], recipeId, baseId: c.baseId, ...(side ? { side } : {}) });
      taken.add(order[k]);
      k++;
    }
  });
  return { cookDays: cook, bases, meals };
}

export interface MealView {
  meal: WeekMeal;
  recipe?: Recipe;
  cookDay: Weekday;
  /** Tage seit dem Kochtag (0 = frisch gekocht) */
  age: number;
  /** zu alt für den Kühlschrank, lässt sich aber einfrieren → „am Vortag auftauen“ */
  frost: boolean;
  /** zu alt und nicht einfrierbar → Julia sollte tauschen oder später kochen */
  tooOld: boolean;
}

export interface BaseView {
  base: WeekBase;
  recipe?: Recipe;
  evenings: number;
  lunches: number;
  /** zu kochende Portionen: Abende + Mittage + Kühlschrank + bewusst Eingefrorenes */
  portions: number;
  /**
   * davon einfrieren: zu alte Mahlzeiten und bewusst Eingefrorenes. Der Kühlschrank-Rest bleibt frisch (Julia: was im
   * Kühlschrank steht, soll auch dort sein) – hält er nicht bis zum Ende, schlägt das Kärtchen „Einfrieren“ vor.
   */
  frozen: number;
}

export interface DayView {
  day: Weekday;
  cook: boolean;
  /** abends */
  meal?: MealView;
  /** mittags – nur an Mittagstagen (`hasLunch`) */
  lunch?: MealView;
  /** an diesem Tag gibt es einen Mittags-Platz */
  hasLunch: boolean;
  /** Mittagstag, diese Woche aber bewusst kein Mittag */
  noLunch: boolean;
}

export interface WeekView {
  order: Weekday[];
  days: DayView[];
  bases: BaseView[];
}

/** Alter und Haltbarkeit einer Mahlzeit am Tag `day` aus einer Grundlage, die am Tag `cookDay` gekocht wurde */
function freshness(order: Weekday[], day: Weekday, cookDay: Weekday, base: Recipe | undefined, keepsFallback?: number) {
  const age = order.indexOf(day) - order.indexOf(cookDay);
  const old = age >= keepsOf(base, keepsFallback);
  return { age, frost: old && !!base?.freezable, tooOld: old && !base?.freezable };
}

export function weekView(week: Week, recipes: readonly Recipe[], household: Household = DEFAULT_HOUSEHOLD, keepsFallback?: number): WeekView {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const order = weekOrder(week);
  const baseDay = new Map(week.bases.map((b) => [b.recipeId, b.day]));
  const noLunch = new Set(week.noLunch ?? []);
  const lunchDays = new Set(household.lunchDays);

  // jedes Essen einzeln (auch wenn nach dem Abgleich kurz zwei auf einem Platz liegen – Portionen zählen beide)
  const views: MealView[] = week.meals.map((meal) => {
    const cookDay = baseDay.get(meal.baseId) ?? meal.day;
    return { meal, recipe: byId.get(meal.recipeId), cookDay, ...freshness(order, meal.day, cookDay, byId.get(meal.baseId), keepsFallback) };
  });
  const meals = new Map(views.map((v) => [slotKey(slotOf(v.meal)), v]));

  const cookDays = new Set(week.cookDays);
  const days: DayView[] = order.map((day) => {
    const hasLunch = lunchDays.has(day) && !noLunch.has(day);
    const lunch = hasLunch ? meals.get(slotKey({ day, lunch: true })) : undefined;
    return { day, cook: cookDays.has(day), meal: meals.get(slotKey({ day })), ...(lunch ? { lunch } : {}), hasLunch, noLunch: lunchDays.has(day) && noLunch.has(day) };
  });

  const bases: BaseView[] = week.bases.map((base) => {
    const own = views.filter((m) => m.meal.baseId === base.recipeId);
    const extra = (base.extra ?? 0) + (base.freeze ?? 0);
    const sum = (ms: MealView[]) => ms.reduce((n, m) => n + servingsOf(m.meal, household), 0);
    return {
      base, recipe: byId.get(base.recipeId), evenings: own.filter((m) => !m.meal.lunch).length, lunches: own.filter((m) => m.meal.lunch).length,
      portions: sum(own) + extra,
      frozen: sum(own.filter((m) => m.frost)) + (base.freeze ?? 0),
    };
  });
  return { order, days, bases };
}

/** Darf getauscht werden? Kein Essen darf vor das Kochen seiner Grundlage rutschen (mittags am Kochtag ist noch nichts da). */
export function canSwap(week: Week, a: Slot, b: Slot): boolean {
  if (sameSlot(a, b)) return false;
  const order = weekOrder(week);
  const baseOf = (m: WeekMeal) => week.bases.find((x) => x.recipeId === m.baseId);
  const x = mealAt(week, a), y = mealAt(week, b);
  if (!x && !y) return false;
  return !(x && !fits(order, baseOf(x), b)) && !(y && !fits(order, baseOf(y), a));
}

/** Zwei Plätze tauschen (auch mit einem freien, auch Mittag mit Abend) – unverändert, wenn es nicht geht */
export function swapSlots(week: Week, a: Slot, b: Slot): Week {
  if (!canSwap(week, a, b)) return week;
  return { ...week, meals: week.meals.map((m) => (sameSlot(slotOf(m), a) ? moveTo(m, b) : sameSlot(slotOf(m), b) ? moveTo(m, a) : m)) };
}

/**
 * Heute auswärts (Julia: „spontan Donnerstag essen gehen, das Essen auf Freitag schieben“): das Gericht rückt einen
 * Tag weiter, belegte Abende danach rücken mit – bis zum nächsten freien Abend. Kein freier Abend mehr: null.
 */
export function shiftFrom(week: Week, day: Weekday): { week: Week; to: Weekday } | null {
  const order = weekOrder(week);
  // nur die Abende rücken – „heute auswärts“ meint das Abendessen
  const at = new Map(week.meals.filter((m) => !m.lunch).map((m) => [m.day, m]));
  if (!at.has(day)) return null;
  const chain: Weekday[] = [];
  for (let i = order.indexOf(day); i < 7; i++) {
    chain.push(order[i]);
    if (!at.has(order[i])) break;
  }
  const last = chain[chain.length - 1];
  if (at.has(last)) return null;
  const next = new Map(chain.slice(0, -1).map((d, i) => [d, chain[i + 1]]));
  return { week: { ...week, meals: week.meals.map((m) => (!m.lunch && next.has(m.day) ? { ...m, day: next.get(m.day)! } : m)) }, to: chain[1] };
}

/**
 * „Lässt sich auch am Sonntag vorbereiten“ (Julia): Eine Grundlage, die später gekocht wird, könnte schon am ersten
 * Kochtag mit – wenn ihre Gerichte dann noch halten oder sich einfrieren lassen. undefined = geht nicht / ist schon dort.
 */
export function earlierCookDay(week: Week, baseId: string, recipes: readonly Recipe[], keepsFallback?: number): { day: Weekday; needsFreeze: boolean } | undefined {
  const first = sortCookDays(week.cookDays)[0];
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (first === undefined || !base || base.day === first) return undefined;
  const order = weekOrder(week);
  const recipe = recipes.find((r) => r.id === baseId);
  const ages = week.meals.filter((m) => m.baseId === baseId).map((m) => order.indexOf(m.day) - order.indexOf(first));
  const needsFreeze = ages.some((a) => a >= keepsOf(recipe, keepsFallback));
  if (needsFreeze && !recipe?.freezable) return undefined;
  return { day: first, needsFreeze };
}

/**
 * Ein Gericht auf einen Tag legen (Julia: „ein Plan“ – aus dem Kochbuch oder von „irgendwann diese Woche“): Eine
 * Verwandlung isst von ihrer Grundlage (fehlt die in der Woche, wird sie an dem Tag gekocht); ein ganzes Gericht wird an
 * dem Tag frisch gekocht – der Tag wird Kochtag. Ohne Woche entsteht eine. Mehr Portionen als für den Abend füllen die
 * nächsten freien Abende (fillEvenings), der Rest ist Vorrat. Ist der Abend schon belegt: unverändert.
 */
export function scheduleMeal(
  week: Week | undefined, recipe: Recipe, day: Weekday, servings: number, household: Household, newId: () => string,
  recipes: readonly Recipe[] = [recipe], keepsFallback?: number, today?: Weekday, lunch = false,
): Week {
  // neue Woche beginnt heute (sonst am gewählten Tag); ein neuer Kochtag verschiebt den Anfang nicht mehr
  const w: Week = week ?? { cookDays: [day], bases: [], meals: [], start: today ?? day };
  if (mealAt(w, { day, lunch })) return w;
  const link = currentContent(recipe).ingredients.find((i) => i.recipeId && i.unit === 'Portion' && i.recipeId !== recipe.id);
  const baseId = baseIdOf(recipe, weekBaseIds(w)) ?? link?.recipeId ?? recipe.id;
  const isNew = !w.bases.some((b) => b.recipeId === baseId);
  const extra = isNew && baseId === recipe.id ? Math.max(0, Math.round(servings - household.portions)) : 0;
  return fillEvenings({
    ...w,
    start: weekOrder(w)[0],
    cookDays: isNew && !w.cookDays.includes(day) ? [...w.cookDays, day] : w.cookDays,
    bases: isNew ? [...w.bases, { recipeId: baseId, day, ...(extra ? { extra } : {}) }] : w.bases,
    meals: [...w.meals, { id: newId(), day, ...(lunch ? { lunch: true as const } : {}), recipeId: recipe.id, baseId }],
  }, baseId, recipes, household, newId, keepsFallback);
}

/** Portionen eines Abends – eigene (Gäste) oder die des Haushalts */
export const servingsOf = (meal: Pick<WeekMeal, 'portions'>, household: Household): number => meal.portions ?? household.portions;

/** Der nächste freie Abend ab dem Kochtag einer Grundlage, an dem sie noch hält (oder sich einfrieren lässt) */
export function nextFreeEvening(week: Week, baseId: string, recipes: readonly Recipe[], keepsFallback?: number): Weekday | undefined {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base) return undefined;
  const order = weekOrder(week);
  const taken = new Set(week.meals.filter((m) => !m.lunch).map((m) => m.day));
  const recipe = recipes.find((r) => r.id === baseId);
  return order.slice(order.indexOf(base.day)).find((d) => !taken.has(d) && !freshness(order, d, base.day, recipe, keepsFallback).tooOld);
}

/**
 * Extra-Portionen auf freie Abende legen (Julia: „Mittwoch hat noch nichts – Portionen erhöhen, dann steht es bei
 * Mittwoch statt ‚einfrieren‘“): je volle Haushalts-Portion ein Abend. Gegessen wird eine Verwandlung, die diese Woche
 * noch nicht dran war (wenig Aufwand zuerst), sonst die Grundlage selbst. Erst wenn kein Abend frei ist, bleibt Vorrat.
 */
export function fillEvenings(week: Week, baseId: string, recipes: readonly Recipe[], household: Household, newId: () => string, keepsFallback?: number): Week {
  let w = week;
  for (;;) {
    const base = w.bases.find((b) => b.recipeId === baseId);
    const extra = base?.extra ?? 0;
    // schon gekocht: der Vorrat liegt dann in der Speisekammer, nicht mehr in der Woche
    if (!base || base.cooked || extra < household.portions) return w;
    const day = nextFreeEvening(w, baseId, recipes, keepsFallback);
    if (day === undefined) return w;
    const used = new Set(w.meals.map((m) => m.recipeId));
    const dish = byEffort(transformsOf(baseId, recipes)).find((r) => !used.has(r.id))?.id ?? baseId;
    w = { ...setExtra(w, baseId, extra - household.portions), meals: [...w.meals, { id: newId(), day, recipeId: dish, baseId }] };
  }
}

/** Darf „eine Portion weniger“? Solange Extra-Portionen da sind oder mehr als ein offener Abend daraus isst */
export function canLessPortions(week: Week, baseId: string): boolean {
  const base = week.bases.find((b) => b.recipeId === baseId);
  return !!base && !base.cooked && (!!base.extra || week.meals.filter((m) => m.baseId === baseId && !m.done).length > 1);
}

/**
 * „+“ / „−“ am Kochtag: eine Portion mehr füllt – sobald es für einen Abend reicht – den nächsten freien Abend. Eine
 * weniger nimmt erst Extra-Portionen weg, dann den letzten offenen Abend aus der Grundlage (bis auf eine Portion).
 */
export function stepPortions(week: Week, baseId: string, up: boolean, recipes: readonly Recipe[], household: Household, newId: () => string, keepsFallback?: number): Week {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base || base.cooked) return week;
  const extra = base.extra ?? 0;
  if (up) return fillEvenings(setExtra(week, baseId, extra + 1), baseId, recipes, household, newId, keepsFallback);
  if (extra > 0) return setExtra(week, baseId, extra - 1);
  if (!canLessPortions(week, baseId)) return week;
  const order = weekOrder(week);
  const last = week.meals.filter((m) => m.baseId === baseId && !m.done).sort((a, b) => slotIndex(order, slotOf(b)) - slotIndex(order, slotOf(a)))[0];
  return setExtra({ ...week, meals: week.meals.filter((m) => m.id !== last.id) }, baseId, servingsOf(last, household) - 1);
}

/**
 * „Was gibt's?“ (Julia: freien Abend antippen) – ein Gericht aus einer Grundlage der Woche auf den Abend legen, mit
 * Beilage, wenn es die Grundlage selbst ist. Ist der Abend belegt, wird getauscht (Portionen bleiben). Ein neuer Abend
 * isst zuerst von den Extra-Portionen – statt einzufrieren. Kein Abend vor dem Kochtag (sonst wäre noch nichts gekocht).
 */
export function putMeal(week: Week, slot: Slot, recipeId: string, baseId: string, household: Household, newId: () => string, side?: string): Week {
  const base = week.bases.find((b) => b.recipeId === baseId);
  const old = mealAt(week, slot);
  const order = weekOrder(week);
  if (!base || old?.done || !fits(order, base, slot)) return week;
  const meal: WeekMeal = moveTo({ id: old?.id ?? newId(), day: slot.day, recipeId, baseId, ...(side && recipeId === baseId ? { side } : {}), ...(old?.portions ? { portions: old.portions } : {}) }, slot);
  const meals = old ? week.meals.map((m) => (m.id === old.id ? meal : m)) : [...week.meals, meal];
  let bases = !old && base.extra && !base.cooked ? setExtra(week, baseId, base.extra - servingsOf(meal, household)).bases : week.bases;
  // die bisherige Grundlage ohne Abend fällt weg – wie beim Löschen (removeMeal)
  if (old && old.baseId !== baseId) bases = bases.filter((b) => b.recipeId !== old.baseId || b.cooked || !!b.extra || meals.some((m) => m.baseId === b.recipeId));
  return { ...week, meals, bases };
}

/**
 * Vorgekochtes aus der Speisekammer auf einen Abend (damit nichts verdirbt): als schon gekochte Grundlage – nichts
 * einzukaufen, beim Essen geht es aus der Speisekammer (store: eatMeal → eatBase). Steht sie schon in der Woche: von dort.
 */
export function putPrepared(week: Week, slot: Slot, recipeId: string, household: Household, newId: () => string): Week {
  if (week.bases.some((b) => b.recipeId === recipeId)) return putMeal(week, slot, recipeId, recipeId, household, newId);
  if (mealAt(week, slot)?.done) return week;
  return putMeal({ ...week, bases: [...week.bases, { recipeId, day: slot.day, cooked: true }] }, slot, recipeId, recipeId, household, newId);
}

/**
 * Portionen eines Abends oder Mittags (Julia: Gäste) – gleich dem Haushalt = Feld weg, damit Haushalt-Änderungen weiter
 * greifen. Julia: „+1 soll Übriges aus dem Kühlschrank nehmen und nicht die Menge zum Kochen erhöhen“ – mehr nimmt
 * zuerst Kühlschrank-Portionen, erst wenn der leer ist, wird mehr gekocht; weniger legt zurück in den Kühlschrank (gekocht
 * wird gleich viel). Schon gekocht: der Kühlschrank rechnet sich aus der Speisekammer (fridgeOf), da ändert sich nichts.
 */
export function setMealPortions(week: Week, mealId: string, portions: number, household: Household): Week {
  const n = Math.max(1, Math.round(portions));
  const meal = week.meals.find((m) => m.id === mealId);
  if (!meal) return week;
  const base = week.bases.find((b) => b.recipeId === meal.baseId);
  const diff = n - servingsOf(meal, household);
  const extra = base?.extra ?? 0;
  const w = base && !base.cooked && !meal.done && diff ? setExtra(week, meal.baseId, diff > 0 ? extra - Math.min(diff, extra) : extra - diff) : week;
  return {
    ...w,
    meals: w.meals.map((m) => {
      if (m.id !== mealId) return m;
      const { portions: _old, ...rest } = m;
      return n === household.portions ? rest : { ...rest, portions: n };
    }),
  };
}

/**
 * Ein gelöschtes Rezept aus der Woche nehmen (Julia: „Heute Abend: Gelöschtes Rezept – gegessen“ stand noch da):
 * seine Abende – auch gegessene –, Abende aus ihm als Grundlage und seine Grundlage selbst. Unverändert, wenn es nicht vorkommt.
 */
export function withoutRecipe(week: Week, recipeId: string): Week {
  const meals = week.meals.filter((m) => m.recipeId !== recipeId && m.baseId !== recipeId);
  const bases = week.bases.filter((b) => b.recipeId !== recipeId);
  return meals.length === week.meals.length && bases.length === week.bases.length ? week : { ...week, meals, bases };
}

/**
 * Einen Abend rausnehmen (Julia: „simple Gerichte aus dem Wochenplan entfernen“) – Gegessenes bleibt. Die Grundlage
 * bleibt, solange noch ein Abend daraus geplant ist (ihre Portionen rechnet weekView neu); war es der letzte und gibt es
 * keine Extra-Portionen, fällt auch ihr Kochtag weg – sonst stünde „Lasagne kochen · 0 Portionen“ da.
 */
export function removeMeal(week: Week, mealId: string): Week {
  const meal = week.meals.find((m) => m.id === mealId);
  if (!meal || meal.done) return week;
  const meals = week.meals.filter((m) => m.id !== mealId);
  const keep = (b: WeekBase) => b.recipeId !== meal.baseId || b.cooked || !!b.extra || meals.some((m) => m.baseId === b.recipeId);
  return { ...week, meals, bases: week.bases.filter(keep) };
}

/** Grundlage auf einen anderen Kochtag legen – nicht nach einem ihrer Gerichte (dann bliebe es ungekocht) */
export function moveBase(week: Week, baseId: string, day: Weekday): Week {
  const order = weekOrder(week);
  const tooLate = week.meals.some((m) => m.baseId === baseId && !fits(order, { day }, slotOf(m)));
  if (tooLate || !week.cookDays.includes(day)) return week;
  return { ...week, bases: week.bases.map((b) => (b.recipeId === baseId ? { ...b, day } : b)) };
}

/**
 * Zwei Kochtage tauschen (Julia: „Sonntags- und Mittwochsgerichte schnell tauschen“): die Grundlagen wechseln den Tag,
 * ihre Abende rücken ab dem neuen Kochtag auf die nächsten freien Abende – die früher gekochte zuerst. Gerichte,
 * Bausteine und Portionen bleiben. Ist von einer der beiden schon etwas gekocht oder gegessen: unverändert.
 */
export function swapCookDays(week: Week, a: Weekday, b: Weekday, household?: Household): Week {
  const moved = week.bases.filter((x) => x.day === a || x.day === b);
  const ids = new Set(moved.map((x) => x.recipeId));
  if (a === b || !moved.length || moved.some((x) => x.cooked) || week.meals.some((m) => m.done && ids.has(m.baseId))) return week;
  const order = weekOrder(week);
  const ord = (d: Weekday) => order.indexOf(d);
  const bases = week.bases.map((x) => (ids.has(x.recipeId) ? { ...x, day: x.day === a ? b : a } : x));
  const stay = week.meals.filter((m) => !ids.has(m.baseId));
  const taken = new Set(stay.map((m) => slotKey(slotOf(m))));
  const lunchOk = (d: Weekday) => !household || lunchDaysOf(week, household).includes(d);
  const placed: WeekMeal[] = [];
  for (const base of bases.filter((x) => ids.has(x.recipeId)).sort((x, y) => ord(x.day) - ord(y.day))) {
    const r = replant(order, week.meals.filter((x) => x.baseId === base.recipeId), base, taken, lunchOk);
    placed.push(...r.placed, ...r.left); // Woche voll – dann eben doppelt, resolveClashes rückt weiter
  }
  return resolveClashes({ ...week, bases, meals: [...stay, ...placed] });
}

/**
 * Essen einer Grundlage ab ihrem (neuen) Kochtag wieder auf freie Plätze legen – Abende auf Abende, Mittage auf
 * Mittage (nur an Mittagstagen), die Reihenfolge bleibt. Was keinen Platz findet, kommt unverändert zurück (`left`).
 */
function replant(order: readonly Weekday[], own: readonly WeekMeal[], base: Pick<WeekBase, 'day' | 'cooked'>, taken: Set<string>, lunchOk: (d: Weekday) => boolean) {
  const placed: WeekMeal[] = [];
  const left: WeekMeal[] = [];
  for (const m of [...own].sort((x, y) => slotIndex(order, slotOf(x)) - slotIndex(order, slotOf(y)))) {
    const lunch = !!m.lunch;
    const day = order.find((d) => fits(order, base, { day: d, lunch }) && !taken.has(slotKey({ day: d, lunch })) && (!lunch || lunchOk(d)));
    if (day === undefined) { left.push(m); continue; }
    taken.add(slotKey({ day, lunch }));
    placed.push(moveTo(m, { day, lunch }));
  }
  return { placed, left };
}

/**
 * Gerichte einer Grundlage im Wechsel (Julia: „4 Portionen mit 2 Varianten im Wechsel geplant – besser hintereinander,
 * dann ist das Vorkochen der Extras leichter“): dieselben Tage, aber gleiche Abende (Gericht + Bausteine) nebeneinander,
 * in der Reihenfolge, in der sie zuerst vorkommen. Unverändert, wenn schon gruppiert oder etwas davon gegessen ist.
 */
export function groupMeals(week: Week, baseId: string): Week {
  const order = weekOrder(week);
  // nur die Abende – Mittage bleiben, wo Julia sie hingelegt hat
  const own = week.meals.filter((m) => m.baseId === baseId && !m.lunch).sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
  if (own.length < 3 || own.some((m) => m.done)) return week;
  const key = (m: WeekMeal) => mealKey(m.recipeId, m.side);
  const firsts = [...new Set(own.map(key))];
  const grouped = firsts.flatMap((k) => own.filter((m) => key(m) === k));
  if (grouped.every((m, i) => m === own[i])) return week;
  const days = new Map(grouped.map((m, i) => [m.id, own[i].day]));
  return { ...week, meals: week.meals.map((m) => (days.has(m.id) ? { ...m, day: days.get(m.id)! } : m)) };
}

/** Grundlagen, deren Gerichte im Wechsel liegen – für den Hinweis im Wochenplan */
export const mixedBases = (week: Week): string[] => week.bases.map((b) => b.recipeId).filter((id) => groupMeals(week, id) !== week);

/** Extra-Portionen (Vorrat) – nie unter 0 */
export function setExtra(week: Week, baseId: string, extra: number): Week {
  return { ...week, bases: week.bases.map((b) => (b.recipeId === baseId ? { ...b, extra: Math.max(0, Math.round(extra)) || undefined } : b)) };
}

/** Mittag an einem Tag diese Woche raus- oder wieder reinnehmen – ein belegter Mittag geht zurück in den Kühlschrank */
export function toggleLunch(week: Week, day: Weekday, household: Household = DEFAULT_HOUSEHOLD): Week {
  const off = new Set(week.noLunch ?? []);
  let w = week;
  if (off.has(day)) off.delete(day);
  else {
    off.add(day);
    const meal = mealAt(week, { day, lunch: true });
    if (meal && !meal.done) w = backToFridge(week, meal.id, household);
  }
  return { ...w, noLunch: [...off].sort((a, b) => a - b) };
}

/**
 * Nach dem Abgleich (zwei Geräte haben verschiedene Gerichte auf denselben Abend gelegt): pro Abend bleibt eines,
 * die anderen rücken auf den nächsten freien Abend danach – lieber verschoben als still verloren.
 */
export function resolveClashes(week: Week): Week {
  const order = weekOrder(week);
  const taken = new Set<string>();
  const moved = new Map<string, Weekday>();
  for (const m of week.meals) {
    const lunch = !!m.lunch;
    if (!taken.has(slotKey(slotOf(m)))) { taken.add(slotKey(slotOf(m))); continue; }
    // auf den nächsten freien Platz derselben Art (Abend → Abend, Mittag → Mittag)
    const free = order.slice(order.indexOf(m.day) + 1).find((d) => !taken.has(slotKey({ day: d, lunch })));
    if (free === undefined) continue; // Woche voll – dann eben zwei auf einem Platz
    taken.add(slotKey({ day: free, lunch }));
    moved.set(m.id, free);
  }
  return moved.size ? { ...week, meals: week.meals.map((m) => (moved.has(m.id) ? { ...m, day: moved.get(m.id)! } : m)) } : week;
}

/**
 * Die Woche als Plan-Einträge (Julia: „Woche ersetzt die Liste“) – so rechnen Einkaufsliste, Vorrat und Startseite
 * ohne Umbau mit: jede ungekochte Grundlage mit ihren Portionen, jedes Gericht mit den Portionen seiner offenen
 * Mittage und Abende. Ist das Gericht die Grundlage selbst (Suppe), steckt es in ihr.
 */
export function weekItems(week: Week, recipes: readonly Recipe[], household: Household = DEFAULT_HOUSEHOLD, keepsFallback?: number): { recipeId: string; servings: number; fromWeek: true }[] {
  const view = weekView(week, recipes, household, keepsFallback);
  const servings = new Map<string, number>();
  const add = (id: string, n: number) => servings.set(id, (servings.get(id) ?? 0) + n);
  for (const b of view.bases) if (!b.base.cooked && b.portions > 0) add(b.base.recipeId, b.portions);
  // schon mitgekochtes Frisches (freshCooked) ist aus dem Vorrat raus wie Gegessenes
  for (const m of week.meals) if (!m.done && !m.freshCooked && m.recipeId !== m.baseId) add(m.recipeId, servingsOf(m, household));
  return [...servings].map(([recipeId, n]) => ({ recipeId, servings: n, fromWeek: true as const }));
}

/**
 * Beilagen der offenen Mittage und Abende (Julia: „Bolognese mit Spätzle“) als Zutaten für die Einkaufsliste – je
 * Beilage zusammengezählt, mit den Portionen des Essens. Gegessenes und schon Mitgekochtes zählt nicht mehr.
 */
export function weekSideNeeds(week: Week | undefined, _recipes: readonly Recipe[], household: Household = DEFAULT_HOUSEHOLD): Ingredient[] {
  if (!week?.meals.some((m) => m.side && !m.done && !m.freshCooked)) return [];
  const portions = new Map<string, number>();
  for (const m of week.meals) {
    if (!m.side || m.done || m.freshCooked) continue;
    // je Baustein zusammengezählt (Pasta an zwei Abenden mit verschiedenem Protein = eine Pasta-Zeile)
    for (const s of sidesOf(m.side)) portions.set(s.id, (portions.get(s.id) ?? 0) + servingsOf(m, household));
  }
  return [...portions].flatMap(([id, n]) => sideIngredient(id, n, household) ?? []);
}

export interface YieldCheck {
  /** was das Rezept laut Portionen ergibt */
  yields: number;
  /** was die Woche davon isst (Abende, Mittage, Vorrat) */
  planned: number;
  /** gekocht, aber ohne Abend (Rezept ergibt mehr als geplant) – mehr einplanen ist in Ordnung, das Rezept skaliert */
  left: number;
}

/**
 * Rezept-Ertrag gegen Plan (Julia: „ich will nur nicht weniger verplanen als ich koche“ – mehr ist in Ordnung, dann
 * wird das Rezept hochgerechnet): sichtbar wird, wenn das Rezept mehr ergibt, als die Woche isst.
 */
export function yieldChecks(view: WeekView): Map<string, YieldCheck> {
  const out = new Map<string, YieldCheck>();
  for (const b of view.bases) {
    const yields = b.recipe ? currentContent(b.recipe).servings : 0;
    if (!yields || b.base.cooked) continue;
    out.set(b.base.recipeId, { yields, planned: b.portions, left: Math.max(0, yields - b.portions) });
  }
  return out;
}

export type CarbCarry ={ side: string; with?: Weekday; portions?: number; from?: Weekday };

/**
 * Zweimal Nudeln kurz hintereinander (Julia: „reicht, es an einem Tag zu kochen und aufzubewahren“): dasselbe
 * Kohlenhydrat an zwei offenen Abenden höchstens 2 Tage auseinander → am ersten für beide kochen, am zweiten aufwärmen.
 * Paarweise, damit nichts älter als 2 Tage wird. Die Einkaufsmenge bleibt gleich – es ändert sich nur, wann gekocht wird.
 */
export function carbCarry(view: WeekView, household: Household): Map<Weekday, CarbCarry> {
  const out = new Map<Weekday, CarbCarry>();
  const carbOf = (d: DayView) => (d.meal && !d.meal.meal.done && d.meal.meal.recipeId === d.meal.meal.baseId ? sidesOf(d.meal.meal.side).find((s) => s.kind === 'carb')?.id : undefined);
  view.days.forEach((d, i) => {
    const carb = carbOf(d);
    if (!carb || out.has(d.day)) return;
    const next = view.days.slice(i + 1, i + 1 + FRESH_DAYS).find((x) => !out.has(x.day) && carbOf(x) === carb);
    if (!next) return;
    out.set(d.day, { side: carb, with: next.day, portions: servingsOf(next.meal!.meal, household) });
    out.set(next.day, { side: carb, from: d.day });
  });
  return out;
}

/** Was Julia gewählt hat, aus einer Woche zurückgelesen (Grundlagen in Reihenfolge, ihre Gerichte nach Abend) */
export function choicesOf(week: Week): WeekChoice[] {
  const order = weekOrder(week);
  return week.bases.map((b) => ({
    baseId: b.recipeId,
    meals: week.meals.filter((m) => m.baseId === b.recipeId && !m.lunch).sort((x, y) => order.indexOf(x.day) - order.indexOf(y.day)).map((m) => mealKey(m.recipeId, m.side)),
  }));
}

/** Schon etwas gekocht oder gegessen? Dann lassen sich die Kochtage nicht mehr neu verteilen. */
export const weekStarted = (week: Week): boolean => week.bases.some((b) => b.cooked) || week.meals.some((m) => m.done);

/**
 * Andere Kochtage (Julia: „falls man mal an nem Tag nicht da ist“): Mashi verteilt neu – Extra-Portionen,
 * MHD-Notizen und abgewählte Mittage bleiben.
 */
export function withCookDays(week: Week, days: readonly Weekday[], newId: () => string, household: Household = DEFAULT_HOUSEHOLD): Week {
  const next = suggestWeek(days, choicesOf(week), newId);
  const order = weekOrder(next);
  // Mittage bleiben auf ihrem Platz, solange ihre Grundlage dann schon gekocht ist – sonst zurück in den Kühlschrank
  const back = new Map<string, number>();
  const lunches = week.meals.filter((m) => m.lunch).filter((m) => {
    const ok = fits(order, next.bases.find((b) => b.recipeId === m.baseId), slotOf(m));
    if (!ok) back.set(m.baseId, (back.get(m.baseId) ?? 0) + servingsOf(m, household));
    return ok;
  });
  return {
    ...next,
    bases: next.bases.map((nb) => {
      const old = week.bases.find((b) => b.recipeId === nb.recipeId);
      const extra = (old?.extra ?? 0) + (back.get(nb.recipeId) ?? 0);
      return { ...nb, ...(extra ? { extra } : {}), ...(old?.freeze ? { freeze: old.freeze } : {}), ...(old?.adds?.length ? { adds: old.adds } : {}) };
    }),
    meals: [...next.meals, ...lunches],
    ...(week.noLunch?.length ? { noLunch: week.noLunch } : {}),
  };
}

/**
 * Grundlage nachträglich in die Woche (Julia: MHD-Hähnchen gefunden → Pulled Chicken): am ersten Kochtag, ihr
 * Gericht auf den nächsten freien Abend danach. Schon dabei: unverändert.
 */
export function addBase(week: Week, baseId: string, newId: () => string, mealRecipeId = baseId): Week {
  if (week.bases.some((b) => b.recipeId === baseId)) return week;
  const first = sortCookDays(week.cookDays)[0] ?? 0;
  const order = weekOrder(week);
  const taken = new Set(week.meals.filter((m) => !m.lunch).map((m) => m.day));
  const free = order.slice(order.indexOf(first)).find((d) => !taken.has(d));
  return {
    ...week,
    bases: [...week.bases, { recipeId: baseId, day: first }],
    meals: free === undefined ? week.meals : [...week.meals, { id: newId(), day: free, recipeId: mealRecipeId, baseId }],
  };
}

/** MHD-Fund in eine Grundlage geben (nur Hinweis am Kochtag – die Menge zieht das Kochen nicht extra ab) */
export function addToBase(week: Week, baseId: string, name: string): Week {
  return { ...week, bases: week.bases.map((b) => (b.recipeId === baseId ? { ...b, adds: [...new Set([...(b.adds ?? []), name])] } : b)) };
}

// ── Topf + Kühlschrank ─────────────────────────────────────────────
// Julias Denkmodell: „Ich koche X Portionen und verteile sie.“ Was im Topf ist, wird am Kochtag gekocht; was noch keinen
// Abend hat, liegt im Kühlschrank – gespeichert als WeekBase.extra, also ohne neues Feld (alte Wochen bleiben gültig).

/** Ein Rezept im Topf: so viele Portionen werden gekocht */
export interface PotItem {
  recipeId: string;
  portions: number;
}

/** Standard-Kochtag einer neuen Woche: der bisherige erste – sonst Sonntag */
export const defaultCookDay = (week?: Week): Weekday => (week ? sortCookDays(week.cookDays)[0] : undefined) ?? 6;

/** Den Topf aus einer Woche zurücklesen: verteilte Abende plus Kühlschrank */
export function potOf(week: Week, household: Household): PotItem[] {
  return week.bases.map((b) => ({
    recipeId: b.recipeId,
    portions: week.meals.filter((m) => m.baseId === b.recipeId).reduce((n, m) => n + servingsOf(m, household), 0) + (b.extra ?? 0) + (b.freeze ?? 0),
  }));
}

/**
 * Aus dem Topf eine Woche machen: alles am Kochtag, jede Portion zuerst in den Kühlschrank. Wird eine noch nicht
 * begonnene Woche neu geplant, bleiben ihre verteilten Abende (so viele, wie die Portionen reichen, frühe zuerst) –
 * Julia muss nicht alles neu verteilen, nur weil sie eine Portion dazugenommen hat.
 */
export function potWeek(pot: readonly PotItem[], household: Household, old?: Week): Week {
  const keep = old && !weekStarted(old) ? old : undefined;
  const day = defaultCookDay(old);
  const order = keep ? weekOrder(keep) : [];
  const bases: WeekBase[] = [];
  const meals: WeekMeal[] = [];
  for (const item of pot) {
    if (bases.some((b) => b.recipeId === item.recipeId)) continue;
    const was = keep?.bases.find((b) => b.recipeId === item.recipeId);
    let room = Math.max(1, Math.round(item.portions));
    const own = (keep?.meals ?? []).filter((m) => m.baseId === item.recipeId).sort((a, b) => slotIndex(order, slotOf(a)) - slotIndex(order, slotOf(b)));
    for (const m of own) {
      const n = servingsOf(m, household);
      if (n > room) break;
      meals.push(m);
      room -= n;
    }
    // bewusst Eingefrorenes bleibt eingefroren, solange die Portionen reichen
    const freeze = Math.min(was?.freeze ?? 0, room);
    room -= freeze;
    const { extra: _old, freeze: _f, ...rest } = was ?? { recipeId: item.recipeId, day };
    bases.push({ ...rest, ...(room ? { extra: room } : {}), ...(freeze ? { freeze } : {}) });
  }
  const cookDays = sortCookDays(bases.map((b) => b.day));
  return {
    cookDays: cookDays.length ? cookDays : [day], bases, meals,
    ...(keep?.start !== undefined ? { start: keep.start } : {}),
    ...(old?.noLunch?.length ? { noLunch: old.noLunch } : {}),
  };
}

export interface FridgeView {
  base: WeekBase;
  recipe?: Recipe;
  /** Portionen ohne Abend */
  left: number;
  /** so viele Abende reichen sie – ein Kärtchen je Abend */
  cards: number;
  /** letzter Abend, an dem es noch frisch ist */
  freshUntil: Weekday;
  /** übrig, nicht einfrierbar und die freien frischen Abende reichen nicht – erst dann schlägt Mashi etwas vor */
  short: boolean;
}

/**
 * Der Kühlschrank (Julia: „gekocht am So · frisch bis Di · 2 Portionen übrig“): je Grundlage, was noch keinen Abend hat.
 * Noch nicht gekocht = die Extra-Portionen; schon gekocht = was davon in der Speisekammer steht (`stock`) ohne die offenen Abende.
 */
export function fridgeOf(week: Week, recipes: readonly Recipe[], household: Household = DEFAULT_HOUSEHOLD, keepsFallback?: number, stock?: ReadonlyMap<string, number>): FridgeView[] {
  const order = weekOrder(week);
  const taken = new Set(week.meals.filter((m) => !m.lunch).map((m) => m.day));
  return week.bases.map((base) => {
    const recipe = recipes.find((r) => r.id === base.recipeId);
    const open = week.meals.filter((m) => m.baseId === base.recipeId && !m.done).reduce((n, m) => n + servingsOf(m, household), 0);
    // bewusst Eingefrorenes (freeze) liegt nicht mehr im Kühlschrank
    const left = base.cooked ? Math.max(0, (stock?.get(base.recipeId) ?? 0) - open - (base.freeze ?? 0)) : base.extra ?? 0;
    const cards = Math.ceil(left / Math.max(1, household.portions));
    const from = order.indexOf(base.day);
    const until = Math.min(6, from + keepsOf(recipe, keepsFallback) - 1);
    const freeFresh = order.slice(from, until + 1).filter((d) => !taken.has(d)).length;
    return { base, recipe, left, cards, freshUntil: order[until], short: left > 0 && !recipe?.freezable && until < 6 && freeFresh < cards };
  });
}

/** „Zurück in den Kühlschrank“: der Abend wird frei, seine Portionen liegen wieder bei der Grundlage. Gegessenes bleibt. */
export function backToFridge(week: Week, mealId: string, household: Household): Week {
  const meal = week.meals.find((m) => m.id === mealId);
  if (!meal || meal.done) return week;
  const base = week.bases.find((b) => b.recipeId === meal.baseId);
  // schon gekocht: die Portionen stehen ohnehin in der Speisekammer
  const w = base && !base.cooked ? setExtra(week, meal.baseId, (base.extra ?? 0) + servingsOf(meal, household)) : week;
  return removeMeal(w, mealId);
}

/**
 * Kochtag einer Grundlage ändern („gekocht am So“ antippen): ihre Abende rücken ab dem neuen Kochtag auf die nächsten
 * freien Abende (Reihenfolge bleibt, wie bei swapCookDays); was keinen Abend mehr findet, wandert in den Kühlschrank.
 * Der Wochenanfang wird festgehalten, damit sich die Woche nicht mitdreht. Schon gekocht oder gegessen: unverändert.
 */
export function setCookDay(week: Week, baseId: string, day: Weekday, household: Household): Week {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base || base.cooked || base.day === day || week.meals.some((m) => m.done && m.baseId === baseId)) return week;
  const order = weekOrder(week);
  const stay = week.meals.filter((m) => m.baseId !== baseId);
  const taken = new Set(stay.map((m) => slotKey(slotOf(m))));
  const { placed, left } = replant(order, week.meals.filter((x) => x.baseId === baseId), { day }, taken, (d) => lunchDaysOf(week, household).includes(d));
  const back = left.reduce((n, m) => n + servingsOf(m, household), 0);
  const bases = week.bases.map((b) => (b.recipeId === baseId ? { ...b, day, ...(back ? { extra: (b.extra ?? 0) + back } : {}) } : b));
  // der alte Kochtag fällt weg, wenn dort nichts mehr gekocht wird
  const cookDays = sortCookDays([...week.cookDays.filter((d) => d !== base.day || bases.some((b) => b.day === d)), day]);
  return { ...week, start: order[0], cookDays, bases, meals: [...stay, ...placed] };
}

/**
 * Kühlschrank-Portionen bewusst einfrieren (Julia: „manches nicht in den Wochenplan eintragen, sondern einfrieren“):
 * sie verlassen den Kühlschrank und werden nicht mehr verplant. Noch nicht gekocht: beim Kochen gleich eingefroren
 * (cookBase); schon gekocht: das Einfrieren in der Speisekammer macht der Store.
 */
export function freezePortions(week: Week, baseId: string, n: number): Week {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base || n <= 0) return week;
  const k = base.cooked ? n : Math.min(n, base.extra ?? 0);
  if (!k) return week;
  return {
    ...week,
    bases: week.bases.map((b) => (b.recipeId === baseId
      ? { ...b, ...(base.cooked ? {} : { extra: (b.extra ?? 0) - k || undefined }), freeze: (b.freeze ?? 0) + k }
      : b)),
  };
}

/** „Doch verteilen“: bewusst Eingefrorenes wieder in den Kühlschrank (schon Gekochtes bleibt gefroren und kommt aufgetaut dran) */
export function unfreezePortions(week: Week, baseId: string): Week {
  const base = week.bases.find((b) => b.recipeId === baseId);
  if (!base?.freeze) return week;
  return {
    ...week,
    bases: week.bases.map((b) => {
      if (b.recipeId !== baseId) return b;
      const { freeze, ...rest } = b;
      return base.cooked ? rest : { ...rest, extra: (b.extra ?? 0) + (freeze ?? 0) };
    }),
  };
}

export type MhdFind =
  /** steckt schon in einem Gericht der Woche */
  | { item: PantryItem; kind: 'covered'; recipe: Recipe }
  /** passt zu einem Rezept, das noch nicht in der Woche ist */
  | { item: PantryItem; kind: 'match'; recipe: Recipe }
  /** kein Rezept kennt es – in eine Grundlage geben oder einfrieren */
  | { item: PantryItem; kind: 'free' };

/**
 * Beim Einkauf reduziert mitgenommen (MHD vom Bon oder von Hand, Julia: „falls ich zwar nen Plan habe, aber was
 * MHD finde“): frisch gekauft (letzte 3 Tage), nicht gefroren. Mashi schlägt nur vor – geändert wird erst auf Antippen.
 */
export function mhdFinds(items: readonly PantryItem[], week: Week, recipes: readonly Recipe[], table: FoodTable, now: Date): MhdFind[] {
  const since = now.getTime() - 3 * 86_400_000;
  const noted = new Set(week.bases.flatMap((b) => b.adds ?? []));
  const inWeek = new Set([...week.bases.map((b) => b.recipeId), ...week.meals.map((m) => m.recipeId)]);
  const has = (r: Recipe, key: string) => currentContent(r).ingredients.some((i) => keyOfName(i.name, table) === key);
  return items
    .filter((it) => it.reduced && !it.recipeId && !it.frozenAt && (it.amount ?? 1) > 0 && new Date(it.boughtAt ?? it.addedAt).getTime() >= since && !noted.has(it.name))
    .map((item): MhdFind => {
      const key = keyOfName(item.name, table);
      if (!key) return { item, kind: 'free' };
      const covered = recipes.find((r) => inWeek.has(r.id) && has(r, key));
      if (covered) return { item, kind: 'covered', recipe: covered };
      const match = recipes.find((r) => !r.archivedAt && !r.fromBase && !r.trial && r.status !== 'ki_entwurf' && has(r, key));
      return match ? { item, kind: 'match', recipe: match } : { item, kind: 'free' };
    });
}
