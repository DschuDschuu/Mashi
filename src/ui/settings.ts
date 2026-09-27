import { useSyncExternalStore } from 'react';

/**
 * Einstellungen dieses Geräts – bewusst NICHT abgeglichen:
 * Am Handy möchte man vielleicht weniger anzeigen als am Tablet.
 */
export interface Settings {
  /** Über jedem Zubereitungsschritt die dafür nötigen Zutaten zeigen */
  showStepIngredients: boolean;
  /** Farbthema – je Gerät, z. B. am Tablet anders als am Handy */
  theme: Theme;
  /** Einführung gesehen (oder übersprungen) */
  onboarded: boolean;
}

export type Theme = 'salbei' | 'bordeaux' | 'sonne' | 'nacht';

/** Themen für die Auswahl – mit drei Farben als Vorschau (Hintergrund, Hauptfarbe, Text) */
export const THEMES: { id: Theme; label: string; colors: [string, string, string] }[] = [
  { id: 'salbei', label: 'Salbei', colors: ['#f8f6f1', '#4f8482', '#2d4748'] },
  { id: 'bordeaux', label: 'Bordeaux', colors: ['#faf6f5', '#7d2a3a', '#3d1f25'] },
  { id: 'sonne', label: 'Sonnengelb', colors: ['#fcf9f0', '#f4cf1f', '#3b321c'] },
  { id: 'nacht', label: 'Nachtblau', colors: ['#f4f6fa', '#2b3d6b', '#1d2842'] },
];

/** Thema aufs Dokument legen (CSS: :root[data-theme=…]) und die Browserleiste mitfärben */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'salbei') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.id === theme)?.colors[0] ?? '#f8f6f1');
}

const KEY = 'mashi-settings';
const DEFAULTS: Settings = { showStepIngredients: true, theme: 'salbei', onboarded: false };

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
  if (patch.theme) applyTheme(patch.theme);
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
