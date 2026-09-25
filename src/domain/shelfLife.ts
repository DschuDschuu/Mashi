import { resolveIngredient } from './mealplan';
import type { FoodEntry, FoodKind, FoodTable } from './nutrition/types';
import type { Pantry, PantryItem } from './pantry';

/**
 * Wie lange hält sich etwas ab dem Kauf? Grobe, eher vorsichtige Richtwerte für frische bzw.
 * gekühlte Ware – kein Ersatz für das Datum auf der Packung. Wer es genau weiß, trägt beim
 * Vorrat ein eigenes Datum ein; das gilt dann immer.
 * Nicht aufgeführt (Nudeln, Reis, Konserven, Gewürze …) = lange haltbar, keine Erinnerung.
 */

/** Sonderfälle unabhängig von der Art: MHD-Ware, Gefrorenes, Aufgetautes (Tage) */
export const SPECIAL_DAYS = { reduced: 1, frozen: 90, thawed: 1 } as const;
export type Special = keyof typeof SPECIAL_DAYS;

/** Deine Richtwerte „hält X Tage ab Kauf“: je Art (Gemüse …) und je Lebensmittel (Tomaten …) */
export interface ShelfDays {
  kinds?: Partial<Record<FoodKind, number>>;
  /** Lebensmittel-ID aus der Tabelle → Tage */
  foods?: Partial<Record<string, number>>;
  /** MHD-Ware hält noch … Tage ab Kauf (Standard 1) */
  reduced?: number;
  /** Gefrorenes: Hinweis nach … Tagen (Standard 90) */
  frozen?: number;
  /** Aufgetautes hält noch … Tage (Standard 1) */
  thawed?: number;
}

export const specialDays = (s: Special, custom: ShelfDays = {}): number => custom[s] ?? SPECIAL_DAYS[s];

/** Mashis Standard je Art – in der Speisekammer änderbar (Pantry.shelfDays). Nicht aufgeführt = lange haltbar. */
export const DEFAULT_SHELF_DAYS: Readonly<Partial<Record<FoodKind, number>>> = {
  protein: 2, // frisches Fleisch und Fisch
  egg: 21,
  dairy: 7,
  vegetable: 5,
  fruit: 5,
  bread: 4,
};

