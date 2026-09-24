import { useSyncExternalStore } from 'react';

// ── Neue Version erkennen ──────────────────────────────────────────

/**
 * Jede Version hat einen Fingerabdruck im Dateinamen des Programmcodes
 * („assets/index-CPmUfL2i.js“). Ändert er sich auf dem Server, gibt es eine neue Version.
 */
export function buildIdFrom(html: string): string | null {
  return html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

let updateAvailable = false;
const listeners = new Set<() => void>();

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => updateAvailable);
}

const CHECK_EVERY = 30 * 60 * 1000;
const MIN_GAP = 60 * 1000;

/**
 * Warum überhaupt nötig: Android hält die installierte App oft nur im Hintergrund.
 * Tippt man wieder aufs Symbol, erscheint die ALTE, noch laufende Seite – ohne Neuladen.
 * Deshalb prüfen wir beim Zurückkommen (und alle 30 Min.) selbst, ob es etwas Neues gibt.
 * Neu geladen wird nie automatisch – sonst ginge z. B. eine halbe Eingabe im Formular verloren.
 */
export function startUpdateCheck() {
  if (!import.meta.env.PROD) return;
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  const current = script && buildIdFrom(script.src);
  if (!current) return;

  let last = 0;
  const check = async () => {
    if (updateAvailable || !navigator.onLine || Date.now() - last < MIN_GAP) return;
    last = Date.now();
    try {
      const html = await (await fetch('./', { cache: 'no-store' })).text();
      const remote = buildIdFrom(html);
      if (remote && remote !== current) {
        updateAvailable = true;
        listeners.forEach((l) => l());
      }
    } catch {
      /* offline oder Server kurz weg – beim nächsten Mal wieder */
    }
  };
  document.addEventListener('visibilitychange', () => !document.hidden && void check());
  window.addEventListener('online', () => void check());
  setInterval(() => void check(), CHECK_EVERY);
}

// ── Geteilter Kassenbon ────────────────────────────────────────────

/** Muss zu sw.js passen: dort legt der Service Worker das geteilte Bild ab. */
const SHARE_CACHE = 'mashi-share';
const SHARE_KEY = 'geteilter-bon';

/** Das aus Lidl Plus (o. Ä.) geteilte Bild abholen – einmalig, danach ist es weg. */
export async function takeSharedReceipt(): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const res = await cache.match(SHARE_KEY);
  if (!res) return null;
  await cache.delete(SHARE_KEY);
  return res.blob();
}

// ── Service Worker ─────────────────────────────────────────────────

/**
 * Service Worker nur im fertigen Build – im Entwicklungsmodus würde er
 * alte Dateien ausliefern und jede Änderung verstecken.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // Beim allerersten Besuch lädt die Seite ihre Dateien, BEVOR der Service Worker
      // aktiv ist. Wir sagen ihm deshalb, was schon geladen wurde – damit auch der
      // allererste Start danach offline funktioniert.
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => new URL(u).origin === location.origin);
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'cache-urls', urls: [location.href, ...urls] });
    } catch (e) {
      console.warn('Mashi: Service Worker nicht registriert', e);
    }
  });
}
