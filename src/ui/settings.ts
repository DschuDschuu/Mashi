import { useSyncExternalStore } from 'react';
import { localDay } from '../domain/dates';
import { activeSpecial, type SpecialId, type SpecialOverride } from '../domain/seasons';

/**
 * Einstellungen dieses Geräts – bewusst NICHT abgeglichen:
 * Am Handy möchte man vielleicht weniger anzeigen als am Tablet.
 */
export interface Settings {
  /** Über jedem Zubereitungsschritt die dafür nötigen Zutaten zeigen */
  showStepIngredients: boolean;
  /** Farbthema – je Gerät, z. B. am Tablet anders als am Handy */
  theme: Theme;
  /** Feiertagsthema von Hand an/aus – ohne Eintrag entscheidet die Saison (domain/seasons.ts) */
  specialOverride?: SpecialOverride;
}

export type Theme = 'salbei' | 'bordeaux' | 'sonne' | 'nacht';

/** Themen für die Auswahl – mit drei Farben als Vorschau (Hintergrund, Hauptfarbe, Text) */
export const THEMES: { id: Theme; label: string; colors: [string, string, string] }[] = [
  { id: 'salbei', label: 'Salbei', colors: ['#f8f6f1', '#4f8482', '#2d4748'] },
  { id: 'bordeaux', label: 'Bordeaux', colors: ['#faf6f5', '#7d2a3a', '#3d1f25'] },
  { id: 'sonne', label: 'Sonnengelb', colors: ['#fcf9f0', '#f4cf1f', '#3b321c'] },
  { id: 'nacht', label: 'Nachtblau', colors: ['#f4f6fa', '#2b3d6b', '#1d2842'] },
];

/** Feiertagsthemen – gleiche Vorschau-Farben wie oben; die Deko dazu liegt in ui/components/HalloweenDeko.tsx */
export const SPECIAL_THEMES: { id: SpecialId; label: string; colors: [string, string, string] }[] = [
  { id: 'halloween', label: 'Halloween', colors: ['#fbf5ee', '#ef7f1a', '#1b1613'] },
];

/** Feiertagsthema, das heute gilt (Saison oder eigene Wahl) */
export const specialOf = (s: Settings): SpecialId | undefined => activeSpecial(localDay(), s.specialOverride);

/**
 * Thema aufs Dokument legen (CSS: :root[data-theme=…]) und die Browserleiste mitfärben.
 * Ein Feiertagsthema liegt über dem eigenen Thema – das bleibt gespeichert und kommt nach der Saison zurück.
 */
export function applyTheme(s: Settings) {
  const root = document.documentElement;
  const theme: Theme | SpecialId = specialOf(s) ?? s.theme;
  if (theme === 'salbei') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const colors = [...THEMES, ...SPECIAL_THEMES].find((t) => t.id === theme)?.colors;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors?.[0] ?? '#f8f6f1');
}

/** Für Komponenten: welches Feiertagsthema gerade an ist */
export function useSpecial(): SpecialId | undefined {
  return specialOf(useSettings());
}

const KEY = 'mashi-settings';
const DEFAULTS: Settings = { showStepIngredients: true, theme: 'salbei' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS; // privater Modus / gesperrter Speicher → Voreinstellung
  }
}

let current = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  if ('theme' in patch || 'specialOverride' in patch) applyTheme(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
  listeners.forEach((l) => l());
}

/** Jetzt, ohne Hook – z. B. beim Start fürs Thema */
export const currentSettings = (): Settings => current;

export function useSettings(): Settings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
