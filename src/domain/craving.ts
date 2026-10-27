import type { Household } from './mealplan';
import type { Pantry } from './pantry';
import { partOf, partsOf, stepPart } from './parts';
import { currentContent, totalMinutes } from './recipe';
import { SIDE_KINDS, SIDES, comboOf, prepOf, sideIngredient, sideOf, sidesOfKind, type SideKind, type SidePrep } from './sides';
import type { Ingredient, Recipe, RecipeContent, RecipeImage, Step } from './types';

/**
 * „Worauf hast du Lust?“ (Julia: „ich sag Taco, dann schlägt es mir das passende Protein vor, dann die Beilage, dann das
 * Topping“): ein Gericht Stufe für Stufe aus den Baukasten-Bausteinen, statt ein fertiges Rezept zu suchen. Woher Mashi
 * weiß, was zusammenpasst: aus einer kurzen festen Liste von Richtungen (Taco, Bowl …) – verlässlich und ohne Netz.
 * Was besonders gut zusammengeht (Hack + Käse), rückt in der nächsten Stufe nach vorn.
 */

export interface Direction {
  id: string;
  name: string;
  /** weitere Wörter, an denen Mashi die Richtung im Textfeld erkennt („Nudeln“ → Pasta) */
  words: readonly string[];
  /** Baustein-ids je Stufe – in der Reihenfolge, in der sie angeboten werden */
  options: Readonly<Record<SideKind, readonly string[]>>;
}

export const DIRECTIONS: readonly Direction[] = [
  {
    // Taco und Wrap zusammengelegt (Julia: „Tortilla, das ergibt beides“, „ich kauf immer die gleichen“) – ein Brot, gleich gewählt.
    // Die id bleibt „taco“, damit gespeicherte Markierungen gelten; alte „wrap“-Markierungen zählen mit (DIRECTION_ALIAS)
    id: 'taco', name: 'Tortilla', words: ['taco', 'tacos', 'wrap', 'wraps', 'mexikanisch', 'burrito', 'quesadilla', 'dürüm'],
    options: {
      carb: ['tortillas'],
      protein: ['hack', 'haehnchen', 'bohnen', 'halloumi', 'kichererbsen', 'tofu'],
      sauce: ['salsa', 'guacamole', 'schmand', 'joghurt'],
      veg: ['mais', 'paprika', 'salat', 'tomaten', 'gurke', 'zwiebeln', 'avocado'],
      topping: ['kaese', 'koriander', 'jalapenos', 'feta', 'kraeuter'],
    },
  },
  {
    id: 'bowl', name: 'Bowl', words: ['bowls', 'buddha', 'poke'],
    options: {
      carb: ['reis', 'quinoa', 'suesskartoffel'],
      protein: ['haehnchen', 'tofu', 'kichererbsen', 'halloumi'],
      sauce: ['erdnuss', 'joghurt', 'guacamole'],
      veg: ['gurke', 'avocado', 'karotten', 'mais', 'spinat', 'brokkoli'],
      topping: ['sesam', 'kraeuter', 'cashews', 'feta', 'ei', 'roestzwiebeln'],
    },
  },
  {
    id: 'pasta', name: 'Pasta', words: ['nudeln', 'spaghetti', 'italienisch'],
    options: {
      carb: ['pasta', 'gnocchi', 'schupfnudeln', 'spaetzle'],
      protein: ['hack', 'haehnchen', 'linsen', 'kichererbsen'],
      sauce: ['tomatensauce', 'pesto', 'sahnesauce'],
      veg: ['zucchini', 'spinat', 'brokkoli', 'tomaten', 'paprika'],
      topping: ['parmesan', 'kraeuter', 'feta', 'roestzwiebeln'],
    },
  },
  {
    id: 'curry', name: 'Curry', words: ['indisch', 'thai', 'dal'],
    options: {
      carb: ['reis', 'naan'],
      protein: ['haehnchen', 'kichererbsen', 'linsen', 'tofu'],
      sauce: ['kokoscurry', 'joghurt'],
      veg: ['spinat', 'brokkoli', 'paprika', 'zucchini', 'karotten'],
      topping: ['koriander', 'cashews', 'sesam'],
    },
  },
  {
    id: 'ofen', name: 'Ofengemüse', words: ['ofen', 'blech', 'backofen'],
    options: {
      carb: ['kartoffeln', 'suesskartoffel'],
      protein: ['halloumi', 'kichererbsen', 'haehnchen'],
      sauce: ['joghurt', 'pesto'],
      veg: ['zucchini', 'paprika', 'brokkoli', 'karotten', 'zwiebeln'],
      topping: ['feta', 'kraeuter', 'cashews'],
    },
  },
  {
    // Julia: „Burger fände ich gut“
    id: 'burger', name: 'Burger', words: ['burgers', 'cheeseburger', 'smashburger'],
    options: {
      carb: ['buns'],
      protein: ['patty', 'haehnchen', 'halloumi', 'tofu'],
      sauce: ['burgersauce', 'guacamole', 'joghurt'],
      veg: ['salat', 'tomaten', 'zwiebeln', 'gurke', 'avocado'],
      topping: ['cheddar', 'roestzwiebeln', 'jalapenos', 'ei'],
    },
  },
];

