// Mashi-KI: kleiner Vermittler zwischen der App und OpenRouter.
//
// Warum ein Server: Mashi liegt öffentlich auf GitHub Pages – ein API-Schlüssel im App-Code wäre für
// jeden lesbar. Hier liegt er nur in den Umgebungsvariablen des Servers (Coolify). Nutzen darf ihn nur, wer sich an der
// Mashi-CouchDB anmelden kann (dieselbe Anmeldung wie der Abgleich) – geprüft über /_session.
//
// Bewusst ohne Pakete (nur Node): nichts zu installieren, wenig Angriffsfläche.
// Diese Datei steht wörtlich in ../coolify/docker-compose.yml (per content:) – darum KEIN Dollar-Zeichen
// vor Klammer oder Buchstabe (keine Template-Strings mit Platzhaltern): Compose/Coolify würden das als
// eigene Variable ersetzen, und der Code wäre still kaputt. Ein Test prüft das.
// Nur Rezepte: feste Anweisung, Grenzen für Länge und Antwort, Anfragen je Person begrenzt.
//
// Wege: POST /rezept, GET /status – jeweils auch mit /ki davor (Coolify schneidet das Präfix standardmäßig
// ab, ohne „Strip Prefixes“ kommt es mit). Folge: eine CouchDB-Datenbank namens „ki“ ist nicht möglich.
//
// Umgebung (in Coolify unter Environment Variables, siehe ../coolify/ANLEITUNG.md):
//   OPENROUTER_API_KEY   Schlüssel von openrouter.ai (Pflicht)
//   OPENROUTER_MODEL     z. B. ein Modell mit „:free“ (Pflicht)
//   COUCHDB_URL          intern, Standard http://couchdb:5984
//   KI_ALLOWED_ORIGINS   erlaubte Herkunft der App, Komma-getrennt (früher MASHI_APP_ORIGINS)
//   KI_PER_HOUR / KI_PER_DAY   Anfragen je Person (Standard 20 / 60)
//   PORT                 Standard 8080

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const SYSTEM_PROMPT =
  'Du bist der Rezept-Assistent der Koch-App Mashi. Du hilfst ausschließlich beim Erstellen von Kochrezepten. ' +
  'Antworte immer nur mit einem einzigen JSON-Objekt im verlangten Aufbau, ohne Text davor oder danach. ' +
  'Bei Anfragen, die nichts mit Kochen zu tun haben, antworte mit {"error": "nur Rezepte"}.';

/** höchstens so viel Auftrag (Zeichen) – lange Vorlieben (bis 10 000) passen mit dem Rest hinein */
export const MAX_PROMPT = 16000;
/** Bytes – Umlaute brauchen in UTF-8 und JSON mehr Platz als ein Zeichen */
const MAX_BODY = 64 * 1024;

/** Anfragen je Person: gleitende Fenster für Stunde und Tag, nur im Speicher (ein Neustart setzt zurück) */
export class RateLimiter {
  constructor(perHour = 20, perDay = 60) {
    this.perHour = perHour;
    this.perDay = perDay;
    /** @type {Map<string, number[]>} */
    this.hits = new Map();
  }
  /** true = erlaubt (und gezählt) */
  take(user, now = Date.now()) {
    const day = 24 * 3600 * 1000;
    const list = (this.hits.get(user) ?? []).filter((t) => now - t < day);
    const lastHour = list.filter((t) => now - t < 3600 * 1000).length;
    if (list.length >= this.perDay || lastHour >= this.perHour) {
      this.hits.set(user, list);
      return false;
    }
    list.push(now);
    this.hits.set(user, list);
    return true;
  }
  /** die zuletzt gezählte Anfrage zurückgeben – die KI hat nicht geantwortet, das soll kein Kontingent kosten */
  giveBack(user) {
    const list = this.hits.get(user);
    if (list?.length) list.pop();
  }
}

/**
 * Falsche Anmeldungen je Herkunft (IP) begrenzen (Code-Review #8): nach zu vielen in kurzer Zeit eine Pause, ohne
 * die Datenbank überhaupt zu fragen – sonst ließen sich über diesen Dienst Passwörter beliebig oft durchprobieren.
 */
