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
