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
  /**
   * Meldet Änderungen, die NICHT aus dieser App-Sitzung stammen –
   * z. B. Rezepte, die der Abgleich vom Handy auf den PC geholt hat.
   * Gibt eine Funktion zum Abmelden zurück.
   */
  onExternalChange?(callback: () => void): () => void;
}