export class FailLimiter {
  constructor(max = 10, windowMs = 15 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} */
    this.fails = new Map();
  }
  recent(ip, now) {
    return (this.fails.get(ip) ?? []).filter((t) => now - t < this.windowMs);
  }
  /** true = Pause (zu viele Fehlversuche) */
  blocked(ip, now = Date.now()) {
    return this.recent(ip, now).length >= this.max;
  }
  fail(ip, now = Date.now()) {
    this.fails.set(ip, [...this.recent(ip, now), now]);
    // nicht unbegrenzt wachsen: abgelaufene Adressen gelegentlich wegräumen
    if (this.fails.size > 5000) for (const [k] of this.fails) if (!this.recent(k, now).length) this.fails.delete(k);
  }
}

/** Herkunft der Anfrage: Traefik trägt die echte Adresse in X-Forwarded-For ein (erste Angabe), sonst der direkte Absender */
export const clientIp = (headers, remote) => String(headers['x-forwarded-for'] ?? '').split(',')[0].trim() || remote || '?';

/**
 * Den ganzen Inhalt einer Anfrage lesen – als Bytes sammeln und erst am Ende als UTF-8 lesen (Code-Review #7):
 * Stückweise gelesen wurde ein Umlaut, dessen Bytes auf zwei Stücke fielen, zu zwei Ersatzzeichen („K??se“).
 * Zu groß: der Rest wird nur noch verworfen, damit die Antwort (413 mit CORS) noch ankommt.
 */
export function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > max) { tooBig = true; chunks.length = 0; return; }
      chunks.push(buf);
    });
    req.on('end', () => resolve(tooBig ? { tooBig: true } : { tooBig: false, body: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', reject);
  });
}

/** Herkunft erlaubt? Dann genau diese zurückschreiben (nie „*“, weil mit Anmeldung) */
export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
  };
}

/**
 * Wer fragt? Die Anmeldung (Basic) geht unverändert an CouchDB /_session – nur wer dort gilt, darf.
 * Ergebnis 1 Minute merken (als Hash, nie das Passwort selbst), damit nicht jede Anfrage die DB fragt – kurz, damit
 * ein geändertes Passwort oder ein gelöschter Zugang bald nicht mehr gilt (Code-Review #13).
 * null = Anmeldung falsch; wirft, wenn die Datenbank nicht antwortet (dann 503 statt „falsche Anmeldung“).
 */
export function makeAuth({ fetch, couchUrl, ttl = 60 * 1000 }) {
  /** @type {Map<string, {name: string, until: number}>} */
  const cache = new Map();
  return async function userOf(authorization, now = Date.now()) {
    if (!authorization || !/^Basic\s+\S+$/i.test(authorization)) return null;
    const key = createHash('sha256').update(authorization).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.until > now) return hit.name;
    const res = await fetch(couchUrl + '/_session', { headers: { authorization, accept: 'application/json' } });
    if (res.status >= 500) throw new Error('CouchDB antwortet nicht (' + res.status + ')');
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const name = body?.userCtx?.name;
    if (!name) return null;
    cache.set(key, { name, until: now + ttl });
    return name;
  };
}

/** Auftrag an OpenRouter (OpenAI-kompatibel); gibt den Text der Antwort zurück */
export async function askModel({ fetch, apiKey, model, baseUrl = 'https://openrouter.ai/api/v1', prompt, timeoutMs = 90_000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', 'x-title': 'Mashi' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });
    if (res.status === 429) return { status: 429 };
    if (!res.ok) return { status: 502 };
    const body = await res.json().catch(() => null);
    const text = body?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? { status: 200, text, model: body.model ?? model } : { status: 502 };
  } catch {
    return { status: 504 };
  } finally {
    clearTimeout(timer);
  }
}

/** Der ganze Ablauf einer Anfrage – ohne Netzwerk-Server, damit er sich testen lässt */
/** „/ki/rezept“ und „/rezept“ sind derselbe Weg (Coolify schneidet /ki meist ab) */
export const routeOf = (path) => path.replace(/^\/ki(?=\/|$)/, '').replace(/\/+$/, '') || '/';

