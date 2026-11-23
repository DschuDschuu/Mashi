// Tests für den KI-Vermittler – ohne Netz: CouchDB und OpenRouter werden nachgestellt.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { Agent, request } from 'node:http';
import { createServer } from 'node:net';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { clientIp, corsHeaders, FailLimiter, makeHandler, MAX_PROMPT, RateLimiter, readBody, SYSTEM_PROMPT } from './ki.mjs';

const APP = 'https://dschudschuu.github.io';
const GOOD_AUTH = 'Basic ' + Buffer.from('julia-test:geheim-test').toString('base64');

/** nachgestellte Gegenseite: /_session kennt nur GOOD_AUTH, OpenRouter antwortet wie eingestellt */
function fakeFetch({ model = { status: 200, text: '{"title":"Test"}' } } = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.endsWith('/_session')) {
      const ok = opts.headers?.authorization === GOOD_AUTH;
      return { ok: true, status: 200, json: async () => ({ userCtx: { name: ok ? 'julia-test' : null } }) };
    }
    if (url.endsWith('/chat/completions')) {
      if (model.status !== 200) return { ok: false, status: model.status, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ model: 'test/modell:free', choices: [{ message: { content: model.text } }] }) };
    }
    throw new Error('unerwartet: ' + url);
  };
  return { fetch, calls };
}
const env = { OPENROUTER_API_KEY: 'sk-test-nicht-echt', OPENROUTER_MODEL: 'test/modell:free', COUCHDB_URL: 'http://couch:5984' };
const ask = (handle, { auth = GOOD_AUTH, body = JSON.stringify({ prompt: 'Rezept mit Feta' }), origin = APP, path = '/ki/rezept', method = 'POST' } = {}) =>
  handle({ method, path, headers: { authorization: auth, origin }, body });

