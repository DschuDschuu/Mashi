import type { Household } from './mealplan';
import type { Family } from './cookStyle';
import type { Ingredient, Step } from './types';

/**
 * Baukasten für die Vorkoch-Woche (Julia: „+ Kohlenhydrat, + Protein, + Beilage, + Topping“): Bausteine, die frisch zur
 * Grundlage dazukommen – „Kürbissauce mit Pasta, Hähnchen & Parmesan“ ohne eigenes Rezept. Bewusst eine kurze feste
 * Liste – Mix & Match hatte dafür Mini-Rezepte („Reis = 100 g Reis“), das war eine zweite Welt neben dem Kochbuch.
 * Dieselben Bausteine nutzt „Worauf hast du Lust?“ (craving.ts) – dafür kam die Stufe Sauce dazu (Julia: Guacamole zum Taco).
 */
export type SideKind = 'carb' | 'protein' | 'sauce' | 'veg' | 'topping';

export interface Side {
  id: string;
  name: string;
  kind: SideKind;
  /** Menge pro Portion – roh bzw. so, wie es im Laden liegt (frische Spätzle aus dem Kühlregal); in `unit` */
  grams: number;
  unit?: 'g' | 'Stück';
  /** wie man ihn am Abend zubereitet (Julia: „woher weiß ich, wie ich das zubereite?“) – eigene Bausteine haben keinen */
  prep?: SidePrep;
  /** nicht mehr angeboten, aber für gespeicherte Abende noch bekannt (Wraps → Tortillas, Julia: „ich kauf immer die gleichen“) */
  retired?: boolean;
  /**
   * Was du dafür kaufst, wie es in der Lebensmitteltabelle heißt (Julia: „Guacamole“ über die Avocado) – für Nährwerte,
   * Einkaufsliste, Abbuchen und Vorrats-Punkte. Fehlt: der Name. Im Teller und in „So geht's“ bleibt der Name.
   */
  food?: string;
  /** Garfamilie (cookStyle.ts) – nur, wo es keine eigenen Wege (WAYS) gibt: bringt die Zubereitungen zum Umschalten */
  family?: Family;
}

/** Zubereitung eines Bausteins: kurzer Satz + Minuten (0 = nur drüber/dazu, kommt zum Schluss) */
export interface SidePrep {
  text: string;
  minutes: number;
}

export const SIDE_KINDS: readonly { kind: SideKind; label: string }[] = [
  { kind: 'carb', label: 'Kohlenhydrat' },
  { kind: 'protein', label: 'Protein' },
  { kind: 'sauce', label: 'Sauce' },
  // „Gemüse“, nicht „Beilage“ (Julia): Beilagen sind im Deutschen gerade Reis, Nudeln, Kartoffeln – die Stufe Kohlenhydrat
  { kind: 'veg', label: 'Gemüse' },
  { kind: 'topping', label: 'Topping' },
];