export function makeHandler({ fetch, env, limiter = new RateLimiter(Number(env.KI_PER_HOUR) || 20, Number(env.KI_PER_DAY) || 60), fails = new FailLimiter() }) {
  const allowed = (env.KI_ALLOWED_ORIGINS || env.MASHI_APP_ORIGINS || 'https://dschudschuu.github.io,http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
  const userOf = makeAuth({ fetch, couchUrl: (env.COUCHDB_URL || 'http://couchdb:5984').replace(/\/+$/, '') });
  const configured = !!(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL);

  /** @returns {Promise<{status: number, headers: Record<string,string>, body?: unknown}>} */
  async function handle({ method, path, headers, body, ip = '?' }) {
    const cors = corsHeaders(headers.origin, allowed);
    const reply = (status, payload) => ({ status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }, body: payload });
    const route = routeOf(path);
    if (method === 'OPTIONS') return { status: 204, headers: cors };
    if (method === 'GET' && route === '/status') return reply(200, { ok: true, configured });
    if (method !== 'POST' || route !== '/rezept') return reply(404, { error: 'unbekannt' });
    if (!configured) return reply(503, { error: 'nicht eingerichtet', message: 'Auf dem Server fehlt noch der KI-Schlüssel.' });

    if (fails.blocked(ip)) return reply(429, { error: 'zu viele', message: 'Zu viele falsche Anmeldungen – bitte in einer Viertelstunde noch mal.' });
    let user;
    try {
      user = await userOf(headers.authorization);
    } catch {
      return reply(503, { error: 'server', message: 'Die Anmeldung lässt sich gerade nicht prüfen – der Server ist kurz nicht erreichbar.' });
    }
    if (!user) {
      if (headers.authorization) fails.fail(ip); // nur echte Versuche zählen, nicht „noch nicht verbunden“
      return reply(401, { error: 'anmeldung', message: 'Bitte in Mashi mit dem Server verbinden.' });
    }
    if (typeof body !== 'string' || body.length > MAX_BODY) return reply(413, { error: 'zu groß' });
    let prompt;
    try { prompt = JSON.parse(body).prompt; } catch { return reply(400, { error: 'kein JSON' }); }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) return reply(400, { error: 'auftrag' });
    if (!limiter.take(user)) return reply(429, { error: 'limit', message: 'Für heute sind genug Rezepte erstellt – später wieder.' });

    const out = await askModel({ fetch, apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL, baseUrl: env.OPENROUTER_BASE_URL, prompt });
    if (out.status === 200) return reply(200, { text: out.text, model: out.model });
    limiter.giveBack(user); // keine Antwort – kostet kein Kontingent (Code-Review #13)
    if (out.status === 429) return reply(429, { error: 'ausgelastet', message: 'Die kostenlose KI ist gerade ausgelastet – in ein paar Minuten noch mal.' });
    if (out.status === 504) return reply(504, { error: 'zeit', message: 'Die KI hat zu lange gebraucht.' });
    return reply(502, { error: 'ki', message: 'Die KI hat gerade nicht geantwortet.' });
  }
  /** CORS-Köpfe für Antworten außerhalb von handle (413, 500) – sonst meldet der Browser nur „offline?“ */
  handle.cors = (origin) => corsHeaders(origin, allowed);
  return handle;
}

/** Start als echter Server (nur, wenn die Datei direkt läuft – nicht in den Tests) */
function start() {
  const handle = makeHandler({ fetch: globalThis.fetch, env: process.env });
  const server = createServer(async (req, res) => {
    const json = { ...handle.cors(req.headers.origin), 'content-type': 'application/json; charset=utf-8' };
    const send = (out) => {
      res.writeHead(out.status, out.headers);
      res.end(out.body === undefined ? undefined : JSON.stringify(out.body));
    };
    const read = await readBody(req).catch(() => ({ tooBig: false, body: '' }));
    // auch hier mit CORS – sonst greift der „kürzer noch mal“-Versuch der App nie (Code-Review #13)
    if (read.tooBig) return send({ status: 413, headers: json, body: { error: 'zu groß' } });
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const ip = clientIp(req.headers, req.socket.remoteAddress);
    send(await handle({ method: req.method ?? 'GET', path, headers: req.headers, body: read.body, ip })
      .catch(() => ({ status: 500, headers: json, body: { error: 'server' } })));
  });
  const port = Number(process.env.PORT) || 8080;
  // 0.0.0.0: sonst erreicht der Proxy den Container nicht (Coolify: „No Available Server“)
  server.listen(port, '0.0.0.0', () => console.log('Mashi-KI hört auf 0.0.0.0:' + port + ' (Modell: ' + (process.env.OPENROUTER_MODEL || 'fehlt') + ')'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
