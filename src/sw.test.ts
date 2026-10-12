import { describe, expect, it } from 'vitest';
// ?raw: Vite liefert die Dateien als Text – ohne Node-Typen im Projekt
import manifestSource from '../public/manifest.webmanifest?raw';
import swSource from '../public/sw.js?raw';

/**
 * public/sw.js in einer nachgestellten Service-Worker-Umgebung ausführen – so lässt sich
 * „Teilen → Mashi“ prüfen, ohne Android-Gerät. Nachgestellt: self, caches, Registrierung.
 */
function loadServiceWorker() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (key: string, res: Response) => void store.set(key, res),
        match: async (key: string) => store.get(key),
        addAll: async () => undefined,
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async () => undefined,
  };
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    location: new URL('https://dschudschuu.github.io/Mashi/sw.js'),
    registration: { scope: 'https://dschudschuu.github.io/Mashi/' },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  new Function('self', 'caches', swSource)(self, caches);
  return { handlers, stores };
}

async function share(body: FormData) {
  const { handlers, stores } = loadServiceWorker();
  let response: Promise<Response> | undefined;
  handlers.fetch({
    request: new Request('https://dschudschuu.github.io/Mashi/bon-teilen', { method: 'POST', body }),
    respondWith: (p: Promise<Response>) => { response = p; },
  });
  return { res: await response!, stores };
}

describe('Teilen → Mashi (Service Worker)', () => {
  it('legt das geteilte Bild ab und öffnet die Import-Seite', async () => {
    const form = new FormData();
    form.append('bon', new File([new Uint8Array([137, 80, 78, 71])], 'bon.png', { type: 'image/png' }));
    const { res, stores } = await share(form);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://dschudschuu.github.io/Mashi/#/speisekammer/bon?geteilt=1');
    const saved = stores.get('mashi-share')?.get('geteilter-bon');
    expect(saved?.headers.get('Content-Type')).toBe('image/png');
    expect((await saved!.arrayBuffer()).byteLength).toBe(4);
  });

  it('ohne Bild trotzdem zur Import-Seite – die meldet dann „nicht angekommen“', async () => {
    const { res, stores } = await share(new FormData());
    expect(res.status).toBe(303);
    expect(stores.get('mashi-share')?.size ?? 0).toBe(0);
  });

  it('das Manifest meldet Mashi als Ziel für Bilder an – passend zum Service Worker', () => {
    const manifest = JSON.parse(manifestSource);
    expect(manifest.share_target).toMatchObject({ action: './bon-teilen', method: 'POST', enctype: 'multipart/form-data' });
    expect(manifest.share_target.params.files[0]).toEqual({ name: 'bon', accept: ['image/*'] });
  });
});

/**
 * Wie loadServiceWorker – zusätzlich mit nachgestelltem Netz (fetch) und Cache-Schlüsseln als Adressen,
 * für Seitenaufrufe und /assets/ (Code-Review #6, #21).
 */
function loadWithNetwork(net: Record<string, Response>) {
  const SCOPE = 'https://dschudschuu.github.io/Mashi/';
  const handlers: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, SCOPE).href;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (k: string | { url: string }, res: Response) => void store.set(keyOf(k), res),
        match: async (k: string | { url: string }) => store.get(keyOf(k))?.clone(),
        keys: async () => [...store.keys()],
        delete: async (k: string | { url: string }) => store.delete(keyOf(k)),
        addAll: async () => undefined,
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (k: string | { url: string }) => {
      for (const s of stores.values()) if (s.has(keyOf(k))) return s.get(keyOf(k))!.clone();
      return undefined;
    },
  };
  const fetchFake = async (r: string | { url: string }) => {
    const res = net[keyOf(r)];
    if (!res) return new Response('nicht gefunden', { status: 404 });
    const copy = res.clone();
    Object.defineProperty(copy, 'type', { value: res.type }); // clone() vergisst die nachgestellte Art
    return copy;
  };
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    location: new URL(`${SCOPE}sw.js`),
    registration: { scope: SCOPE },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  new Function('self', 'caches', 'fetch', swSource)(self, caches, fetchFake);
  /** einen Abruf durch den Service Worker schicken; wartet auch auf waitUntil (z. B. Aufräumen) */
  const request = async (url: string, mode: 'navigate' | 'cors' = 'cors') => {
    let response: Promise<Response> | undefined;
    const later: Promise<unknown>[] = [];
    handlers.fetch({
      request: { url, method: 'GET', mode },
      respondWith: (p: Promise<Response>) => { response = p; },
      waitUntil: (p: Promise<unknown>) => later.push(p),
    });
    const res = await response!;
    await new Promise((r) => setTimeout(r, 20)); // Ablegen im Cache läuft nebenher
    await Promise.all(later);
    return res;
  };
  const cached = () => [...(stores.get('mashi-v1')?.keys() ?? [])].map((k) => k.replace(SCOPE, ''));
  return { request, cached, stores, SCOPE };
}