export const SIDES: readonly Side[] = [
  { id: 'pasta', name: 'Pasta', kind: 'carb', grams: 100, prep: { text: 'in Salzwasser kochen', minutes: 10 } },
  { id: 'reis', name: 'Reis', kind: 'carb', grams: 75, prep: { text: 'mit doppelter Menge Wasser köcheln', minutes: 15 } },
  { id: 'schupfnudeln', name: 'Schupfnudeln', kind: 'carb', grams: 250, prep: { text: 'in der Pfanne goldbraun braten', minutes: 8 }, family: 'gar' },
  { id: 'spaetzle', name: 'Spätzle', kind: 'carb', grams: 250, prep: { text: 'in der Pfanne erhitzen', minutes: 5 }, family: 'gar' },
  { id: 'gnocchi', name: 'Gnocchi', kind: 'carb', grams: 250, prep: { text: 'in Salzwasser garen, bis sie oben schwimmen', minutes: 4 }, family: 'gar' },
  { id: 'kartoffeln', name: 'Kartoffeln', kind: 'carb', grams: 300, prep: { text: 'in Salzwasser kochen', minutes: 20 } },
  { id: 'buns', name: 'Burgerbrötchen', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'aufschneiden und kurz anrösten', minutes: 2 } },
  { id: 'tortillas', name: 'Tortillas', kind: 'carb', grams: 2, unit: 'Stück', prep: { text: 'in der Pfanne kurz erwärmen', minutes: 2 } },
  { id: 'wraps', name: 'Wraps', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'in der Pfanne kurz erwärmen', minutes: 2 }, retired: true },
  { id: 'naan', name: 'Naan', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'im Ofen aufbacken', minutes: 5 } },
  { id: 'quinoa', name: 'Quinoa', kind: 'carb', grams: 60, prep: { text: 'mit doppelter Menge Wasser köcheln', minutes: 15 } },
  { id: 'suesskartoffel', name: 'Süßkartoffel', kind: 'carb', grams: 250, prep: { text: 'würfeln und im Ofen rösten', minutes: 25 }, family: 'fest' },
  { id: 'haehnchen', name: 'Hähnchenbrust', kind: 'protein', grams: 125, prep: { text: 'in Streifen schneiden und braten', minutes: 8 } },
  { id: 'hack', name: 'Hackfleisch', kind: 'protein', grams: 125, prep: { text: 'krümelig anbraten', minutes: 8 } },
  { id: 'tofu', name: 'Tofu', kind: 'protein', grams: 100, prep: { text: 'würfeln und knusprig braten', minutes: 10 } },
  { id: 'linsen', name: 'Linsen', kind: 'protein', grams: 60, prep: { text: 'in Wasser weich kochen', minutes: 20 }, family: 'zeit' },
  { id: 'bohnen', name: 'Schwarze Bohnen', kind: 'protein', grams: 120, prep: { text: 'abspülen, mit Kreuzkümmel erhitzen', minutes: 5 }, family: 'gar' },
  { id: 'kichererbsen', name: 'Kichererbsen', kind: 'protein', grams: 120, prep: { text: 'abspülen und knusprig rösten', minutes: 15 } },
  { id: 'halloumi', name: 'Halloumi', kind: 'protein', grams: 75, prep: { text: 'in Scheiben goldbraun braten', minutes: 6 } },
  { id: 'patty', name: 'Hack-Patty', kind: 'protein', grams: 150, food: 'Hackfleisch', prep: { text: 'aus Hack flach formen, je Seite 3–4 Min. braten', minutes: 8 } },
  // Saucen über ihre Hauptzutat – so, wie „So geht's“ sie macht (Knoblauch, Limette, Salz fallen kaum ins Gewicht)
  { id: 'tomatensauce', name: 'Tomatensauce', kind: 'sauce', grams: 125, food: 'Passierte Tomaten', prep: { text: 'passierte Tomaten mit Knoblauch einköcheln', minutes: 10 } },
  { id: 'pesto', name: 'Pesto', kind: 'sauce', grams: 30, prep: { text: 'unter die heißen Nudeln heben', minutes: 0 } },
  { id: 'sahnesauce', name: 'Sahnesauce', kind: 'sauce', grams: 75, food: 'Sahne', prep: { text: 'Sahne mit etwas Brühe einköcheln', minutes: 5 } },
  { id: 'salsa', name: 'Tomatensalsa', kind: 'sauce', grams: 60, food: 'Tomaten', prep: { text: 'Tomaten und Zwiebel würfeln, mit Limette mischen', minutes: 5 } },
  { id: 'guacamole', name: 'Guacamole', kind: 'sauce', grams: 60, food: 'Avocado', prep: { text: 'Avocado zerdrücken, mit Limette und Salz abschmecken', minutes: 5 } },
  { id: 'schmand', name: 'Schmand', kind: 'sauce', grams: 40, prep: { text: 'glatt rühren', minutes: 0 } },
  { id: 'joghurt', name: 'Joghurt-Dip', kind: 'sauce', grams: 50, food: 'Joghurt', prep: { text: 'Joghurt mit Knoblauch und Salz verrühren', minutes: 3 } },
  { id: 'erdnuss', name: 'Erdnusssauce', kind: 'sauce', grams: 40, prep: { text: 'Erdnussmus mit Sojasauce, Limette und Wasser glatt rühren', minutes: 3 } },
  { id: 'kokoscurry', name: 'Kokos-Currysauce', kind: 'sauce', grams: 150, food: 'Kokosmilch', prep: { text: 'Currypaste anrösten, Kokosmilch dazu, köcheln', minutes: 10 } },
  { id: 'burgersauce', name: 'Burgersauce', kind: 'sauce', grams: 30, prep: { text: 'Mayo, Ketchup und etwas Gurkenwasser verrühren', minutes: 2 } },
  { id: 'brokkoli', name: 'Brokkoli', kind: 'veg', grams: 150, prep: { text: 'in Röschen dämpfen', minutes: 5 } },
  { id: 'salat', name: 'Salat', kind: 'veg', grams: 50, prep: { text: 'waschen und anmachen', minutes: 5 } },
  { id: 'paprika', name: 'Paprika', kind: 'veg', grams: 100, prep: { text: 'in Streifen schneiden, kurz anbraten', minutes: 5 } },
  { id: 'zucchini', name: 'Zucchini', kind: 'veg', grams: 150, prep: { text: 'in Scheiben anbraten', minutes: 6 } },
  { id: 'spinat', name: 'Spinat', kind: 'veg', grams: 100, prep: { text: 'kurz zusammenfallen lassen', minutes: 2 } },
  { id: 'mais', name: 'Mais', kind: 'veg', grams: 75, prep: { text: 'abtropfen lassen, kurz anrösten', minutes: 3 } },
  { id: 'tomaten', name: 'Tomaten', kind: 'veg', grams: 100, prep: { text: 'würfeln', minutes: 2 }, family: 'roh' },
  { id: 'zwiebeln', name: 'Rote Zwiebeln', kind: 'veg', grams: 30, prep: { text: 'in feine Ringe schneiden', minutes: 2 }, family: 'roh' },
  { id: 'avocado', name: 'Avocado', kind: 'veg', grams: 75, prep: { text: 'in Scheiben schneiden', minutes: 2 } },
  { id: 'gurke', name: 'Gurke', kind: 'veg', grams: 75, prep: { text: 'in Scheiben schneiden', minutes: 2 } },
  { id: 'karotten', name: 'Karotten', kind: 'veg', grams: 100, prep: { text: 'raspeln oder in Stifte schneiden', minutes: 3 } },
  { id: 'parmesan', name: 'Parmesan', kind: 'topping', grams: 15, prep: { text: 'frisch drüberreiben', minutes: 0 } },
  { id: 'feta', name: 'Feta', kind: 'topping', grams: 40, prep: { text: 'drüberbröseln', minutes: 0 } },
  { id: 'kraeuter', name: 'Frische Kräuter', kind: 'topping', grams: 5, prep: { text: 'hacken und drüberstreuen', minutes: 0 } },
  { id: 'sesam', name: 'Sesam', kind: 'topping', grams: 5, prep: { text: 'ohne Fett kurz rösten', minutes: 2 } },
  { id: 'roestzwiebeln', name: 'Röstzwiebeln', kind: 'topping', grams: 10, prep: { text: 'drüberstreuen', minutes: 0 } },
  { id: 'ei', name: 'Ei', kind: 'topping', grams: 1, unit: 'Stück', prep: { text: 'wachsweich kochen', minutes: 7 } },
  { id: 'kaese', name: 'Geriebener Käse', kind: 'topping', grams: 30, prep: { text: 'drüberstreuen', minutes: 0 } },
  { id: 'koriander', name: 'Koriander', kind: 'topping', grams: 5, prep: { text: 'grob zupfen', minutes: 0 } },
  { id: 'jalapenos', name: 'Jalapeños', kind: 'topping', grams: 15, prep: { text: 'in Ringe schneiden', minutes: 0 } },
  { id: 'cashews', name: 'Cashews', kind: 'topping', grams: 15, prep: { text: 'ohne Fett rösten', minutes: 3 } },
  { id: 'cheddar', name: 'Cheddar', kind: 'topping', grams: 1, unit: 'Stück', prep: { text: 'als Scheibe auf dem Patty schmelzen lassen', minutes: 1 } },
];

