/**
 * Das Mashi-Datenmodell.
 *
 * Grundidee: Ein Rezept ist ein Container mit Status, Metadaten und einer
 * Liste von Versionen. Der eigentliche Inhalt (Zutaten, Schritte, Zeiten …)
 * steckt ausschließlich in den Versionen. Dadurch geht die ursprüngliche
 * KI-Version nie verloren, auch wenn der Nutzer das Rezept umbaut.
 *
 * Nährwerte sind bewusst NICHT Teil des Modells – sie werden immer aus den
 * Zutaten berechnet (siehe domain/nutrition). So kann keine Quelle (auch
 * keine KI) Nährwerte „hineinschreiben“.
 */

/** Lebenszyklus eines Rezepts. Archivieren ist ein eigenes Flag (archivedAt). */
export type RecipeStatus = 'ki_entwurf' | 'zum_testen' | 'bewaehrt' | 'kochbuch';

/** Woher das Rezept ursprünglich stammt. Ändert sich nie. */
export type RecipeSource = 'ki' | 'selbst' | 'import';

/** Wer eine Version erzeugt hat. */
export type VersionAuthor = 'ki' | 'nutzer' | 'import';

/** Geräte und Kategorien sind offene Strings – der Katalog (catalog.ts) ist erweiterbar. */
export type DeviceId = string;
export type CategoryId = string;

export type Unit =
  | 'g' | 'kg' | 'ml' | 'l'
  | 'EL' | 'TL' | 'Prise'
  | 'Stück' | 'Zehe' | 'Dose' | 'Glas' | 'Bund' | 'Handvoll' | 'cm' | 'Messlöffel';

export type Difficulty = 1 | 2 | 3;

/** Verweis auf einen Eintrag in einer Lebensmitteldatenbank (Open Food Facts, USDA, lokal …). */
export interface FoodRef {
  provider: string;
  foodId: string;
}

export interface Ingredient {
  /** Stabil über Versionen hinweg – damit lassen sich Änderungen nachvollziehen. */
  id: string;
  name: string;
  amount?: number;
  unit?: Unit;
  /** z. B. „fein gehackt“ */
  note?: string;
  optional?: boolean;
  /** Vom Nutzer oder Provider bestätigte Zuordnung. Fehlt sie, wird über den Namen gesucht. */
  foodRef?: FoodRef;
}

export interface Step {
  id: string;
  text: string;
  /** Optionaler Timer direkt am Schritt (Kochmodus). */
  timerMinutes?: number;
  /**
   * Welche Zutaten dieser Schritt braucht (IDs aus RecipeContent.ingredients).
   * - fehlt (undefined): Mashi erkennt sie automatisch aus dem Schritttext
   * - gesetzt: genau diese – vom Nutzer korrigiert oder von der KI geliefert
   * - leere Liste: ausdrücklich keine Zutaten (≠ „nicht gesetzt“)
   */
  ingredientIds?: string[];
}

/** Alles, was ein Rezept inhaltlich ausmacht – und damit versioniert wird. */
export interface RecipeContent {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: Difficulty;
  ingredients: Ingredient[];
  steps: Step[];
  categories: CategoryId[];
  tags: string[];
  devices: DeviceId[];
  /** Nur für KI-Bilder: Beschreibung des Gerichts, ohne Stilvorgaben (die kommen zentral dazu). */
  imagePrompt?: string;
}

export interface RecipeVersion {
  id: string;
  /** 1, 2, 3 … fortlaufend je Rezept */
  number: number;
  createdAt: string;
  author: VersionAuthor;
  /** z. B. „KI-Vorschlag“, „Nach Test am 12.9.“, „Meine Kochbuch-Version“ */
  label?: string;
  content: RecipeContent;
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface TestFeedback {
  id: string;
  /** Welche Version wurde gekocht? */
  versionId: string;
  createdAt: string;
  rating: Rating;
  note: string;
}

/** Welche Linienzeichnung ein Platzhalterbild zeigt. */
export type ImageMotif = 'bowl' | 'plate' | 'pot' | 'stack' | 'jar';

export type RecipeImage =
  /** Prototyp: Pastellfläche mit Linienzeichnung statt Foto */
  | { kind: 'placeholder'; motif: ImageMotif; hue: number }
  /** Später: Supabase Storage URL (KI-Bild oder eigenes Foto) */
  | {
    kind: 'url'; url: string; prompt?: string;
    /** Originalfoto (verkleinert) – damit der Ausschnitt später wieder änderbar ist */
    original?: string;
    /** gewählter Ausschnitt im Original: Mitte (Anteil 0–1) und Zoom */
    crop?: ImageCrop;
  };

export interface ImageCrop { x: number; y: number; zoom: number }

export interface Recipe {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RecipeStatus;
  /** Gesetzt = archiviert. Der Status bleibt erhalten, damit Wiederherstellen verlustfrei ist. */
  archivedAt?: string;
  source: RecipeSource;
  favorite: boolean;
  image?: RecipeImage;
  /** Persönliche, freie Notizen – unabhängig von Versionen. */
  notes: string;
  lastCookedAt?: string;
  currentVersionId: string;
  versions: RecipeVersion[];
  feedback: TestFeedback[];
}
