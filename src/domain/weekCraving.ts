import { type Household } from './mealplan';
import type { PantryItem } from './pantry';
import { currentContent } from './recipe';
import { STAGES, EMPTY_CRAVING, allPicks, chooseDirection, closeStep, coversOf, guessKind, normDirection, ownMinutes, ownSteps, pick, readyPortions, readyPrep, recipeChoiceId, type Choice, type CravingState } from './craving';
import { comboOf, ownEntry, ownOf, ownSidesOf, prepOf, sideOf, sidesOf, styleOf, type ComboStep, type SideKind } from './sides';
import { OWN_WAY, composeSteps, coveredByServing, learnedFor, servingText, spiceOf, wayOf, waysOf, type StyleStep, type WayContext } from './cookStyle';
import type { Recipe, RecipeContent } from './types';

/**
 * Der Baukasten im Wochenplan (Rundgang 9: aus craving.ts gelöst, das über 1000 Zeilen hatte): die Grundlage als schon
 * gewählter Baustein, die gespeicherte Form eines Abends („pasta,parmesan,wuerze:…“) und „So geht's“ für einen
 * Wochenabend – mit Kochstil, Mitkochen und Aufwärmen. Die Lust-Seite selbst (Stepper, Zeitleiste, Rezept daraus)
 * bleibt in craving.ts; die Abhängigkeit geht nur in diese Richtung.
 */

/**
 * Kocht die Grundlage wie eine Sauce – köcheln, schmoren, einkochen, und am Ende geht nichts in den Ofen? Bolognese,
 * Curry, Chili, Suppe ja; Lasagne (köchelt, wird dann gebacken), Frikadellen, Ofengemüse nein.
 */
export const cooksAsSauce = (c: Pick<RecipeContent, 'steps'>): boolean =>
  c.steps.some((st) => /k(ö|oe)chel|schmor|einkoch|reduzier/i.test(st.text)) && !c.steps.some((st) => /ofen|backen|blech|gratin/i.test(st.text));

/**
 * Die Grundlage im Wochenplan als schon gewählter Baustein (Julia: „den neuen Baukasten auch im Wochenplan“): ihre
 * Markierung als ganzes Rezept – sonst geraten: was nach Sauce klingt, ist Sauce; alles andere (Bolognese, Chili,
 * Curry) ist Protein und bringt die Sauce mit.
 */
export function baseChoice(r: Recipe): Choice {
  const c = currentContent(r);
  const b = r.blocks?.find((x) => !x.part);
  const kind = b?.kind ?? guessKind(c.title);
  // unmarkiert: Sauce mit dabei nur, wenn sie wie eine kocht (Julia: „an den Schritten“) – sonst wären Lasagne und
  // Frikadellen ein Topf, in dem der Brokkoli mitgart (Rundgang)
  const also = b ? b.also ?? [] : kind !== 'sauce' && cooksAsSauce(c) ? ['sauce' as const] : [];
  return {
    id: recipeChoiceId(r.id), name: c.title, kind, recipeId: r.id,
    directions: b ? [...new Set(b.directions.map(normDirection))] : [], ...(also.length ? { also } : {}),
    ...(r.pairs?.length ? { pairs: r.pairs } : {}), ...(r.image ? { image: r.image } : {}),
  };
}

/** Stepper-Start mit der Grundlage: sie füllt ihre Stufen; passt sie nur zu einer Richtung, ist die auch gewählt */
export function baseCraving(r: Recipe): { state: CravingState; own: Choice[] } {
  const base = baseChoice(r);
  const own = [base];
  // die Stufe der Grundlage ist erledigt – auch bei Mehrfach-Stufen (Tomatensauce), sonst bliebe Sauce offen
  const s = closeStep(pick(EMPTY_CRAVING, base.kind, base.id, own), base.kind);
  return { state: base.directions?.length === 1 ? chooseDirection(s, base.directions[0], own) : s, own };
}

/**
 * Die Bausteine in der gespeicherten Form des Baukastens („pasta,parmesan“) – die Grundlage selbst steht am Abend.
 * Mit `own` auch deine Rezepte (Julia: deine Guacamole im Wochenplan, sides.ts: ownEntry), in Stufen-Reihenfolge wie
 * die festen; ohne eigene ist die Form dieselbe wie bisher (gleiche Abende bleiben gleich, mealKey).
 */
