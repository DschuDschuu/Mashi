import type { SyncConfig } from '../../data/sync';
import { basic } from '../ai/serverAi';
import { LeafletError } from './schwarz';

/** PDFs nur von hier (wie domain/leaflets.ts und server/ki) – eine andere Adresse schickt Mashi gar nicht erst los */
const PDF_HOST = 'https://assets.leaflets.schwarz/';
/** der Server lädt den Prospekt (Kaufland: bis über 100 MB) und liest ihn – das darf dauern */
const TIMEOUT_MS = 120_000;

/** Ein gelesener Prospekt: Text je Seite, auf Wunsch die Wörter mit Lage (für Lidl-Preise, domain/leafletPrices.ts) */
export interface LeafletText {
  pages: string[];
  /** ungeprüft – priceRows prüft selbst */
  layout?: unknown;
}
export type LeafletReader = (pdfUrl: string, opts?: { layout?: boolean }) => Promise<LeafletText>;

/**
 * Prospekt-PDF → Text über deinen Server (server/ki: POST /ki/prospekttext, mit poppler).
 * Warum nicht im Handy: Die PDFs sind fast nur Bilder (Lidl 20–40 MB, Kaufland bis ~135 MB pro Woche), und der
 * Prospekt-Host liefert nur ganze Dateien – das Handy müsste alles laden. Der Server schickt nur den Text zurück
 * (mit layout auch die Wörter mit Lage, gepackt ~150 KB). Ohne KI: ausgewertet wird in der App (domain/leaflets.ts).
 * Angemeldet wie der Abgleich.
 * @param config die aktuelle Verbindung (null = nicht verbunden, z. B. Demo)
 */
export function serverPdfText(config: () => SyncConfig | null, fetchFn: typeof fetch = (...a) => fetch(...a)): LeafletReader {
  return async (pdfUrl, opts = {}) => {
    if (!pdfUrl.startsWith(PDF_HOST)) throw new LeafletError('Der Prospekt kam von einer unbekannten Adresse – Mashi öffnet ihn nicht.');
    const cfg = config();
    if (!cfg) throw new LeafletError('Prospekte liest dein Mashi-Server – dafür bitte mit dem Server verbinden.');
    let res: Response;
    try {
      res = await fetchFn(`${new URL(cfg.url).origin}/ki/prospekttext`, {
        method: 'POST',
        headers: { authorization: basic(cfg.username, cfg.password), 'content-type': 'application/json' },
        body: JSON.stringify(opts.layout ? { url: pdfUrl, layout: true } : { url: pdfUrl }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new LeafletError('Dein Server war nicht erreichbar oder zu langsam – bist du offline? Sonst später noch mal.');
    }
    const body = (await res.json().catch(() => null)) as { pages?: unknown; layout?: unknown; message?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message : null;
    // 404 ohne eigenen Text: den Weg gibt es auf dem Server noch nicht (alter KI-Dienst oder gar keiner)
    if (res.status === 404 && !message) throw new LeafletError('Dein Server kann Prospekte noch nicht lesen – bitte die neue Compose-Datei einspielen (server/coolify/ANLEITUNG.md).');
    if (res.status === 401) throw new LeafletError(message ?? 'Der Server hat die Anmeldung abgelehnt – bitte in den Einstellungen neu mit dem Server verbinden.');
    if (!res.ok) throw new LeafletError(message ?? `Dein Server konnte den Prospekt gerade nicht lesen (Fehler ${res.status}). Später noch mal – oder Text einfügen.`);
    const pages = body?.pages;
    if (!Array.isArray(pages) || !pages.every((p) => typeof p === 'string')) throw new LeafletError('Die Antwort deines Servers war nicht lesbar. Versuch es bitte noch einmal.');
    // älterer Server ohne layout: einfach ohne Preise weiter
    return body?.layout != null ? { pages, layout: body.layout } : { pages };
  };
}
