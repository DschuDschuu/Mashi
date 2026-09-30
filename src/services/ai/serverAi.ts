import { buildRecipePrompt, parseRecipeReply, RecipeReplyError } from '../../domain/aiRecipe';
import type { SyncConfig } from '../../data/sync';
import type { RecipeAiProvider, RecipeDraft, RecipeRequest } from './types';

/** Fehler mit einer Meldung, die man so in der App zeigen kann */
export class KiError extends Error {}

/** Basic-Anmeldung wie beim Abgleich (UTF-8, damit auch „ä“ im Passwort geht) */
const basic = (u: string, p: string) => 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${u}:${p}`)));

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
      let res: Response;
      try {
        res = await fetchFn(`${new URL(cfg.url).origin}/ki/rezept`, {
          method: 'POST',
          headers: { authorization: basic(cfg.username, cfg.password), 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: buildRecipePrompt(req) }),
        });
      } catch {
        throw new KiError('Der Server ist gerade nicht erreichbar – bist du offline?');
      }
      const body = (await res.json().catch(() => null)) as { text?: string; message?: string } | null;
      // 404: den Vermittler gibt es auf dem Server noch nicht (dann antwortet die CouchDB selbst)
      if (res.status === 404) throw new KiError('Auf deinem Server ist die KI noch nicht eingerichtet (siehe server/coolify/ANLEITUNG.md).');
      // eigene Texte, falls nicht der KI-Dienst selbst antwortet (sonst dessen Meldung)
      if (res.status === 401) throw new KiError(body?.message ?? 'Der Server hat die Anmeldung abgelehnt – bitte in den Einstellungen neu mit dem Server verbinden.');
      if (res.status === 429) throw new KiError(body?.message ?? 'Gerade zu viele Anfragen – in ein paar Minuten noch mal.');
      if (res.status === 503) throw new KiError(body?.message ?? 'Die KI ist auf dem Server noch nicht fertig eingerichtet.');
      if (!res.ok) throw new KiError(body?.message ?? 'Die KI hat gerade nicht geantwortet. Versuch es bitte noch einmal.');
      try {
        return parseRecipeReply(body?.text ?? '', req);
      } catch (e) {
        throw new KiError(`${e instanceof RecipeReplyError ? e.message : 'Die Antwort der KI war nicht lesbar.'} Versuch es bitte noch einmal.`);
      }
    },
  };
}