/** Ausnahmen innerhalb einer Art (Lebensmittel-ID aus der Tabelle) – genauer als der Wert der Art, gehen deshalb vor */
const DAYS_BY_FOOD: Record<string, number | null> = {
  // Fleisch & Wurst
  haehnchenhack: 1, rinderhack: 1, haehnchenbrust: 2, rindersteak: 3, doenerfleisch: 2, bacon: 10,
  fruehstuecksfleisch: null, // Konserve
  // Milchprodukte
  parmesan: 28, gruyere: 21, cheddar: 21, 'griech-joghurt': 10, magerquark: 10, frischkaese: 14,
  'frischkaese-light': 14, huettenkaese: 7, mozzarella: 7, milch: 7, 'milch-fettarm': 7, magermilch: 7,
  hafermilch: null, sahne: 7, kochsahne: 14, 'creme-fraiche': 14,
  // Gemüse & Obst
  zwiebel: 21, knoblauch: 30, karotte: 14, hokkaido: 30, ingwer: 21, rotkohl: 14, paprika: 7,
  kirschtomaten: 5, gurke: 5, avocado: 4, spinat: 3, salat: 3, eisbergsalat: 4, 'pak-choi': 4,
  fruehlingszwiebel: 5, erbsen: null, mais: null, banane: 5, heidelbeeren: 4, mango: 5, zitronensaft: 21,
  // Frische Teigwaren aus dem Kühlregal
  gnocchi: 14, schupfnudeln: 14, spaetzle: 10, tteokbokki: 14,
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Wie viele Tage ab Kauf? Die genaueste Angabe gewinnt:
 * eigenes Produkt („hält 10 Tage“) → Lebensmittel (dein Wert, sonst Richtwert: Spinat 3, Zwiebeln 21)
 * → Art (dein Wert, sonst Standard). undefined = lange haltbar / unbekannt.
 */
export function shelfDaysOf(food: FoodEntry | undefined, kind: FoodKind | undefined, custom: ShelfDays = {}): number | undefined {
  if (food?.shelfDays) return food.shelfDays;
  return shelfDaysForFood(food?.baseId ?? food?.ref.foodId, kind, custom);
}

/** Wie shelfDaysOf, aber ohne eigenes Produkt – z. B. als Schätzung im Produktformular. */
export function shelfDaysForFood(id: string | undefined, kind: FoodKind | undefined, custom: ShelfDays = {}): number | undefined {
  if (id && custom.foods?.[id]) return custom.foods[id];
  if (id && id in DAYS_BY_FOOD) return DAYS_BY_FOOD[id] ?? undefined;
  return kind ? custom.kinds?.[kind] ?? DEFAULT_SHELF_DAYS[kind] : undefined;
}

// ── Übersicht zum Einstellen ───────────────────────────────────────

export interface ShelfFood {
  id: string;
  name: string;
  /** was gerade gilt */
  days: number | undefined;
  /** was ohne deinen Wert gälte – Richtwert fürs Lebensmittel oder der Wert der Art */
  standard: number | undefined;
  /** folgt ohne eigenen Wert der Art („alle anderen“) */
  followsKind: boolean;
  own: boolean;
}

export interface ShelfGroup {
  kind: FoodKind;
  days: number | undefined;
  standard: number | undefined;
  own: boolean;
  foods: ShelfFood[];
}

/** Reihenfolge wie in der Speisekammer; Nudeln & Reis nur mit frischer Ware (Gnocchi …) – der Rest hält ewig */
const KIND_ORDER: FoodKind[] = ['vegetable', 'fruit', 'protein', 'egg', 'dairy', 'bread', 'staple'];

/** Alles, was sich einstellen lässt – je Art mit ihren Lebensmitteln und dem Wert, der gerade gilt. */
export function shelfOverview(foods: { id: string; name: string; kind?: FoodKind }[], custom: ShelfDays = {}): ShelfGroup[] {
  return KIND_ORDER.map((kind) => {
    const standard = DEFAULT_SHELF_DAYS[kind];
    const days = custom.kinds?.[kind] ?? standard;
    const list = foods
      .filter((f) => f.kind === kind && (kind !== 'staple' || !!DAYS_BY_FOOD[f.id] || !!custom.foods?.[f.id]))
      .map((f): ShelfFood => {
        const followsKind = !(f.id in DAYS_BY_FOOD);
        const std = followsKind ? days : DAYS_BY_FOOD[f.id] ?? undefined;
        const own = custom.foods?.[f.id];
        return { id: f.id, name: f.name, days: own ?? std, standard: std, followsKind, own: !!own };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { kind, days, standard, own: custom.kinds?.[kind] !== undefined, foods: list };
  });
}

/** Einen Wert setzen oder (undefined) auf Standard zurück – leere Maps fallen weg. */
export function setShelfDays(custom: ShelfDays = {}, target: { kind: FoodKind } | { food: string } | { special: Special }, days: number | undefined): ShelfDays {
  if ('special' in target) {
    const { [target.special]: _old, ...rest } = custom;
    return days ? { ...rest, [target.special]: days } : rest;
  }
  const patch = <K extends string>(map: Partial<Record<K, number>> | undefined, key: K) => {
    const next: Partial<Record<K, number>> = { ...map };
    if (days) next[key] = days;
    else delete next[key];
    return Object.keys(next).length ? next : undefined;
  };
  const next: ShelfDays = 'kind' in target
    ? { ...custom, kinds: patch(custom.kinds, target.kind) }
    : { ...custom, foods: patch(custom.foods, target.food) };
  if (!next.kinds) delete next.kinds;
  if (!next.foods) delete next.foods;
  return next;
}

/** Bis wann sollte der Vorrat weg sein? Ein eigenes Datum am Vorrat geht immer vor. undefined = lange haltbar / unbekannt. */
export function useByOf(item: PantryItem, table: FoodTable, custom: ShelfDays = {}): Date | undefined {
  if (item.useBy) return new Date(item.useBy);
  // Eingefroren: die Uhr steht – erst nach Monaten ein sanfter Hinweis
  if (item.frozenAt) return new Date(new Date(item.frozenAt).getTime() + specialDays('frozen', custom) * DAY);
  const r = resolveIngredient({ id: item.id, name: item.name }, 1, table);
  let days = shelfDaysOf(r?.food, r?.kind, custom);
  // MHD-Ware: kurz vor dem Datum gekauft – höchstens so lange wie eingestellt
  if (item.reduced) days = Math.min(days ?? Infinity, specialDays('reduced', custom));
  if (days === undefined) return undefined;
  const bought = new Date(item.boughtAt ?? item.addedAt);
  return new Date(bought.getTime() + days * DAY);
}

/** Ganze Tage bis zum Ablauf (Kalendertage, nicht Stunden): heute = 0, morgen = 1, gestern = −1. */
export function daysLeft(useBy: Date, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(useBy) - day(now)) / DAY);
}

export interface Expiring {
  item: PantryItem;
  useBy: Date;
  daysLeft: number;
}

/** Was bald weg sollte (bis `within` Tage, Abgelaufenes eingeschlossen) – dringendstes zuerst. */
export function expiringSoon(pantry: Pantry, table: FoodTable, now = new Date(), within = 2): Expiring[] {
  return pantry.items
    .map((item) => {
      const useBy = useByOf(item, table, pantry.shelfDays);
      return useBy ? { item, useBy, daysLeft: daysLeft(useBy, now) } : null;
    })
    .filter((e): e is Expiring => e !== null && e.daysLeft <= within)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.item.name.localeCompare(b.item.name, 'de'));
}

