# Mashi-CouchDB einrichten

Eigene CouchDB nur für die Mashi-App – getrennt von der Obsidian-LiveSync-CouchDB.
Läuft hinter dem vorhandenen Traefik (Coolify-Proxy), HTTPS per Let's Encrypt.
Der Port 5984 wird **nicht** auf dem Host veröffentlicht.

## Dateien

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | CouchDB 3.5 + Traefik-Labels (HTTPS, HTTP→HTTPS-Umleitung) |
| `mashi.ini` | Einstellungen: Pflicht-Anmeldung, CORS für die App, Einzelserver |
| `.env.example` | Vorlage für Subdomain und Admin-Zugang → als `.env` kopieren |
| `setup.sh` | Pro Person einmal: Datenbank + App-Benutzer + Zugriffsregel, mit Gegenproben |

## Schritte

1. **DNS:** A-Record für die Subdomain (z. B. `mashi-db.carapaxo.de`) auf die Server-IP.
2. **Traefik-Namen prüfen:** In `docker-compose.yml` sind Netzwerk `coolify`, Entrypoints
   `http`/`https` und Resolver `letsencrypt` angenommen (Coolify-Standard). Abweichend? Nur
   die mit `←` markierten Labels anpassen – Vergleich z. B. mit den Labels der Obsidian-CouchDB.
3. **Konfiguration:**
   ```sh
   cp .env.example .env    # MASHI_DB_HOST und ein langes Admin-Passwort eintragen
   ```
4. **Starten:**
   ```sh
   docker compose up -d
   ```
5. **Einrichten** (fragt Datenbankname – Enter = `mashi` –, dann Benutzername + Passwort für
   Julias App-Zugang, verdeckt):
   ```sh
   sh setup.sh
   ```
   Am Ende müssen alle Gegenproben „ok“ melden.

Julia trägt danach in der App nur ein: Adresse `https://<subdomain>/mashi`, Benutzername, Passwort.
Der Admin-Zugang kommt **nie** in die App.

## Weitere Person hinzufügen

Jede Person bekommt eine **eigene Datenbank** mit eigenem Benutzer – eigene Rezepte, Produkte,
Wochenplan und Speisekammer. Nichts wird geteilt, und niemand sieht die Daten des anderen.

1. Auf dem Server im Ordner mit `.env`:
   ```sh
   sh setup.sh
   ```
   Bei „Name der Datenbank“ **nicht** Enter drücken, sondern einen eigenen Namen eingeben,
   z. B. `mashi-tom` (nur Kleinbuchstaben, Ziffern, `_` und `-`). Dann Benutzername und Passwort
   der neuen Person.
2. In der App (auf dem Gerät der neuen Person): „Mit Server verbinden“ → Adresse
   `https://<subdomain>/mashi-tom`, Benutzername, Passwort.

**Schutz vor Aussperren:** Gibt es die Datenbank schon und gehört sie jemand anderem, bricht
`setup.sh` mit „STOPP“ ab und ändert nichts. Wer versehentlich Enter drückt, sperrt also
nicht Julia aus `mashi` aus. Für dieselbe Person darf das Skript beliebig oft laufen (z. B. um
ein Passwort neu zu setzen).

## Sicherheit

- Ohne Anmeldung: alles `401`. Der App-Benutzer ist **kein** Admin und nur Mitglied der
  eigenen Datenbank (`mashi` bzw. `mashi-tom`) – er kann keine anderen Datenbanken sehen, anlegen oder Rechte ändern.
- Ein fremder angemeldeter Benutzer bekommt auf `mashi` ein `403` – das gilt genauso zwischen
  `mashi` und `mashi-tom`.
- Optional: Rate-Limit-Middleware in `docker-compose.yml` einkommentieren (Passwort-Raten).

## Lokal getestet (2026-09-23, couchdb:3.5 = 3.5.2)

Container startet, `single_node` legt `_users`/`_replicator` an, CORS-Einstellung wird geladen,
`setup.sh` läuft durch (auch zweimal hintereinander; Passwort mit `"` und `\` funktioniert),
App-Benutzer liest/schreibt (200/201), falsches Passwort 401, fremder Benutzer 403,
App-Benutzer darf keine DB anlegen und sich nicht zum Admin machen (401).
Zweite Person (2026-09-25): `mashi-tom` angelegt, Julia → `mashi-tom` 403, Tom → `mashi` 403,
Tom mit versehentlich `mashi` → STOPP, Julia bleibt einziges Mitglied von `mashi`.
Traefik/Let's Encrypt konnte lokal nicht getestet werden – das prüft `setup.sh` auf dem Server
gleich mit (erster Schritt: HTTPS + Admin-Anmeldung).

## Bekannte Eigenheiten

- **Kein `:ro` am `mashi.ini`-Mount.** Das Startskript des Images setzt Besitzer/Rechte unter
  `/opt/couchdb` und bricht bei schreibgeschützter Datei still ab (Exit 1, leeres Log).
  Die Datei gehört auf dem Host danach UID 5984 – normal.
- Beim **allerersten** Start stehen zwei `database_does_not_exist … _users`-Zeilen im Log
  (Start-Wettlauf, bevor `single_node` die Systemdatenbanken angelegt hat). Harmlos.
- Versucht der App-Benutzer, `_security` zu ändern, antwortet CouchDB mit `500 no_majority`
  statt 403. Die Regel bleibt trotzdem unverändert (geprüft).
- Kein Healthcheck: Mit Pflicht-Anmeldung liefert `/_up` 401; Traefik würde einen
  „unhealthy“-Container aus dem Routing nehmen.

## Backup

Die Daten liegen im Volume `mashi-couchdb-data`. Einfachste Sicherung:
```sh
docker run --rm -v mashi-couchdb-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mashi-couchdb-$(date +%F).tar.gz -C /data .
```
Zusätzlich hat jedes Gerät mit der App eine vollständige Kopie, und die App hat unter
„Mehr → Sicherung herunterladen“ einen JSON-Export.
