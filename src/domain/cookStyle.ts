import { sideOf, type SideKind } from './sides';
import type { Step } from './types';

/**
 * Kochstil im Baukasten (Julia: „die Kochschritte sind pro Baustein immer sehr identisch und haben nicht so die
 * Variabilität“): Würze je Richtung, mehrere Zubereitungen je Baustein, Zusammenführen (eine Pfanne, ein Blech, in der
 * Sauce, mit den Nudeln) und zum Schluss „Anrichten“. Nur Regeln und Texte – Mengen, Einkauf und Nährwerte bleiben,
 * wie sie sind (Gewürze stehen bewusst nicht auf der Einkaufsliste).
 */

export interface Spice {
  id: string;
  name: string;
  /** womit Protein und Gemüse vor dem Braten oder Rösten gewürzt werden */
  rub: string;
  /** der letzte Handgriff beim Anrichten */
  finish?: string;
}

export const SPICES: readonly Spice[] = [
  { id: 'mexikanisch', name: 'mexikanisch', rub: 'Kreuzkümmel, Paprikapulver und Salz', finish: 'Limettenspalten dazu' },
  { id: 'asiatisch', name: 'asiatisch', rub: 'Sojasauce, Ingwer und Knoblauch', finish: 'einen Spritzer Limette darüber' },
  { id: 'mediterran', name: 'mediterran', rub: 'Knoblauch, Oregano, Salz und Pfeffer', finish: 'mit etwas Olivenöl beträufeln' },
  { id: 'indisch', name: 'indisch', rub: 'Garam Masala, Kurkuma und Salz', finish: 'einen Spritzer Zitrone darüber' },
  { id: 'kraeuter', name: 'Kräuter', rub: 'Rosmarin, Thymian, Salz und Olivenöl' },
  { id: 'rauchig', name: 'rauchig', rub: 'Rauchpaprika, Salz und Pfeffer' },
];

/** bewusst ohne Würze (Chip „ohne“) */
export const NO_SPICE = 'ohne';

/** was zu welcher Richtung passt – der Chip kann es ändern (Julia: auch innerhalb einer Richtung mal anders) */
const DIRECTION_SPICE: Readonly<Record<string, string>> = {
  taco: 'mexikanisch', bowl: 'asiatisch', pasta: 'mediterran', curry: 'indisch', ofen: 'kraeuter', burger: 'rauchig',
};

export const defaultSpice = (direction?: string): string | undefined => (direction ? DIRECTION_SPICE[direction] : undefined);

/** die Würze dieses Gerichts: gewählt, sonst die der Richtung; „ohne“ = keine */
export function spiceOf(chosen: string | undefined, direction?: string): Spice | undefined {
  const id = chosen ?? defaultSpice(direction);
  return id === NO_SPICE ? undefined : SPICES.find((x) => x.id === id);
}

/** Eine Art, einen Baustein zuzubereiten (Brokkoli gedämpft, geröstet, mit den Nudeln …) */
export interface SideWay {
  id: string;
  /** kurz für den Chip */
  label: string;
  text: string;
  minutes: number;
  /** Vorschlag in diesen Richtungen (Ofengemüse → geröstet) */
  for?: readonly string[];
  /** gart in einem anderen Schritt mit: in der köchelnden Sauce bzw. im Nudelwasser – dann steht dort `joined` */
  into?: 'sauce' | 'carb';
  joined?: string;
}

/**
 * Zubereitungen je Baustein – die erste ist Mashis Standard (dieselbe wie in sides.ts). Nur Bausteine, bei denen es
 * wirklich verschiedene Wege gibt; der Rest bleibt bei seinem einen Satz.
 */
