// Die Coolify-Compose-Datei darf die laufende CouchDB nie gefährden – das prüft dieser Test bei jedem Lauf.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, 'docker-compose.yml'), 'utf8');
const compose = parse(text);
const dockerfile = readFileSync(join(here, '..', 'ki', 'Dockerfile'), 'utf8');
const workflow = parse(readFileSync(join(here, '..', '..', '.github', 'workflows', 'ki-image.yml'), 'utf8'));
const ini = readFileSync(join(here, '..', 'couchdb', 'mashi.ini'), 'utf8').replace(/\r\n/g, '\n');
const bind = (service, target) => compose.services[service].volumes.find((v) => typeof v === 'object' && v.target === target);

describe('Coolify-Compose', () => {
  it('ist gültiges YAML mit genau couchdb + ki', () => {
    expect(Object.keys(compose.services)).toEqual(['couchdb', 'ki']);
  });

  it('CouchDB bleibt, wie sie läuft: Service-Name, Image, Volume, Coolify-Variablen', () => {
    const c = compose.services.couchdb;
    expect(c.image).toBe('couchdb:3.5');
    expect(c.volumes).toContain('mashi-couchdb-data:/opt/couchdb/data');
    expect(Object.keys(compose.volumes)).toEqual(['mashi-couchdb-data']);
    expect(c.environment).toEqual(['SERVICE_FQDN_COUCHDB_5984', 'COUCHDB_USER=${SERVICE_USER_COUCHDB}', 'COUCHDB_PASSWORD=${SERVICE_PASSWORD_64_COUCHDB}']);
  });

  it('keine Einträge, die Coolify selbst setzt (Labels, Netzwerke, Ports, restart, container_name)', () => {
    for (const s of Object.values(compose.services)) {
      for (const k of ['labels', 'networks', 'ports', 'restart', 'container_name', 'build']) expect(s).not.toHaveProperty(k);
    }
    expect(compose).not.toHaveProperty('networks');
  });

  it('mashi.ini: Fauxton bedienbar (WWW-Authenticate), /_up ohne Anmeldung für den Healthcheck, CORS für die App', () => {
    const ini = bind('couchdb', '/opt/couchdb/etc/local.d/mashi.ini').content;
    expect(ini).toContain('WWW-Authenticate = Basic realm="couchdb"');
    expect(ini).toContain('require_valid_user_except_for_up = true');
    expect(ini).toContain('origins = https://dschudschuu.github.io');
  });

  it('die CouchDB-Einstellungen sind wörtlich server/couchdb/mashi.ini (Code-Review #26)', () => {
    expect(bind('couchdb', '/opt/couchdb/etc/local.d/mashi.ini').content).toBe(ini.endsWith('\n') ? ini : ini + '\n');
  });

  it('KI-Dienst: fertiges Image (kein Code in der Datei), jedes Redeploy holt die neueste Fassung; nur Schlüssel und Modell ohne Standard', () => {
    const k = compose.services.ki;
    expect(k.image).toBe('ghcr.io/dschudschuu/mashi-ki:latest');
    expect(k.pull_policy).toBe('always');
    // Benutzer und Start legt das Image fest (USER node, CMD) – kein root, kein eingebetteter ki.mjs mehr
    for (const key of ['user', 'command', 'entrypoint', 'volumes']) expect(k).not.toHaveProperty(key);
    expect(text).not.toContain('ki.mjs');
    expect(k.environment).toContain('COUCHDB_URL=${COUCHDB_URL:-http://couchdb:5984}');
    const noDefault = k.environment.filter((e) => /=\$\{[A-Z_]+\}$/.test(e)).map((e) => e.split('=')[0]);
    expect(noDefault).toEqual(['OPENROUTER_API_KEY', 'OPENROUTER_MODEL']);
    // Alpine hat kein curl
    expect(k.healthcheck.test).toEqual(['CMD', 'wget', '-qO-', 'http://127.0.0.1:8080/status']);
  });

  it('Image, Dockerfile und Workflow passen zusammen: gleicher Name, poppler beim Bauen, läuft als node', () => {
    expect(workflow.env.IMAGE + ':latest').toBe(compose.services.ki.image);
    expect(dockerfile).toMatch(/^FROM node:24-alpine$/m);
    expect(dockerfile).toMatch(/^RUN apk add --no-cache poppler-utils$/m);
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^CMD \["node", "ki\.mjs"\]$/m);
    // veröffentlicht wird erst nach grünen Tests
    expect(workflow.jobs.build.needs).toBe('test');
    expect(workflow.jobs.publish.needs).toBe('build');
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('in der Compose-Datei steht kein $-Platzhalter außer den Umgebungsvariablen', () => {
    const lines = text.split('\n').filter((l) => /\$[{A-Za-z_]/.test(l));
    expect(lines.every((l) => /^\s+- [A-Z_0-9]+=\$\{[A-Z_0-9]+(:-[^}]*)?\}$/.test(l))).toBe(true);
  });
});
