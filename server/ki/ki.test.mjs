// Tests für den KI-Vermittler – ohne Netz: CouchDB und OpenRouter werden nachgestellt.
import { describe, expect, it } from 'vitest';
import { corsHeaders, makeHandler, MAX_PROMPT, RateLimiter, SYSTEM_PROMPT } from './ki.mjs';

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
