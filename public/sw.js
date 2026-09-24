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
/** Kurzzeit-Ablage für einen geteilten Kassenbon – muss zu src/pwa.ts passen. */
const SHARE_CACHE = 'mashi-share';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mashi-') && k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
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

  // „Teilen → Mashi“ (share_target im Manifest): Android schickt das Bild per POST hierher.
  // Kurz ablegen und die Import-Seite öffnen – die holt es dort ab (takeSharedReceipt).
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/bon-teilen')) {
    event.respondWith((async () => {
      try {
        const file = (await req.formData()).get('bon');
        if (file && typeof file !== 'string') {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put('geteilter-bon', new Response(file, { headers: { 'Content-Type': file.type || 'image/png' } }));
        }
      } catch { /* dann meldet die Import-Seite, dass nichts angekommen ist */ }
      return Response.redirect(new URL('./#/speisekammer/bon?geteilt=1', self.registration.scope).href, 303);
    })());
    return;
  }

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
