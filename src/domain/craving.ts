import type { Household } from './mealplan';
import type { Pantry } from './pantry';
import { partsOf, stepPart } from './parts';
import { currentContent, totalMinutes } from './recipe';
import { SIDE_KINDS, SIDES, prepOf, sideOf, type SideKind, type SidePrep } from './sides';
import type { Recipe } from './types';

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
    id: 'taco', name: 'Taco', words: ['tacos', 'mexikanisch', 'burrito', 'quesadilla'],
    options: {
      carb: ['tortillas'],
      protein: ['hack', 'haehnchen', 'bohnen', 'tofu'],
      sauce: ['salsa', 'guacamole', 'schmand'],
      veg: ['mais', 'paprika', 'salat', 'tomaten', 'zwiebeln', 'avocado'],
      topping: ['kaese', 'koriander', 'jalapenos', 'feta'],
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
    id: 'wrap', name: 'Wrap', words: ['wraps', 'dürüm', 'rolle'],
    options: {
      carb: ['wraps'],
      protein: ['haehnchen', 'halloumi', 'kichererbsen', 'tofu'],
      sauce: ['joghurt', 'guacamole', 'salsa'],
      veg: ['salat', 'gurke', 'tomaten', 'paprika', 'zwiebeln', 'mais'],
      topping: ['feta', 'kaese', 'kraeuter', 'jalapenos'],
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
];

/** Stufen, bei denen man mehrere nimmt (Mais und Paprika) – die anderen schließen mit der ersten Wahl */
export const MULTI: ReadonlySet<SideKind> = new Set(['veg', 'topping']);

export const STAGES: readonly SideKind[] = SIDE_KINDS.map((k) => k.kind);

export interface CravingState {
  direction?: string;
  picks: Partial<Record<SideKind, string[]>>;
  /** Stufen, die erledigt sind – gewählt oder „ohne weiter“ */
  closed: SideKind[];
}

export const EMPTY_CRAVING: CravingState = { picks: {}, closed: [] };

export const directionOf = (id: string | undefined): Direction | undefined => DIRECTIONS.find((d) => d.id === id);

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
  /** nur Teile: aus welchem Rezept („Honig-Senf-Dip“ aus „Knusprige Hähnchenstreifen“) */
  from?: string;
}

/** ids für Rezepte als Baustein – „rezept:<id>“ bzw. „rezept:<id>:<Teil>“ */
export const recipeChoiceId = (recipeId: string, part?: string) => (part ? `rezept:${recipeId}:${part}` : `rezept:${recipeId}`);

/**
 * Deine Rezepte als Wahl (Julia: „wenn ich ein Rezept als Beilage tagge, soll es im Baum auftauchen“) – nur, was als
 * Baustein markiert ist. Steht davon etwas vorgekocht im Kühlschrank, zählt Mashi die Portionen mit.
 */
