# Mashi – Architektur

## Projektstruktur

```
mashi/
├─ docs/                      Architektur, Datenmodell, Wireframes
├─ index.html
├─ src/
│  ├─ domain/                 Reines TypeScript, kein React, kein Netzwerk → voll testbar
│  │  ├─ types.ts             Das Datenmodell (Recipe, Version, Ingredient …)
│  │  ├─ recipe.ts            Hilfen: aktuelle Version, neue Version anhängen
│  │  ├─ catalog.ts           Geräte, Kategorien, Status-Texte (erweiterbar)
│  │  ├─ status.ts            Erlaubte Statuswechsel
│  │  ├─ scaling.ts           Portionen umrechnen, Mengen küchentauglich anzeigen
│  │  ├─ versions.ts          Unterschiede zwischen Versionen („300 g → 350 g“)
│  │  ├─ filter.ts            Suche und Filter
│  │  └─ nutrition/           Nährwertengine – rechnet NUR aus Zutaten × Tabelle
│  │     ├─ engine.ts         Berechnung + Einstufung berechnet/geschätzt/nicht verfügbar
│  │     ├─ units.ts          EL, Stück, Zehe … → Gramm
│  │     ├─ localFoods.ts     Lokale Lebensmitteltabelle (Prototyp)
│  │     └─ types.ts          FoodTable / NutritionProvider-Schnittstellen
│  ├─ services/               Austauschbare Anbieter hinter Schnittstellen
│  │  ├─ index.ts             ← DIE Stelle, an der Anbieter verdrahtet werden
│  │  ├─ ai/                  RecipeAiProvider (heute: Mock)
│  │  └─ images/              ImageProvider + zentraler Bildstil
│  ├─ data/
│  │  ├─ repository.ts        RecipeRepository-Schnittstelle
│  │  ├─ localRepository.ts   heute: localStorage
│  │  ├─ mockRecipes.ts       Beispielrezepte
│  │  └─ store.ts             App-Zustand + alle Aktionen (createRecipe, submitTest …)
│  ├─ ui/
│  │  ├─ components/          Karten, Navigation, Editoren, Nährwertanzeige …
│  │  └─ screens/             Ein Screen pro Datei
│  ├─ router.ts               Minimaler Hash-Router
│  ├─ App.tsx                 Routen-Tabelle
│  └─ styles/app.css          Designsystem (Tokens oben)
```

### Die drei Regeln dahinter

1. **`domain/` kennt nichts außer sich selbst.** Keine Imports aus `ui/`, `data/` oder `services/`.
   Deshalb lassen sich Nährwerte, Portionen und Versionen ohne Browser testen (`npm test`).
2. **Screens schreiben nie direkt in den Speicher.** Alles läuft über die Aktionen in `data/store.ts`.
   Wenn Supabase kommt, ändert sich das Repository – nicht die Screens.
3. **Anbieter werden nur in `services/index.ts` gewählt.** KI, Bilder, Lebensmitteldaten: jeweils eine Zeile.

## KI und Nährwerte sind technisch getrennt

```
  Freitext ──▶ RecipeAiProvider ──▶ RecipeDraft (Zutaten, Mengen, Schritte …)
                                        │            KEIN Nährwertfeld im Typ
                                        ▼
                               Nährwertengine ◀── FoodTable (lokal / Open Food Facts / USDA)
                                        │
                                        ▼
                     berechnet 🟢 · geschätzt 🟡 („ca.“) · nicht verfügbar ⚪
```

`RecipeDraft` = `RecipeContent`, und `RecipeContent` hat kein Feld für Nährwerte. Die KI *kann*
keine Nährwerte liefern, die irgendwo gespeichert würden. Nährwerte werden bei jeder Anzeige
aus den Zutaten berechnet (gecacht je Version).

**Einstufung** (`engine.ts`):
- 🟢 *berechnet*: jede mitgezählte Zutat eindeutig zugeordnet und in Gramm umrechenbar.
- 🟡 *geschätzt*: mind. eine Zutat nur ungefähr zugeordnet, ohne Menge, oder mit grober Einheit
  (Prise, Handvoll, Bund, Dose).
