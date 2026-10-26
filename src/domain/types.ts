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
import type { SideKind } from './sides';

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
  | 'Stück' | 'Zehe' | 'Dose' | 'Glas' | 'Bund' | 'Handvoll' | 'cm' | 'Messlöffel' | 'Portion';

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
  /** Teil des Rezepts („Sauce“, „Salat“) – lässt sich getrennt kochen (siehe parts.ts); fehlt = „Frisch“ */
  part?: string;
  optional?: boolean;
  /** Vom Nutzer oder Provider bestätigte Zuordnung. Fehlt sie, wird über den Namen gesucht. */
  foodRef?: FoodRef;
  /** Lässt sich auch selbst machen – nach diesem Rezept (Julia: gekaufte oder selbstgemachte Gnocchi), siehe homemade.ts */
  recipeId?: string;
  /** Nur in dieser Variante (RecipeContent.choices) – fehlt: in allen, siehe choices.ts */
  choice?: string;
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
  /**
   * Zu welchem Teil der Schritt gehört (siehe parts.ts) – fehlt: aus seinen Zutaten (Mashis Vorschlag);
   * REST = „Frisch“, FINISH = „Zum Schluss“ (bringt Teile zusammen)
   */
  part?: string;
  /** Nur in dieser Variante (RecipeContent.choices) – fehlt: in allen, siehe choices.ts */
  choice?: string;
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
  /** Varianten des Rezepts (Julia: „mit Hähnchen“ oder „mit Tofu“) – Zutaten und Schritte gehören zu einer oder zu allen */
  choices?: string[];
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
  /** das „zuletzt gekocht“ davor – damit „Heute gekocht“ zurückgenommen werden kann, ohne das alte Datum zu verlieren */
  previousCookedAt?: string;
  currentVersionId: string;
  versions: RecipeVersion[];
  feedback: TestFeedback[];
  /**
   * Veraltet: Baustein für das frühere Mix & Match („sosse“, „beilage“). Steht nur noch in alten Daten und
   * Sicherungen – beim Start räumt retireMix (mix.ts) es weg. Nicht mehr setzen.
   */
  mix?: string;
  /** Veraltet: „passt gut zu“ aus Mix & Match – wird mit `mix` weggeräumt */
  goesWith?: string[];
  /**
   * Zutaten (IDs), die gerade selbst gemacht statt gekauft werden – Julias Wahl, gilt für Plan, Einkauf und Kochmodus.
   * Bewusst nicht versioniert (wie der Favorit): umschalten ist keine neue Fassung des Rezepts.
   */
  homemade?: string[];
  /**
   * Zubereitung von Baukasten-Bausteinen nur bei dieser Grundlage (Julia: „Tomaten bei Kürbissauce anders als bei Bolo“),
   * je Baustein-id. Nicht versioniert – wie homemade.
   */
  blockPrep?: Record<string, { text: string; minutes: number }>;
  /** gewählte Variante (RecipeContent.choices) – fehlt oder gibt es nicht mehr: die erste; wie homemade nicht versioniert */
  choice?: string;
  /**
   * Vorkochen (Julia: am Wochenende eine Grundlage kochen, unter der Woche daraus verschiedene Abendessen):
   * wie lange es gekocht im Kühlschrank hält (Tage) – fehlt: shelfDays.prepared (Standard 3). Siehe week.ts.
   * Wie Favorit und homemade nicht versioniert – das ist eine Eigenschaft des Gerichts, keine neue Fassung.
   */
  keepsDays?: number;
  /** lässt sich gekocht einfrieren – späte Abende plant Mashi dann als „einfrieren, am Vortag auftauen“ */
  freezable?: boolean;
  /** eignet sich zum Mitnehmen (Mittagessen) – Julia: Burger oder Suppe im Büro eher nicht */
  togo?: boolean;
  /**
   * Verwandlung einer Grundlage (Bolo-Wraps aus der Bolognese) – steht nur unter ihrer Grundlage, nicht im
   * Kochbuch-Raster (Julia: sonst steht alles doppelt). Die Zutat mit recipeId zeigt auf dieselbe Grundlage.
   */
  fromBase?: string;
  /**
   * Als Baustein in „Worauf hast du Lust?“ (Julia: „Knusprige Hähnchenstreifen“ als Protein beim Taco) – das ganze
   * Rezept oder einzelne Teile (zwei Saucen in einem Rezept = zwei Bausteine). Nicht versioniert wie freezable;
   * benennt eine neue Version einen Teil um, zieht die Markierung mit (parts.ts: followBlockParts).
   */
  blocks?: RecipeBlock[];
  /**
   * Was besonders gut dazu passt (Julia: „in den Grundrezepten notieren, zu was sie passen“): Baustein-ids aus sides.ts,
   * z. B. Bolognese → Spätzle, Parmesan. Im Stepper – auch im Wochenplan – stehen die vorn. Nicht versioniert wie blocks.
   */
  pairs?: string[];
  /**
   * Probiergericht aus „Worauf hast du Lust?“ (Julia: „ich teste erst, wie es ist, dann speicher ich es“): ein echtes
   * Rezept, damit Kochmodus, Plan und Einkaufsliste wie immer funktionieren – aber noch nicht im Kochbuch. Nach dem
   * Kochen fragt die Startseite „Wie war's?“; speichern nimmt die Markierung weg, „Nicht speichern“ löscht es.
   */
  trial?: boolean;
}

/** Ein Rezept (ohne part) oder ein Teil davon als Baustein */
export interface RecipeBlock {
  /** Name des Teils (Ingredient.part) – fehlt: das ganze Rezept */
  part?: string;
  kind: SideKind;
  /** weitere Stufen, die er mit abdeckt (Julia: Bolognese ist Protein und Sauce) – gewählt sind die dann erledigt */
  also?: SideKind[];
  /** fester Baustein, den er ersetzt (Julia: meine Guacamole statt der festen) – der feste steht dann nicht mehr zur Wahl */
  replaces?: string;
  /** Richtungen (craving.ts: „taco“, „bowl“ …), in denen er auftaucht – leer: überall */
  directions: string[];
}