export function cravingCombo(s: CravingState, own: readonly Choice[] = [], baseId?: string): string | undefined {
  const mine = allPicks(s).flatMap((id) => {
    const c = sideOf(id) ? undefined : own.find((o) => o.id === id);
    return c?.recipeId && c.recipeId !== baseId ? [{ kind: c.kind, entry: ownEntry({ recipeId: c.recipeId, kind: c.kind, name: c.name, ...(c.from ? { part: c.name } : {}) }) }] : [];
  });
  const fixed = (comboOf(allPicks(s)) ?? '').split(',').filter(Boolean).map((id) => ({ kind: sideOf(id)!.kind, entry: id }));
  const list = [...fixed, ...mine].sort((a, b) => STAGES.indexOf(a.kind) - STAGES.indexOf(b.kind)).map((x) => x.entry);
  return list.length ? [...new Set(list)].join(',') : undefined;
}

/**
 * „So geht's“ für deine Rezepte an einem Abend der Woche: steht genug vorgekocht da, nur aus dem Kühlschrank (readyPrep,
 * `ready` – dann gibt es auch nichts mitzukochen), sonst „nach deinem Rezept“ mit seiner Dauer. Ohne Stift – geändert
 * wird am Rezept. `more`: zusätzliche Portionen für einen Eintrag (gleich für morgen mitkochen, week.ts: carbCarry).
 */
export function ownComboSteps(side: string | undefined, recipes: readonly Recipe[], items: readonly PantryItem[], portions: number, more?: { entry: string; portions: number }): ComboStep[] {
  return ownSidesOf(side).flatMap((o): ComboStep[] => {
    const r = recipes.find((x) => x.id === o.recipeId);
    if (!r) return [];
    if (readyPortions(items, o.recipeId, o.part, true) >= portions + (more?.entry === o.entry ? more.portions : 0)) {
      const p = readyPrep(o.kind);
      return [{ id: o.entry, name: o.name, text: p.text, minutes: p.minutes, source: 'rezept', ready: true }];
    }
    // deine Schritte (Weg B) – ohne zugeordnete Schritte wie bisher „nach deinem Rezept“
    const steps = ownSteps(r, o.part, recipes);
    return [{
      id: o.entry, name: o.name, minutes: ownMinutes(currentContent(r), o.part), source: 'rezept',
      ...(steps.length ? { steps } : { text: 'nach deinem Rezept' }), ...(o.part ? { from: currentContent(r).title } : {}),
    }];
  });
}

/** Ein Schritt eines Wochenabends – wie im Baukasten, dazu woher die Zubereitung kommt (Stift) und ob dein Rezept fertig dasteht */
export type WeekStep = StyleStep & { source: ComboStep['source']; ready?: true };

/**
 * „So geht's“ für einen Abend der Woche mit Kochstil (Julia: die abwechslungsreichen Schritte auch im Wochenplan): die
 * Grundlage aufwärmen – ist sie eine Sauce (Bolognese), gart „in der Sauce“ darin –, die festen Bausteine mit ihrer
 * Zubereitung (am Abend gewählt → nur bei dieser Grundlage → dein Standard → Vorschlag der Richtung → Mashis
 * Standard), zusammengeführt und gewürzt, deine Rezepte wie bisher (ownComboSteps), am Ende „Anrichten“. Richtung,
 * Würze und Wege stehen am Abend (sides.ts: styleOf); alte Abende ohne Richtung: ungewürzt, allgemein angerichtet.
 * `basePot: false` am Kochtag – da wird die Grundlage gerade erst gekocht, nicht aufgewärmt.
 *
 * `carry`: zweimal dasselbe Kohlenhydrat (week.ts: carbCarry, Tage schon als Text). `with` – heute gleich für diesen Tag
 * mitkochen, `from` – von diesem Tag aufwärmen; das gilt VOR dem Zusammenführen (Rundgang: „Pasta mit Brokkoli“ verlor
 * sonst den Hinweis, und am Folgetag hieß es „Pasta von Montag“ neben „in Salzwasser kochen“). Steht dein Rezept
 * vorgekocht da (`ready`), bleibt es bei „aus dem Kühlschrank“ – fürs Mitkochen muss es für beide reichen.
 */