/**
 * Was besonders gut zusammengeht – rückt in der nächsten Stufe nach vorn (Julia: „je nachdem, was ich wähle, die
 * passende Beilage“). Gilt in beide Richtungen.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['hack', 'kaese'], ['hack', 'paprika'], ['hack', 'tomatensauce'], ['hack', 'jalapenos'],
  ['haehnchen', 'avocado'], ['haehnchen', 'guacamole'], ['haehnchen', 'pesto'], ['haehnchen', 'sahnesauce'], ['haehnchen', 'joghurt'],
  ['bohnen', 'mais'], ['bohnen', 'salsa'], ['bohnen', 'avocado'],
  ['tofu', 'erdnuss'], ['tofu', 'sesam'], ['tofu', 'brokkoli'],
  ['kichererbsen', 'joghurt'], ['kichererbsen', 'spinat'], ['kichererbsen', 'feta'],
  ['halloumi', 'gurke'], ['halloumi', 'joghurt'], ['halloumi', 'zucchini'],
  ['linsen', 'spinat'], ['linsen', 'tomatensauce'],
  ['tomatensauce', 'parmesan'], ['pesto', 'parmesan'], ['sahnesauce', 'spinat'],
  ['kokoscurry', 'koriander'], ['erdnuss', 'cashews'], ['erdnuss', 'karotten'],
  ['salsa', 'koriander'], ['guacamole', 'mais'], ['schmand', 'kaese'],
  ['patty', 'cheddar'], ['patty', 'burgersauce'], ['patty', 'zwiebeln'], ['haehnchen', 'salat'], ['halloumi', 'tomaten'],
];

/** Stufen, bei denen man mehrere nimmt (Mais und Paprika; Julia: Bolo und dazu ein Joghurt-Dip) – die anderen schließen mit der ersten Wahl */
export const MULTI: ReadonlySet<SideKind> = new Set(['sauce', 'veg', 'topping']);

export const STAGES: readonly SideKind[] = SIDE_KINDS.map((k) => k.kind);

export interface CravingState {
  direction?: string;
  picks: Partial<Record<SideKind, string[]>>;
  /** Stufen, die erledigt sind – gewählt oder „ohne weiter“ */
  closed: SideKind[];
}

export const EMPTY_CRAVING: CravingState = { picks: {}, closed: [] };

export const directionOf = (id: string | undefined): Direction | undefined => DIRECTIONS.find((d) => d.id === id);

/** frühere Richtungen, die in einer anderen aufgegangen sind – Wrap steckt jetzt in Tortilla („taco“) */
const DIRECTION_ALIAS: Readonly<Record<string, string>> = { wrap: 'taco' };
export const normDirection = (id: string): string => DIRECTION_ALIAS[id] ?? id;

/** Alle Stufen, die eine Wahl abdeckt – Bolognese: Protein und Sauce */
export const coversOf = (c: Pick<Choice, 'kind' | 'also'>): SideKind[] => [c.kind, ...(c.also ?? []).filter((k) => k !== c.kind)];

const allPicks = (s: CravingState): string[] => STAGES.flatMap((k) => s.picks[k] ?? []);

/** Eine Wahl im Stepper: ein fester Baustein oder eines deiner Rezepte (bzw. ein Teil davon, Recipe.blocks) */
export interface Choice {
  id: string;
  name: string;
  kind: SideKind;
  /** wie man es am Abend macht – bei Rezepten „nach deinem Rezept“ */
  prep?: SidePrep;
  recipeId?: string;
  /** nur Rezepte: in welchen Richtungen es auftaucht – leer: überall */
  directions?: readonly string[];
  /** Portionen, die schon gekocht im Kühlschrank stehen (Vorgekochtes, nicht gefroren) */
  ready?: number;
  /** nur Rezepte: ihr Bild – im Stepper stehen sie als Karussell mit Bild (Julia) */
  image?: RecipeImage;
  /** nur Teile: aus welchem Rezept („Honig-Senf-Dip“ aus „Knusprige Hähnchenstreifen“) */
  from?: string;
  /** weitere Stufen, die es mit abdeckt (Bolognese: Protein + Sauce) – gewählt sind die dann erledigt */
  also?: readonly SideKind[];
  /** was besonders gut dazu passt (Recipe.pairs) – rückt in den nächsten Stufen nach vorn */
  pairs?: readonly string[];
  /** fester Baustein, den es ersetzt (RecipeBlock.replaces) – der feste steht dann nicht zur Wahl */
  replaces?: string;
}

