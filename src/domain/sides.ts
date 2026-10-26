import type { Household } from './mealplan';
import type { Ingredient } from './types';

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
  { kind: 'veg', label: 'Beilage' },
  { kind: 'topping', label: 'Topping' },
];

export const SIDES: readonly Side[] = [
  { id: 'pasta', name: 'Pasta', kind: 'carb', grams: 100, prep: { text: 'in Salzwasser kochen', minutes: 10 } },
  { id: 'reis', name: 'Reis', kind: 'carb', grams: 75, prep: { text: 'mit doppelter Menge Wasser köcheln', minutes: 15 } },
  { id: 'schupfnudeln', name: 'Schupfnudeln', kind: 'carb', grams: 250, prep: { text: 'in der Pfanne goldbraun braten', minutes: 8 } },
  { id: 'spaetzle', name: 'Spätzle', kind: 'carb', grams: 250, prep: { text: 'in der Pfanne erhitzen', minutes: 5 } },
  { id: 'gnocchi', name: 'Gnocchi', kind: 'carb', grams: 250, prep: { text: 'in Salzwasser garen, bis sie oben schwimmen', minutes: 4 } },
  { id: 'kartoffeln', name: 'Kartoffeln', kind: 'carb', grams: 300, prep: { text: 'in Salzwasser kochen', minutes: 20 } },
  { id: 'buns', name: 'Burgerbrötchen', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'aufschneiden und kurz anrösten', minutes: 2 } },
  { id: 'tortillas', name: 'Weizentortillas', kind: 'carb', grams: 2, unit: 'Stück', prep: { text: 'in der Pfanne kurz erwärmen', minutes: 2 } },
  { id: 'wraps', name: 'Wraps', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'in der Pfanne kurz erwärmen', minutes: 2 } },
  { id: 'naan', name: 'Naan', kind: 'carb', grams: 1, unit: 'Stück', prep: { text: 'im Ofen aufbacken', minutes: 5 } },
  { id: 'quinoa', name: 'Quinoa', kind: 'carb', grams: 60, prep: { text: 'mit doppelter Menge Wasser köcheln', minutes: 15 } },
  { id: 'suesskartoffel', name: 'Süßkartoffel', kind: 'carb', grams: 250, prep: { text: 'würfeln und im Ofen rösten', minutes: 25 } },
  { id: 'haehnchen', name: 'Hähnchenbrust', kind: 'protein', grams: 125, prep: { text: 'in Streifen schneiden und braten', minutes: 8 } },
  { id: 'hack', name: 'Hackfleisch', kind: 'protein', grams: 125, prep: { text: 'krümelig anbraten', minutes: 8 } },
  { id: 'tofu', name: 'Tofu', kind: 'protein', grams: 100, prep: { text: 'würfeln und knusprig braten', minutes: 10 } },
  { id: 'linsen', name: 'Linsen', kind: 'protein', grams: 60, prep: { text: 'in Wasser weich kochen', minutes: 20 } },
  { id: 'bohnen', name: 'Schwarze Bohnen', kind: 'protein', grams: 120, prep: { text: 'abspülen, mit Kreuzkümmel erhitzen', minutes: 5 } },
  { id: 'kichererbsen', name: 'Kichererbsen', kind: 'protein', grams: 120, prep: { text: 'abspülen und knusprig rösten', minutes: 15 } },
  { id: 'halloumi', name: 'Halloumi', kind: 'protein', grams: 75, prep: { text: 'in Scheiben goldbraun braten', minutes: 6 } },
  { id: 'patty', name: 'Hack-Patty', kind: 'protein', grams: 150, prep: { text: 'aus Hack flach formen, je Seite 3–4 Min. braten', minutes: 8 } },
  { id: 'tomatensauce', name: 'Tomatensauce', kind: 'sauce', grams: 125, prep: { text: 'passierte Tomaten mit Knoblauch einköcheln', minutes: 10 } },
  { id: 'pesto', name: 'Pesto', kind: 'sauce', grams: 30, prep: { text: 'unter die heißen Nudeln heben', minutes: 0 } },
  { id: 'sahnesauce', name: 'Sahnesauce', kind: 'sauce', grams: 75, prep: { text: 'Sahne mit etwas Brühe einköcheln', minutes: 5 } },
  { id: 'salsa', name: 'Tomatensalsa', kind: 'sauce', grams: 60, prep: { text: 'Tomaten und Zwiebel würfeln, mit Limette mischen', minutes: 5 } },
  { id: 'guacamole', name: 'Guacamole', kind: 'sauce', grams: 60, prep: { text: 'Avocado zerdrücken, mit Limette und Salz abschmecken', minutes: 5 } },
  { id: 'schmand', name: 'Schmand', kind: 'sauce', grams: 40, prep: { text: 'glatt rühren', minutes: 0 } },
  { id: 'joghurt', name: 'Joghurt-Dip', kind: 'sauce', grams: 50, prep: { text: 'Joghurt mit Knoblauch und Salz verrühren', minutes: 3 } },
  { id: 'erdnuss', name: 'Erdnusssauce', kind: 'sauce', grams: 40, prep: { text: 'Erdnussmus mit Sojasauce, Limette und Wasser glatt rühren', minutes: 3 } },
  { id: 'kokoscurry', name: 'Kokos-Currysauce', kind: 'sauce', grams: 150, prep: { text: 'Currypaste anrösten, Kokosmilch dazu, köcheln', minutes: 10 } },
  { id: 'burgersauce', name: 'Burgersauce', kind: 'sauce', grams: 30, prep: { text: 'Mayo, Ketchup und etwas Gurkenwasser verrühren', minutes: 2 } },
  { id: 'brokkoli', name: 'Brokkoli', kind: 'veg', grams: 150, prep: { text: 'in Röschen dämpfen', minutes: 5 } },
  { id: 'salat', name: 'Salat', kind: 'veg', grams: 50, prep: { text: 'waschen und anmachen', minutes: 5 } },
  { id: 'paprika', name: 'Paprika', kind: 'veg', grams: 100, prep: { text: 'in Streifen schneiden, kurz anbraten', minutes: 5 } },
  { id: 'zucchini', name: 'Zucchini', kind: 'veg', grams: 150, prep: { text: 'in Scheiben anbraten', minutes: 6 } },
  { id: 'spinat', name: 'Spinat', kind: 'veg', grams: 100, prep: { text: 'kurz zusammenfallen lassen', minutes: 2 } },
  { id: 'mais', name: 'Mais', kind: 'veg', grams: 75, prep: { text: 'abtropfen lassen, kurz anrösten', minutes: 3 } },
  { id: 'tomaten', name: 'Tomaten', kind: 'veg', grams: 100, prep: { text: 'würfeln', minutes: 2 } },
  { id: 'zwiebeln', name: 'Rote Zwiebeln', kind: 'veg', grams: 30, prep: { text: 'in feine Ringe schneiden', minutes: 2 } },
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