- ⚪ *nicht verfügbar*: mehr als 30 % der Zutaten (nach Anzahl **oder** Gewicht) unbekannt.
- Ignoriert: optionale Zutaten, Salz/Pfeffer ohne Menge.

## Navigation

```
 ┌──────── Bottom Navigation (Tabs) ─────────┐
 │  Start   Kochbuch   [ ＋ ]    Plan    Mehr │
 └───────────────────────┬───────────────────┘
                         └─ Sheet: ✨ Mit KI · ✍️ Eigenes Rezept · 📷 Importieren

 #/                       Start
 #/kochbuch?device=…      Kochbuch (Filter als URL → Schnellfilter sind Links)
 #/testen                 KI-Ideen · Zum Testen · Bewährt (über Start erreichbar)
 #/plan                   Wochenplan „Diese Woche“, Vorschläge, Einkaufsliste
 #/mehr                   Archiv, Einstellungen, Meine Produkte, Sync, Sicherung
 #/rezept/:id             Rezeptdetail
 #/rezept/:id/kochen?p=3  Kochmodus (ohne Navigation)
 #/rezept/:id/test        Testfeedback
 #/rezept/:id/bearbeiten  Formular → neue Version
 #/neu/ki | manuell | import   (import = Text einfügen → vorausgefülltes Formular)
```

Start + Kochbuch (die häufigsten) liegen links unter dem Daumen. „Zum Testen“ hat keinen eigenen
Tab mehr: Es steht auf der Startseite und als Segment im Kochbuch; der Platz gehört dem Wochenplan.
Leicht umstellbar in `BottomNav.tsx`.

## Status-Lebenszyklus

```
 ✨ KI-Idee ──vormerken──▶ 🧪 Zum Testen ──hat geschmeckt──▶ ❤️ Bewährt ──übernehmen──▶ 📖 Kochbuch
                               ▲                                 │                       │
                               └──────── nochmal testen ─────────┘◀── weiter verbessern ─┘
 Archivieren: eigenes Flag (archivedAt), Status bleibt → verlustfrei wiederherstellbar.
```

**Entscheidung zu Abschnitt 4 des Konzepts:** Ein frisch generiertes Rezept landet als
*KI-Idee*, nicht sofort als *Zum Testen*. Grund: Prinzip 32 – der Nutzer entscheidet, was er
ausprobieren will. Ein Klick auf „Zum Testen vormerken“ reicht. (Änderbar in `AiCreateScreen.tsx`.)

## Phasenplan

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | UI + Navigation + Mock-Daten | ✅ dieser Prototyp |
| 2 | Supabase: Auth, Tabellen, `SupabaseRecipeRepository` | offen |
| 3 | Manuelle Rezepterstellung | ✅ (lokal) |
| 4 | Teststatus, Bewertungen, Versionierung | ✅ (lokal) |
| 5 | KI-Rezepte über Supabase Edge Function | offen – Mock vorhanden |
| 6 | KI-Bilder (1024², einmal erzeugen, in Storage speichern) | offen – Stil definiert |
| 7 | Nährwertengine mit Open Food Facts / USDA | Engine ✅, externe Daten offen |
| 8 | Suche + Filter | ✅ |
| 9 | Kochmodus | ✅ (Timer, Wake Lock) |
| 10 | PWA, IndexedDB, Offline-Sync | offen |

## Wichtige Hinweise für später

- **Geteilter Origin:** Auf `dschudschuu.github.io` teilt Mashi localStorage/IndexedDB mit
  my-little-joy und dem Betriebskosten-Abrechner. Deshalb alle Schlüssel mit `mashi-` präfixen.
  „Websitedaten löschen“ trifft alle drei Apps.
- **API-Schlüssel nie ins Frontend.** KI- und Bild-Aufrufe laufen ab Phase 5 über Supabase
  Edge Functions; das Frontend kennt nur den öffentlichen Supabase-Anon-Key (durch RLS geschützt).
- **Schriften** kommen im Prototyp von Google Fonts. Für Offline (Phase 10) lokal bündeln.
