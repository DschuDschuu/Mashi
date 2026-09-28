import type { RecipeStatus } from '../domain/types';
import type { IconName } from './components/Icon';

/**
 * Welches Linien-Icon zu welchem Katalogeintrag gehört.
 * Liegt bewusst in ui/ und nicht in domain/catalog.ts: Icons sind Darstellung,
 * und die Domäne soll nichts von der Oberfläche wissen.
 */
const DEVICE_ICONS: Record<string, IconName> = {
  herd: 'stove',
  backofen: 'oven',
  airfryer: 'airfryer',
  'monsieur-cuisine': 'mixer',
  mikrowelle: 'microwave',
  'slow-cooker': 'slowcooker',
};

export const STATUS_ICONS: Record<RecipeStatus, IconName> = {
  ki_entwurf: 'sparkles',
  zum_testen: 'flask',
  bewaehrt: 'heart',
  kochbuch: 'book',
};

/** Unbekannte (später ergänzte) Geräte bekommen ein neutrales Icon statt eines Fehlers. */
export const deviceIcon = (id: string): IconName => DEVICE_ICONS[id] ?? 'stove';
