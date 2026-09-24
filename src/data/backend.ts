import PouchDB from 'pouchdb-browser';
import { useSyncExternalStore } from 'react';
import { LocalRecipeRepository } from './localRepository';
import { PouchRecipeRepository, type RecipeDb } from './pouchRepository';
import { initStore } from './store';
import { remoteDb, startSync, testConnection, type SyncConfig, type SyncState } from './sync';

/**
 * Welcher Speicher läuft? Zwei getrennte Welten:
 * - 'demo': Beispieldaten, nur in diesem Browser. Wird NIE hochgeladen.
 * - 'sync': deine echten Rezepte – lokal in IndexedDB und abgeglichen mit deiner CouchDB.
 * Ohne Auswahl zeigt die App den Verbindungs-Bildschirm.
 */
export type Mode = 'demo' | 'sync';

const MODE_KEY = 'mashi-mode';
const SYNC_KEY = 'mashi-sync';
const LOCAL_DB = 'mashi-recipes';

/**
 * Voreinstellung im Verbindungs-Bildschirm, damit man nur Benutzer + Passwort tippt.
 * Kein Geheimnis – geschützt ist die Datenbank durch die Anmeldung. Per VITE_COUCHDB_URL überschreibbar.
 */
export const DEFAULT_DB_URL: string = import.meta.env.VITE_COUCHDB_URL ?? 'https://mashi.carapaxo.de/mashi';

const remoteFactory = (url: string, opts: PouchDB.Configuration.RemoteDatabaseConfiguration) => new PouchDB(url, opts) as RecipeDb;

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

// ── Sync-Status für die Oberfläche ────────────────────────────────

let state: SyncState = { kind: 'aus' };
const listeners = new Set<() => void>();
function setState(s: SyncState) {
  state = s;
  listeners.forEach((l) => l());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

// ── Start ─────────────────────────────────────────────────────────

/** Beim App-Start aufrufen. Gibt den aktiven Modus zurück (null = noch nichts gewählt). */
export async function boot(): Promise<Mode | null> {
  const mode = currentMode();
  const cfg = savedSyncConfig();

  if (mode === 'sync' && cfg) {
    const local = new PouchDB(LOCAL_DB) as RecipeDb;
    await initStore(new PouchRecipeRepository(local));
    startSync(local, remoteDb(remoteFactory, cfg), setState);
    return 'sync';
  }
  if (mode === 'demo') {
    await initStore(new LocalRecipeRepository());
    return 'demo';
  }
  return null;
}

/** Verbindung testen, speichern und App neu starten. Gibt eine Fehlermeldung zurück oder lädt neu. */
export async function connect(cfg: SyncConfig): Promise<string | null> {
  const error = await testConnection(remoteFactory, cfg);
  if (error) return error;
  // Hinweis: Das Passwort liegt danach im Browser dieses Geräts (wie bei Obsidian LiveSync).
  // Deshalb bekommt Mashi einen eigenen CouchDB-Benutzer, der NUR die Mashi-Datenbank sieht.
  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
  localStorage.setItem(MODE_KEY, JSON.stringify('sync'));
  location.reload();
  return null;
}

export function startDemo() {
  localStorage.setItem(MODE_KEY, JSON.stringify('demo'));
  location.reload();
}

/**
 * Abmelden: Zugangsdaten UND die lokale Kopie auf diesem Gerät löschen.
 * Auf dem Server und deinen anderen Geräten bleibt alles erhalten.
 */
export async function disconnect() {
  localStorage.removeItem(SYNC_KEY);
  localStorage.removeItem(MODE_KEY);
  await (new PouchDB(LOCAL_DB) as RecipeDb).destroy();
  location.reload();
}

/** Demo verlassen → zurück zum Verbindungs-Bildschirm. Die Beispieldaten bleiben liegen. */
export function leaveDemo() {
  localStorage.removeItem(MODE_KEY);
  location.reload();
}
