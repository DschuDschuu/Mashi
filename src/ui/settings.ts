import { useSyncExternalStore } from 'react';

/**
 * Einstellungen dieses Geräts – bewusst NICHT abgeglichen:
 * Am Handy möchte man vielleicht weniger anzeigen als am Tablet.
 */
export interface Settings {
  /** Über jedem Zubereitungsschritt die dafür nötigen Zutaten zeigen */
  showStepIngredients: boolean;
}

const KEY = 'mashi-settings';
const DEFAULTS: Settings = { showStepIngredients: true };

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
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