describe('Mashi-KI-Vermittler', () => {
  it('angemeldet → Auftrag mit fester Rezept-Anweisung an OpenRouter, Antworttext zurück', async () => {
    const { fetch, calls } = fakeFetch();
    const out = await ask(makeHandler({ fetch, env }));
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ text: '{"title":"Test"}', model: 'test/modell:free' });
    expect(out.headers['Access-Control-Allow-Origin']).toBe(APP);
    const call = calls.find((c) => c.url.endsWith('/chat/completions'));
    expect(call.opts.headers.authorization).toBe('Bearer sk-test-nicht-echt');
    const sent = JSON.parse(call.opts.body);
    expect(sent).toMatchObject({ model: 'test/modell:free', max_tokens: 2500 });
    expect(sent.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: 'Rezept mit Feta' }]);
  });

  it('ohne oder mit falscher Anmeldung: 401, OpenRouter wird gar nicht gefragt', async () => {
    const { fetch, calls } = fakeFetch();
    const handle = makeHandler({ fetch, env });
    expect((await ask(handle, { auth: '' })).status).toBe(401); // '' statt undefined – sonst greift der Standardwert
    expect((await ask(handle, { auth: 'Basic ' + Buffer.from('x:y').toString('base64') })).status).toBe(401);
    expect((await ask(handle, { auth: 'Bearer irgendwas' })).status).toBe(401);
    expect(calls.some((c) => c.url.endsWith('/chat/completions'))).toBe(false);
  });

  it('Anmeldung wird gemerkt – nicht jede Anfrage fragt die Datenbank', async () => {
    const { fetch, calls } = fakeFetch();
    const handle = makeHandler({ fetch, env });
    await ask(handle);
    await ask(handle);
    expect(calls.filter((c) => c.url.endsWith('/_session'))).toHaveLength(1);
  });

  it('Grenzen: zu langer Auftrag, kein JSON, leerer Auftrag, falscher Weg', async () => {
    const { fetch } = fakeFetch();
    const handle = makeHandler({ fetch, env });
    expect((await ask(handle, { body: JSON.stringify({ prompt: 'x'.repeat(MAX_PROMPT + 1) }) })).status).toBe(400);
    expect((await ask(handle, { body: 'kein json' })).status).toBe(400);
    expect((await ask(handle, { body: JSON.stringify({ prompt: '  ' }) })).status).toBe(400);
    expect((await ask(handle, { path: '/ki/chat' })).status).toBe(404);
  });

  it('Anfragen je Person begrenzt → 429 mit verständlicher Meldung', async () => {
    const { fetch } = fakeFetch();
    const handle = makeHandler({ fetch, env, limiter: new RateLimiter(2, 10) });
    expect((await ask(handle)).status).toBe(200);
    expect((await ask(handle)).status).toBe(200);
    const third = await ask(handle);
    expect(third.status).toBe(429);
    expect(third.body.message).toMatch(/später/);
  });

  it('RateLimiter: Stunde und Tag getrennt, altes fällt raus', () => {
    const r = new RateLimiter(2, 3);
    const t0 = 1_000_000_000;
    expect([r.take('a', t0), r.take('a', t0 + 1), r.take('a', t0 + 2)]).toEqual([true, true, false]);
    expect(r.take('b', t0)).toBe(true); // andere Person zählt extra
    expect(r.take('a', t0 + 3600 * 1000 + 5)).toBe(true); // neue Stunde
    expect(r.take('a', t0 + 3600 * 1000 + 6)).toBe(false); // Tagesgrenze 3 erreicht
  });

  it('OpenRouter ausgelastet / kaputt → 429 bzw. 502 mit Meldung', async () => {
    expect((await ask(makeHandler({ fetch: fakeFetch({ model: { status: 429 } }).fetch, env }))).status).toBe(429);
    const bad = await ask(makeHandler({ fetch: fakeFetch({ model: { status: 500 } }).fetch, env }));
    expect(bad.status).toBe(502);
    expect(bad.body.message).toBeTruthy();
  });

  it('ohne Schlüssel: 503, Status sagt „nicht eingerichtet“', async () => {
    const { fetch } = fakeFetch();
    const handle = makeHandler({ fetch, env: { COUCHDB_URL: 'http://couch:5984' } });
    expect((await ask(handle)).status).toBe(503);
    expect((await ask(handle, { method: 'GET', path: '/ki/status' })).body).toEqual({ ok: true, configured: false });
  });

  it('CORS nur für Mashis Herkunft, nie „*“', () => {
    const allowed = [APP];
    expect(corsHeaders(APP, allowed)['Access-Control-Allow-Origin']).toBe(APP);
    expect(corsHeaders('https://boese.example', allowed)).toEqual({});
    expect(corsHeaders(undefined, allowed)).toEqual({});
  });
});

describe('Coolify: Wege und Einstellungen', () => {
  it('antwortet mit und ohne /ki davor (Coolify schneidet das Präfix standardmäßig ab)', async () => {
    const { fetch } = fakeFetch();
    const handle = makeHandler({ fetch, env });
    for (const path of ['/ki/rezept', '/rezept', '/rezept/']) expect((await ask(handle, { path })).status).toBe(200);
    for (const path of ['/ki/status', '/status', '/ki/status/']) expect((await ask(handle, { method: 'GET', path })).body).toEqual({ ok: true, configured: true });
    // kein falscher Treffer auf ähnliche Namen
    expect((await ask(handle, { path: '/kiosk/rezept' })).status).toBe(404);
  });

  it('KI_ALLOWED_ORIGINS gilt (der alte Name MASHI_APP_ORIGINS auch noch); COUCHDB_URL hat einen Standard', async () => {
    const { fetch, calls } = fakeFetch();
    const handle = makeHandler({ fetch, env: { OPENROUTER_API_KEY: 'sk-test', OPENROUTER_MODEL: 'test/modell:free', KI_ALLOWED_ORIGINS: 'https://app.example.test' } });
    const out = await ask(handle, { origin: 'https://app.example.test' });
    expect(out.headers['Access-Control-Allow-Origin']).toBe('https://app.example.test');
    expect(calls[0].url).toBe('http://couchdb:5984/_session');
    const old = makeHandler({ fetch, env: { ...env, MASHI_APP_ORIGINS: 'https://alt.example.test' } });
    expect((await ask(old, { origin: 'https://alt.example.test' })).headers['Access-Control-Allow-Origin']).toBe('https://alt.example.test');
  });
});