export const WAYS: Readonly<Record<string, readonly SideWay[]>> = {
  brokkoli: [
    { id: 'gedaempft', label: 'gedämpft', text: 'in Röschen dämpfen', minutes: 5 },
    { id: 'ofen', label: 'geröstet', text: 'in Röschen mit Öl im Ofen rösten', minutes: 20, for: ['ofen'] },
    { id: 'nudeln', label: 'mit den Nudeln', text: 'in Röschen die letzten 3 Min. mit den Nudeln kochen', minutes: 3, for: ['pasta'], into: 'carb', joined: 'die letzten 3 Min. die Brokkoli-Röschen mitkochen' },
    { id: 'sauce', label: 'in der Sauce', text: 'in Röschen in der Sauce garen', minutes: 6, for: ['curry'], into: 'sauce', joined: 'die Brokkoli-Röschen 6 Min. darin garen' },
  ],
  paprika: [
    { id: 'pfanne', label: 'angebraten', text: 'in Streifen schneiden, kurz anbraten', minutes: 5 },
    { id: 'ofen', label: 'geröstet', text: 'in Streifen schneiden, im Ofen rösten', minutes: 20, for: ['ofen'] },
    { id: 'roh', label: 'roh', text: 'in feine Streifen schneiden', minutes: 2 },
  ],
  zucchini: [
    { id: 'pfanne', label: 'angebraten', text: 'in Scheiben anbraten', minutes: 6 },
    { id: 'ofen', label: 'geröstet', text: 'in Stücken im Ofen rösten', minutes: 20, for: ['ofen'] },
    { id: 'sauce', label: 'in der Sauce', text: 'würfeln und in der Sauce garen', minutes: 8, into: 'sauce', joined: 'die Zucchiniwürfel 8 Min. darin garen' },
  ],
  karotten: [
    { id: 'roh', label: 'roh', text: 'raspeln oder in Stifte schneiden', minutes: 3 },
    { id: 'ofen', label: 'geröstet', text: 'in Stifte schneiden, im Ofen rösten', minutes: 25, for: ['ofen'] },
  ],
  spinat: [
    { id: 'pfanne', label: 'zusammengefallen', text: 'kurz zusammenfallen lassen', minutes: 2 },
    { id: 'roh', label: 'roh', text: 'waschen und roh dazugeben', minutes: 1, for: ['bowl'] },
    { id: 'sauce', label: 'in der Sauce', text: 'in der Sauce zusammenfallen lassen', minutes: 2, for: ['curry'], into: 'sauce', joined: 'zum Schluss den Spinat darin zusammenfallen lassen' },
  ],
  mais: [
    { id: 'pfanne', label: 'angeröstet', text: 'abtropfen lassen, kurz anrösten', minutes: 3 },
    { id: 'roh', label: 'pur', text: 'abtropfen lassen', minutes: 1 },
  ],
  haehnchen: [
    { id: 'pfanne', label: 'gebraten', text: 'in Streifen schneiden und braten', minutes: 8 },
    { id: 'ofen', label: 'im Ofen', text: 'im Ganzen im Ofen garen, dann aufschneiden', minutes: 25, for: ['ofen'] },
    { id: 'sauce', label: 'in der Sauce', text: 'würfeln, anbraten und in der Sauce fertig garen', minutes: 12, for: ['curry'], into: 'sauce', joined: 'die Hähnchenwürfel kurz anbraten und darin fertig garen' },
  ],
  tofu: [
    { id: 'pfanne', label: 'knusprig', text: 'würfeln und knusprig braten', minutes: 10 },
    { id: 'ofen', label: 'im Ofen', text: 'würfeln und im Ofen knusprig backen', minutes: 25 },
    { id: 'sauce', label: 'in der Sauce', text: 'würfeln und in der Sauce ziehen lassen', minutes: 8, for: ['curry'], into: 'sauce', joined: 'die Tofuwürfel darin ziehen lassen' },
  ],
  kichererbsen: [
    { id: 'pfanne', label: 'geröstet', text: 'abspülen und knusprig rösten', minutes: 15 },
    { id: 'ofen', label: 'im Ofen', text: 'abspülen, mit Öl im Ofen rösten', minutes: 25, for: ['ofen'] },
    { id: 'sauce', label: 'in der Sauce', text: 'abspülen und in der Sauce erwärmen', minutes: 5, for: ['curry'], into: 'sauce', joined: 'die Kichererbsen darin erwärmen' },
  ],
  kartoffeln: [
    { id: 'gekocht', label: 'gekocht', text: 'in Salzwasser kochen', minutes: 20 },
    { id: 'ofen', label: 'Ofenspalten', text: 'in Spalten schneiden, im Ofen rösten', minutes: 35, for: ['ofen'] },
  ],
  halloumi: [
    { id: 'pfanne', label: 'gebraten', text: 'in Scheiben goldbraun braten', minutes: 6 },
    { id: 'ofen', label: 'im Ofen', text: 'in Scheiben im Ofen backen', minutes: 12, for: ['ofen'] },
  ],
};

