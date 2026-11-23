/**
 * Die EINE Stelle, an der konkrete Anbieter verdrahtet werden.
 * Anbieter wechseln = hier eine Zeile ändern, sonst nirgends.
 */
import { localFoodTable } from '../domain/nutrition/localFoods';
import type { FoodTable } from '../domain/nutrition/types';
import { currentMode, savedSyncConfig } from '../data/connection';
import { mockRecipeAi } from './ai/mockAi';
import { KiError, serverOffersAi, serverRecipeAi, type OffersAi } from './ai/serverAi';
import { openFoodFacts, type BarcodeLookup } from './barcode/openFoodFacts';
import type { RecipeAiProvider } from './ai/types';
import { placeholderImages, type ImageProvider } from './images/imageProvider';
import { serverPdfText, type LeafletReader } from './leaflets/serverPdfText';

// Echte Daten → die KI des verbundenen Servers (server/ki, OpenRouter); Demo → Beispielrezepte ohne Netz
const serverAi = serverRecipeAi(savedSyncConfig);
export const recipeAi: RecipeAiProvider = {
  id: 'auto',
  generateRecipe: (req) => (currentMode() === 'sync' ? serverAi : mockRecipeAi).generateRecipe(req),
};
// Angebote mit KI lesen (Einkauf planen) – nur mit Server; die Demo liest den Text selbst
const serverOffers = serverOffersAi(savedSyncConfig);
export const offersAi: OffersAi = {
  readOffers: (...a) => (currentMode() === 'sync'
    ? serverOffers.readOffers(...a)
    : Promise.reject(new KiError('Mit KI lesen geht, sobald Mashi mit deinem Server verbunden ist – in der Demo liest Mashi selbst.'))),
};
// Prospekte von Lidl und Kaufland, ohne KI (domain/leaflets.ts): welche es gibt, fragt der Browser selbst beim
// Prospekt-Dienst; das PDF liest dein Server (zu groß fürs Handy), bei Lidl mit Lage für die Preise
// (domain/leafletPrices.ts). Demo → Meldung „bitte mit dem Server verbinden“.
export { loadWeekFlyers, LeafletError } from './leaflets/schwarz';
export const readLeaflet: LeafletReader = serverPdfText(() => (currentMode() === 'sync' ? savedSyncConfig() : null));
export const imageProvider: ImageProvider = placeholderImages;
export const foodTable: FoodTable = localFoodTable;
export const barcodeLookup: BarcodeLookup = openFoodFacts;
