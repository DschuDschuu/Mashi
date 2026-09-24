#!/bin/sh
# Mashi – Einrichtung der CouchDB (einmalig nach dem ersten `docker compose up -d`).
#
# Legt an:
#   1. die Datenbank "mashi"
#   2. einen eigenen Benutzer für die App (KEIN Admin)
#   3. Zugriffsregel: nur dieser Benutzer darf die Datenbank lesen und schreiben
# Und prüft am Ende, dass ein Fremder ohne Anmeldung abgewiesen wird.
#
# Aufruf im Ordner mit der .env:   sh setup.sh
# Kann gefahrlos mehrfach laufen (vorhandene Datenbank bleibt, Passwort wird ggf. neu gesetzt).
set -eu

[ -f .env ] || { echo "Keine .env gefunden – bitte im Ordner server/couchdb ausführen."; exit 1; }
# shellcheck disable=SC1091
. ./.env
: "${MASHI_DB_HOST:?}" "${COUCHDB_ADMIN_USER:?}" "${COUCHDB_ADMIN_PASSWORD:?}"

# MASHI_DB_URL nur zum lokalen Testen (z. B. http://127.0.0.1:5984), sonst immer HTTPS über die Subdomain.
URL="${MASHI_DB_URL:-https://${MASHI_DB_HOST}}"
ADMIN="${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}"

# JSON-sicher: Backslash und Anführungszeichen im Passwort maskieren
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# HTTP-Status einer Anfrage (Ausgabe verwerfen)
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "→ Prüfe Erreichbarkeit von ${URL} …"
code=$(status -u "$ADMIN" "$URL/")
case "$code" in
  200) echo "  ok (HTTPS + Admin-Anmeldung funktionieren)";;
  401) echo "  Admin-Anmeldung abgelehnt – COUCHDB_ADMIN_USER/PASSWORD prüfen."; exit 1;;
  000) echo "  Keine Verbindung – DNS-Eintrag, Traefik-Labels oder Zertifikat prüfen."; exit 1;;
  *)   echo "  Unerwartete Antwort: $code"; exit 1;;
esac

printf "Benutzername für die Mashi-App (z. B. julia): "
read -r APP_USER
[ -n "$APP_USER" ] || { echo "Benutzername darf nicht leer sein."; exit 1; }
stty -echo 2>/dev/null || true
printf "Passwort für %s (wird nicht angezeigt): " "$APP_USER"; read -r APP_PASS; echo
printf "Passwort wiederholen: "; read -r APP_PASS2; echo
stty echo 2>/dev/null || true
[ "$APP_PASS" = "$APP_PASS2" ] || { echo "Passwörter stimmen nicht überein."; exit 1; }
[ ${#APP_PASS} -ge 12 ] || { echo "Bitte mindestens 12 Zeichen."; exit 1; }

echo "→ Datenbank 'mashi' …"
code=$(status -u "$ADMIN" -X PUT "$URL/mashi")
case "$code" in 201|202) echo "  angelegt";; 412) echo "  gibt es schon – bleibt unverändert";; *) echo "  Fehler: $code"; exit 1;; esac

echo "→ Benutzer '$APP_USER' …"
DOC_URL="$URL/_users/org.couchdb.user:$APP_USER"
REV=$(curl -s -u "$ADMIN" "$DOC_URL" | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p')
BODY="{\"name\":\"$(esc "$APP_USER")\",\"password\":\"$(esc "$APP_PASS")\",\"roles\":[],\"type\":\"user\"${REV:+,\"_rev\":\"$REV\"}}"
code=$(status -u "$ADMIN" -X PUT "$DOC_URL" -H 'Content-Type: application/json' -d "$BODY")
case "$code" in 201|202) if [ -n "$REV" ]; then echo "  gab es schon – Passwort neu gesetzt"; else echo "  angelegt"; fi;; *) echo "  Fehler: $code"; exit 1;; esac
unset APP_PASS APP_PASS2 BODY

echo "→ Zugriffsregel: nur '$APP_USER' darf in 'mashi' …"
SEC="{\"admins\":{\"names\":[],\"roles\":[]},\"members\":{\"names\":[\"$(esc "$APP_USER")\"],\"roles\":[]}}"
code=$(status -u "$ADMIN" -X PUT "$URL/mashi/_security" -H 'Content-Type: application/json' -d "$SEC")
[ "$code" = "200" ] && echo "  gesetzt" || { echo "  Fehler: $code"; exit 1; }

echo "→ Gegenprobe: Zugriff ohne Anmeldung muss abgewiesen werden …"
code=$(status "$URL/mashi")
[ "$code" = "401" ] && echo "  ok (401 – gesperrt)" || { echo "  ACHTUNG: Antwort $code statt 401 – mashi.ini wird nicht gelesen?"; exit 1; }

echo "→ Gegenprobe: CORS für die App …"
cors=$(curl -s -o /dev/null -D - -X OPTIONS "$URL/mashi" \
  -H 'Origin: https://dschudschuu.github.io' -H 'Access-Control-Request-Method: GET' \
  | tr -d '\r' | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p')
[ "$cors" = "https://dschudschuu.github.io" ] && echo "  ok" || echo "  ACHTUNG: CORS-Antwort '$cors' – [cors] in mashi.ini prüfen."

echo
echo "Fertig. In der Mashi-App eintragen:"
echo "  Adresse:      $URL/mashi"
echo "  Benutzername: $APP_USER"
echo "  Passwort:     (das eben gewählte)"