/**
 * Wie ein Schritt gart (Julia: „das Rezept checkt das“) – Ofen vor Pfanne vor Dämpfen vor Kochen („anbraten und in der
 * Sauce fertig garen“ ist Pfanne). Ohne Garart (abgießen, schneiden) gibt es nichts zu prüfen.
 */
export const METHODS: readonly (readonly [string, RegExp])[] = [
  ['ofen', /ofen|blech|backen/i],
  ['pfanne', /brat|pfanne|anr(ö|oe)st|zusammenfallen/i],
  ['dampf', /d(ä|ae)mpf/i],
  ['wasser', /koch|k(ö|oe)chel|garen|blanchier|salzwasser/i],
];
export const methodOf = (text: string): string | undefined => METHODS.find(([, re]) => re.test(text))?.[0];

/**
 * Garfamilien (Julia: Zubereitungswege für alle Bausteine, „möglichst pflegeleicht“ – die Idee aus „Mashi – neuer Chat 3“):
 * Bausteine ohne eigene Wege (WAYS) bekommen die ihrer Familie – Gnocchi knusprig, Süßkartoffel gedämpft, deine eigenen
 * (Kürbis) auch. Mashis Standard des Bausteins (sides.ts: prep) steht vorn und ersetzt den Weg seiner Garart.
 */
export type Family = 'fest' | 'zart' | 'gar' | 'zeit' | 'roh';

export const FAMILIES: readonly { id: Family; label: string }[] = [
  { id: 'fest', label: 'fest' }, { id: 'zart', label: 'zart & schnell' }, { id: 'gar', label: 'schon gar' },
  { id: 'zeit', label: 'braucht Zeit' }, { id: 'roh', label: 'roh gut' },
];

function familyWays(family: Family, name: string): SideWay[] {
  switch (family) {
    case 'fest': return [
      { id: 'ofen', label: 'geröstet', text: 'in Stücke schneiden, mit Öl im Ofen rösten', minutes: 25, for: ['ofen'] },
      { id: 'pfanne', label: 'gebraten', text: 'in Stücke schneiden und in der Pfanne braten', minutes: 12 },
      { id: 'gedaempft', label: 'gedämpft', text: 'in Stücke schneiden und dämpfen', minutes: 12 },
    ];
    case 'zart': return [
      { id: 'pfanne', label: 'gebraten', text: 'in Stücke schneiden und kurz braten', minutes: 6 },
      { id: 'ofen', label: 'im Ofen', text: 'in Stücken kurz im Ofen rösten', minutes: 15, for: ['ofen'] },
      { id: 'sauce', label: 'in der Sauce', text: 'in Stücken in der Sauce garen', minutes: 8, into: 'sauce', joined: `${name} 8 Min. darin garen` },
    ];
    case 'gar': return [
      { id: 'pfanne', label: 'knusprig', text: 'in der Pfanne knusprig braten', minutes: 8 },
      { id: 'sauce', label: 'in der Sauce', text: 'in der Sauce erwärmen', minutes: 5, into: 'sauce', joined: `${name} darin erwärmen` },
      { id: 'ofen', label: 'im Ofen', text: 'mit Öl im Ofen knusprig backen', minutes: 15, for: ['ofen'] },
    ];
    case 'zeit': return [
      { id: 'koecheln', label: 'gekocht', text: 'in Wasser weich köcheln', minutes: 20 },
      { id: 'sauce', label: 'in der Sauce', text: 'in der Sauce weich garen', minutes: 20, into: 'sauce', joined: `${name} darin weich garen` },
    ];
    case 'roh': return [
      { id: 'roh', label: 'roh', text: 'klein schneiden', minutes: 2 },
      { id: 'pfanne', label: 'angebraten', text: 'kurz anbraten', minutes: 4 },
      { id: 'ofen', label: 'geröstet', text: 'im Ofen rösten', minutes: 15, for: ['ofen'] },
    ];
  }
}

