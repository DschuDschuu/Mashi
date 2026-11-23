// Tests für den KI-Vermittler – ohne Netz: CouchDB und OpenRouter werden nachgestellt.
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { Agent, request } from 'node:http';
import { createServer } from 'node:net';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { clientIp, corsHeaders, encodeBody, FailLimiter, makeHandler, MAX_PROMPT, pdfUrlOk, RateLimiter, readBody, readPdf, SYSTEM_PROMPT, wordsWithFonts } from './ki.mjs';

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

describe('Prospekte lesen (POST /prospekttext, Einkauf planen)', () => {
  const PDF = 'https://assets.leaflets.schwarz/leaflets/pdfs/test/a.pdf';
  /** nachgestellt: /_session wie oben, der Prospekt-Server liefert ein Test-„PDF“ */
  function pdfFetch({ status = 200, length } = {}) {
    const calls = [];
    const fetch = async (url, opts = {}) => {
      calls.push(url);
      if (url.endsWith('/_session')) return { ok: true, status: 200, json: async () => ({ userCtx: { name: opts.headers?.authorization === GOOD_AUTH ? 'julia-test' : null } }) };
      if (url.startsWith('https://assets.leaflets.schwarz/')) {
        return new Response(status === 200 ? '%PDF-test' : 'Access Denied', { status, headers: length ? { 'content-length': String(length) } : {} });
      }
      throw new Error('unerwartet: ' + url);
    };
    return { fetch, calls };
  }
  const read = (handle, { url = PDF, auth = GOOD_AUTH, layout } = {}) =>
    handle({ method: 'POST', path: '/ki/prospekttext', headers: { authorization: auth, origin: APP }, body: JSON.stringify({ url, layout }) });
  const LAYOUT = { fonts: [[10, 'TestFont']], pages: [[['Testkohl', 10, 20, 40, 12, 0]]] };
  /** nachgestellt: liest „das PDF“ und merkt sich, wie oft und mit welchem Wunsch */
  function reader() {
    const calls = [];
    const fn = async (_data, { layout }) => {
      calls.push(layout);
      return layout ? { pages: ['Ab Mo. 23.11. Seite eins', 'Seite zwei'], layout: LAYOUT } : { pages: ['Ab Mo. 23.11. Seite eins', 'Seite zwei'] };
    };
    return { fn, calls };
  }
  const pages = reader().fn;

  it('angemeldet → Text je Seite; ohne KI-Schlüssel; zweites Mal aus dem Gedächtnis statt neu laden', async () => {
    const { fetch, calls } = pdfFetch();
    const handle = makeHandler({ fetch, env: { COUCHDB_URL: 'http://couch:5984' }, pdfReader: pages });
    const out = await read(handle);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ pages: ['Ab Mo. 23.11. Seite eins', 'Seite zwei'] });
    expect(out.headers['Access-Control-Allow-Origin']).toBe(APP);
    await read(handle);
    expect(calls.filter((u) => u === PDF)).toHaveLength(1);
  });

  it('mit layout: dazu die Wörter mit Lage (für Lidl-Preise) – eigenes Gedächtnis, nur „true“ zählt', async () => {
    const { fetch } = pdfFetch();
    const r = reader();
    const handle = makeHandler({ fetch, env, pdfReader: r.fn });
    expect((await read(handle, { layout: true })).body.layout).toEqual(LAYOUT);
    expect((await read(handle, { layout: true })).body.layout).toEqual(LAYOUT);
    expect((await read(handle)).body.layout).toBeUndefined();
    expect((await read(handle, { layout: 'ja' })).body.layout).toBeUndefined();
    // einmal mit, einmal ohne gelesen – die Wiederholungen kamen aus dem Gedächtnis
    expect(r.calls).toEqual([true, false]);
  });

  it('nur Prospekt-PDFs: fremde Adressen, http, Täuschungs-Domains und Nicht-PDFs werden gar nicht abgerufen', async () => {
    const { fetch, calls } = pdfFetch();
    const handle = makeHandler({ fetch, env, pdfReader: pages });
    for (const url of ['https://example.test/a.pdf', 'http://assets.leaflets.schwarz/a.pdf', 'https://assets.leaflets.schwarz.evil.test/a.pdf', 'https://assets.leaflets.schwarz/a.exe', 'https://x:y@assets.leaflets.schwarz/a.pdf', 42]) {
      const out = await read(handle, { url });
      expect(out.status).toBe(400);
    }
    expect(calls.some((u) => !u.endsWith('/_session'))).toBe(false);
    expect((await read(handle, { auth: 'Basic falsch' })).status).toBe(401);
  });

  it('verständliche Meldungen: Fassung weg, zu groß, pdftotext fehlt, zu oft – Fehlschläge kosten kein Kontingent', async () => {
    expect((await read(makeHandler({ fetch: pdfFetch({ status: 403 }).fetch, env, pdfReader: pages }))).body.message).toMatch(/noch einmal holen/);
    expect((await read(makeHandler({ fetch: pdfFetch({ length: 999 * 1024 * 1024 }).fetch, env, pdfReader: pages }))).status).toBe(413);
    const missing = async () => { throw Object.assign(new Error('spawn pdftotext ENOENT'), { code: 'ENOENT' }); };
    const pdfLimiter = new RateLimiter(1, 1);
    const handle = makeHandler({ fetch: pdfFetch().fetch, env, pdfReader: missing, pdfLimiter });
    const out = await read(handle);
    expect(out.status).toBe(503);
    expect(out.body.message).toMatch(/pdftotext fehlt.*ANLEITUNG/);
    // der Fehlschlag hat das eine erlaubte Mal nicht verbraucht
    expect(pdfLimiter.take('julia-test')).toBe(true);
    expect((await read(handle)).status).toBe(429);
  });

  it('pdfUrlOk: nur https://assets.leaflets.schwarz/…pdf', () => {
    expect(pdfUrlOk(PDF)).toBe(true);
    expect(pdfUrlOk('https://assets.leaflets.schwarz.evil.test/a.pdf')).toBe(false);
    expect(pdfUrlOk('kaputt')).toBe(false);
  });

  it('wordsWithFonts: Wortgrenzen von pdftotext, Schrift von pdftohtml – leere Stücke davor zählen nicht', () => {
    const bbox = '<doc><page width="400" height="600">'
      + '<word xMin="10.000" yMin="20.000" xMax="40.000" yMax="32.000">Leber</word>'
      + '<word xMin="40.000" yMin="20.000" xMax="60.000" yMax="32.000">käse</word>'
      + '<word xMin="100.000" yMin="50.000" xMax="120.000" yMax="90.000">7.</word>'
      + '<word xMin="118.000" yMin="50.000" xMax="150.000" yMax="90.000">99*</word>'
      + '<word xMin="10.000" yMin="200.000" xMax="30.000" yMax="210.000">A&amp;B</word>'
      + '</page><page width="400" height="600"></page></doc>';
    const xml = '<pdf2xml><page number="1" position="absolute" top="0" left="0" height="600" width="400">'
      + '<fontspec id="0" size="10" family="AAA+TestCond" color="#000"/><fontspec id="1" size="40" family="AAA+TestPrice" color="#000"/>'
      + '<fontspec id="2" size="6" family="AAA+TestBook" color="#000"/>'
      + '<text top="20.000" left="10.000" width="50.000" height="12.000" font="0"><b>Leber käse</b></text>'
      + '<text top="50.000" left="98.300" width="1.700" height="40.000" font="2"> </text>'
      + '<text top="50.000" left="100.000" width="50.000" height="40.000" font="1">7. 99*</text>'
      + '</page></pdf2xml>';
    const out = wordsWithFonts(bbox, xml);
    expect(out.fonts).toEqual([[10, 'AAA+TestCond'], [40, 'AAA+TestPrice'], [6, 'AAA+TestBook']]);
    expect(out.pages).toEqual([[
      ['Leber', 10, 20, 30, 12, 0], ['käse', 40, 20, 20, 12, 0],
      // nicht die kleine Leerzeichen-Schrift (2), die direkt davor liegt
      ['7.', 100, 50, 20, 40, 1], ['99*', 118, 50, 32, 40, 1],
      ['A&B', 10, 200, 20, 10, -1],
    ], []]);
  });

  it('große Antworten gepackt, wenn der Browser es kann; kleine nie', () => {
    const big = JSON.stringify({ pages: ['x'.repeat(40000)] });
    const packed = encodeBody(big, 'gzip, deflate, br');
    expect(packed.headers).toEqual({ 'Content-Encoding': 'gzip' });
    expect(gunzipSync(packed.data).toString()).toBe(big);
    expect(packed.data.length).toBeLessThan(big.length / 10);
    expect(encodeBody(big, undefined)).toEqual({ data: big, headers: {} });
    expect(encodeBody('{"ok":true}', 'gzip')).toEqual({ data: '{"ok":true}', headers: {} });
  });

  // mit dem echten poppler – nur, wo es installiert ist (im Container installiert es die Compose-Datei)
  const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  it.skipIf(!hasPdftotext)('readPdf: echtes kleines PDF mit zwei Seiten → zwei Seiten Text, mit layout auch die Wörter', async () => {
    const pdf = Buffer.from(tinyPdf(['Ab Do. 26.11. Testkohl', 'Seite zwei']));
    const out = await readPdf(pdf);
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]).toContain('Ab Do. 26.11. Testkohl');
    expect(out.pages[1]).toContain('Seite zwei');
    expect(out.layout).toBeUndefined();
    const { layout } = await readPdf(pdf, { layout: true });
    expect(layout.pages).toHaveLength(2);
    const kohl = layout.pages[0].find((w) => w[0] === 'Testkohl');
    // Helvetica 12 pt, links ab x = 50 (siehe tinyPdf)
    expect(layout.fonts[kohl[5]]).toEqual([12, 'Helvetica']);
    expect(kohl[1]).toBeGreaterThan(50);
    expect(layout.pages[1].map((w) => w[0])).toEqual(['Seite', 'zwei']);
  });
});

/** ein winziges gültiges PDF mit einer Textzeile je Seite (nur ASCII) – für den Test mit dem echten pdftotext */
function tinyPdf(lines) {
  const objs = [];
  const pageIds = lines.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + lines.length + ' >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  lines.forEach((line, i) => {
    const stream = 'BT /F1 12 Tf 50 700 Td (' + line + ') Tj ET';
    objs[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
    objs[5 + i * 2] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length;
    out += id + ' 0 obj\n' + objs[id] + '\nendobj\n';
  }
  const xref = out.length;
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n' + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return out;
}
