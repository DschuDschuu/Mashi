/**
 * Welche Verbindung ist eingestellt? Nur das Lesen aus dem Gerät – ohne Store und PouchDB, damit auch
 * die Dienste (z. B. die KI in services/) es nutzen können, ohne einen Import-Kreis
 * (services → backend → store → services) zu bauen. Schreiben tut weiterhin backend.ts.
 */
import type { SyncConfig } from './sync';

/** 'demo' = Beispieldaten nur in diesem Browser, 'sync' = echte Daten mit der CouchDB abgeglichen */
export type Mode = 'demo' | 'sync';

export const MODE_KEY = 'mashi-mode';
export const SYNC_KEY = 'mashi-sync';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function currentMode(): Mode | null {
  return read<Mode>(MODE_KEY);
}

export function savedSyncConfig(): SyncConfig | null {
  return read<SyncConfig>(SYNC_KEY);
}
