# Mashi 🥣

Dein persönliches Kochbuch – das mit jedem Rezept wächst, das du wirklich ausprobiert hast.
(맛있다, *mashitda* – „es schmeckt“.)

**Kernidee:** Eine Rezeptidee ist noch kein Rezept. Erst testen, dann bewerten und anpassen,
dann selbst entscheiden, ob es ins Kochbuch kommt. Dazu: Wochenplan, Einkaufsliste und
Speisekammer, die zusammenarbeiten – was da ist, muss nicht gekauft werden.

Live: <https://dschudschuu.github.io/Mashi/> · installierbar als App (PWA), funktioniert offline.

## Was Mashi kann

- **Kochbuch** mit Versionen: eigene Rezepte, Import aus Text oder Foto (Texterkennung im Browser),
  KI-Ideen erst testen, Bewertung, „Zutaten vereinheitlichen“ (eine Schreibweise je Zutat)
- **Wochenplan** (laufend, ohne Wochenwechsel) mit Vorschlägen (gemeinsame Zutaten), Nährwerten pro Portion,
  „Gekocht“-Haken und **Vorgekocht**: übrige Portionen in der Speisekammer mit Erinnerung, einfrierbar, „1 gegessen“
- **Einkaufsliste** aus dem Plan, zieht den Vorrat ab, Basics, „Doch kaufen“, Kassenbon hakt ab,
  „Nachkaufen“ bei Vorratsware unter dem Mindestbestand (z. B. passierte Tomaten unter 4 Dosen)
- **Speisekammer**: Vorrat per Kassenbon oder von Hand (mit Marke/Sorte), Packungen („4 × 500 g“,
  „750 ml offen“ – Angebrochenes hält kürzer), „Ganze Packung verwenden?“ beim Kochen, Haltbarkeit,
  „Bald verbrauchen“, Einfrieren, Reste verwerten
- **Meine Lebensmittel**: eigene Produkte mit Marke, Nährwerte per Etikett-Foto, Open Food Facts
  oder abgetippt; mehrere Sorten einer Zutat mit Favorit ★; „Immer im Haus“, „Ohne Nährwerte“;
  Fettstufen bei Milch, Joghurt, Quark
- **Nährwerte** rein rechnerisch aus Zutaten × Lebensmitteltabelle (nie von der KI), je Zutat
  aufgeschlüsselt, Makro-Ziel für die Sortenwahl
- **Kochmodus** Schritt für Schritt mit Timer, Mengen nur für dieses Mal
- **Abgleich** zwischen Geräten über eine eigene CouchDB (siehe `server/couchdb/ANLEITUNG.md`),
  Sicherung als Datei, Einführung beim ersten Start, vier Farbthemen

## Loslegen

```bash
npm install
npm run dev        # http://localhost:5173/Mashi/ – ohne Server: „Erst mal ohne Server ausprobieren“ (Demo)
npm test           # Domänentests (vitest)
npm run build      # Typprüfung + statischer Build nach dist/
```

Die Demo hat Beispieldaten und bleibt im Browser; „Einstellungen → Synchronisation →
Beispieldaten zurücksetzen“ stellt sie wieder her. Lokal testen mit echten Daten nur bewusst –
Änderungen gingen dann in die echte Datenbank.

## Doku

- [Architektur, Navigation, Phasen](docs/ARCHITEKTUR.md)
- [Datenmodell (Rezepte, Plan, Speisekammer, Meine Lebensmittel)](docs/DATENMODELL.md)
- [Wireframes der ersten Phase](docs/WIREFRAMES.md) (historisch)
- [Eigener Server (CouchDB)](server/couchdb/ANLEITUNG.md)

## Technik

React 19 + TypeScript + Vite, eigenes CSS mit Design-Tokens (keine UI-Bibliothek), Hash-Routing
(GitHub Pages ohne Umleitungen). Daten lokal in PouchDB (IndexedDB), Abgleich mit CouchDB,
Konflikte werden feldweise zusammengeführt. Texterkennung mit tesseract.js (lädt beim ersten
Mal das deutsche Sprachmodell). Die Rechenlogik liegt getrennt in `src/domain/` und ist mit
Tests abgesichert.