/** ids für Rezepte als Baustein – „rezept:<id>“ bzw. „rezept:<id>:<Teil>“ */
export const recipeChoiceId = (recipeId: string, part?: string) => (part ? `rezept:${recipeId}:${part}` : `rezept:${recipeId}`);

/**
 * Deine Rezepte als Wahl (Julia: „wenn ich ein Rezept als Beilage tagge, soll es im Baum auftauchen“) – nur, was als
 * Baustein markiert ist. Steht davon etwas vorgekocht im Kühlschrank, zählt Mashi die Portionen mit – ohne die, die
 * im Wochenplan schon für einen Abend verplant sind (`reserved`, je Grundlage).
 */
export function recipeChoices(recipes: readonly Recipe[], pantry?: Pick<Pantry, 'items'>, reserved?: ReadonlyMap<string, number>): Choice[] {
  return recipes.filter((r) => !r.archivedAt && r.status !== 'ki_entwurf' && r.blocks?.length).flatMap((r) => {
    const c = currentContent(r);
    const parts = partsOf(c);
    return r.blocks!.flatMap((b): Choice[] => {
      if (b.part && !parts.includes(b.part)) return []; // Teil gibt es (noch) nicht – nichts anbieten
      const fresh = (pantry?.items ?? [])
        .filter((it) => it.recipeId === r.id && (it.part ?? undefined) === b.part && !it.frozenAt)
        .reduce((n, it) => n + (it.amount ?? 0), 0);
      const ready = b.part ? fresh : Math.max(0, fresh - (reserved?.get(r.id) ?? 0));
      // ein Teil: nur seine Schritte mit Uhr zählen – das ganze Rezept dauert länger als die Sauce darin
      const minutes = b.part ? c.steps.filter((st) => stepPart(st, c) === b.part).reduce((n, st) => n + (st.timerMinutes ?? 0), 0) : totalMinutes(c);
      return [{
        id: recipeChoiceId(r.id, b.part), name: b.part ?? c.title, kind: b.kind, recipeId: r.id, directions: [...new Set(b.directions.map(normDirection))],
        ...(r.image ? { image: r.image } : {}),
        prep: { text: 'nach deinem Rezept', minutes }, ...(ready > 0 ? { ready } : {}), ...(b.part ? { from: c.title } : {}),
        ...(b.also?.length ? { also: b.also } : {}), ...(r.pairs?.length ? { pairs: r.pairs } : {}),
        ...(b.replaces ? { replaces: b.replaces } : {}),
      }];
    });
  });
}

/** Wahl zu einer id – feste Bausteine mit deiner Zubereitung aus den Einstellungen */
export function choiceOf(id: string, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep'>): Choice | undefined {
  const mine = own.find((o) => o.id === id);
  if (mine) return mine;
  const side = sideOf(id);
  return side ? { id: side.id, name: side.name, kind: side.kind, prep: prepOf(side.id, household) } : undefined;
}

/** passt eine Wahl in eine Richtung? Rezepte ohne Richtung passen überall */
const fits = (id: string, d: Direction, own: readonly Choice[]) => {
  const mine = own.find((o) => o.id === id);
  if (mine) return !mine.directions?.length || mine.directions.includes(d.id);
  return STAGES.some((k) => d.options[k].includes(id));
};

/**
 * Was als Nächstes dran ist: die Stufen der Reihe nach – undefined = fertig. Die Richtung ist kein eigener Schritt
 * (Julia: „es passt, wenn es einfach beginnt“): sie kommt vom Chip oder aus dem Textfeld und filtert nur im Hintergrund.
 */
export function currentStep(s: CravingState): SideKind | undefined {
  return STAGES.find((k) => !s.closed.includes(k));
}

/**
 * Was in einer Stufe zur Wahl steht: zuerst Vorgekochtes aus dem Kühlschrank, dann deine Rezepte, dann die festen
 * Bausteine der Richtung – bei denen rückt nach vorn, was gut zum schon Gewählten passt.
 */
