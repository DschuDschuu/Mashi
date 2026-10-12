// Erzeugt server/coolify/docker-compose.yml – mit dem Code von server/ki/ki.mjs wörtlich per `content:`.
// Aufruf nach jeder Änderung an ki.mjs:   node server/coolify/build-compose.mjs
// Ein Test (compose.test.mjs) schlägt fehl, wenn die Compose-Datei und ki.mjs auseinanderlaufen.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, '..', 'ki', 'ki.mjs'), 'utf8').replace(/\r\n/g, '\n');

// Compose/Coolify ersetzen $-Platzhalter überall – auch im eingefügten Code. Dort darf keiner stehen.
if (/\$[{A-Za-z_]/.test(code)) throw new Error('ki.mjs enthält ein $ vor { oder Buchstabe – Compose würde es ersetzen');

/**
 * Mashi-Einstellungen der CouchDB – direkt aus server/couchdb/mashi.ini (Code-Review #26). Vorher stand hier eine
 * Abschrift: wer CORS oder max_document_size in mashi.ini änderte, ließ Coolify still auf dem alten Stand.
 */
const MASHI_INI = readFileSync(join(here, '..', 'couchdb', 'mashi.ini'), 'utf8').replace(/\r\n/g, '\n');
if (/\$[{A-Za-z_]/.test(MASHI_INI)) throw new Error('mashi.ini enthält ein $ vor { oder Buchstabe – Compose würde es ersetzen');

const indent = (text, n) => text.replace(/\n$/, '').split('\n').map((l) => (l ? ' '.repeat(n) + l : '')).join('\n');

const compose = `# Mashi auf Coolify: CouchDB + KI-Dienst (siehe ANLEITUNG.md im selben Ordner).
#
# !! In die BESTEHENDE Coolify-Ressource einfügen (Edit Compose File → Save → Redeploy),
# !! NICHT als neue Ressource anlegen – sonst entsteht ein neues, LEERES Volume.
# !! Service-Name „couchdb“ und Volume „mashi-couchdb-data“ nie umbenennen.
#
# Diese Datei wird erzeugt: node server/coolify/build-compose.mjs (Code aus server/ki/ki.mjs).
# Nicht von Hand ändern. Labels, Netzwerke, Ports, restart und container_name setzt Coolify selbst.
services:
  couchdb:
    image: couchdb:3.5
    environment:
      - SERVICE_FQDN_COUCHDB_5984
      - COUCHDB_USER=\${SERVICE_USER_COUCHDB}
      - COUCHDB_PASSWORD=\${SERVICE_PASSWORD_64_COUCHDB}
    volumes:
      - mashi-couchdb-data:/opt/couchdb/data
      - type: bind
        source: ./mashi.ini
        target: /opt/couchdb/etc/local.d/mashi.ini
        content: |
${indent(MASHI_INI, 10)}
    # /_up antwortet ohne Anmeldung (require_valid_user_except_for_up); curl ist im Image
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:5984/_up > /dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  # KI-Rezepte: Vermittler zu OpenRouter. Domain in Coolify: https://<DB-DOMAIN>:8080/ki
  # In Coolify nur OPENROUTER_API_KEY und OPENROUTER_MODEL eintragen – der Rest hat Standardwerte.
  # Ohne Schlüssel läuft der Dienst trotzdem und meldet „nicht eingerichtet“.
  ki:
    image: node:24-alpine
    user: node
    command: ["node", "/app/ki.mjs"]
    environment:
      - OPENROUTER_API_KEY=\${OPENROUTER_API_KEY}
      - OPENROUTER_MODEL=\${OPENROUTER_MODEL}
      - COUCHDB_URL=\${COUCHDB_URL:-http://couchdb:5984}
      - KI_ALLOWED_ORIGINS=\${KI_ALLOWED_ORIGINS:-https://dschudschuu.github.io}
      - KI_PER_HOUR=\${KI_PER_HOUR:-20}
      - KI_PER_DAY=\${KI_PER_DAY:-60}
    volumes:
      - type: bind
        source: ./ki.mjs
        target: /app/ki.mjs
        content: |
${indent(code, 10)}
    # Alpine hat kein curl – wget (BusyBox) ist dabei
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/status"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    depends_on:
      - couchdb

volumes:
  mashi-couchdb-data:
`;

writeFileSync(join(here, 'docker-compose.yml'), compose);
console.log('server/coolify/docker-compose.yml geschrieben (' + compose.split('\n').length + ' Zeilen)');