/** Chip für Mashis Standard, wenn keiner der Familie zu seiner Garart passt */
const METHOD_LABEL: Readonly<Record<string, string>> = { ofen: 'geröstet', pfanne: 'gebraten', dampf: 'gedämpft', wasser: 'gekocht' };

/**
 * Familie eines eigenen Bausteins am Namen raten (Julia: „Mashi rät, wenn es nicht kennt, fragen“) – was nicht hier
 * steht, fragt die Oberfläche nach. „grüne Bohnen“ sind frisch, Kichererbsen aus der Dose schon gar.
 */
const FAMILY_WORDS: readonly (readonly [Family, RegExp])[] = [
  ['zart', /gr(ü|ue)ne bohne|brechbohne|buschbohne/],
  ['roh', /radieschen|rucola|feldsalat|sprossen|oliven/],
  ['gar', /gnocchi|tortellini|ravioli|maultasche|kichererbse|bohne|falafel/],
  ['zeit', /linse|graupe|gulasch/],
  ['zart', /pilz|champignon|aubergine|spargel|lauch|porree|erbse|zuckerschote|fr(ü|ue)hlingszwiebel|mangold|pak ?choi|garnele|lachs|fisch|pute|steak|tempeh|seitan/],
  ['fest', /k(ü|ue)rbis|blumenkohl|rosenkohl|rote bete|sellerie|pastinake|kohlrabi|kohl|m(ö|oe)hre|r(ü|ue)be|fenchel|topinambur/],
];
export const guessFamily = (name: string): Family | undefined => FAMILY_WORDS.find(([, re]) => re.test(name.toLowerCase()))?.[0];

/** nur, was gegart wird, hat eine Familie – Saucen und Toppings nicht */
const COOKED: ReadonlySet<SideKind> = new Set(['carb', 'protein', 'veg']);

/** Die Familie eines Bausteins: deine Wahl (Household.sideFamily) → Mashis (Side.family) → bei eigenen geraten */
export const familyOf = (side: { id: string; name: string; kind: SideKind; family?: Family }, families?: Readonly<Record<string, Family>>): Family | undefined =>
  families?.[side.id] ?? side.family ?? (side.id.startsWith('eigen:') && COOKED.has(side.kind) ? guessFamily(side.name) : undefined);

/** braucht ein eigener Baustein eine Antwort? gegart, aber weder gewählt noch erkannt */
export const needsFamily = (side: { id: string; name: string; kind: SideKind }, families?: Readonly<Record<string, Family>>): boolean =>
  side.id.startsWith('eigen:') && COOKED.has(side.kind) && !familyOf(side, families);

/** die Wege der Familie – mit Mashis Standard des Bausteins vorn, an der Stelle seiner Garart */
function familyWaysOf(sideId: string, families?: Readonly<Record<string, Family>>): SideWay[] {
  const side = sideOf(sideId);
  const family = side && familyOf(side, families);
  if (!side || !family) return [];
  const ways = familyWays(family, side.name);
  const std = side.prep;
  if (!std) return ways;
  const m = methodOf(std.text);
  const i = ways.findIndex((w) => !w.into && (m ? methodOf(w.text) === m : w.id === 'roh'));
  const first: SideWay = { ...(i >= 0 ? ways[i] : { id: 'standard', label: (m && METHOD_LABEL[m]) || 'Standard' }), text: std.text, minutes: std.minutes };
  return [first, ...ways.filter((_, k) => k !== i)];
}

/** dein Standard aus den Einstellungen als Chip – er geht vor Mashis Vorschlag */
export const OWN_WAY = 'eigen';

