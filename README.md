# Mashi 🥣

Dein persönliches Kochbuch – das mit jedem Rezept wächst, das du wirklich ausprobiert hast.
(맛있다, *mashitda* – „es schmeckt“.)

**Kernidee:** Eine KI-Rezeptidee ist noch kein Rezept. Erst testen, dann bewerten und anpassen,
dann selbst entscheiden, ob es ins Kochbuch kommt.

## Stand: Phase 1 – klickbarer Prototyp

- Alle Screens mit Beispieldaten: Start, Kochbuch, Rezeptdetail, Zum Testen, Erstellen,
  KI-Rezept (Mock), Testfeedback, Kochmodus, eigenes Rezept, Archiv
- Kompletter Lebenszyklus KI-Idee → Zum Testen → Bewährt → Kochbuch mit Versionierung
- Nährwertengine mit lokaler Lebensmitteltabelle (berechnet / geschätzt / nicht verfügbar)
- Daten liegen **nur im Browser** (localStorage). Noch kein Login, keine echte KI, kein Offline.

## Loslegen

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Domänentests (Nährwerte, Portionen, Versionen, Filter)
npm run build      # statischer Build nach dist/
```

„Mehr → Beispieldaten zurücksetzen“ stellt den Ausgangszustand wieder her.

## Doku

- [Architektur, Navigation, Phasenplan](docs/ARCHITEKTUR.md)
- [Datenmodell + geplante Supabase-Tabellen](docs/DATENMODELL.md)
- [Wireframes](docs/WIREFRAMES.md)

## Technik

React 19 + TypeScript + Vite, eigenes CSS (keine UI-Bibliothek), Hash-Routing (läuft auf
GitHub Pages ohne Umleitungen). Einzige Laufzeitabhängigkeit: React.
