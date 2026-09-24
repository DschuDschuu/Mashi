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
};

const CATEGORY_ICONS: Record<string, IconName> = {
  fruehstueck: 'cup',
  hauptgericht: 'cloche',
  suppe: 'pot',
  'salat-bowl': 'leaf',
  beilage: 'rice',
  snack: 'cookie',
  dessert: 'cake',
  backen: 'bread',
  getraenke: 'glass',
};

export const STATUS_ICONS: Record<RecipeStatus, IconName> = {
  ki_entwurf: 'sparkles',
  zum_testen: 'flask',
  bewaehrt: 'heart',
  kochbuch: 'book',
};

/** Unbekannte (später ergänzte) Einträge bekommen ein neutrales Icon statt eines Fehlers. */
export const deviceIcon = (id: string): IconName => DEVICE_ICONS[id] ?? 'stove';
export const categoryIcon = (id: string): IconName => CATEGORY_ICONS[id] ?? 'cloche';
