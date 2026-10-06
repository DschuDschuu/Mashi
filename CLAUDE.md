# Arbeiten an Mashi – Hinweise für Claude

Mashi ist Julias persönliches Kochbuch als PWA (React 19 + TypeScript + Vite, PouchDB/CouchDB, GitHub Pages).
Was Mashi kann und wie es aufgebaut ist: [README.md](README.md), [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md),
[docs/DATENMODELL.md](docs/DATENMODELL.md). Diese Datei sagt, **wie** hier gearbeitet wird – sie gilt am PC
und in Cloud-Sitzungen (Claude-App → Code).

## Zusammenarbeit

- **Immer Deutsch** – Antworten, Quiz, auch die kurzen Sätze zwischen Werkzeugaufrufen.
- Offene Entscheidungen fragen (Auswahl mit Empfehlung), Selbstverständliches einfach tun und kurz sagen.
- **Committen und pushen nur, wenn Julia es will.**
- **Quiz vor jedem Push** (Team-Regel): als Ankreuzfragen (mehrere richtig möglich), plausible Falschantworten,
  nie selbst beantworten; bei falscher oder halber Antwort erklären und eine kurze Nachfrage. Frage 5
  (Grundursache) nur bei Bugfixes. Danach die Trailer `Quiz-Reviewed`, `Quiz-Summary`, `Quiz-Date` in den Commit.
- Nach dem Push den GitHub-Action-Lauf bis „success“ beobachten (`gh run watch <id> --exit-status`).

## Befehle

```bash
npm ci              # einmalig nach dem Klonen
npm run dev         # Demo: http://localhost:5173/Mashi/
npm test            # Vitest
npm run build       # tsc + vite build
npx tsc --noEmit    # nur Typen prüfen (nicht `tsc -b`: legt tsconfig.tsbuildinfo an)
```

**Erfolg immer am Exit-Code prüfen**, nie per grep in der Ausgabe – so ging schon ein roter Stand raus.
Push auf `main` → GitHub Action (Tests + Build) → GitHub Pages: https://dschudschuu.github.io/Mashi/

## Datenschutz – das Repo ist öffentlich

- Keine persönlichen Daten ins Repo: keine echten Rezepte, Vorlieben-Texte, Bons, Preise, Zugangsdaten.
  Tests und Beispiele nur mit erfundenen Daten.
- Julias echte Daten liegen in einer CouchDB, die jemand anderes betreibt. **Claude greift nie auf den Server zu**
  und fasst keine Passwörter an – Server-Änderungen nur als Dateien unter `server/` mit Anleitung.
- localStorage-Schlüssel immer mit `mashi-` beginnen (der Origin `dschudschuu.github.io` ist mit anderen Apps geteilt).

## In der Demo testen (Browser)

- Demo-Modus speichert in localStorage (`mashi-recipes-v2`, `mashi-pantry-v1`, `mashi-plan-v1`, `mashi-products-v1` …).
  **Vorher sichern, nachher zurückspielen:** alles nach `sessionStorage['mashi-test-backup']`, nach dem Test
  wiederherstellen, prüfen, neu laden.
- Handybreite (375 px) mitprüfen; Breiten per `getBoundingClientRect`/`scrollWidth` messen statt dem Screenshot zu
  trauen; vor Screenshots `*{transition:none}` setzen.
- Vite: wird eine Datei zweimal kurz hintereinander geschrieben, hält der Browser manchmal die Zwischenfassung →
  Datei `touch`en und neu laden. Liefert der Dev-Server Altes, ihn neu starten.
- Ohne Browser (Cloud-Sitzung): Tests + Build, danach auf der echten Seite ansehen lassen.

## Aufbau in Kürze

- `src/domain/` – reine Logik mit Tests daneben (`*.test.ts`); `src/data/store.ts` – Zustand, Aktionen, „Rückgängig“;
  `src/data/syncMerge.ts` – Zusammenführen beim Abgleich (neue Felder an Plan/Speisekammer dort mitdenken);
  `src/ui/` – Screens und Komponenten; `src/styles/app.css` (Tablet-Regeln am Dateiende).
- Begriffe, die oft vorkommen:
  - Lebensmittel-Schlüssel `keyOfName` (`food:<id>`; mehrere Sorten `food:sorten:<id>`) – gleiches Lebensmittel = gleicher Schlüssel.
  - „Meine Lebensmittel“ = `MyProduct` (Sorten, Favorit, Packungsgrößen; `noValues` = rechnet mit der Tabelle).
  - Bons: `SavedBon`/`BonLine` (`skip`, `priceOnly`, Rabatte je Zeile); Preise je Sorte über `PriceEntry.productId`.
  - Plan: `PlanItem.amounts` („nur dieses Mal“-Mengen) und `variants` (Sorte); `asCooked` = Rezept, wie gekocht.
  - Reste/„läuft bald ab“: `leftoverSuggestions`; Vorgekochtes: `PantryItem.recipeId` + `cooked`.
- Alles, was Daten ändert, bekommt in der Oberfläche ein „Rückgängig“ (Toast).

## Stil

- Kommentare auf Deutsch und erklären das **Warum**; der Wunsch dahinter steht oft als „(Julia: …)“ dabei.
- Texte in der App kurz und freundlich, Linien-Icons statt Emojis; nichts darf auf 375 px aus der Karte ragen.
- Für Regex und Sonderzeichen das Edit-Werkzeug nehmen – Skripte (Python, sed) machen aus `\b`, `\n`, ` `
  gern echte Zeichen.

## Effizientes Arbeiten

- Lies zuerst CLAUDE.md und nur die für die Aufgabe relevanten Dateien.
- Untersuche nicht ohne Grund das gesamte Repository.
- Ändere nur Dateien, die für die Aufgabe notwendig sind.
- Bestehende Komponenten, Funktionen und Styles wiederverwenden, bevor neue erstellt werden.
- Keine ungefragten Refactorings oder Architekturänderungen.
- Keine neuen Dependencies ohne Rückfrage.
- Bei kleinen Änderungen keine vollständige Codeausgabe; kurz zusammenfassen, was geändert wurde.
- Tests nur für die betroffene Funktionalität ausführen, sofern kein vollständiger Testlauf sinnvoll oder ausdrücklich gewünscht ist.
