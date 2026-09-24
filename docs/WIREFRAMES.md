# Mashi – Wireframes

Grobe Struktur der ersten acht Screens (Smartphone, ~384 px). Der klickbare Prototyp
(`npm run dev`) setzt genau diese Struktur um – er ist die „lebende“ Fassung dieser Skizzen.

```
① START                         ② KOCHBUCH                      ③ REZEPTDETAIL
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│         Mashi           │    │ Mein Kochbuch   9 Rez.  │    │ ←              ♡   ⋯   │
│         맛있다           │    │ [🔍 Suchen …    ] [≡ 2] │    │     [  Food-Foto  ]     │
│ Was möchtest du heute   │    │ (Alle)(Kochbuch)(Bewährt│    │                         │
│      kochen?            │    │  )(Zum Testen)          │    ├─────────────────────────┤
│ [🔍 Rezepte, Zutaten …] │    │ ┌ Filter (aufklappbar) ┐│    │ 📖 Mein Kochbuch        │
│ ┌───┐┌───┐┌───┐┌───┐    │    │ │Gerät  Kategorie Zeit ││    │ Gochujang Chicken Bowl  │
│ │🍳 ││🌀 ││♨️ ││🤖 │    │    │ │kcal  Protein  Tags ♥ ││    │ Kurzbeschreibung …      │
│ └───┘└───┘└───┘└───┘    │    │ └─────────────────────-┘│    │ ⏱ 10+20 Min · 2 Port.  │
│ (⚡<30 Min)(🥩Protein)(❤)│    │ ┌────────┐ ┌────────┐   │    │ ┌kcal┬Prot┬KH──┬Fett┐  │
│ Zuletzt gekocht   Alle  │    │ │ Bild   │ │ Bild   │   │    │ └────┴────┴────┴────┘  │
│ ┌──────┐┌──────┐┌──     │    │ │Titel   │ │Titel   │   │    │ [Status-Aktion]         │
│ │ Bild ││ Bild ││        │    │ │30 Min… │ │25 Min… │   │    │ Zutaten|Zubereitung|    │
│ └──────┘└──────┘└──     │    │ └────────┘ └────────┘   │    │ Nährwerte|Notizen|Infos │
│ Zum Testen        Alle  │    │ …                       │    │ Portionen   [− 2 +]     │
│ ┌──────┐┌──────┐        │    │                         │    │ 350 g  Hähnchenhack     │
├─────────────────────────┤    ├─────────────────────────┤    │ …                       │
│ Start Kochb. (+) Test Mehr   │ Start Kochb. (+) Test Mehr   │ [▶ Kochmodus starten]   │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘

④ ZUM TESTEN                    ⑤ REZEPT ERSTELLEN (Sheet)      ⑥ KI-REZEPT ERSTELLEN
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│ Zum Testen              │    │                         │    │ ←  Rezept mit KI        │
│ „Eine Idee ist noch     │    │      (abgedunkelt)      │    │ Beschreibe deine Zutaten│
│  kein Rezept …“         │    │                         │    │ ┌─────────────────────┐ │
│ ┌─────────────────────┐ │    ├─────────────────────────┤    │ │ z. B. Ich habe …    │ │
│ │✨ Neue Idee mit KI  ›│ │    │ ─── Neues Rezept        │    │ └─────────────────────┘ │
│ └─────────────────────┘ │    │ ┌─────────────────────┐ │    │ Portionen      [− 2 +]  │
│ 🧪 Bereit zum Testen    │    │ │✨ Mit KI erstellen › │ │    │ Gerät (🍳)(🌀)(♨️)(🤖)  │
│ ┌──────┐┌──────┐        │    │ ├─────────────────────┤ │    │ Zeit (≤15)(≤20)(≤30)    │
│ └──────┘└──────┘        │    │ │✍️ Eigenes Rezept   › │ │    │ Wünsche (Protein)(Veg.) │
│ ✨ Neue KI-Ideen        │    │ ├─────────────────────┤ │    │ [✨ Rezeptidee generier.]│
│ ┌──────┐                │    │ │📷 Importieren      › │ │    │ 💡 Tipp: … Nährwerte    │
│ ❤️ Bewährt – fast im KB │    │ └─────────────────────┘ │    │    berechnet Mashi selbst│
│ ┌──────┐                │    │                         │    │                         │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘

⑦ TESTFEEDBACK                  ⑧ KOCHMODUS
┌─────────────────────────┐    ┌─────────────────────────┐
│ ←     Wie war's?        │    │ ✕  Schritt 2 von 5   ☰  │
│ [Bild] Titel · Version 1│    │    ▓▓▓▓▓░░░░░░░░░       │
│ Bewertung               │    │                         │
│   ☆ ☆ ☆ ☆ ☆             │    │ GOCHUJANG CHICKEN BOWL  │
│ Test-Notiz              │    │                         │
│ ┌─────────────────────┐ │    │ Hackfleisch krümelig    │
│ │Mehr Gochujang …     │ │    │ anbraten. Gemüse dazu-  │
│ └─────────────────────┘ │    │ geben …   (große Schrift│
│ Rezept anpassen  [ändern]    │                         │
│ [300][g ▾][Hähnchenhack]×    │ ┌─────────────────────┐ │
│ Deine Änderungen:       │    │ │       5:42          │ │
│  300 g → 350 g Hähnch.  │    │ │ [Pause] [Abbrechen] │ │
│ [♥ Als bewährt überneh.]│    │ └─────────────────────┘ │
│ [📖 Direkt ins Kochbuch]│    │                         │
│ [Speichern & weiter t.] │    │ [ Zurück ]  [ Weiter ]  │
│   Nicht mein Fall …     │    │  (64 px hoch, nasse Hände)
└─────────────────────────┘    └─────────────────────────┘
```

## Gestaltungsprinzipien (aus dem Konzept übersetzt)

- Creme `#faf7f2` als Grund, Salbei-Petrol `#4f8784` als einzige Akzentfarbe, Pastellflächen für Gruppen.
- Große Touch-Ziele: mind. 44 px, im Kochmodus 64 px.
- Handschrift (Dancing Script) nur für Logo und kleine Akzente – nie für Inhalte.
- Status dezent als Pille auf dem Bild; Kochbuch-Rezepte tragen gar kein Badge (sie sind „normal“).
- „KI“ taucht nur dort auf, wo es um Herkunft geht. Nach der Übernahme heißt es nur noch
  klein „Ursprünglich mit KI erstellt“.
