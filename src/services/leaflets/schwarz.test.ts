import { describe, expect, it } from 'vitest';
import { LeafletError, loadWeekFlyers } from './schwarz';

// erfundene Antwort im Aufbau des Prospekt-Diensts
const overview = { categories: [{ subcategories: [{ name: 'Unsere Aktionsprospekte', flyers: [
  { name: 'Aktionsprospekt', offerStartDate: '2026-11-23', offerEndDate: '2026-11-28', pdfUrl: 'https://assets.leaflets.schwarz/leaflets/pdfs/test/a.pdf' },
] }] }] };
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('Prospekt-Dienst abrufen', () => {
  it('Übersicht mit fester Adresse → Wochenprospekte mit PDF', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return res(200, overview); }) as typeof fetch;
    expect((await loadWeekFlyers('lidl', '2026-11-28', { fetchFn })).map((f) => f.pdfUrl)).toEqual(['https://assets.leaflets.schwarz/leaflets/pdfs/test/a.pdf']);
    expect(urls).toEqual(['https://endpoints.leaflets.schwarz/v4/overview/?region_id=0&client_locale=lidl/de-DE']);
  });

  it('verständliche Meldungen: offline, unbekannte Filiale, Fehler, kein Prospekt', async () => {
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(loadWeekFlyers('lidl', '2026-11-28', { fetchFn: offline })).rejects.toThrow(/offline/);
    await expect(loadWeekFlyers('kaufland', '2026-11-28', { storeId: '99', fetchFn: (async () => res(400, {})) as typeof fetch })).rejects.toThrow(/Filialnummer 99/);
    await expect(loadWeekFlyers('lidl', '2026-11-28', { fetchFn: (async () => res(503, {})) as typeof fetch })).rejects.toThrow(/Fehler 503/);
    await expect(loadWeekFlyers('lidl', '2027-01-02', { fetchFn: (async () => res(200, overview)) as typeof fetch })).rejects.toBeInstanceOf(LeafletError);
  });
});
