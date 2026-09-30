# Mashi auf Coolify: CouchDB + KI-Rezepte

Alles geht über die **Coolify-Oberfläche** – kein SSH, keine `.env`-Datei, kein `setup.sh`, kein
`docker compose` von Hand. Getestet gegen die Coolify-Doku (Stand 4.1.x); Coolify selbst konnte
lokal nicht nachgestellt werden – siehe „Lokal getestet“ unten.

> ### ⚠️ Wichtig: die BESTEHENDE Ressource bearbeiten – NICHT neu anlegen
> Die neue Compose-Datei kommt in die **Coolify-Ressource, in der die Mashi-CouchDB schon läuft**:
> **Edit Compose File → Inhalt ersetzen → Save → Redeploy.**
>
> Legst du stattdessen eine **neue** Ressource an, bekommt sie ein **neues, leeres Volume** – die
> App sähe dann keine Rezepte mehr. Service-Name `couchdb` und Volume `mashi-couchdb-data` in der
> Datei sind absichtlich genau so wie bisher und dürfen nicht umbenannt werden.

## Reihenfolge

1. **Zuerst Coolify aktualisieren** (dieser Ablauf unten).
2. Sobald die neue App-Version auf GitHub Pages ist, funktioniert „Rezept mit KI erstellen“ sofort.

Bis der KI-Dienst läuft, stürzt die App nicht ab: Sie zeigt beim Erstellen
„Auf deinem Server ist die KI noch nicht eingerichtet“ (ohne Dienst antwortet an `/ki` die CouchDB
mit 404) bzw. „Auf dem Server fehlt noch der KI-Schlüssel“ (Dienst läuft, Schlüssel fehlt).
Rezepte, Abgleich und alles andere laufen in beiden Fällen normal weiter.

## Dateien

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | CouchDB (unverändert) + KI-Dienst `ki` – komplett in Coolify einfügbar |
| `build-compose.mjs` | erzeugt `docker-compose.yml` aus `../ki/ki.mjs` (nur für Entwicklung) |
| `compose.test.mjs` | prüft bei jedem Testlauf: gültiges YAML, CouchDB unverändert, Code = `ki.mjs` |

Die manuelle Variante ohne Coolify liegt in `../couchdb/` (mit SSH, `.env`, `setup.sh`).

## 1. OpenRouter vorbereiten

1. Auf <https://openrouter.ai> ein Konto anlegen → **Keys** → neuen Schlüssel erstellen.
2. Unter <https://openrouter.ai/models> ein Modell wählen. Kostenlose enden auf `:free`
   (nach „free“ filtern). Für gute deutsche Rezepte lieber ein größeres Modell.
3. **Datenschutz:** In den OpenRouter-Einstellungen (Privacy) prüfen, ob Anbieter Eingaben speichern
   oder zum Training nutzen dürfen – manche kostenlose Modelle gibt es nur mit dieser Erlaubnis.
   In einen Auftrag gehen Zutaten, Wünsche, Vorräte und – wenn in der App eingeschaltet – die
   Vorlieben (z. B. Titel der Lieblingsrezepte). Keine Namen, keine Anmeldungen.

## 2. Compose-Datei ersetzen (bestehende Ressource!)

1. In Coolify das Projekt öffnen → die **bestehende** Mashi-Ressource (mit dem Service `couchdb`).
2. **Edit Compose File** → den ganzen Inhalt durch `server/coolify/docker-compose.yml` ersetzen
   (Datei im Repo öffnen, „Raw“, alles kopieren) → **Save**.

Was sich an der CouchDB ändert (alles rückwärtsverträglich):
- `[httpd] WWW-Authenticate = Basic realm="couchdb"` – ohne das ist Fauxton bei Pflicht-Anmeldung nicht bedienbar.
- Healthcheck auf `/_up` (antwortet ohne Anmeldung, dank `require_valid_user_except_for_up`).
  Nach einem Redeploy ist die Datenbank erst nach dem ersten erfolgreichen Check (~10 s) wieder erreichbar.
- CORS-Herkunft ist `https://dschudschuu.github.io` (die App) und `http://localhost:5173` (Entwicklung).

## 3. Domains

Coolify zeigt je Service ein Feld **Domains for …**.

| Service | Domain (Schreibweise für Coolify 4.x: **Port vor Pfad**) |
|---|---|
| `couchdb` | `https://<DB-DOMAIN>:5984` (wie bisher, nach „Convert to Application“) |
| `ki` | `https://<DB-DOMAIN>:8080/ki` |

- Beispiel: `https://mashi.carapaxo.de:8080/ki`. Der Port sagt Coolify nur, auf welchen Port **im
  Container** weitergeleitet wird – von außen bleibt es normales HTTPS auf 443.
- Gleicher Hostname für beide ist so vorgesehen: CouchDB auf der Wurzel, KI unter `/ki`
  (der spezifischere Pfad gewinnt).
- **Strip Prefixes** (Advanced) darf an bleiben (Standard): Der Dienst beantwortet `/rezept` und
  `/status` genauso wie `/ki/rezept` und `/ki/status`.