export const sideOf = (id: string | undefined): Side | undefined => {
  if (!id) return undefined;
  const m = /^eigen:(carb|protein|sauce|veg|topping):(.+)$/.exec(id);
  if (m) return { id, name: m[2], kind: m[1] as SideKind, grams: CUSTOM_GRAMS[m[1] as SideKind] };
  return SIDES.find((s) => s.id === id);
};

/** Alle Bausteine einer Gruppe – die festen und die eigenen */
export const sidesOfKind = (kind: SideKind, custom: readonly string[] = []): Side[] =>
  [...SIDES, ...custom.flatMap((id) => sideOf(id) ?? [])].filter((s) => s.kind === kind);

/**
 * Die Bausteine eines Abends. Gespeichert als eine Zeichenkette („pasta,haehnchen,parmesan“) im bisherigen Feld
 * `WeekMeal.side` – so bleiben Abgleich, Tauschen und Auswahl-Schlüssel (mealKey) unverändert, alte Abende („pasta“) gelten weiter.
 */
export const sidesOf = (side: string | undefined): Side[] => (side ? side.split(',').flatMap((id) => sideOf(id) ?? []) : []);

/** Bausteine → gespeicherte Form, in fester Reihenfolge (Kohlenhydrat, Protein, Beilage, Topping) */
export const comboOf = (ids: readonly string[]): string | undefined => {
  const order = SIDE_KINDS.map((k) => k.kind);
  const list = ids.flatMap((id) => sideOf(id) ?? []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return list.length ? list.map((s) => s.id).join(',') : undefined;
};

/** Bausteine lesbar: „Pasta, Hähnchenbrust & Parmesan“ */
export function comboText(side: string | undefined): string {
  const names = sidesOf(side).map((s) => s.name);
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
  /** woher der Text kommt – zum Bearbeiten */
  source: 'grundlage' | 'standard' | 'eigen';
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
export function sideIngredient(id: string, portions: number, household?: Pick<Household, 'sides'>): Ingredient | undefined {
  const side = sideOf(id);
  return side ? { id: `beilage:${id}`, name: side.name, amount: sideGrams(id, household) * portions, unit: side.unit ?? 'g' } : undefined;
}