/** Standardmenge eigener Bausteine je Gruppe (in den Einstellungen änderbar) */
const CUSTOM_GRAMS: Record<SideKind, number> = { carb: 100, protein: 125, sauce: 50, veg: 100, topping: 15 };

/**
 * Eigene Bausteine tragen Gruppe und Namen in der id („eigen:veg:Tomaten“) – so braucht Mashi für Titel, Einkauf und
 * Essen keine zweite Liste, auch auf einem Gerät, das die eigenen Bausteine noch nicht abgeglichen hat.
 */
export function customSideId(kind: SideKind, name: string): string | undefined {
  const clean = name.replace(/[,+:]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? `eigen:${kind}:${clean}` : undefined;
}

/** Was du für einen Baustein kaufst und abbuchst: deine Angabe (Household.sideFood), sonst Mashis (Side.food), sonst der Name */
export const foodOf = (s: Pick<Side, 'id' | 'name' | 'food'>, household?: Pick<Household, 'sideFood'>): string =>
  household?.sideFood?.[s.id]?.trim() || s.food || s.name;

export const sideOf = (id: string | undefined): Side | undefined => {
  if (!id) return undefined;
  const m = /^eigen:(carb|protein|sauce|veg|topping):(.+)$/.exec(id);
  if (m) return { id, name: m[2], kind: m[1] as SideKind, grams: CUSTOM_GRAMS[m[1] as SideKind] };
  return SIDES.find((s) => s.id === id);
};

/** Alle Bausteine einer Gruppe – die festen und die eigenen */
export const sidesOfKind = (kind: SideKind, custom: readonly string[] = []): Side[] =>
  [...SIDES, ...custom.flatMap((id) => sideOf(id) ?? [])].filter((s) => s.kind === kind && !s.retired);

/**
 * Die Bausteine eines Abends. Gespeichert als eine Zeichenkette („pasta,haehnchen,parmesan“) im bisherigen Feld
 * `WeekMeal.side` – so bleiben Abgleich, Tauschen und Auswahl-Schlüssel (mealKey) unverändert, alte Abende („pasta“) gelten weiter.
 */
export const sidesOf = (side: string | undefined): Side[] => (side ? side.split(',').flatMap((id) => sideOf(id) ?? []) : []);

/** Bausteine → gespeicherte Form, in fester Reihenfolge (Kohlenhydrat, Protein, Sauce, Gemüse, Topping) */
export const comboOf = (ids: readonly string[]): string | undefined => {
  const order = SIDE_KINDS.map((k) => k.kind);
  const list = ids.flatMap((id) => sideOf(id) ?? []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return list.length ? list.map((s) => s.id).join(',') : undefined;
};

/**
 * Deine Rezepte als Baustein eines Abends (Julia: eigene Bausteine auch im Wochenplan): im selben Feld wie die festen,
 * als „mein:<Stufe>:<Rezept-id>:<Name>“, ein Teil (die Guacamole aus „Tacos“) mit „:teil“ dahinter. Der Name steht mit
 * drin, damit Titel wie „Chili mit Reis & Guacamole“ ohne die Rezepte auskommen (wie „eigen:veg:Tomaten“) – kodiert,
 * weil Komma, Plus und Doppelpunkt in der gespeicherten Form trennen (sidesOf, mealKey). Alte App-Fassungen überspringen
 * solche Einträge einfach (sideOf kennt sie nicht).
 */
export interface OwnSide { entry: string; recipeId: string; kind: SideKind; name: string; part?: string }

export const ownEntry = (o: { recipeId: string; kind: SideKind; name: string; part?: string }): string =>
  `mein:${o.kind}:${o.recipeId}:${encodeURIComponent(o.name)}${o.part ? ':teil' : ''}`;

export function ownOf(entry: string): OwnSide | undefined {
  const m = /^mein:(carb|protein|sauce|veg|topping):([^:,+]+):([^:,+]+)(:teil)?$/.exec(entry);
  if (!m) return undefined;
  try {
    const name = decodeURIComponent(m[3]);
    return { entry, recipeId: m[2], kind: m[1] as SideKind, name, ...(m[4] ? { part: name } : {}) };
  } catch {
    return undefined; // kaputt kodiert – lieber weglassen als abstürzen
  }
}

/** die eigenen Bausteine eines Abends */
export const ownSidesOf = (side: string | undefined): OwnSide[] => (side ? side.split(',').flatMap((e) => ownOf(e) ?? []) : []);

/**
 * Kochstil eines Abends (Julia: die abwechslungsreichen Schritte auch im Wochenplan, cookStyle.ts) – im selben Feld als
 * „richtung:pasta“, „wuerze:indisch“, „weg:brokkoli:ofen“. Nur Kleinbuchstaben-ids, also nichts zu kodieren; alte
 * App-Fassungen und alle, die nur Bausteine lesen (sidesOf, comboText), überspringen die Einträge.
 */
export interface SideStyle { direction?: string; spice?: string; ways: Record<string, string> }

const STYLE_ENTRY = /^(richtung|wuerze):([a-z0-9-]+)$|^weg:([a-z0-9-]+):([a-z0-9-]+)$/;

export function styleOf(side: string | undefined): SideStyle {
  const style: SideStyle = { ways: {} };
  for (const e of side ? side.split(',') : []) {
    const m = STYLE_ENTRY.exec(e);
    if (!m) continue;
    if (m[1] === 'richtung') style.direction = m[2];
    else if (m[1] === 'wuerze') style.spice = m[2];
    else style.ways[m[3]] = m[4];
  }
  return style;
}

/** Bausteine bleiben, wie sie sind; der Kochstil wird ersetzt (am Ende, fest sortiert – gleiche Abende, gleicher mealKey) */
export function withStyle(side: string | undefined, style: Partial<SideStyle>): string | undefined {
  const items = (side ? side.split(',') : []).filter((e) => e && !STYLE_ENTRY.test(e));
  if (!items.length) return undefined; // pur bleibt pur – ohne Bausteine gibt es nichts zu kochen
  const valid = (x?: string) => !!x && /^[a-z0-9-]+$/.test(x);
  return [
    ...items,
    ...(valid(style.direction) ? [`richtung:${style.direction}`] : []),
    ...(valid(style.spice) ? [`wuerze:${style.spice}`] : []),
    ...Object.entries(style.ways ?? {}).filter(([id, w]) => valid(id) && valid(w)).sort(([a], [b]) => a.localeCompare(b)).map(([id, w]) => `weg:${id}:${w}`),
  ].join(',');
}

/**
 * Nur die Bausteine eines Abends, ohne Kochstil. „Dasselbe Gericht?“ fragt nach den Bausteinen, nicht nach der Würze
 * (Rundgang: seit der Stil im selben Feld steht, galt Pasta & Brokkoli „indisch“ und „mexikanisch“ als zwei Gerichte –
 * kein Mitkochen, doppelte Chips).
 */
export const bareSide = (side: string | undefined): string | undefined => withStyle(side, {});

/**
 * Je Bausteine ein Abend, in der Reihenfolge der Woche (Rundgang: „mit Pasta & Brokkoli“ stand zweimal da, nur die
 * Würze war anders). Es bleibt der erste – außer `keep` (der Abend, der gerade offen ist) hat dieselben Bausteine:
 * dann seiner, damit ein Tipp auf den Chip seine Würze nicht gegen die eines anderen Abends tauscht.
 */
export function distinctCombos(sides: readonly string[], keep?: string): string[] {
  const out = new Map<string, string>();
  const mine = bareSide(keep);
  for (const s of sides) {
    const k = bareSide(s);
    if (k && !out.has(k)) out.set(k, k === mine ? keep! : s);
  }
  return [...out.values()];
}

/** Bausteine lesbar: „Pasta, Hähnchenbrust & Parmesan“ – eigene mit ihrem Namen, in gespeicherter Reihenfolge */
export function comboText(side: string | undefined): string {
  const names = (side ? side.split(',') : []).flatMap((e) => sideOf(e)?.name ?? ownOf(e)?.name ?? []);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? '';
}

/**
 * Zubereitung: erst die Abweichung bei dieser Grundlage (Julia: „Tomaten bei Kürbissauce anders als bei Bolo“), dann
 * der eigene Standard aus den Einstellungen, dann Mashis Standard. undefined = noch keine (eigener Baustein).
 */
export function prepOf(id: string, household?: Pick<Household, 'sidePrep'>, base?: { blockPrep?: Record<string, SidePrep> }): SidePrep | undefined {
  return base?.blockPrep?.[id] ?? household?.sidePrep?.[id] ?? sideOf(id)?.prep;
}

export interface ComboStep {
  /** Baustein-id, fehlt bei der Grundlage selbst */
  id?: string;
  name: string;
  text?: string;
  minutes: number;
  /** woher der Text kommt – zum Bearbeiten; „rezept“: dein Rezept als Baustein, die Schritte stehen dort */
  source: 'grundlage' | 'standard' | 'eigen' | 'rezept';
  /** dein Rezept steht vorgekocht da – nichts zu kochen, also auch nichts mitzukochen */
  ready?: true;
  /** dein Rezept: seine Schritte (craving.ts: ownSteps) – fehlen sie, steht „nach deinem Rezept“ im Text */
  steps?: readonly Pick<Step, 'text' | 'timerMinutes'>[];
  /** nur Teile: aus welchem Rezept */
  from?: string;
}

/**
 * Die Schritte eines Baukasten-Abends: was am längsten dauert, zuerst – so ist am Ende alles gleichzeitig fertig.
 * Die Grundlage wird nur aufgewärmt (5 Min.); was 0 Minuten braucht (Parmesan drüber), kommt zum Schluss.
 */
export function comboSteps(side: string | undefined, baseTitle: string, household?: Pick<Household, 'sidePrep'>, base?: { blockPrep?: Record<string, SidePrep> }): ComboStep[] {
  const steps: ComboStep[] = sidesOf(side).map((s) => {
    const prep = prepOf(s.id, household, base);
    const source = base?.blockPrep?.[s.id] ? 'grundlage' as const : household?.sidePrep?.[s.id] ? 'eigen' as const : 'standard' as const;
    return { id: s.id, name: s.name, text: prep?.text, minutes: prep?.minutes ?? 0, source };
  });
  return [{ name: baseTitle, text: 'aufwärmen', minutes: 5, source: 'standard' as const }, ...steps].sort((a, b) => b.minutes - a.minutes);
}

/** Menge pro Portion – feste Werte, einmal zentral änderbar (Julia: nicht bei jedem Abend nachfragen) */
export const sideGrams = (id: string, household?: Pick<Household, 'sides'>): number =>
  household?.sides?.[id] ?? sideOf(id)?.grams ?? 0;

/** Ein Baustein als Zutat für so viele Portionen – Einkaufsliste und Vorrat rechnen damit wie mit jeder Zutat */
export function sideIngredient(id: string, portions: number, household?: Pick<Household, 'sides' | 'sideFood'>): Ingredient | undefined {
  const side = sideOf(id);
  return side ? { id: `beilage:${id}`, name: foodOf(side, household), amount: sideGrams(id, household) * portions, unit: side.unit ?? 'g' } : undefined;
}
