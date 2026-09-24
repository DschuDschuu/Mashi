import type { RecipeSource, RecipeStatus } from './types';

/**
 * Stammdaten. Neue Geräte oder Kategorien = neuer Eintrag hier,
 * keine Änderung am Datenmodell nötig (IDs sind offene Strings).
 */

export type Tint = 'mint' | 'sky' | 'sage' | 'peach' | 'rose' | 'butter' | 'sand';

export interface CatalogEntry {
  id: string;
  label: string;
  tint: Tint;
}

export const DEVICES: CatalogEntry[] = [
  { id: 'herd', label: 'Herd', tint: 'sage' },
  { id: 'backofen', label: 'Backofen', tint: 'sky' },
  { id: 'airfryer', label: 'Airfryer', tint: 'mint' },
  { id: 'monsieur-cuisine', label: 'Monsieur Cuisine', tint: 'peach' },
  { id: 'mikrowelle', label: 'Mikrowelle', tint: 'sand' },
];

export const CATEGORIES: CatalogEntry[] = [
  { id: 'fruehstueck', label: 'Frühstück', tint: 'butter' },
  { id: 'hauptgericht', label: 'Hauptgericht', tint: 'mint' },
  { id: 'suppe', label: 'Suppe & Eintopf', tint: 'rose' },
  { id: 'salat-bowl', label: 'Salat & Bowl', tint: 'mint' },
  { id: 'beilage', label: 'Beilage', tint: 'sand' },
  { id: 'snack', label: 'Snack', tint: 'butter' },
  { id: 'dessert', label: 'Dessert', tint: 'rose' },
  { id: 'backen', label: 'Backen', tint: 'sand' },
  { id: 'getraenke', label: 'Getränke', tint: 'sky' },
];

export interface StatusInfo {
  label: string;
  /** kurze Erklärung für Hilfetexte */
  hint: string;
  tint: Tint;
}

export const STATUS_INFO: Record<RecipeStatus, StatusInfo> = {
  ki_entwurf: { label: 'KI-Idee', hint: 'Noch nicht ausprobiert und noch nicht im Kochbuch.', tint: 'sky' },
  zum_testen: { label: 'Zum Testen', hint: 'Vorgemerkt – koch es und sag, wie es war.', tint: 'peach' },
  bewaehrt: { label: 'Bewährt', hint: 'Hat geschmeckt. Jetzt noch feinschleifen und übernehmen.', tint: 'rose' },
  kochbuch: { label: 'Mein Rezept', hint: 'Deine endgültige, persönliche Version.', tint: 'mint' },
};

export const SOURCE_INFO: Record<RecipeSource, { label: string }> = {
  ki: { label: 'Mit KI erstellt' },
  selbst: { label: 'Selbst erstellt' },
  import: { label: 'Importiert' },
};

export const DIFFICULTY_LABEL = { 1: 'Einfach', 2: 'Mittel', 3: 'Anspruchsvoll' } as const;

const byId = (list: CatalogEntry[], id: string) => list.find((e) => e.id === id);

export function deviceInfo(id: string): CatalogEntry {
  return byId(DEVICES, id) ?? { id, label: id, tint: 'sand' };
}

export function categoryInfo(id: string): CatalogEntry {
  return byId(CATEGORIES, id) ?? { id, label: id, tint: 'sand' };
}
