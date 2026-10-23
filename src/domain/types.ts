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
   * Gesetzt = Baustein für Mix & Match (Julia: Saucen und Beilagen frei kombinieren) – steht dann nur dort,
   * nicht im Kochbuch. Offener String wie bei den Kategorien (siehe MIX_ROLES in mix.ts), später z. B. „gemuese“.
   */
  mix?: string;
  /** „Passt gut zu“ – IDs anderer Mix-Bausteine; gilt in beide Richtungen (siehe goesTogether) */
  goesWith?: string[];
  /**
   * Zutaten (IDs), die gerade selbst gemacht statt gekauft werden – Julias Wahl, gilt für Plan, Einkauf und Kochmodus.
   * Bewusst nicht versioniert (wie der Favorit): umschalten ist keine neue Fassung des Rezepts.
   */
  homemade?: string[];
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
}
