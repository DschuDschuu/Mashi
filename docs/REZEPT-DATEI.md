# Rezept-Datei

Viele Rezepte auf einmal in Mashi bringen – selbst geschrieben oder von einer KI erstellt. Dasselbe Grundformat wie
beim [Adventskalender](ADVENTSKALENDER.md), nur ohne `tag` und mit Einordnung und Meal Prep.

- **Wo:** Plus → Importieren → „Rezept-Datei wählen“. Erst kommt eine **Vorschau** mit Häkchen je Rezept, dann
  „N Rezepte einspielen“. Die Rezepte landen unter **„Zum Testen“**, mit einem „Rückgängig“ für alle.
- **Gibt es schon:** Ein Rezept mit gleichem Titel (Groß/klein egal) im Kochbuch oder weiter oben in der Datei ist in
  der Vorschau markiert und abgewählt – anhaken geht trotzdem.
- **Fehler:** Ein kaputtes Rezept (Titel fehlt …) steht mit Grund unter „Wird übersprungen“, die anderen lassen sich
  trotzdem einspielen. Kleinigkeiten (unbekannte Einheit …) stehen als Hinweis da.
- Eine **Mashi-Sicherung** oder **geteilte Rezepte** (aus „Rezepte teilen“) sind etwas anderes: die kommen unter
  Einstellungen → Sicherung → Einspielen.
- Code: `src/domain/recipeFile.ts` (Einlesen, gemeinsam mit dem Adventskalender), `src/ui/components/RecipeFileImport.tsx`.

## Format

Ein Rezept, eine Liste von Rezepten oder `{ "rezepte": [ … ] }`. JSON, UTF-8. Beispiel (erfunden):

```json
[
  {
    "titel": "Linsen-Bolognese",
    "beschreibung": "Würzig, gut vorzukochen",
    "portionen": 4,
    "vorbereitung": 10,
    "kochzeit": 25,
    "kategorie": "Hauptgericht",
    "geraete": ["Herd"],
    "schwierigkeit": "einfach",
    "schlagworte": ["vegetarisch", "Meal Prep"],
    "haltbar_tage": 3,
    "einfrierbar": true,
    "aufbewahrung": "Sauce und Nudeln getrennt aufbewahren.",
    "zutaten": [
      { "name": "Rote Linsen", "menge": 200, "einheit": "g", "teil": "Sauce" },
      { "name": "Passierte Tomaten", "menge": 500, "einheit": "g", "teil": "Sauce" },
      { "name": "Knoblauch", "menge": 2, "einheit": "Zehe", "hinweis": "gehackt", "teil": "Sauce" },
      { "name": "Spaghetti", "menge": 400, "einheit": "g" },
      { "name": "Parmesan", "menge": 40, "einheit": "g", "optional": true },
      { "name": "Salz", "hinweis": "nach Geschmack" }
    ],
    "schritte": [
      { "text": "Knoblauch anschwitzen, Linsen und Tomaten dazu, 20 Min. köcheln.", "teil": "Sauce" },
      "Spaghetti kochen und mit der Sauce servieren."
    ],
    "tipp": "Mit einem Schuss Balsamico abschmecken."
  }
]
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `titel` | ja | Name des Rezepts |
| `portionen` | ja | Zahl größer 0 |
| `zutaten` | ja | mindestens eine; je `name` (Pflicht), `menge` (Zahl, „1,5“ geht auch), `einheit`, `hinweis`, `teil`, `optional` (true) |
| `schritte` | ja | mindestens einer; Text ohne Nummer – oder `{ "text": …, "teil": … }`; „10 Min.“ im Text wird zum Timer |
| `beschreibung` | nein | ein Satz |
| `vorbereitung`, `kochzeit` | nein | Minuten (`backzeit` geht statt `kochzeit` auch) – sonst steht „0 Min.“ da |
| `kategorie` | nein | ein Text oder eine Liste: Frühstück, Hauptgericht, Suppe & Eintopf, Salat & Bowl, Beilage, Snack, Dessert, Backen, Getränke. „Suppe“, „Salat“, „Kuchen“ … versteht Mashi auch; Unbekanntes wird zum Schlagwort |
| `geraete` | nein | Liste: Herd, Backofen, Airfryer, Monsieur Cuisine, Mikrowelle, Slow Cooker („Ofen“, „Heißluftfritteuse“ gehen auch) |
| `schwierigkeit` | nein | 1–3 oder einfach, mittel, anspruchsvoll (fehlt: einfach) |
| `schlagworte` | nein | Liste von Texten |
| `tipp` | nein | kommt in die Notizen |
| `haltbar_tage` | nein | Meal Prep: so viele Tage hält es gekocht im Kühlschrank (1–30; bei „2 bis 3“ nimmt Mashi die kleinere Zahl) – der Wochenplan rechnet damit |
| `einfrierbar` | nein | Meal Prep: true/false (oder ja/nein) – späte Abende plant Mashi dann als „einfrieren, am Vortag auftauen“ |
| `aufbewahrung` | nein | Meal Prep: kommt in die Notizen |
| `bild` | nein | Foto **in der Datei**: `"data:image/jpeg;base64,/9j/4AAQ…"` (JPEG, PNG oder WebP, bis 4 MB) – keine Links |

**Teile** (`teil`): Zutaten und Schritte mit demselben Teil („Sauce“) lassen sich getrennt kochen – zum Beispiel die
Sauce am Wochenende vorkochen. Was keinen Teil hat, ist „Frisch“ (wird jedes Mal frisch gemacht). Ein Schritt ohne
Teil bekommt ihn aus seinen Zutaten.

**Einheiten** wie in Mashi: `g`, `kg`, `ml`, `l`, `EL`, `TL`, `Prise`, `Stück`, `Zehe`, `Dose`, `Glas`, `Bund`,
`Handvoll`, `cm`, `Portion` („Zehen“, „Stk.“, „Liter“ gehen auch). Päckchen bitte in Gramm – eine unbekannte Einheit
übernimmt Mashi als Hinweis an der Zutat.

**Fotos** verkleinert Mashi beim Einspielen auf 800 px (wie eigene Fotos). Ohne Foto bekommt das Rezept eine Zeichnung.

## Vorlage für eine KI

Zum Kopieren in einen Chat, damit die Datei gleich passt:

> Schreib mir die Rezepte als JSON-Liste für meine Koch-App Mashi. Je Rezept: `titel`, `portionen` (Zahl),
> `vorbereitung` und `kochzeit` (Minuten), `kategorie`, `geraete` (Liste), `schwierigkeit` (einfach, mittel oder
> anspruchsvoll), `zutaten` (Liste mit `name`, `menge` als Zahl, `einheit` – nur g, kg, ml, l, EL, TL, Prise, Stück,
> Zehe, Dose, Glas, Bund, Handvoll –, nach Bedarf `hinweis` und `teil`), `schritte` (Liste von Texten ohne Nummern).
> Für Meal Prep zusätzlich `haltbar_tage` (Zahl), `einfrierbar` (true/false) und `aufbewahrung`. Nur das JSON, ohne
> Erklärung drumherum.