describe('Code-Review #7: Umlaute über Stückgrenzen', () => {
  it('„Käse“ in zwei Stücken, geteilt mitten im ä → kommt heil an', async () => {
    const bytes = Buffer.from('{"prompt":"Käse"}', 'utf8');
    const cut = bytes.indexOf(0xc3) + 1; // zwischen den beiden Bytes von „ä“
    const read = await readBody(Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)]));
    expect(JSON.parse(read.body).prompt).toBe('Käse');
  });

  it('zu groß → tooBig, ohne den Rest zu sammeln', async () => {
    expect(await readBody(Readable.from([Buffer.alloc(10), Buffer.alloc(10)]), 15)).toEqual({ tooBig: true });
  });
});

describe('Code-Review #13: Fehler verständlich, kein Kontingent für Fehlschläge', () => {
  it('Datenbank nicht erreichbar → 503 statt „falsche Anmeldung“', async () => {
    const down = async () => { throw new Error('ECONNREFUSED'); };
    expect((await ask(makeHandler({ fetch: down, env }))).status).toBe(503);
    const broken = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect((await ask(makeHandler({ fetch: broken, env }))).status).toBe(503);
  });

  it('KI antwortet nicht → kostet kein Kontingent', async () => {
    let fail = true;
    const { fetch } = fakeFetch();
    const flaky = async (url, opts) => (url.endsWith('/chat/completions') && fail ? { ok: false, status: 502, json: async () => ({}) } : fetch(url, opts));
    const handle = makeHandler({ fetch: flaky, env, limiter: new RateLimiter(1, 1) });
    expect((await ask(handle)).status).toBe(502);
    fail = false;
    expect((await ask(handle)).status).toBe(200); // vorher: 429, weil der Fehlschlag mitgezählt hatte
  });

  it('CORS-Köpfe gibt es auch für Antworten außerhalb des Ablaufs (413, 500)', () => {
    const { fetch } = fakeFetch();
    expect(makeHandler({ fetch, env }).cors(APP)['Access-Control-Allow-Origin']).toBe(APP);
  });
});

describe('Code-Review #8: Passwort-Raten wird gebremst', () => {
  it('nach 10 falschen Anmeldungen von derselben Adresse: Pause, ohne die Datenbank zu fragen', async () => {
    const { fetch, calls } = fakeFetch();
    const handle = makeHandler({ fetch, env });
    const wrong = 'Basic ' + Buffer.from('julia-test:falsch').toString('base64');
    for (let i = 0; i < 10; i++) expect((await handle({ method: 'POST', path: '/rezept', headers: { authorization: wrong + i, origin: APP }, body: '{}', ip: '203.0.113.7' })).status).toBe(401);
    const asked = calls.length;
    const out = await handle({ method: 'POST', path: '/rezept', headers: { authorization: GOOD_AUTH, origin: APP }, body: JSON.stringify({ prompt: 'x' }), ip: '203.0.113.7' });
    expect(out.status).toBe(429);
    expect(calls.length).toBe(asked); // CouchDB nicht mehr gefragt
    // andere Adresse: nicht betroffen
    expect((await handle({ method: 'POST', path: '/rezept', headers: { authorization: GOOD_AUTH, origin: APP }, body: JSON.stringify({ prompt: 'x' }), ip: '198.51.100.2' })).status).toBe(200);
  });

  it('ohne Anmeldung („noch nicht verbunden“) zählt nicht als Fehlversuch; nach 15 Minuten wieder frei', () => {
    const f = new FailLimiter(2, 15 * 60 * 1000);
    f.fail('a', 0); f.fail('a', 1);
    expect(f.blocked('a', 2)).toBe(true);
    expect(f.blocked('a', 15 * 60 * 1000 + 2)).toBe(false);
  });

  it('echte Adresse aus X-Forwarded-For (Traefik), sonst der direkte Absender', () => {
    expect(clientIp({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }, '10.0.0.2')).toBe('203.0.113.7');
    expect(clientIp({}, '10.0.0.5')).toBe('10.0.0.5');
  });
});

