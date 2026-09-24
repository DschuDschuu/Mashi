/* Mashi Service Worker – macht die App offline-fähig.
 *
 * Strategie:
 * - Seitenaufruf (index.html): erst Netz, sonst Cache → Updates kommen sofort an.
 * - /assets/…: Dateinamen enthalten einen Hash und ändern sich bei jeder neuen
 *   Version. Deshalb gefahrlos: erst Cache, sonst Netz.
 * - Andere Server (deine CouchDB!) werden NIE abgefangen – den Abgleich macht PouchDB.
 *
 * CACHE nur hochzählen, wenn sich die Strategie ändert – neue App-Versionen
 * brauchen das nicht (neue Hash-Namen, network-first für index.html).
 */
const CACHE = 'mashi-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mashi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'cache-urls') {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(event.data.urls).catch(() => undefined)));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      // cache: 'reload' umgeht den HTTP-Cache des Browsers – sonst kämen Updates verzögert an.
      fetch(req, { cache: 'reload' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r ?? caches.match(req))),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Übrige eigene Dateien (Manifest, Icons): Netz, sonst Cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