const ok = (body: string, type = 'text/html') => {
  const res = new Response(body, { status: 200, headers: { 'Content-Type': type } });
  Object.defineProperty(res, 'type', { value: 'basic' }); // wie eine Antwort vom eigenen Server
  return res;
};

describe('Service Worker: nur Brauchbares in den Cache (Code-Review #6)', () => {
  it('eine 404-Seite überschreibt die gespeicherte Startseite nicht', async () => {
    const sw = loadWithNetwork({});
    const res = await sw.request(`${sw.SCOPE}index.htm`, 'navigate');
    expect(res.status).toBe(404);
    expect(sw.cached()).toEqual([]);
  });

  it('nur die echte Startseite wird als Offline-Startseite gemerkt', async () => {
    const sw = loadWithNetwork({ [`${sw_scope()}andere.html`]: ok('<p>anders</p>') });
    await sw.request(`${sw.SCOPE}andere.html`, 'navigate');
    expect(sw.cached()).toEqual([]);
  });

  it('eine fehlende Programm-Datei (404) wird nicht für immer abgelegt', async () => {
    const sw = loadWithNetwork({});
    expect((await sw.request(`${sw.SCOPE}assets/index-ALTALTAL.js`)).status).toBe(404);
    expect(sw.cached()).toEqual([]);
  });
});

describe('Service Worker: alte Versionen räumen sich weg (Code-Review #21)', () => {
  it('nach einer neuen Startseite bleiben nur ihre Dateien – inkl. Schriften und nachgeladenem Code', async () => {
    const S = sw_scope();
    const net = {
      [S]: ok('<script type="module" src="./assets/index-NEUNEU12.js"></script><link href="./assets/index-NEUCSS12.css">'),
      [`${S}assets/index-NEUNEU12.js`]: ok('import("./src-CHUNK123.js")', 'text/javascript'),
      [`${S}assets/index-NEUCSS12.css`]: ok('@font-face{src:url(./nunito-sans-ABCDEFGH.woff2)}', 'text/css'),
      [`${S}assets/src-CHUNK123.js`]: ok('import"./index-NEUNEU12.js"', 'text/javascript'),
      [`${S}assets/index-ALTALT12.js`]: ok('alt', 'text/javascript'),
      [`${S}assets/nunito-sans-ABCDEFGH.woff2`]: ok('font', 'font/woff2'),
    };
    const sw = loadWithNetwork(net);
    // alte Version liegt schon im Cache, die Schrift auch
    await sw.request(`${S}assets/index-ALTALT12.js`);
    await sw.request(`${S}assets/nunito-sans-ABCDEFGH.woff2`);
    expect(sw.cached()).toEqual(['assets/index-ALTALT12.js', 'assets/nunito-sans-ABCDEFGH.woff2']);
    // neue Startseite geladen → aufräumen
    await sw.request(S, 'navigate');
    expect(sw.cached().sort()).toEqual(['', 'assets/index-NEUCSS12.css', 'assets/index-NEUNEU12.js', 'assets/nunito-sans-ABCDEFGH.woff2', 'assets/src-CHUNK123.js']);
  });

  it('fehlt eine Datei der neuen Version (offline, Server-Fehler), wird nichts gelöscht', async () => {
    const S = sw_scope();
    const sw = loadWithNetwork({
      [S]: ok('<script src="./assets/index-NEUNEU12.js"></script>'),
      [`${S}assets/index-ALTALT12.js`]: ok('alt', 'text/javascript'),
    });
    await sw.request(`${S}assets/index-ALTALT12.js`);
    await sw.request(S, 'navigate');
    expect(sw.cached()).toContain('assets/index-ALTALT12.js');
  });
});

function sw_scope() { return 'https://dschudschuu.github.io/Mashi/'; }