/**
 * Woran eine Zubereitung hängt: eine Sauce, die köchelt („in der Sauce“), Pasta im Salzwasser („mit den Nudeln“) – und
 * deine Garfamilien (Household.sideFamily)
 */
export interface WayContext { direction?: string; sauceSimmers: boolean; pastaBoils: boolean; families?: Readonly<Record<string, Family>> }

/** die Wege, die bei diesem Gericht gehen – „in der Sauce“ nur, wenn eine köchelt */
export const waysOf = (sideId: string, ctx: WayContext): SideWay[] =>
  (WAYS[sideId] ?? familyWaysOf(sideId, ctx.families)).filter((w) => (w.into === 'sauce' ? ctx.sauceSimmers : w.into === 'carb' ? ctx.pastaBoils : true));

/**
 * Die Zubereitung eines Bausteins: deine Wahl am Gericht → dein Standard aus den Einstellungen (undefined – dann gilt
 * dein Text) → der Vorschlag der Richtung → Mashis Standard.
 */
export function wayOf(sideId: string, ctx: WayContext, chosen?: string, ownStandard = false): SideWay | undefined {
  const ways = waysOf(sideId, ctx);
  const picked = ways.find((w) => w.id === chosen);
  if (picked) return picked;
  if (chosen === OWN_WAY || ownStandard) return undefined;
  return ways.find((w) => !!ctx.direction && !!w.for?.includes(ctx.direction)) ?? ways[0];
}

/** Zubereitung zum Umschalten (Chips in „So geht's“) – je Baustein mit mehreren Wegen */
export interface WayOption { id: string; name: string; ways: readonly SideWay[]; chosen: string }

/** Ein Schritt im Baukasten – auch mehrere Bausteine zusammen (eine Pfanne). `fixed`: nur die werden gewürzt und zusammengeführt */
export interface StyleStep {
  /** die Chips wandern beim Zusammenführen mit – auch in der Pfanne lässt sich die Paprika noch umschalten */
  options?: WayOption[];
  ids: string[];
  kind?: SideKind;
  name: string;
  text?: string;
  minutes: number;
  /** fester Baustein mit Mashis bzw. deiner Zubereitung – nicht dein Rezept, nicht Vorgekochtes */
  fixed?: boolean;
  way?: SideWay;
  /** schon gewürzt (Pfanne, Blech) */
  seasoned?: boolean;
  /** der Abschluss „Anrichten“ */
  serving?: boolean;
  /** ein Topf, in dem anderes mitgaren kann – die Grundlage im Wochenplan, wenn sie eine Sauce ist (Bolognese) */
  pot?: boolean;
  /** dein Rezept als Baustein (Julia: „meine Kochschritte bleiben“): seine Schritte statt „nach deinem Rezept“ – craving.ts: ownSteps */
  steps?: readonly OwnStep[];
  /** nur Teile: aus welchem Rezept („Joghurt-Dip“ aus „Ofengemüse vom Blech“) */
  from?: string;
}

/** Ein Schritt aus deinem Rezept, wie er unter dem Baustein steht */
export type OwnStep = Pick<Step, 'text' | 'timerMinutes'>;