export function optionsFor(s: CravingState, kind: SideKind, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep' | 'customSides'>, all = false): Choice[] {
  // „alle zeigen“: die Richtung filtert dann nicht – sortiert wird trotzdem nach dem, was passt
  const dir = all ? undefined : directionOf(s.direction);
  // auch in jeder weiteren Stufe, die es abdeckt – so steht die Bolognese schon beim Protein
  // schon in einer anderen Stufe gewählt (Bolognese beim Protein) steht bei der Sauce nicht noch einmal – sonst stünde sie doppelt im Gericht
  const elsewhere = new Set(STAGES.filter((k) => k !== kind).flatMap((k) => s.picks[k] ?? []));
  const mine = own.filter((o) => coversOf(o).includes(kind) && !elsewhere.has(o.id) && (!dir || fits(o.id, dir, own)));
  // eigene Bausteine (Julia: „Tomaten bei Beilage“) passen überall – sie stehen hinten; heißt einer wie ein fester
  // (Julias „Tomaten“ von früher, bevor es die festen gab), steht nur der feste da (Julia: „2 mal Tomaten“)
  const fixedNames = new Set(SIDES.filter((x) => x.kind === kind && !x.retired).map((x) => norm(x.name).trim()));
  const custom = sidesOfKind(kind, household?.customSides).filter((x) => x.id.startsWith('eigen:') && !fixedNames.has(norm(x.name).trim())).map((x) => x.id);
  const ids = [...(dir ? dir.options[kind] : SIDES.filter((x) => x.kind === kind && !x.retired).map((x) => x.id)), ...custom];
  const picks = allPicks(s);
  // Gewähltes, das notiert hat, was gut dazu passt (Bolognese → Spätzle), zählt doppelt; eigene Rezepte zählen wie der
  // feste Baustein, den sie ersetzen (deine Guacamole passt wie die feste zum Mais)
  const chosen = picks.flatMap((id) => own.find((o) => o.id === id) ?? []);
  const asFixed = picks.map((id) => own.find((o) => o.id === id)?.replaces ?? id);
  const score = (id: string) => PAIRS.filter(([a, b]) => (a === id && asFixed.includes(b)) || (b === id && asFixed.includes(a))).length
    + 2 * chosen.filter((c) => c.pairs?.includes(id)).length;
  // was dein Rezept ersetzt, steht nicht mehr zur Wahl
  const replaced = new Set(mine.flatMap((o) => o.replaces ?? []));
  // sort ist stabil: ohne Paar bleibt die Reihenfolge der Richtung
  const fixed = [...ids].filter((id) => !replaced.has(id)).sort((a, b) => score(b) - score(a)).flatMap((id) => choiceOf(id, [], household) ?? []);
  return [...mine.filter((o) => o.ready), ...mine.filter((o) => !o.ready), ...fixed];
}

/**
 * Wahl in einer Stufe: einzeln (schließt die Stufe) oder bei Beilage/Topping an- und abwählen. Deckt die Wahl weitere
 * Stufen ab (Bolognese beim Protein → auch Sauce), sind die erledigt, solange dort nichts gewählt ist; wird sie
 * ersetzt, gehen die wieder auf.
 */
export function pick(s: CravingState, kind: SideKind, id: string, own: readonly Choice[] = []): CravingState {
  const extraOf = (x: string | undefined) => {
    const c = x ? own.find((o) => o.id === x) : undefined;
    return c ? coversOf(c).filter((k) => k !== kind) : [];
  };
  let next: CravingState;
  if (!MULTI.has(kind)) {
    const prev = s.picks[kind]?.[0];
    const freed = prev && prev !== id ? extraOf(prev).filter((k) => !s.picks[k]?.length) : [];
    next = { ...s, picks: { ...s.picks, [kind]: [id] }, closed: closeStage(s.closed.filter((k) => !freed.includes(k)), kind) };
  } else {
    const now = s.picks[kind] ?? [];
    if (now.includes(id)) return { ...s, picks: { ...s.picks, [kind]: now.filter((x) => x !== id) } };
    next = { ...s, picks: { ...s.picks, [kind]: [...now, id] } };
  }
  const extra = extraOf(id).filter((k) => !next.picks[k]?.length);
  return { ...next, closed: extra.reduce(closeStage, next.closed) };
}

/** Steckt eine Stufe in etwas schon Gewähltem? („Sauce – steckt in Bolognese“) */
export function coveredBy(s: CravingState, kind: SideKind, own: readonly Choice[] = []): Choice | undefined {
  if (s.picks[kind]?.length) return undefined;
  return STAGES.filter((k) => k !== kind).flatMap((k) => s.picks[k] ?? [])
    .map((id) => own.find((o) => o.id === id))
    .find((c): c is Choice => !!c && coversOf(c).includes(kind));
}

