import type { MealPlan } from '../domain/mealplan';
import type { Pantry } from '../domain/pantry';
import type { MyProduct } from '../domain/nutrition/myProducts';
import type { Recipe } from '../domain/types';

/**
 * Speicherzugriff, unabhängig vom Ort.
 * - LocalRecipeRepository: Demo-Modus, Beispieldaten nur in diesem Browser (localStorage)
 * - PouchRecipeRepository: echte Daten, lokal in IndexedDB + Abgleich mit deiner CouchDB
 *
 * Bewusst asynchron, damit Aufrufstellen nicht wissen müssen, wo die Daten liegen.
 *
 * Speichern mit `base`: der Stand, den die App gerade verändert hat. Liegt in der Datenbank
 * inzwischen etwas Neueres (vom anderen Gerät), wird die Änderung darauf angewendet statt es zu
 * überschreiben. Zurück kommt, was wirklich gespeichert wurde (void = genau das Übergebene).
 */
export interface RecipeRepository {
  list(): Promise<Recipe[]>;
  save(recipe: Recipe, base?: Recipe): Promise<Recipe | void>;
  remove(id: string): Promise<void>;
  /** „Meine Produkte“ – eine Liste pro Kochbuch, wird wie die Rezepte abgeglichen. */
  loadProducts(): Promise<MyProduct[]>;
  saveProducts(products: MyProduct[], base?: MyProduct[]): Promise<MyProduct[] | void>;
  /** Wochenplan „Diese Woche“ inkl. abgehakter Einkäufe – auf allen Geräten gleich. */
  loadPlan(): Promise<MealPlan>;
  savePlan(plan: MealPlan, base?: MealPlan): Promise<MealPlan | void>;
  /** Speisekammer inkl. gelernter Bon-Artikel – auf allen Geräten gleich. */
  loadPantry(): Promise<Pantry>;
  savePantry(pantry: Pantry, base?: Pantry): Promise<Pantry | void>;
  /**
   * Meldet Änderungen, die NICHT aus dieser App-Sitzung stammen –
   * z. B. Rezepte, die der Abgleich vom Handy auf den PC geholt hat.
   * Gibt eine Funktion zum Abmelden zurück.
   */
  onExternalChange?(callback: () => void): () => void;
}