const simmers = (t?: string) => !!t && /k(ö|oe)cheln/i.test(t);
const inOven = (t?: string) => !!t && /im ofen/i.test(t);
const inSauce = (t?: string) => !!t && /in der sauce/i.test(t);
const panFried = (t?: string) => !!t && /braten/i.test(t) && !inOven(t) && !inSauce(t);
const panVeg = (t?: string) => !!t && /an(braten|r(ö|oe)sten)|zusammenfallen/i.test(t) && !inOven(t) && !inSauce(t);
const heated = (t?: string) => !!t && /braten|r(ö|oe)sten|im ofen/i.test(t) && !inSauce(t);
/** was vor dem Braten zu tun ist: „in Streifen schneiden, kurz anbraten“ → „in Streifen schneiden“ */
const panCut = (t: string) => t.replace(/,?\s*(kurz\s+)?(an(braten|r(ö|oe)sten)|zusammenfallen lassen)\s*$/i, '').trim();
/** was vor dem Ofen zu tun ist: „in Spalten schneiden, im Ofen rösten“ → „in Spalten schneiden“ */
const ovenCut = (t: string) => t.replace(/,?\s*(und\s+)?(mit öl\s+)?im ofen.*$/i, '').trim();
const named = (name: string, cut: string) => (cut ? `${name} (${cut})` : name);
/** „A, B und C“ */
export const andList = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs.at(-1)}` : xs[0] ?? '');

function merged<T extends StyleStep>(target: T, add: readonly T[], text: string, minutes: number): T {
  const options = [target, ...add].flatMap((s) => s.options ?? []);
  return { ...target, ids: [...target.ids, ...add.flatMap((a) => a.ids)], text, minutes, ...(options.length ? { options } : {}) };
}

/**
 * Zusammenführen und würzen – nur feste Bausteine, deine Rezepte bleiben, wie sie sind:
 * 1. „in der Sauce“ / „mit den Nudeln“ gart im Schritt der köchelnden Sauce bzw. der Pasta mit,
 * 2. ein Blech: was in den Ofen kommt (ab zwei), das Längste zuerst, der Rest kommt später dazu,
 * 3. eine Pfanne: angebratenes Gemüse zum gebratenen Protein (nur bei genau einem),
 * 4. die Würze an alles, was brät oder röstet und noch keine hat.
 */
export function composeSteps<T extends StyleStep>(input: readonly T[], spice?: Spice): T[] {
  let steps = [...input];
  const replace = (target: T, gone: readonly T[], next: T) => { steps = steps.filter((s) => !gone.includes(s)).map((s) => (s === target ? next : s)); };

  for (const into of ['sauce', 'carb'] as const) {
    const target = steps.find((s) => (into === 'sauce' && s.pot) || (s.fixed && s.kind === into && (into === 'sauce' ? simmers(s.text) : /salzwasser/i.test(s.text ?? ''))));
    const moving = steps.filter((s) => s.fixed && s.way?.into === into);
    if (!target || !moving.length) continue;
    const text = [target.text, ...moving.map((m) => m.way!.joined)].filter(Boolean).join('; ');
    replace(target, moving, merged(target, moving, text, Math.max(target.minutes, ...moving.map((m) => m.minutes))));
  }

  const oven = steps.filter((s) => s.fixed && s.kind !== 'sauce' && s.kind !== 'topping' && inOven(s.text))
    .sort((a, b) => b.minutes - a.minutes);
  if (oven.length >= 2) {
    const [first] = oven;
    const delay = (s: T) => first.minutes - s.minutes;
    const start = oven.filter((s) => delay(s) <= 0);
    const later = [...new Set(oven.map(delay).filter((d) => d > 0))].sort((a, b) => a - b)
      .map((d) => `nach ${d} Min. ${andList(oven.filter((s) => delay(s) === d).map((s) => named(s.name, ovenCut(s.text!))))} dazu`);
    const text = [`${andList(start.map((s) => named(s.name, ovenCut(s.text!))))}${spice ? `, mit ${spice.rub} würzen` : ''}, im Ofen rösten`, ...later].join('; ');
    replace(first, oven.slice(1), { ...merged(first, oven.slice(1), text, first.minutes), name: 'Aufs Blech', seasoned: true });
  }

  const protein = steps.filter((s) => s.fixed && s.kind === 'protein' && panFried(s.text));
  const veg = steps.filter((s) => s.fixed && s.kind === 'veg' && panVeg(s.text));
  if (protein.length === 1 && veg.length) {
    const [p] = protein;
    const longest = Math.max(...veg.map((v) => v.minutes));
    const delay = Math.max(0, p.minutes - longest);
    const vegText = andList(veg.map((v) => named(v.name, panCut(v.text!))));
    const text = `${p.text}${spice ? ` – vorher mit ${spice.rub} würzen` : ''}; ${delay > 0 ? `nach ${delay} Min. ${vegText} in dieselbe Pfanne geben` : `${vegText} gleich mit in die Pfanne`}`;
    replace(p, veg, { ...merged(p, veg, text, Math.max(p.minutes, longest)), seasoned: true });
  }

  if (!spice) return steps;
  return steps.map((s) => (s.fixed && !s.seasoned && s.text && heated(s.text) && (s.kind === 'protein' || s.kind === 'veg' || (s.kind === 'carb' && inOven(s.text)))
    ? { ...s, text: `${s.text} – vorher mit ${spice.rub} würzen`, seasoned: true }
    : s));
}

/** Was beim Anrichten ohnehin passiert („drüberstreuen“, Pesto unter die Nudeln) – dafür braucht es keinen eigenen Schritt */
export const coveredByServing = (text?: string): boolean => !!text && /^(frisch )?drüber\S*$|^unter die heißen nudeln heben$|^glatt rühren$/i.test(text.trim());

/**
 * Der Abschluss je Richtung (Julia: jedes Gericht soll wie ein Rezept enden, nicht mit „Koriander: grob zupfen“) –
 * mit deinen Bausteinen gefüllt, zum Schluss der Handgriff der Würze. Weniger als zwei Bausteine: keiner.
 */
export function servingText(direction: string | undefined, names: Partial<Record<SideKind, readonly string[]>>, spice?: Spice, opts: {
  /** die Nudeln werden heute nicht gekocht (von gestern, vorgekocht) – dann gibt es nichts abzugießen (Julia) */ warm?: boolean;
} = {}): string | undefined {
  if (Object.values(names).flat().length < 2) return undefined;
  const n = (k: SideKind) => andList(names[k] ?? []);
  const has = (k: SideKind) => !!names[k]?.length;
  const mains = andList([...(names.protein ?? []), ...(names.veg ?? [])]);
  const top = (verb: string) => (has('topping') ? `, ${verb.replace('%', n('topping'))}` : '');
  let t: string;
  switch (direction) {
    case 'taco':
      t = `${n('carb') || 'Tortillas'} mit ${mains || 'allem'} füllen${has('sauce') ? `, ${n('sauce')} darauf` : ''}${top('% darüber')}`;
      break;
    case 'bowl':
      t = `${n('carb') || 'Alles'} in Schalen verteilen${mains ? `, ${mains} nebeneinander darauflegen` : ''}${has('sauce') ? `, mit ${n('sauce')} beträufeln` : ''}${top('% darüberstreuen')}`;
      break;
    case 'pasta':
      t = opts.warm
        ? `${n('carb') || 'Nudeln'}${has('sauce') ? ` mit ${n('sauce')} vermengen${mains ? `, ${mains} unterheben` : ''}` : mains ? ` mit ${mains} mischen` : ' auf die Teller'}${top('mit % servieren')}`
        : `${n('carb') || 'Nudeln'} abgießen${has('sauce') ? ` und mit ${n('sauce')} vermengen` : ''}${mains ? `, ${mains} unterheben` : ''}${top('mit % servieren')}`;
      break;
    case 'curry':
      t = `${has('carb') ? `${n('carb')} auf die Teller, ` : ''}das Curry${mains ? ` mit ${mains}` : ''} dazu${top('mit % bestreuen')}`;
      break;
    case 'ofen':
      t = `Alles vom Blech auf die Teller${has('sauce') ? `, ${n('sauce')} als Klecks dazu` : ''}${top('mit % bestreuen')}`;
      break;
    case 'burger': {
      const layers = [
        ...(has('sauce') ? [`unten ${n('sauce')}`] : []),
        ...(has('veg') ? [`dann ${n('veg')}`] : []),
        ...(has('protein') ? [`darauf ${n('protein')}${has('topping') ? ` mit ${n('topping')}` : ''}`] : has('topping') ? [`darauf ${n('topping')}`] : []),
      ];
      t = `${n('carb') || 'Brötchen'} belegen: ${[...layers, 'Deckel drauf'].join(', ')}`;
      break;
    }
    default:
      t = `Alles auf die Teller verteilen${has('sauce') ? `, ${n('sauce')} dazu` : ''}${top('mit % bestreuen')}`;
  }
  return spice?.finish ? `${t} – ${spice.finish}` : t;
}