const closeStage = (closed: SideKind[], kind: SideKind) => (closed.includes(kind) ? closed : [...closed, kind]);

/** „Weiter“ bzw. „Ohne … weiter“ – bei Einzel-Stufen ohne Wahl */
export const closeStep = (s: CravingState, kind: SideKind): CravingState => ({ ...s, closed: closeStage(s.closed, kind) });

/** Stufe noch einmal öffnen („Ändern“) – die Wahl bleibt stehen, damit man nur austauscht */
export const reopen = (s: CravingState, kind: SideKind): CravingState => ({ ...s, closed: s.closed.filter((k) => k !== kind) });

/**
 * Richtung wählen oder wechseln. Gewähltes, das nicht in die neue Richtung passt, bleibt (Julia hat es ja so gewollt);
 * eine Einzel-Stufe ohne Wahl wird wieder offen, damit die neue Richtung dort etwas vorschlagen kann – außer sie steckt
 * in etwas Gewähltem (Sauce in der Bolognese).
 */
export function chooseDirection(s: CravingState, id: string, own: readonly Choice[] = []): CravingState {
  const dir = directionOf(id);
  if (!dir) return s;
  // ein Kohlenhydrat, das die Richtung ausmacht (Burger → Brötchen), gleich setzen – solange noch keins gewählt ist
  const only = dir.options.carb.length === 1 && !s.picks.carb?.length ? dir.options.carb[0] : undefined;
  const picks = only ? { ...s.picks, carb: [only] } : s.picks;
  const closed = s.closed.filter((k) => (picks[k]?.length ?? 0) > 0 || MULTI.has(k) || !!coveredBy({ ...s, picks }, k, own));
  return { direction: id, picks, closed: only ? closeStage(closed, 'carb') : closed };
}

/** fürs Vergleichen: klein, ohne Umlaute und Satzzeichen („Hähnchen!“ → „haehnchen“) */
const norm = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ');
const wordsOf = (t: string) => norm(t).split(/\s+/).filter((w) => w.length >= 3);

/**
 * Wie gut trifft ein eingetipptes Wort einen Namen? 0 = gar nicht, 1 = genau. „Hähnchen“ trifft „Hähnchenbrust“
 * (9 von 14 Buchstaben) besser als „Hähnchenstreifen“ – so gewinnt das Genauere, „Tacos“ trifft „Taco“.
 */
const hit = (word: string, name: string) => Math.max(0, ...wordsOf(name).map((n) =>
  n.startsWith(word) ? word.length / n.length : word.startsWith(n) ? n.length / word.length : 0));

/**
 * Das Textfeld verstehen (Julia: „ich darf mit allem anfangen“): „Taco“ → Richtung, „Hähnchen“ → Protein,
 * „Pasta mit Brokkoli“ → beides, „Hähnchenstreifen“ → dein Rezept. Jedes Wort zählt einzeln; Füllwörter („mit“,
 * „und“) treffen nichts. undefined = Mashi kennt nichts davon.
 */
