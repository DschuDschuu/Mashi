import { CLIENT_STORE, flyersFromOverview, overviewUrl, weekFlyers, type LeafletClient, type LeafletFlyer } from '../../domain/leaflets';

/** Fehler mit einer Meldung, die man so in der App zeigen kann */
export class LeafletError extends Error {}

/** so lange wartet Mashi auf den Prospekt-Dienst */
const TIMEOUT_MS = 15_000;

/**
 * Die Wochenprospekte für den Einkaufstag – direkt vom Prospekt-Dienst (er erlaubt Abrufe von jeder Webseite, siehe
 * domain/leaflets.ts). Abgerufen wird nur die selbst gebaute Adresse.
 * @param shopDay Einkaufstag (JJJJ-MM-TT, Julia: Samstag – offerWeekEnd)
 */
export async function loadWeekFlyers(
  client: LeafletClient, shopDay: string, opts: { storeId?: string; fetchFn?: typeof fetch } = {},
): Promise<LeafletFlyer[]> {
  const fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  const store = CLIENT_STORE[client];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let json: unknown;
  try {
    const res = await fetchFn(overviewUrl(client, opts.storeId), { signal: ctrl.signal, headers: { accept: 'application/json' } });
    // Kaufland mit unbekannter Filiale antwortet 400
    if (res.status === 400 && opts.storeId) throw new LeafletError(`Die Filialnummer ${opts.storeId} kennt ${store} nicht – bitte prüfen.`);
    if (!res.ok) throw new LeafletError(`Der ${store}-Prospekt ließ sich gerade nicht laden (Fehler ${res.status}). Später noch mal – oder Text einfügen.`);
    json = await res.json();
  } catch (e) {
    if (e instanceof LeafletError) throw e;
    throw new LeafletError(`Der ${store}-Prospekt ist gerade nicht erreichbar – bist du offline?`);
  } finally {
    clearTimeout(timer);
  }
  const flyers = weekFlyers(flyersFromOverview(json), shopDay);
  if (!flyers.length) throw new LeafletError(`Für deinen Einkaufstag hat ${store} (noch) keinen Prospekt veröffentlicht.`);
  return flyers;
}
