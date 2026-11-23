import { describe, expect, it } from 'vitest';
import { LeafletError } from './schwarz';
import { serverPdfText } from './serverPdfText';

const cfg = { url: 'https://mashi.example.test/mashi', username: 'julia-test', password: 'pässwort-test' };
const PDF = 'https://assets.leaflets.schwarz/leaflets/pdfs/test/a.pdf';
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const fails = (p: Promise<unknown>) => p.then(() => { throw new Error('hätte scheitern sollen'); }, (e: unknown) => {
  expect(e).toBeInstanceOf(LeafletError);
  return (e as Error).message;
});

describe('Prospekt-Text über deinen Server', () => {
  it('fragt <Server>/ki/prospekttext mit der Abgleich-Anmeldung und bekommt den Text je Seite', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const read = serverPdfText(() => cfg, (async (url: string, init: RequestInit) => { calls.push({ url, init }); return res(200, { pages: ['Ab Do. 26.11.', 'Seite 2'] }); }) as typeof fetch);
    expect(await read(PDF)).toEqual({ pages: ['Ab Do. 26.11.', 'Seite 2'] });
    expect(calls[0].url).toBe('https://mashi.example.test/ki/prospekttext');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ url: PDF });
    expect((calls[0].init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
  });

  it('mit layout (Lidl-Preise): fragt danach und reicht die Wörter weiter – ein älterer Server ohne bleibt nutzbar', async () => {
    const bodies: unknown[] = [];
    const layout = { fonts: [[10, 'A']], pages: [[['Testkohl', 1, 2, 3, 4, 0]]] };
    const answer = (withLayout: boolean) => serverPdfText(() => cfg, (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return res(200, withLayout ? { pages: ['x'], layout } : { pages: ['x'] });
    }) as typeof fetch);
    expect(await answer(true)(PDF, { layout: true })).toEqual({ pages: ['x'], layout });
    expect(await answer(false)(PDF, { layout: true })).toEqual({ pages: ['x'] });
    expect(bodies).toEqual([{ url: PDF, layout: true }, { url: PDF, layout: true }]);
  });

  it('fremde Adresse oder nicht verbunden (Demo): gar keine Anfrage', async () => {
    let asked = false;
    const fetchFn = (async () => { asked = true; return res(200, { pages: [] }); }) as typeof fetch;
    expect(await fails(serverPdfText(() => cfg, fetchFn)('https://example.test/a.pdf'))).toMatch(/unbekannten Adresse/);
    expect(await fails(serverPdfText(() => null, fetchFn)(PDF))).toMatch(/mit dem Server verbinden/);
    expect(asked).toBe(false);
  });

  it('Meldungen: alter Server, Meldung des Servers, offline, kaputte Antwort', async () => {
    const answer = (r: Response) => serverPdfText(() => cfg, (async () => r) as typeof fetch)(PDF);
    // alter KI-Dienst: 404 ohne eigenen Text
    expect(await fails(answer(res(404, { error: 'unbekannt' })))).toMatch(/neue Compose-Datei/);
    // neuer Dienst, Prospekt-Fassung weg: 404 mit Text – den zeigt Mashi
    expect(await fails(answer(res(404, { message: 'Den Prospekt gibt es so nicht mehr – bitte noch einmal holen.' })))).toMatch(/noch einmal holen/);
    expect(await fails(answer(res(503, { message: 'Dein Server kann Prospekte noch nicht lesen (pdftotext fehlt)' })))).toMatch(/pdftotext/);
    expect(await fails(answer(res(502, null)))).toMatch(/Fehler 502/);
    expect(await fails(answer(res(200, { pages: [1, 2] })))).toMatch(/nicht lesbar/);
    expect(await fails(serverPdfText(() => cfg, (async () => { throw new TypeError('offline'); }) as typeof fetch)(PDF))).toMatch(/offline/);
  });
});