export function understand(text: string, own: readonly Choice[] = []): CravingState | undefined {
  let s: CravingState = EMPTY_CRAVING;
  let found = false;
  // Stufen, die das Getippte schon gefüllt hat – „knusprige Hähnchenstreifen“ soll nicht zusätzlich Hähnchenbrust wählen
  const byText = new Set<SideKind>();
  const replaced = new Set(own.flatMap((o) => o.replaces ?? []));
  const fixed: Choice[] = SIDES.filter((x) => !x.retired && !replaced.has(x.id)).map((x) => ({ id: x.id, name: x.name, kind: x.kind }));
  // dein Rezept, das einen festen Baustein ersetzt, hört auch auf dessen Namen („Guacamole“ → deine „Avocado-Creme“)
  const alias = (c: Choice) => (c.replaces ? sideOf(c.replaces)?.name ?? '' : '');
  for (const word of wordsOf(text)) {
    const dir = DIRECTIONS.find((d) => hit(word, d.name) || d.words.some((w) => hit(word, w)));
    // Richtung zuerst. Ist das Wort genau ein Baustein der Richtung („Wraps“, „Pasta“), ist der auch gleich gewählt
    if (dir) {
      if (!s.direction) s = chooseDirection(s, dir.id, own);
      const same = SIDES.find((x) => dir.options[x.kind].includes(x.id) && hit(word, x.name) === 1);
      if (same && !s.picks[same.kind]?.length) s = pick(s, same.kind, same.id, own);
      found = true;
      continue;
    }
    // bei Gleichstand gewinnt dein Rezept (steht vorn, sort ist stabil)
    const best = [...own, ...fixed]
      .map((c) => ({ c, score: Math.max(hit(word, c.name), own.includes(c) ? hit(word, alias(c)) : hit(word, c.id)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.c;
    if (!best) continue;
    found = true;
    if (byText.has(best.kind) && !MULTI.has(best.kind)) continue;
    // „Brokkoli“ wählt vor, die Beilagen-Stufe bleibt offen – vielleicht kommt noch Paprika dazu
    if (!s.picks[best.kind]?.includes(best.id)) s = pick(s, best.kind, best.id, own);
    byText.add(best.kind);
  }
  if (!found) return undefined;
  // erst jetzt die Richtung anwenden, falls Bausteine nach ihr kamen – so stimmt, was offen bleibt
  return s.direction ? chooseDirection(s, s.direction, own) : s;
}

/** Alles Gewählte in der Reihenfolge der Stufen */
export const cravingChoices = (s: CravingState, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep'>): Choice[] =>
  allPicks(s).flatMap((id) => choiceOf(id, own, household) ?? []);

/** lesbar: „Weizentortillas, Hähnchenbrust & Guacamole“ */
export function cravingText(s: CravingState, own: readonly Choice[] = []): string {
  const names = cravingChoices(s, own).map((c) => c.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? '';
}

/**
 * Vorschlag für den Namen: „Taco mit Hackfleisch“ – die Richtung und das Protein (oder das Erste, was es gibt). Ist es
 * dein Rezept, heißt es „Knusprige Hähnchenstreifen als Taco“: „Taco mit Knusprige …“ klang falsch (Julia), und Rezeptnamen
 * lassen sich nicht zuverlässig beugen.
 */
export function cravingTitle(s: CravingState, own: readonly Choice[] = []): string {
  const dir = directionOf(s.direction);
  const main = (s.picks.protein ?? s.picks.sauce ?? s.picks.veg ?? [])[0];
  const choice = main ? choiceOf(main, own) : undefined;
  const mainName = choice?.name;
  if (dir && choice?.recipeId) return `${choice.name} als ${dir.name}`;
  if (dir && mainName) return `${dir.name} mit ${mainName}`;
  return dir?.name ?? mainName ?? 'Dein Gericht';
}

/**
 * „So geht's“: das Längste zuerst, damit alles gleichzeitig fertig ist (wie comboSteps beim Baukasten-Abend).
 * Vorgekochtes wird nur aufgewärmt (5 Min.).
 */
export function cravingSteps(s: CravingState, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep'>): { id: string; name: string; text?: string; minutes: number }[] {
  return cravingChoices(s, own, household)
    .map((c) => (c.ready ? { id: c.id, name: c.name, text: 'aus dem Kühlschrank aufwärmen', minutes: 5 } : { id: c.id, name: c.name, text: c.prep?.text, minutes: c.prep?.minutes ?? 0 }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Stufe vorschlagen, wenn ein Rezept oder Teil zum Baustein wird – am Namen („Honig-Senf-Dip“ → Sauce). Nur ein
 * Vorschlag: Julia tippt die richtige Stufe an, wenn er nicht passt. Sonst Protein (das Häufigste: Hähnchenstreifen).
 */
export function guessKind(name: string): SideKind {
  const n = norm(name);
  if (/sauce|sosse|dip|salsa|pesto|creme|dressing|guacamole|hummus|mayo|aioli|chutney/.test(n)) return 'sauce';
  if (/reis|nudel|pasta|kartoffel|brot|tortilla|wrap|couscous|bulgur|quinoa|fladen|spaetzle|gnocchi/.test(n)) return 'carb';
  if (/topping|crunch|kerne|nuesse|crumble|krokant|streusel/.test(n)) return 'topping';
  if (/salat|gemuese|kohl|slaw|pickles|eingelegt/.test(n)) return 'veg';
  return 'protein';
}

/**
 * Aus dem Zusammengeklickten ein Rezept machen (Julia: „im Wochenplan oder spontan zum Kochen, kann dann als Rezept
 * gespeichert werden“) – damit Kochmodus, Einkaufsliste und Vorrat ohne Sonderweg damit rechnen:
 * - feste Bausteine werden Zutaten (Menge pro Portion aus den Einstellungen) mit ihrer Zubereitung als Schritt,
 * - ein ganzes Rezept wird eine verknüpfte Zutat in Portionen (wie eine Grundlage – Vorgekochtes deckt sie),
 * - ein Teil bringt seine Zutaten und Schritte mit (umgerechnet auf die Portionen).
 * Schritte: das Längste zuerst, damit alles gleichzeitig fertig ist.
 */
export function cravingContent(s: CravingState, opts: {
  own?: readonly Choice[]; recipes?: readonly Recipe[]; household?: Pick<Household, 'sides' | 'sidePrep'>;
  servings: number; title: string; newId: () => string;
}): RecipeContent {
  const { own = [], recipes = [], household, servings, newId } = opts;
  const ingredients: Ingredient[] = [];
  const steps: { minutes: number; list: Step[] }[] = [];
  for (const c of cravingChoices(s, own, household)) {
    const recipe = c.recipeId ? recipes.find((r) => r.id === c.recipeId) : undefined;
    if (recipe && c.from) {
      // ein Teil („Testdip“): Zutaten und Schritte übernehmen, auf die Portionen umgerechnet
      const rc = currentContent(recipe);
      const part = c.name;
      const f = servings / (rc.servings || 1);
      for (const i of rc.ingredients.filter((x) => partOf(x) === part)) ingredients.push({ ...i, id: newId(), part, ...(i.amount != null ? { amount: Math.round(i.amount * f * 10) / 10 } : {}) });
      const partSteps = rc.steps.filter((st) => stepPart(st, rc) === part).map((st) => ({ id: newId(), text: st.text, part, ...(st.timerMinutes ? { timerMinutes: st.timerMinutes } : {}) }));
      steps.push({ minutes: c.prep?.minutes ?? 0, list: partSteps });
    } else if (recipe) {
      ingredients.push({ id: newId(), name: c.name, amount: servings, unit: 'Portion', recipeId: recipe.id });
      const minutes = c.ready ? 5 : c.prep?.minutes ?? 0;
      steps.push({ minutes, list: [{ id: newId(), text: c.ready ? `${c.name} aus dem Kühlschrank aufwärmen` : `${c.name} nach deinem Rezept zubereiten`, ...(minutes ? { timerMinutes: minutes } : {}) }] });
    } else {
      const ing = sideIngredient(c.id, servings, household);
      if (ing) ingredients.push({ ...ing, id: newId() });
      const minutes = c.prep?.minutes ?? 0;
      steps.push({ minutes, list: [{ id: newId(), text: c.prep?.text ? `${c.name}: ${c.prep.text}` : c.name, ...(minutes ? { timerMinutes: minutes } : {}) }] });
    }
  }
  const ordered = [...steps].sort((a, b) => b.minutes - a.minutes);
  return {
    title: opts.title.trim() || cravingTitle(s, own), description: cravingText(s, own), servings,
    prepMinutes: 0, cookMinutes: Math.max(0, ...steps.map((x) => x.minutes)), difficulty: 1,
    ingredients, steps: ordered.flatMap((x) => x.list).length ? ordered.flatMap((x) => x.list) : [{ id: newId(), text: '' }],
    categories: [], tags: directionOf(s.direction) ? [directionOf(s.direction)!.name] : [], devices: [],
  };
}

/**
 * Zu welchem Rezept passt ein Probiergericht als Variante? (Julia: „als Variante eines Rezepts speichern“) – vorn, was
 * dieselbe Grundlage nutzt (die Bolognese selbst oder ein Gericht daraus), dann gleiche Zutaten und Wörter im Titel.
 * Nur Kochbuch-Rezepte: keine anderen Probiergerichte, nichts aus dem Archiv. Höchstens `max`.
 */
export function variantTargets(trial: Recipe, recipes: readonly Recipe[], max = 5): Recipe[] {
  const c = currentContent(trial);
  const bases = new Set(c.ingredients.flatMap((i) => i.recipeId ?? []));
  const names = new Set(c.ingredients.map((i) => norm(i.name).trim()));
  const words = new Set(wordsOf(c.title));
  const score = (r: Recipe) => {
    const rc = currentContent(r);
    return (bases.has(r.id) || (r.fromBase && bases.has(r.fromBase)) || rc.ingredients.some((i) => i.recipeId && bases.has(i.recipeId)) ? 3 : 0)
      + rc.ingredients.filter((i) => names.has(norm(i.name).trim())).length
      + 2 * wordsOf(rc.title).filter((w) => words.has(w)).length;
  };
  return recipes
    .filter((r) => r.id !== trial.id && !r.trial && !r.archivedAt)
    .map((r) => ({ r, n: score(r) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.r);
}

/**
 * Probiergerichte, die liegen geblieben sind: nie gekocht, nicht (mehr) im Plan und älter als eine Woche – die räumt
 * Mashi beim Start weg, damit sich keine unsichtbaren Rezepte sammeln.
 */
export function staleTrials(recipes: readonly Recipe[], plannedIds: ReadonlySet<string>, now: Date): string[] {
  const week = 7 * 24 * 60 * 60 * 1000;
  return recipes
    .filter((r) => r.trial && !r.lastCookedAt && !plannedIds.has(r.id) && now.getTime() - new Date(r.createdAt).getTime() > week)
    .map((r) => r.id);
}

/**
 * „Passt dazu aus deinem Kochbuch“ (Julia: „die Möglichkeit, sich von Rezepten inspirieren zu lassen“): fertige
 * Rezepte, die zur bisherigen Auswahl passen. Jeder gewählte Baustein, der als Zutat drin ist oder im Titel steht,
 * zählt einen Punkt (gleiches Lebensmittel über keyOfName, sonst am Namen: „Hähnchenbrust“ trifft „Hähnchenbrustfilet“),
 * die Richtung im Titel oder in den Stichworten („Bowl“, „Curry“) einen. Bei bis zu zwei Angaben reicht ein Punkt
 * („Pasta mit Pesto“ → die Avocado-Pasta), ab drei braucht es zwei; mehr Punkte, Favoriten und gut Bewertetes zuerst.
 */
export function matchingRecipes(s: CravingState, opts: {
  recipes: readonly Recipe[]; own?: readonly Choice[]; keyOf?: (name: string) => string | undefined; limit?: number;
}): Recipe[] {
  const { recipes, own = [], keyOf = () => undefined, limit = 4 } = opts;
  const dir = directionOf(s.direction);
  const picks = cravingChoices(s, own);
  // „Pasta“ als Richtung und als Nudel ist eine Angabe, nicht zwei
  const sameAsDir = (c: Choice) => !!dir && wordsOf(c.name).some((w) => wordsOf(dir.name).includes(w));
  const signals = picks.filter((c) => !sameAsDir(c)).length + (dir ? 1 : 0);
  if (!signals) return [];
  const used = new Set(picks.flatMap((c) => c.recipeId ?? []));
  const rated = (r: Recipe) => [...r.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.rating ?? 0;
  return recipes
    .filter((r) => !r.archivedAt && !r.trial && !r.fromBase && r.status !== 'ki_entwurf' && !used.has(r.id))
    .map((r) => {
      const c = currentContent(r);
      const ingredients = c.ingredients.map((i) => ({ key: keyOf(i.name), words: wordsOf(i.name), recipeId: i.recipeId }));
      const has = (pick: Choice) => ingredients.some((i) => (pick.recipeId && i.recipeId === pick.recipeId)
        || (!pick.recipeId && ((!!i.key && i.key === keyOf(pick.name)) || wordsOf(pick.name).some((w) => i.words.some((iw) => iw.startsWith(w))))));
      const text = [c.title, ...c.tags].join(' ');
      // auch in zusammengesetzten Wörtern („Hähnchencurry“, „Buddhabowl“) – ab 4 Buchstaben, sonst steckt „Dal“ überall drin
      const dirWords = [dir?.name ?? '', ...(dir?.words ?? [])].flatMap(wordsOf);
      const dirHit = !!dir && wordsOf(text).some((t) => dirWords.some((w) => hit(t, w) > 0 || (w.length >= 4 && t.includes(w))));
      const inTitle = (pick: Choice) => !pick.recipeId && wordsOf(pick.name).some((w) => wordsOf(c.title).some((t) => t.includes(w)));
      return { r, score: picks.filter((pk) => has(pk) || inTitle(pk)).length + (dirHit ? 1 : 0) };
    })
    .filter((x) => x.score >= (signals >= 3 ? 2 : 1))
    .sort((a, b) => b.score - a.score || Number(b.r.favorite) - Number(a.r.favorite) || rated(b.r) - rated(a.r))
    .slice(0, limit)
    .map((x) => x.r);
}

/**
 * Die Grundlage im Wochenplan als schon gewählter Baustein (Julia: „den neuen Baukasten auch im Wochenplan“): ihre
 * Markierung als ganzes Rezept – sonst geraten: was nach Sauce klingt, ist Sauce; alles andere (Bolognese, Chili,
 * Curry) ist Protein und bringt die Sauce mit.
 */
export function baseChoice(r: Recipe): Choice {
  const c = currentContent(r);
  const b = r.blocks?.find((x) => !x.part);
  const kind = b?.kind ?? guessKind(c.title);
  const also = b ? b.also ?? [] : kind === 'protein' ? ['sauce' as const] : [];
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

/** Die festen Bausteine in der gespeicherten Form des Baukastens („pasta,parmesan“) – die Grundlage selbst steht am Abend */
export const cravingCombo = (s: CravingState): string | undefined => comboOf(allPicks(s));
