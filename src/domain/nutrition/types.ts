import type { FoodRef, Unit } from '../types';

/** Nährwerte je 100 g (bzw. als Summe). Pflichtfelder + optionale Zusatzwerte. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  salt?: number;
}

export const CORE_NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'] as const;
export const OPTIONAL_NUTRIENTS = ['fiber', 'sugar', 'satFat', 'salt'] as const;

export type FoodKind = 'protein' | 'staple' | 'dairy' | 'egg' | 'bread' | 'vegetable' | 'fruit';

export interface FoodEntry {
  ref: FoodRef;
  name: string;
  /** Werte pro 100 g */
  per100g: Nutrients;
  /** g pro ml, für Flüssigkeiten ≠ 1 */
  density?: number;
  /** Gewicht einer Einheit in Gramm, z. B. { Stück: 150, EL: 18 } */
  portions?: Partial<Record<Unit, number>>;
  /** Salz, Pfeffer & Co. – ohne Menge unbedenklich zu ignorieren */
  negligible?: boolean;
  /** Art des Lebensmittels – z. B. für den Wochenplan: Hähnchen und Pasta zählen mehr als Paprika. */
  kind?: FoodKind;
  /** Haltbarkeit ab Kauf in Tagen – nur bei eigenen Produkten, wenn dort eingetragen */
  shelfDays?: number;
  /** Bei eigenen Produkten: der Eintrag der allgemeinen Tabelle, den es ersetzt (für dessen Richtwerte) */
  baseId?: string;
  /** von dir auf „ohne Nährwerte“ gestellt (siehe noNutrition.ts) – im Rezept wieder umschaltbar */
  userZero?: boolean;
  /**
   * Mehrere eigene Sorten für diese Zutat (siehe variants.ts): per100g ist dann der Durchschnitt,
   * hier stehen die einzelnen Sorten – für die Spanne und die Auswahl beim Planen/Kochen.
   */
  variants?: FoodVariant[];
  /** davon dein Favorit (★) – dann sind per100g seine Werte, keine Spanne */
  favoriteId?: string;
}

/** Eine Sorte = ein eigenes Produkt („Pesto verde (K-Classic)“) */
export interface FoodVariant {
  /** ID des Produkts in „Meine Produkte“ */
  id: string;
  name: string;
  per100g: Nutrients;
  favorite?: boolean;
}

/**
 * Synchrone, lokale Sicht auf Lebensmitteldaten. Die Engine rechnet NUR hiergegen.
 * Externe Anbieter (Open Food Facts, USDA) füllen später asynchron diesen lokalen
 * Bestand bzw. setzen foodRef an den Zutaten – die Rechnung bleibt dadurch offline-fähig.
 */
export interface FoodTable {
  byRef(ref: FoodRef): FoodEntry | undefined;
  /** Suche über den Zutatennamen. 'exact' = eindeutig, 'approx' = nur ungefähr passend. */
  matchName(name: string): { food: FoodEntry; quality: 'exact' | 'approx' } | undefined;
}

/** Schnittstelle für externe Datenbanken – noch nicht implementiert (Phase 7). */
export interface NutritionProvider {
  id: string;
  search(query: string): Promise<FoodEntry[]>;
  byBarcode?(ean: string): Promise<FoodEntry | undefined>;
}

export type NutritionAccuracy = 'berechnet' | 'geschaetzt' | 'nicht_verfuegbar';

export type MatchStatus =
  | 'exact'        // eindeutig zugeordnet
  | 'approx'       // nur ungefähr zugeordnet
  | 'no-weight'    // zugeordnet, aber Einheit nicht in Gramm umrechenbar
  | 'no-amount'    // keine Menge angegeben
  | 'unmatched'    // kein passendes Lebensmittel
  | 'ignored';     // optional oder vernachlässigbar (Salz, Pfeffer)

export interface IngredientNutrition {
  ingredientId: string;
  name: string;
  status: MatchStatus;
  food?: FoodEntry;
  grams?: number;
}

export interface NutritionResult {
  accuracy: NutritionAccuracy;
  /** null, wenn accuracy = 'nicht_verfuegbar' – dann zeigen wir lieber nichts */
  total: Nutrients | null;
  perServing: Nutrients | null;
  items: IngredientNutrition[];
  /** gesamt: kleinster und größter Wert je nach Sorte – nur wenn Zutaten mehrere Sorten haben */
  range?: { kcal: [number, number]; protein: [number, number] };
}
