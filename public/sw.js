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

/**
 * Nur Brauchbares ablegen (Code-Review #6): eine Fehlerseite (404 von GitHub Pages, kurzer 5xx) im Cache würde beim
 * nächsten Offline-Start angezeigt – bzw. bei /assets/ für immer ausgeliefert.
 */
const cacheable = (res) => res.ok && res.type === 'basic';

/** Die Startseite der App (…/Mashi/ bzw. …/Mashi/index.html) – nur sie wird als „./“ abgelegt */
const isStartPage = (url) => {
  const scope = new URL(self.registration.scope).pathname;
  return url.pathname === scope || url.pathname === `${scope}index.html`;
};

/**
 * Dateinamen mit Hash aus dem Build (index-BECOnJt7.js, nunito-sans-…-AkRraKH2.woff2) – nur mit „./“ bzw. „assets/“
 * davor, so wie Vite sie in Startseite, Code und Stile schreibt (kein Zufallstreffer im Programmtext)
 */
const ASSET_NAME = /(?<=(?:\.\/|assets\/))[\w.-]+-[\w-]{8}\.(?:js|css|woff2?|png|jpe?g|svg|webp)/g;

/**
 * Alte Versionen aus dem Cache räumen (Code-Review #21): Jede neue Version bringt neue Dateinamen mit, die alten
 * blieben sonst für immer liegen – im selben Speicher, den die Rezepte brauchen. Behalten wird, was die neue
 * Startseite nennt, und was deren Programmcode und Stile nennen (nachgeladener Code, Schriften).
 */
async function pruneAssets(html) {
  const cache = await caches.open(CACHE);
  const keep = new Set(html.match(ASSET_NAME) ?? []);
  if (!keep.size) return; // keine erkennbare Startseite – lieber nichts löschen
  const todo = [...keep];
  while (todo.length) {
    const name = todo.pop();
    if (!/\.(js|css)$/.test(name)) continue;
    const url = new URL(`./assets/${name}`, self.registration.scope).href;
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url).catch(() => undefined);
      if (res && cacheable(res)) await cache.put(url, res.clone());
    }
    if (!res || !res.ok) return; // eine Datei der neuen Version fehlt – dann lieber nichts löschen
    for (const n of (await res.clone().text()).match(ASSET_NAME) ?? []) if (!keep.has(n)) { keep.add(n); todo.push(n); }
  }
  for (const req of await cache.keys()) {
    const path = new URL(req.url ?? req).pathname;
    if (path.includes('/assets/') && !keep.has(path.split('/').pop())) await cache.delete(req);
  }
}

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
          // nur die echte Startseite, und nur, wenn sie geklappt hat – sonst stünde beim nächsten Offline-Start ein 404 da
          if (cacheable(res) && isStartPage(url)) {
            const copy = res.clone();
            const text = res.clone().text();
            event.waitUntil(caches.open(CACHE).then((c) => c.put('./', copy)).then(() => text).then(pruneAssets).catch(() => undefined));
          }
          return res;
        })
        .catch(() => caches.match('./').then((r) => r ?? caches.match(req))),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (cacheable(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Übrige eigene Dateien (Manifest, Icons): Netz, sonst Cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (cacheable(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
