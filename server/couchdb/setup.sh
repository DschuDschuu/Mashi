#!/bin/sh
# Mashi – Einrichtung der CouchDB (einmalig nach dem ersten `docker compose up -d`).
#
# Legt an:
#   1. eine Datenbank – "mashi" oder für jede weitere Person eine eigene (z. B. "mashi-tom")
#   2. einen eigenen Benutzer für die App (KEIN Admin)
#   3. Zugriffsregel: dieser Benutzer darf diese Datenbank lesen und schreiben
# Jede Person hat so ihre eigenen Rezepte, Produkte, Wochenplan und Speisekammer.
# Schutz: Gehört eine Datenbank schon jemand anderem, bricht das Skript ab, statt ihn auszusperren.
# Und prüft am Ende, dass ein Fremder ohne Anmeldung abgewiesen wird.
#
# Aufruf im Ordner mit der .env:   sh setup.sh
# Kann gefahrlos mehrfach laufen (vorhandene Datenbank bleibt, Passwort wird ggf. neu gesetzt).
set -eu

[ -f .env ] || { echo "Keine .env gefunden – bitte im Ordner server/couchdb ausführen."; exit 1; }

# Werte aus der .env LESEN statt sie als Shell-Code auszuführen (Code-Review #15): Die .env ist im Format von
# Docker Compose – ein Leerzeichen, $ oder ` im Passwort würde sonst etwas anderes ausführen oder einen anderen Wert
# ergeben als den, den Compose der CouchDB gibt. Umschließende ' oder " werden entfernt, wie bei Compose.
envval() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" .env | tail -n 1 \
    | sed "s/^[[:space:]]*//; s/[[:space:]]*\$//; s/^'\\(.*\\)'\$/\\1/; s/^\"\\(.*\\)\"\$/\\1/"
}
MASHI_DB_HOST=$(envval MASHI_DB_HOST)
COUCHDB_ADMIN_USER=$(envval COUCHDB_ADMIN_USER)
COUCHDB_ADMIN_PASSWORD=$(envval COUCHDB_ADMIN_PASSWORD)
MASHI_DB_URL=$(envval MASHI_DB_URL)
[ -n "$MASHI_DB_HOST" ] && [ -n "$COUCHDB_ADMIN_USER" ] && [ -n "$COUCHDB_ADMIN_PASSWORD" ] \
  || { echo "In der .env fehlt MASHI_DB_HOST, COUCHDB_ADMIN_USER oder COUCHDB_ADMIN_PASSWORD."; exit 1; }

# MASHI_DB_URL nur zum lokalen Testen (z. B. http://127.0.0.1:5984), sonst immer HTTPS über die Subdomain.
URL="${MASHI_DB_URL:-https://${MASHI_DB_HOST}}"

# Zugangsdaten nie auf die Befehlszeile (Code-Review #16): dort sieht sie jeder auf dem Server per `ps`.
# Die Admin-Anmeldung steht in einer Datei, die nur du lesen kannst, und wird am Ende gelöscht.
umask 077
AUTH=$(mktemp)
# Bei Abbruch (Strg+C): Passwort-Eingabe wieder sichtbar machen und die Datei löschen (Code-Review #17)
trap 'stty echo 2>/dev/null || true; rm -f "$AUTH"' EXIT
trap 'exit 130' INT TERM

# für curl-Konfiguration und JSON: Backslash und Anführungszeichen maskieren
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
printf 'user = "%s:%s"\n' "$(esc "$COUCHDB_ADMIN_USER")" "$(esc "$COUCHDB_ADMIN_PASSWORD")" > "$AUTH"

# HTTP-Status einer Anfrage (Ausgabe verwerfen). „|| true“: ohne Verbindung meldet curl 000 und einen Fehler –
# mit set -e wäre das Skript sonst stumm beendet, statt den Hinweis unten zu zeigen (Code-Review #14).
status() { curl -s -o /dev/null -w '%{http_code}' "$@" || true; }
# als Admin; Inhalt (JSON) kommt über die Standardeingabe, nicht über die Befehlszeile
admin() { curl -s -K "$AUTH" "$@" || true; }
admin_status() { status -K "$AUTH" "$@"; }

echo "→ Prüfe Erreichbarkeit von ${URL} …"
code=$(admin_status "$URL/")
case "$code" in
  200) echo "  ok (HTTPS + Admin-Anmeldung funktionieren)";;
  401) echo "  Admin-Anmeldung abgelehnt – COUCHDB_ADMIN_USER/PASSWORD prüfen."; exit 1;;
  000) echo "  Keine Verbindung – DNS-Eintrag, Traefik-Labels oder Zertifikat prüfen."; exit 1;;
  *)   echo "  Unerwartete Antwort: $code"; exit 1;;
esac

printf "Name der Datenbank (Enter = mashi; für eine weitere Person z. B. mashi-tom): "
read -r DB
DB="${DB:-mashi}"
# CouchDB: Kleinbuchstabe am Anfang, dann Kleinbuchstaben, Ziffern, _ und -
echo "$DB" | grep -Eq '^[a-z][a-z0-9_-]*$' || { echo "Ungültiger Name – nur Kleinbuchstaben, Ziffern, _ und -, Anfang mit Buchstabe."; exit 1; }

