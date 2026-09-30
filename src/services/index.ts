/**
 * Die EINE Stelle, an der konkrete Anbieter verdrahtet werden.
 * Anbieter wechseln = hier eine Zeile ändern, sonst nirgends.
 */
import { localFoodTable } from '../domain/nutrition/localFoods';
import type { FoodTable } from '../domain/nutrition/types';
import { currentMode, savedSyncConfig } from '../data/connection';
import { mockRecipeAi } from './ai/mockAi';
import { serverRecipeAi } from './ai/serverAi';
import { openFoodFacts, type BarcodeLookup } from './barcode/openFoodFacts';
import type { RecipeAiProvider } from './ai/types';
import { placeholderImages, type ImageProvider } from './images/imageProvider';

// Echte Daten → die KI des verbundenen Servers (server/ki, OpenRouter); Demo → Beispielrezepte ohne Netz
const serverAi = serverRecipeAi(savedSyncConfig);
export const recipeAi: RecipeAiProvider = {
  id: 'auto',
  generateRecipe: (req) => (currentMode() === 'sync' ? serverAi : mockRecipeAi).generateRecipe(req),
};
export const imageProvider: ImageProvider = placeholderImages;
export const foodTable: FoodTable = localFoodTable;
export const barcodeLookup: BarcodeLookup = openFoodFacts;