export function weekCookSteps(side: string | undefined, base: Recipe, opts: {
  household?: Pick<Household, 'sidePrep' | 'sideFamily' | 'lastWays'>; recipes?: readonly Recipe[]; items?: readonly PantryItem[]; portions?: number;
  carry?: { entry: string; portions?: number; with?: string; from?: string }; basePot?: boolean;
} = {}): WeekStep[] {
  const { household, recipes = [], items = [], portions = 1, carry, basePot = true } = opts;
  const more = carry?.with !== undefined ? { entry: carry.entry, portions: carry.portions ?? 0 } : undefined;
  const reheat = carry?.from !== undefined ? carry.entry : undefined;
  const style = styleOf(side);
  const b = baseChoice(base);
  const pot = basePot && coversOf(b).includes('sauce');
  const fixed = sidesOf(side);
  const ctx: WayContext = {
    direction: style.direction,
    sauceSimmers: pot || fixed.some((x) => x.kind === 'sauce' && /k(ö|oe)cheln/i.test(prepOf(x.id, household, base)?.text ?? '')),
    // Pasta von gestern kocht nicht – dann gart auch nichts „mit den Nudeln“
    pastaBoils: fixed.some((x) => x.id === 'pasta' && x.id !== reheat),
    ...(household?.sideFamily ? { families: household.sideFamily } : {}),
    ...(household?.lastWays ? { learned: learnedFor(household.lastWays, style.direction) } : {}),
  };
  const spice = spiceOf(style.spice, style.direction);
  const sides = fixed.map((x): WeekStep => {
    const mine = base.blockPrep?.[x.id] ?? household?.sidePrep?.[x.id];
    const way = wayOf(x.id, ctx, style.ways[x.id], !!mine);
    const ways = [...(mine ? [{ id: OWN_WAY, label: 'deine', ...mine }] : []), ...waysOf(x.id, ctx)];
    const prep = way ?? prepOf(x.id, household, base);
    const source = way ? 'standard' : base.blockPrep?.[x.id] ? 'grundlage' : household?.sidePrep?.[x.id] ? 'eigen' : 'standard';
    return {
      ids: [x.id], kind: x.kind, name: x.name, text: prep?.text, minutes: prep?.minutes ?? 0, fixed: true, source,
      ...(way ? { way } : {}),
      ...(ways.length > 1 ? { options: [{ id: x.id, name: x.name, ways, chosen: way?.id ?? OWN_WAY }] } : {}),
    };
  });
  const own = ownComboSteps(side, recipes, items, portions, more)
    .map((s): WeekStep => ({
      ids: [s.id!], kind: ownOf(s.id!)?.kind, name: s.name, text: s.text, minutes: s.minutes, source: 'rezept',
      ...(s.ready ? { ready: true as const } : {}), ...(s.steps ? { steps: s.steps } : {}), ...(s.from ? { from: s.from } : {}),
    }));
  const baseStep: WeekStep = { ids: ['grundlage'], kind: b.kind, name: b.name, text: 'aufwärmen', minutes: 5, source: 'standard', ...(pot ? { pot: true } : {}) };
  const names: Partial<Record<SideKind, string[]>> = { [b.kind]: [b.name] };
  for (const x of [...fixed, ...ownSidesOf(side)]) names[x.kind] = [...(names[x.kind] ?? []), x.name];
  // Nudeln von gestern oder vorgekocht aus dem Kühlschrank: beim Anrichten nichts „abgießen“ (Julia)
  const carbs = [...sides, ...own].filter((s) => s.kind === 'carb');
  const warm = carbs.length > 0 && carbs.every((s) => s.ids[0] === reheat || s.ready);
  const serving = servingText(style.direction, names, spice, { warm });
  const hint = carry?.with !== undefined ? `gleich für ${carry.with} mitkochen` : undefined;
  const carriedName = carry && (sideOf(carry.entry)?.name ?? ownOf(carry.entry)?.name);
  const carried = (s: WeekStep): WeekStep => {
    if (!carry || s.ids[0] !== carry.entry || s.ready) return s;
    // aufwärmen: keine Zubereitung zum Umschalten, deine Schritte braucht es dann nicht
    if (carry.from !== undefined) return { ...s, text: `von ${carry.from} aufwärmen`, minutes: 3, steps: undefined, options: undefined, way: undefined };
    return hint ? { ...s, text: s.steps ? hint : `${s.text ?? 'kochen'} – ${hint}` } : s;
  };
  const steps = composeSteps([baseStep, ...sides, ...own].map(carried), spice)
    .filter((st) => !(serving && st.fixed && st.minutes <= 0 && coveredByServing(st.text)))
    // ging der Hinweis beim Zusammenführen unter (aufs Blech: „im Ofen …“ wird gekürzt), steht er mit Namen dahinter
    .map((st) => (hint && carriedName && st.ids.includes(carry!.entry) && !st.text?.includes(hint)
      ? { ...st, text: `${st.text} – ${carriedName} ${hint}` }
      : st));
  return serving ? [...steps, { ids: ['anrichten'], name: 'Anrichten', text: serving, minutes: 0, serving: true, source: 'standard' }] : steps;
}
