import type { RecipeContent } from '../../domain/types';

export interface RecipeRequest {
  /** Freitext – immer möglich, z. B. „Ich habe Hähnchenhack und Paprika …“ */
  prompt: string;
  servings?: number;
  maxMinutes?: number;
  devices?: string[];
  wishes?: string[];
}

/**
 * Was die KI liefern darf: strukturierte Rezeptdaten.
 * Bewusst KEINE Nährwerte – die berechnet ausschließlich die Nährwertengine.
 * (RecipeContent hat gar kein Feld dafür; der Typ erzwingt die Trennung.)
 */
export type RecipeDraft = RecipeContent;

export interface RecipeAiProvider {
  id: string;
  generateRecipe(req: RecipeRequest): Promise<RecipeDraft>;
  /** Phase „Import“: Text/Foto/PDF → Entwurf zur Prüfung */
  extractRecipe?(input: { text?: string; file?: Blob }): Promise<RecipeDraft>;
}
