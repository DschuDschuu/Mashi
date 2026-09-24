import type { MealPlan } from '../domain/mealplan';
import type { MyProduct } from '../domain/nutrition/myProducts';
import type { Recipe } from '../domain/types';

/**
 * Speicherzugriff, unabhängig vom Ort.
 * - LocalRecipeRepository: Demo-Modus, Beispieldaten nur in diesem Browser (localStorage)
 * - PouchRecipeRepository: echte Daten, lokal in IndexedDB + Abgleich mit deiner CouchDB
 *
 * Bewusst asynchron, damit Aufrufstellen nicht wissen müssen, wo die Daten liegen.
 */
export interface RecipeRepository {
  list(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<void>;
  remove(id: string): Promise<void>;
  /** „Meine Produkte“ – eine Liste pro Kochbuch, wird wie die Rezepte abgeglichen. */
  loadProducts(): Promise<MyProduct[]>;
  saveProducts(products: MyProduct[]): Promise<void>;
  /** Wochenplan „Diese Woche“ inkl. abgehakter Einkäufe – auf allen Geräten gleich. */
  loadPlan(): Promise<MealPlan>;
  savePlan(plan: MealPlan): Promise<void>;
  /**
   * Meldet Änderungen, die NICHT aus dieser App-Sitzung stammen –
   * z. B. Rezepte, die der Abgleich vom Handy auf den PC geholt hat.
   * Gibt eine Funktion zum Abmelden zurück.
   */
  onExternalChange?(callback: () => void): () => void;
}
