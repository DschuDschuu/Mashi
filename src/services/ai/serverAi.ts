import { buildRecipePrompt, OLD_SERVER_PROMPT, parseRecipeReply, RecipeReplyError } from '../../domain/aiRecipe';
import { buildOffersPrompt, OffersReplyError, parseOffersReply, type OfferDraft } from '../../domain/offers';
import type { SyncConfig } from '../../data/sync';
import type { RecipeAiProvider, RecipeDraft, RecipeRequest } from './types';

/** Fehler mit einer Meldung, die man so in der App zeigen kann */
export class KiError extends Error {}

/** Basic-Anmeldung wie beim Abgleich (UTF-8, damit auch „ä“ im Passwort geht) */
export const basic = (u: string, p: string) => 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${u}:${p}`)));

type Body = { text?: string; message?: string } | null;

/** Einen Auftrag an <Server>/ki/rezept schicken – der Weg nimmt jeden Auftrag, Mashi prüft die Antwort selbst */
async function post(cfg: SyncConfig, prompt: string, fetchFn: typeof fetch): Promise<Response> {
  try {
    return await fetchFn(`${new URL(cfg.url).origin}/ki/rezept`, {
      method: 'POST',
      headers: { authorization: basic(cfg.username, cfg.password), 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new KiError('Der Server ist gerade nicht erreichbar – bist du offline?');
  }
}

/** Antwort lesen – bei einem Fehler eine Meldung, die man so zeigen kann */
async function textOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as Body;
  // 404: den Vermittler gibt es auf dem Server noch nicht (dann antwortet die CouchDB selbst)
  if (res.status === 404) throw new KiError('Auf deinem Server ist die KI noch nicht eingerichtet (siehe server/coolify/ANLEITUNG.md).');
  // eigene Texte, falls nicht der KI-Dienst selbst antwortet (sonst dessen Meldung)
  if (res.status === 401) throw new KiError(body?.message ?? 'Der Server hat die Anmeldung abgelehnt – bitte in den Einstellungen neu mit dem Server verbinden.');
  if (res.status === 429) throw new KiError(body?.message ?? 'Gerade zu viele Anfragen – in ein paar Minuten noch mal.');
  if (res.status === 503) throw new KiError(body?.message ?? 'Die KI ist auf dem Server noch nicht fertig eingerichtet.');
  if (!res.ok) throw new KiError(body?.message ?? 'Die KI hat gerade nicht geantwortet. Versuch es bitte noch einmal.');
  return body?.text ?? '';
}

/**
 * Die KI des verbundenen Mashi-Servers: https://<server>/ki/rezept (siehe server/ki).
 * Mashi baut den Auftrag (buildRecipePrompt), der Server reicht ihn an OpenRouter weiter,
 * die Antwort prüft wieder Mashi (parseRecipeReply). Angemeldet wie der Abgleich – kein eigener Schlüssel.
 * @param config die aktuelle Verbindung (null = nicht verbunden)
 */
export function serverRecipeAi(config: () => SyncConfig | null, fetchFn: typeof fetch = (...a) => fetch(...a)): RecipeAiProvider {
  return {
    id: 'mashi-server',
    async generateRecipe(req: RecipeRequest): Promise<RecipeDraft> {
      const cfg = config();
      if (!cfg) throw new KiError('Für echte KI-Rezepte bitte Mashi mit dem Server verbinden.');
      const full = buildRecipePrompt(req);
      let res = await post(cfg, full, fetchFn);
      // älterer Server (Grenze 8000): zu langer Auftrag → einmal mit gekürzten Vorlieben, statt zu scheitern
      if ((res.status === 400 || res.status === 413) && full.length > OLD_SERVER_PROMPT) {
        res = await post(cfg, buildRecipePrompt(req, { maxLength: OLD_SERVER_PROMPT }), fetchFn);
      }
      const text = await textOf(res);
      try {
        return parseRecipeReply(text, req);
      } catch (e) {
        throw new KiError(`${e instanceof RecipeReplyError ? e.message : 'Die Antwort der KI war nicht lesbar.'} Versuch es bitte noch einmal.`);
      }
    },
  };
}

/** Angebote mit KI lesen – nur auf Tipp, wenn Mashi den Prospekt-Text nicht ganz versteht (siehe offers.ts) */
export interface OffersAi {
  readOffers(text: string, store: string, today: string): Promise<OfferDraft[]>;
}

/**
 * Prospekt-Text über denselben Weg wie die Rezepte lesen (/ki/rezept nimmt jeden Auftrag) – dafür braucht der Server
 * kein Update. Zählt gegen dasselbe Kontingent wie die KI-Rezepte.
 */
export function serverOffersAi(config: () => SyncConfig | null, fetchFn: typeof fetch = (...a) => fetch(...a)): OffersAi {
  return {
    async readOffers(text, store, today) {
      const cfg = config();
      if (!cfg) throw new KiError('Mit KI lesen geht, sobald Mashi mit deinem Server verbunden ist.');
      const reply = await textOf(await post(cfg, buildOffersPrompt(text, store, today), fetchFn));
      try {
        return parseOffersReply(reply);
      } catch (e) {
        throw new KiError(e instanceof OffersReplyError ? e.message : 'Die Antwort der KI war nicht lesbar. Versuch es bitte noch einmal.');
      }
    },
  };
}