export function recipeChoices(recipes: readonly Recipe[], pantry?: Pick<Pantry, 'items'>): Choice[] {
  return recipes.filter((r) => !r.archivedAt && r.status !== 'ki_entwurf' && r.blocks?.length).flatMap((r) => {
    const c = currentContent(r);
    const parts = partsOf(c);
    return r.blocks!.flatMap((b): Choice[] => {
      if (b.part && !parts.includes(b.part)) return []; // Teil gibt es (noch) nicht – nichts anbieten
      const ready = (pantry?.items ?? [])
        .filter((it) => it.recipeId === r.id && (it.part ?? undefined) === b.part && !it.frozenAt)
        .reduce((n, it) => n + (it.amount ?? 0), 0);
      // ein Teil: nur seine Schritte mit Uhr zählen – das ganze Rezept dauert länger als die Sauce darin
      const minutes = b.part ? c.steps.filter((st) => stepPart(st, c) === b.part).reduce((n, st) => n + (st.timerMinutes ?? 0), 0) : totalMinutes(c);
      return [{
        id: recipeChoiceId(r.id, b.part), name: b.part ?? c.title, kind: b.kind, recipeId: r.id, directions: b.directions,
        prep: { text: 'nach deinem Rezept', minutes }, ...(ready > 0 ? { ready } : {}), ...(b.part ? { from: c.title } : {}),
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

/** Was als Nächstes dran ist: erst die Richtung, dann die Stufen der Reihe nach – undefined = fertig */
export function currentStep(s: CravingState): 'direction' | SideKind | undefined {
  if (!s.direction) return 'direction';
  return STAGES.find((k) => !s.closed.includes(k));
}

/** Richtungen zur Auswahl: die, in die alles Gewählte passt („Hähnchen“ → Taco, Bowl, Pasta …) – passt keine, alle */
export function directionsFor(s: CravingState, own: readonly Choice[] = []): Direction[] {
  const picks = allPicks(s);
  const fit = DIRECTIONS.filter((d) => picks.every((id) => fits(id, d, own)));
  return fit.length ? fit : [...DIRECTIONS];
}

/**
 * Was in einer Stufe zur Wahl steht: zuerst Vorgekochtes aus dem Kühlschrank, dann deine Rezepte, dann die festen
 * Bausteine der Richtung – bei denen rückt nach vorn, was gut zum schon Gewählten passt.
 */
export function optionsFor(s: CravingState, kind: SideKind, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep'>): Choice[] {
  const dir = directionOf(s.direction);
  const mine = own.filter((o) => o.kind === kind && (!dir || fits(o.id, dir, own)));
  const ids = dir ? dir.options[kind] : SIDES.filter((x) => x.kind === kind).map((x) => x.id);
  const picks = allPicks(s);
  const score = (id: string) => PAIRS.filter(([a, b]) => (a === id && picks.includes(b)) || (b === id && picks.includes(a))).length;
  // sort ist stabil: ohne Paar bleibt die Reihenfolge der Richtung
  const fixed = [...ids].sort((a, b) => score(b) - score(a)).flatMap((id) => choiceOf(id, [], household) ?? []);
  return [...mine.filter((o) => o.ready), ...mine.filter((o) => !o.ready), ...fixed];
}

/** Wahl in einer Stufe: einzeln (schließt die Stufe) oder bei Beilage/Topping an- und abwählen */
export function pick(s: CravingState, kind: SideKind, id: string): CravingState {
  if (!MULTI.has(kind)) return { ...s, picks: { ...s.picks, [kind]: [id] }, closed: closeStage(s.closed, kind) };
  const now = s.picks[kind] ?? [];
  return { ...s, picks: { ...s.picks, [kind]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] } };
}

const closeStage = (closed: SideKind[], kind: SideKind) => (closed.includes(kind) ? closed : [...closed, kind]);

/** „Weiter“ bzw. „Ohne … weiter“ – bei Einzel-Stufen ohne Wahl */
export const closeStep = (s: CravingState, kind: SideKind): CravingState => ({ ...s, closed: closeStage(s.closed, kind) });

/** Stufe noch einmal öffnen („Ändern“) – die Wahl bleibt stehen, damit man nur austauscht */
export const reopen = (s: CravingState, kind: SideKind): CravingState => ({ ...s, closed: s.closed.filter((k) => k !== kind) });

/**
 * Richtung wählen oder wechseln. Gewähltes, das nicht in die neue Richtung passt, bleibt (Julia hat es ja so gewollt);
 * eine Einzel-Stufe ohne Wahl wird wieder offen, damit die neue Richtung dort etwas vorschlagen kann.
 */
export function chooseDirection(s: CravingState, id: string): CravingState {
  const dir = directionOf(id);
  if (!dir) return s;
  // ein Kohlenhydrat, das die Richtung ausmacht (Taco → Tortillas), gleich setzen – solange noch keins gewählt ist
  const only = dir.options.carb.length === 1 && !s.picks.carb?.length ? dir.options.carb[0] : undefined;
  const picks = only ? { ...s.picks, carb: [only] } : s.picks;
  const closed = s.closed.filter((k) => (picks[k]?.length ?? 0) > 0 || MULTI.has(k));
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
  const fixed: Choice[] = SIDES.map((x) => ({ id: x.id, name: x.name, kind: x.kind }));
  for (const word of wordsOf(text)) {
    const dir = DIRECTIONS.find((d) => hit(word, d.name) || d.words.some((w) => hit(word, w)));
    // Richtung zuerst: „Pasta“ ist Richtung und Baustein – als Richtung bringt es Nudeln gleich mit
    if (dir) {
      if (!s.direction) s = chooseDirection(s, dir.id);
      found = true;
      continue;
    }
    // bei Gleichstand gewinnt dein Rezept (steht vorn, sort ist stabil)
    const best = [...own, ...fixed]
      .map((c) => ({ c, score: Math.max(hit(word, c.name), own.includes(c) ? 0 : hit(word, c.id)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.c;
    if (!best) continue;
    found = true;
    if (byText.has(best.kind) && !MULTI.has(best.kind)) continue;
    // „Brokkoli“ wählt vor, die Beilagen-Stufe bleibt offen – vielleicht kommt noch Paprika dazu
    if (!s.picks[best.kind]?.includes(best.id)) s = pick(s, best.kind, best.id);
    byText.add(best.kind);
  }
  if (!found) return undefined;
  // erst jetzt die Richtung anwenden, falls Bausteine nach ihr kamen – so stimmt, was offen bleibt
  return s.direction ? chooseDirection(s, s.direction) : s;
}

/** Alles Gewählte in der Reihenfolge der Stufen */
export const cravingChoices = (s: CravingState, own: readonly Choice[] = [], household?: Pick<Household, 'sidePrep'>): Choice[] =>
  allPicks(s).flatMap((id) => choiceOf(id, own, household) ?? []);

/** lesbar: „Weizentortillas, Hähnchenbrust & Guacamole“ */
export function cravingText(s: CravingState, own: readonly Choice[] = []): string {
  const names = cravingChoices(s, own).map((c) => c.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? '';
}

/** Vorschlag für den Namen: „Taco mit Hackfleisch“ – die Richtung und das Protein (oder das Erste, was es gibt) */
export function cravingTitle(s: CravingState, own: readonly Choice[] = []): string {
  const dir = directionOf(s.direction);
  const main = (s.picks.protein ?? s.picks.sauce ?? s.picks.veg ?? [])[0];
  const mainName = main ? choiceOf(main, own)?.name : undefined;
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
