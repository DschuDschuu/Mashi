# Adventskalender

Vom 1. bis 24. Dezember öffnet sich in Mashi jeden Tag ein Türchen mit einem Rezept. Gefällt es, legt
„Zum Testen speichern“ es ins Kochbuch (Status „Zum Testen“, Schlagwort „Adventskalender“, der Tipp als Notiz).

- **Wo:** Startseite (1.–24.12. „Türchen 5 öffnen“; ab 15.11. die Erinnerung „befüllen“, wegklickbar) und
  `#/advent`, das ganze Jahr über die Einstellungen erreichbar.
- **Türchen:** gehen an ihrem Tag auf (Ortszeit). Nach dem Dezember des Kalenders ist alles offen – Verpasstes nachholen.
  Geschlossen ist jedes eine eigene Grafik in Rot, Grün, Braun und Rosa (`AdventDoorArt.tsx`, reines SVG); wartet es
  noch, ist es blasser und hat ein Schloss, das heutige hat Rahmen und „Heute“.
- **Daten:** Die Rezepte kommen aus einer JSON-Datei, die man selbst einspielt („Kalender befüllen“). Sie liegen im
  eigenen Dokument `adventskalender` (Demo: localStorage `mashi-advent-v1`), werden mit den Geräten abgeglichen und
  sind in der Sicherung enthalten – **nie im Repo** (das ist öffentlich). Code: `src/domain/advent.ts`,
  `src/data/adventStore.ts`, `src/ui/screens/AdventScreen.tsx`.
- **Neu befüllen** im selben Jahr behält geöffnete und gespeicherte Türchen; ein neues Jahr fängt von vorn an.
- **Erstes Öffnen:** Die bemalte Tür schwingt auf, es funkelt kurz, dann kommt das Rezept (bei „weniger Bewegung“
  sofort).
- **Was hab ich da?** Im geöffneten Türchen steht je Zutat da / reicht nicht / fehlt (wie auf der Rezeptseite, mit
  dem, was nach dem Wochenplan frei bleibt). „N Zutaten auf die Einkaufsliste“ setzt Fehlendes und Knappes als eigene
  Einträge (nur Namen) auf die Liste, mit Rückgängig; in der Vorschau nicht.
- **Fotos ergänzen:** Unten auf der Adventsseite „Fotos ergänzen …“ – alle Türchen mit Titel und Foto, je Foto wählen
  (Ausschnitt wie bei Rezeptfotos, 4 : 3) oder entfernen, mit Rückgängig; geht jederzeit, auch vor Dezember. Ist das
  Rezept schon im Kochbuch und hat noch kein eigenes Foto, bekommt es das neue mit. Zwei Geräte, die gleichzeitig
  verschiedene Türchen ändern, verlieren dabei nichts (Zusammenführen je Türchen).
- **Vorschau zum Ausprobieren:** `…/Mashi/#/advent?vorschau=5` tut so, als wäre der 5. Dezember (ohne Zahl: der 1.,
  oben mit −/+ umschalten). Türchen lassen sich ansehen, aber Mashi merkt sich nichts – kein „geöffnet“, kein Speichern
  ins Kochbuch. „Beenden“ führt zum echten Kalender. Befüllen geht dort ganz normal (das ist echt).

## Format der Datei

Eine JSON-Datei (UTF-8) mit einer Liste von bis zu 24 Rezepten, eins je Tag. Beispiel (erfunden):

```json
[
  {
    "tag": 1,
    "titel": "Zimtsterne",
    "beschreibung": "Klassiker mit Baiser-Glasur",
    "portionen": 30,
    "vorbereitung": 40,
    "backzeit": 10,
    "zutaten": [
      { "name": "Eiweiß", "menge": 2, "einheit": "Stück", "teil": "Glasur" },
      { "name": "Puderzucker", "menge": 200, "einheit": "g", "teil": "Glasur" },
      { "name": "Mandeln", "menge": 250, "einheit": "g", "hinweis": "gemahlen" },
      { "name": "Zimt", "menge": 2, "einheit": "TL" },
      { "name": "Salz", "einheit": "Prise" }
    ],
    "schritte": [
      "Eiweiß steif schlagen, Puderzucker einrieseln lassen.",
      "Bei 150 °C ca. 10 Min. backen."
    ],
    "tipp": "Teig zwischen Frischhaltefolie ausrollen."
  }
]
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `tag` | ja | 1–24, jeder Tag höchstens einmal (fehlende Tage bleiben leer) |
| `titel` | ja | Name des Rezepts |
| `portionen` | ja | Zahl größer 0 |
| `zutaten` | ja | mindestens eine; je `name` (Pflicht), `menge` (Zahl, Punkt als Komma), `einheit`, `hinweis`, `teil` |
| `schritte` | ja | mindestens ein Text, ohne Nummern; „10 Min.“ im Text wird zum Timer |
| `beschreibung` | nein | ein Satz |
| `vorbereitung`, `backzeit` | nein | Minuten (`kochzeit` geht statt `backzeit` auch) |
| `tipp` | nein | landet beim Speichern in den Notizen |
| `bild` | nein | Foto **in der Datei**: `"data:image/jpeg;base64,/9j/4AAQ…"` (JPEG, PNG oder WebP, bis 4 MB) – keine Links |

**Fotos:** Am besten vorher auf etwa 1000 px verkleinern, sonst wird die Datei riesig. Mashi verkleinert jedes Foto
beim Einspielen auf 800 px (wie eigene Fotos) und legt es als **eigenes Dokument** ab (`adventbild_…`, Demo:
`mashi-advent-bild-…`) – im Kalender steht nur der Verweis, so gleicht ein geöffnetes Türchen nur ein paar Bytes ab.
Zu sehen ist das Foto auf der geöffneten Kachel, oben im Türchen und beim Speichern als Bild des Rezepts. Links
(`https://…`) nimmt Mashi nicht: Sie würden bei jedem Anzeigen einen fremden Server fragen (Code-Review #22). Beim
Neu-Befüllen werden alte Fotos aufgeräumt; die des vorigen Kalenders bleiben, damit „Rückgängig“ sie noch findet.
Die Sicherungsdatei enthält den Kalender ohne Fotos – die stehen ja in deiner JSON-Datei.

**Einheiten** wie in Mashi: `g`, `kg`, `ml`, `l`, `EL`, `TL`, `Prise`, `Stück`, `Zehe`, `Dose`, `Glas`, `Bund`,
`Handvoll`, `cm`, `Portion`. Päckchen bitte in Gramm (Vanillezucker 8 g, Backpulver 15 g, Puddingpulver 37 g) – eine
unbekannte Einheit übernimmt Mashi als Hinweis an der Zutat und sagt es beim Einspielen.

Mashi prüft die Datei vor dem Einspielen: Fehler (Titel fehlt, Tag doppelt …) werden je Tag aufgelistet und
verhindern das Einspielen; Kleinigkeiten stehen als Hinweis da.