/** „heute“, „morgen“, „noch 2 Tage“, „seit gestern drüber“ */
export function daysLabel(days: number): string {
  if (days < -1) return `seit ${-days} Tagen drüber`;
  if (days === -1) return 'seit gestern drüber';
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `noch ${days} Tage`;
}

/** Wie lange schon eingefroren: „10 Tagen“, „3 Wochen“, „4 Monaten“ */
export function frozenSince(frozenAt: string, now = new Date()): string {
  const d = Math.max(0, -daysLeft(new Date(frozenAt), now));
  if (d === 1) return 'gestern';
  if (d < 14) return d === 0 ? 'heute' : `${d} Tagen`;
  if (d < 60) return `${Math.round(d / 7)} Wochen`;
  return `${Math.round(d / 30)} Monaten`;
}

/** Für die Erinnerung: „morgen“, „seit gestern drüber“ – oder bei Gefrorenem „seit 3 Monaten eingefroren“. */
export function expiryLabel(e: Expiring, now = new Date()): string {
  if (!e.item.frozenAt) return daysLabel(e.daysLeft);
  const since = frozenSince(e.item.frozenAt, now);
  return since === 'heute' || since === 'gestern' ? `${since} eingefroren` : `seit ${since} eingefroren`;
}

/** Schlüssel (wie in Einkaufsliste/Vorschlägen) der bald ablaufenden Vorräte → Tage bis Ablauf. */
export function useUpKeys(pantry: Pantry, table: FoodTable, now = new Date(), within = 2): Map<string, number> {
  const keys = new Map<string, number>();
  for (const e of expiringSoon(pantry, table, now, within)) {
    const key = resolveIngredient({ id: e.item.id, name: e.item.name }, 1, table)?.key;
    if (key && !keys.has(key)) keys.set(key, e.daysLeft);
  }
  return keys;
}