- Folge: Eine CouchDB-Datenbank namens `ki` ist nicht möglich (wird es eh nicht geben).
- Falls `couchdb` noch nicht umgestellt ist: beim Service `couchdb` **Convert to Application**,
  erst dann gibt es das Domain-Feld.

## 4. Umgebungsvariablen

Unter **Environment Variables** tauchen nach dem Speichern die Variablen aus der Datei auf.
**Nur zwei muss man eintragen:**

| Variable | Wert |
|---|---|
| `OPENROUTER_API_KEY` | der Schlüssel aus Schritt 1 |
| `OPENROUTER_MODEL` | der Modellname aus Schritt 1, z. B. „…:free“ |

Alles andere hat Standardwerte und kann so bleiben:

| Variable | Standard | Bedeutung |
|---|---|---|
| `COUCHDB_URL` | `http://couchdb:5984` | intern, über den Service-Namen |
| `KI_ALLOWED_ORIGINS` | `https://dschudschuu.github.io` | woher die App fragen darf (Komma-getrennt) |
| `KI_PER_HOUR` / `KI_PER_DAY` | `20` / `60` | Rezepte je Person (schützt das Gratis-Kontingent) |

Die Variablen der CouchDB (`SERVICE_USER_COUCHDB`, `SERVICE_PASSWORD_64_COUCHDB`) bleiben unverändert.

## 5. Deploy

**Redeploy** (bzw. Deploy). Unter **Logs** des Service `ki` steht danach nur eine Zeile:
`Mashi-KI hört auf 0.0.0.0:8080 (Modell: …)`. Aufträge, Antworten und Anmeldungen werden nie
protokolliert. Beide Services sollten nach kurzer Zeit **healthy** sein.

## 6. Prüfen im Browser

1. `https://<DB-DOMAIN>/ki/status` öffnen → muss `{"ok":true,"configured":true}` zeigen
   (`configured:false` = Schlüssel oder Modell fehlt).
2. `https://<DB-DOMAIN>/_utils` → Fauxton muss nach Benutzer und Passwort fragen.
3. In der App (mit Server verbunden): **＋ → Rezept mit KI erstellen** → ein Rezept anfordern.

## 7. Weitere Person hinzufügen (in Fauxton)

Jede Person bekommt eine eigene Datenbank und einen eigenen Benutzer (nur Mitglied, kein Admin).

1. `https://<DB-DOMAIN>/_utils` → mit dem Admin-Zugang anmelden (Coolify: `SERVICE_USER_COUCHDB` /
   `SERVICE_PASSWORD_64_COUCHDB` unter Environment Variables).
2. **Create Database** → Name z. B. `mashi-tom` (Kleinbuchstaben, Ziffern, `_`, `-`; **nicht** `ki`).
3. Datenbank `_users` öffnen → **Create Document**:
   ```json
   { "_id": "org.couchdb.user:tom", "name": "tom", "password": "<langes Passwort>", "roles": [], "type": "user" }
   ```
4. Datenbank `mashi-tom` → **Permissions** → unter **Members** den Namen `tom` eintragen → speichern.
   (Nicht unter Admins!)
5. In der App der Person: „Mit Server verbinden“ → `https://<DB-DOMAIN>/mashi-tom`, Benutzer, Passwort.
   Die KI nutzt dieselbe Anmeldung – nichts weiter einzutragen.

## Modell wechseln

**Environment Variables** → `OPENROUTER_MODEL` ändern → **Redeploy**. In der App ist nichts zu tun.

## Lokal getestet (2026-09-30)

Mit den Images aus der Datei (`couchdb:3.5`, `node:24-alpine`), Code und `mashi.ini` **aus der
Compose-Datei gelesen**, OpenRouter nachgestellt:
- beide Healthchecks „healthy“ (`curl …/_up` ohne Anmeldung, `wget …/status`), KI-Dienst ohne
  gesetzte `COUCHDB_URL` (Standard `http://couchdb:5984`)
- `/status` und `/ki/status` → `{"ok":true,"configured":true}`; ohne Schlüssel `configured:false`, Rezept 503
- ohne oder mit falscher Anmeldung 401 (auf beiden Wegen), OpenRouter wird dann nicht gefragt
- CORS-Vorabfrage von der App erlaubt, fremde Herkunft ohne Freigabe
- angemeldet Rezept auf `/rezept` und `/ki/rezept`; Limit greift mit 429
- läuft als Benutzer `node`, lauscht auf `0.0.0.0:8080`, protokolliert nur die Startzeile
- ohne KI-Dienst antwortet die CouchDB an `/ki/rezept` mit 404 **mit** CORS-Kopf → die App zeigt
  „noch nicht eingerichtet“
- CouchDB schickt bei 401 `WWW-Authenticate: Basic realm="couchdb"`

Nicht lokal testbar: Coolify selbst (Domains, Strip Prefixes, Convert to Application) und das
echte OpenRouter.
