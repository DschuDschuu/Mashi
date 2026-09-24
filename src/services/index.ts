/**
 * Die EINE Stelle, an der konkrete Anbieter verdrahtet werden.
 * Anbieter wechseln = hier eine Zeile ändern, sonst nirgends.
 */
import { localFoodTable } from '../domain/nutrition/localFoods';
import type { FoodTable } from '../domain/nutrition/types';
import { mockRecipeAi } from './ai/mockAi';
import type { RecipeAiProvider } from './ai/types';
import { placeholderImages, type ImageProvider } from './images/imageProvider';

export const recipeAi: RecipeAiProvider = mockRecipeAi;
export const imageProvider: ImageProvider = placeholderImages;
export const foodTable: FoodTable = localFoodTable;