printf "Benutzername für die Mashi-App (z. B. julia): "
read -r APP_USER
# geht ungeprüft in eine Adresse und eine Suche – darum nur einfache Zeichen (Code-Review #17)
echo "$APP_USER" | grep -Eq '^[a-z0-9_.-]+$' || { echo "Benutzername bitte nur aus Kleinbuchstaben, Ziffern, Punkt, _ und -."; exit 1; }
stty -echo 2>/dev/null || true
printf "Passwort für %s (wird nicht angezeigt): " "$APP_USER"; read -r APP_PASS; echo
printf "Passwort wiederholen: "; read -r APP_PASS2; echo
stty echo 2>/dev/null || true
[ "$APP_PASS" = "$APP_PASS2" ] || { echo "Passwörter stimmen nicht überein."; exit 1; }
[ ${#APP_PASS} -ge 12 ] || { echo "Bitte mindestens 12 Zeichen."; exit 1; }

# Wer darf schon in die Datenbank? Namen und Rollen getrennt lesen – egal, in welcher Reihenfolge sie stehen
# (Code-Review #17: die alte Suche fand bei anderer Reihenfolge niemanden und sperrte dann den Besitzer aus)
MEMBER_NAMES=""
MEMBER_ROLES=""
echo "→ Datenbank '$DB' …"
code=$(admin_status -X PUT "$URL/$DB")
case "$code" in
  201|202) echo "  angelegt";;
  412)
    echo "  gibt es schon – bleibt unverändert"
    MEMBERS=$(admin "$URL/$DB/_security" | tr -d '\n' | sed -n 's/.*"members":{\([^}]*\)}.*/\1/p')
    MEMBER_NAMES=$(printf '%s' "$MEMBERS" | sed -n 's/.*"names":\[\([^]]*\)\].*/\1/p')
    MEMBER_ROLES=$(printf '%s' "$MEMBERS" | sed -n 's/.*"roles":\[\([^]]*\)\].*/\1/p')
    if [ -n "$MEMBER_ROLES" ]; then
      echo "  STOPP: Zugriff auf '$DB' läuft über Rollen ($MEMBER_ROLES) – bitte in Fauxton von Hand anpassen."
      exit 1
    fi
    if [ -n "$MEMBER_NAMES" ] && ! printf '%s' "$MEMBER_NAMES" | grep -q "\"$APP_USER\""; then
      echo "  STOPP: '$DB' gehört schon $MEMBER_NAMES."
      echo "  Für eine weitere Person bitte einen eigenen Namen wählen, z. B. mashi-$APP_USER."
      exit 1
    fi;;
  *) echo "  Fehler: $code"; exit 1;;
esac

echo "→ Benutzer '$APP_USER' …"
DOC_URL="$URL/_users/org.couchdb.user:$APP_USER"
REV=$(admin "$DOC_URL" | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p')
code=$(printf '{"name":"%s","password":"%s","roles":[],"type":"user"%s}' "$(esc "$APP_USER")" "$(esc "$APP_PASS")" "${REV:+,\"_rev\":\"$REV\"}" \
  | admin_status -X PUT "$DOC_URL" -H 'Content-Type: application/json' --data-binary @-)
case "$code" in 201|202) if [ -n "$REV" ]; then echo "  gab es schon – Passwort neu gesetzt"; else echo "  angelegt"; fi;; *) echo "  Fehler: $code"; exit 1;; esac
unset APP_PASS APP_PASS2

# Bisherige Mitglieder bleiben – der Benutzer kommt dazu, statt alle anderen zu ersetzen (Code-Review #17)
if [ -n "$MEMBER_NAMES" ]; then NAMES="$MEMBER_NAMES"; else NAMES="\"$(esc "$APP_USER")\""; fi
echo "→ Zugriffsregel: $NAMES in '$DB' …"
code=$(printf '{"admins":{"names":[],"roles":[]},"members":{"names":[%s],"roles":[]}}' "$NAMES" \
  | admin_status -X PUT "$URL/$DB/_security" -H 'Content-Type: application/json' --data-binary @-)
[ "$code" = "200" ] && echo "  gesetzt" || { echo "  Fehler: $code"; exit 1; }

echo "→ Gegenprobe: Zugriff ohne Anmeldung muss abgewiesen werden …"
code=$(status "$URL/$DB")
[ "$code" = "401" ] && echo "  ok (401 – gesperrt)" || { echo "  ACHTUNG: Antwort $code statt 401 – mashi.ini wird nicht gelesen?"; exit 1; }

echo "→ Gegenprobe: CORS für die App …"
cors=$(curl -s -o /dev/null -D - -X OPTIONS "$URL/$DB" \
  -H 'Origin: https://dschudschuu.github.io' -H 'Access-Control-Request-Method: GET' \
  | tr -d '\r' | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p' || true)
[ "$cors" = "https://dschudschuu.github.io" ] && echo "  ok" || echo "  ACHTUNG: CORS-Antwort '$cors' – [cors] in mashi.ini prüfen."

echo
echo "Fertig. In der Mashi-App eintragen:"
echo "  Adresse:      $URL/$DB"
echo "  Benutzername: $APP_USER"
echo "  Passwort:     (das eben gewählte)"