describe('Sauber beenden: docker stop dauert nicht 10 s und endet mit Exit 0', () => {
  // Hier läuft ki.mjs als echter Prozess (nicht PID 1 wie im Container): Ohne eigenen Handler stirbt er am Signal
  // (signal 'SIGTERM', kein Exit-Code) – im Container würde dasselbe Signal ignoriert und Docker nach 10 s abschießen.
  const KI = fileURLToPath(new URL('./ki.mjs', import.meta.url));
  const running = [];
  afterEach(() => { for (const c of running.splice(0)) c.kill('SIGKILL'); });

  const freePort = () => new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });

  /** ki.mjs starten (ohne KI-Schlüssel: /rezept antwortet dann ohne Netz mit 503) und warten, bis er zuhört */
  async function startKi() {
    const port = await freePort();
    const child = spawn(process.execPath, [KI], { env: { PATH: process.env.PATH, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    running.push(child);
    const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() })));
    let log = '';
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (d) => { log += d; if (log.includes('hört auf')) resolve(); });
      exited.then(() => reject(new Error('ki.mjs ist nicht gestartet: ' + log)));
    });
    return { child, port, exited, log: () => log };
  }

  /** eine Anfrage; resolve mit Status und Text der Antwort */
  const send = (req, body) => new Promise((resolve, reject) => {
    req.on('response', (res) => { let text = ''; res.on('data', (d) => { text += d; }); res.on('end', () => resolve({ status: res.statusCode, text })); });
    req.on('error', reject);
    if (body !== undefined) req.end(body);
  });

  it.each(['SIGTERM', 'SIGINT'])('%s: endet sofort mit Exit 0, statt am Signal zu sterben', async (signal) => {
    const ki = await startKi();
    const t0 = Date.now();
    ki.child.kill(signal);
    const { code, signal: diedOf, at } = await ki.exited;
    expect({ code, diedOf }).toEqual({ code: 0, diedOf: null });
    expect(at - t0).toBeLessThan(1000);
    expect(ki.log()).toContain(signal + ' – nehme nichts Neues mehr an');
  });

  it('eine ruhende Keep-alive-Verbindung (wie von Traefik) hält das Beenden nicht auf', async () => {
    const ki = await startKi();
    const agent = new Agent({ keepAlive: true });
    try {
      const out = await send(request({ port: ki.port, path: '/status', agent }), '');
      expect(out.status).toBe(200);
      const t0 = Date.now();
      ki.child.kill('SIGTERM');
      const { code, at } = await ki.exited;
      expect(code).toBe(0);
      expect(at - t0).toBeLessThan(1000);
    } finally {
      agent.destroy();
    }
  });

  it('eine laufende Anfrage wird noch beantwortet, danach endet der Dienst', async () => {
    const ki = await startKi();
    const agent = new Agent({ keepAlive: true });
    try {
      const body = JSON.stringify({ prompt: 'Linsensuppe' });
      const req = request({ port: ki.port, path: '/rezept', method: 'POST', agent, headers: { 'content-length': Buffer.byteLength(body) } });
      const answer = send(req);
      req.write(body.slice(0, 5)); // Anfrage läuft: erst ein Teil ist da
      await new Promise((r) => setTimeout(r, 100));
      ki.child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      expect(ki.child.exitCode).toBe(null); // wartet noch auf den Rest der Anfrage
      req.end(body.slice(5));
      const out = await answer;
      const done = Date.now();
      expect(out.status).toBe(503); // ohne KI-Schlüssel: „nicht eingerichtet“ – aber eine echte Antwort
      const { code, at } = await ki.exited;
      expect(code).toBe(0);
      expect(at - done).toBeLessThan(1000); // nicht erst nach der Frist
    } finally {
      agent.destroy();
    }
  });
});
