/// <reference types="pouchdb-core" />
import type { RecipeDb } from './pouchRepository';

export interface SyncConfig {
  /** Volle Adresse der Datenbank, z. B. https://mashi-db.1.2.3.4.sslip.io/mashi */
  url: string;
  username: string;
  password: string;
}

export type SyncState =
  | { kind: 'aus' }
  | { kind: 'verbinde' }
  | { kind: 'aktuell'; at: string }
  | { kind: 'offline' }
  | { kind: 'fehler'; message: string };

type RemoteFactory = (url: string, opts: PouchDB.Configuration.RemoteDatabaseConfiguration) => RecipeDb;

/** „mashi-db.x.sslip.io“ → „https://mashi-db.x.sslip.io/mashi“ – verzeiht fehlendes https:// und /mashi. */
export function normalizeDbUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const u = new URL(url);
  if (u.pathname === '' || u.pathname === '/') u.pathname = '/mashi';
  return u.toString().replace(/\/$/, '');
}

export function remoteDb(factory: RemoteFactory, cfg: SyncConfig): RecipeDb {
  // skip_setup: Die App legt die Datenbank NIE selbst an. Das darf nur der Admin auf dem Server.
  return factory(cfg.url, { auth: { username: cfg.username, password: cfg.password }, skip_setup: true });
}

/** Verbindung prüfen, bevor wir irgendetwas speichern. Liefert eine verständliche Fehlermeldung. */
export async function testConnection(factory: RemoteFactory, cfg: SyncConfig): Promise<string | null> {
  try {
    await remoteDb(factory, cfg).info();
    return null;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) return 'Benutzername oder Passwort stimmt nicht.';
    if (status === 403) return 'Dieser Benutzer hat keinen Zugriff auf die Mashi-Datenbank.';
    if (status === 404) return 'Die Datenbank gibt es auf dem Server nicht – Adresse prüfen (endet sie auf /mashi?).';
    return 'Server nicht erreichbar. Adresse prüfen – oder CORS ist auf dem Server noch nicht für Mashi freigegeben.';
  }
}

/**
 * Dauerhafter Abgleich in beide Richtungen. Offline? PouchDB versucht es selbst weiter,
 * sobald wieder Netz da ist. Gibt eine Stopp-Funktion zurück.
 */
export function startSync(local: RecipeDb, remote: RecipeDb, onState: (s: SyncState) => void): () => void {
  onState({ kind: 'verbinde' });
  const sync = local
    .sync(remote, { live: true, retry: true })
    .on('active', () => onState({ kind: 'verbinde' }))
    .on('paused', (err) => onState(err ? { kind: 'offline' } : { kind: 'aktuell', at: new Date().toISOString() }))
    .on('denied', () => onState({ kind: 'fehler', message: 'Der Server hat eine Änderung abgelehnt (Berechtigung).' }))
    .on('error', (err) => {
      const status = (err as { status?: number }).status;
      onState({ kind: 'fehler', message: status === 401 ? 'Anmeldung abgelaufen oder Passwort geändert.' : 'Abgleich unterbrochen.' });
    });
  return () => sync.cancel();
}
