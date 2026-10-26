# Mashi – Datenmodell

Die maßgebliche Definition steht in [`src/domain/types.ts`](../src/domain/types.ts).
Hier die Idee dahinter und die geplante Abbildung in Supabase.

## Kernidee: Rezept = Hülle + Versionen

```
Recipe  (Hülle – ändert sich selten)
├─ status        ki_entwurf | zum_testen | bewaehrt | kochbuch
├─ archivedAt?   gesetzt = archiviert (Status bleibt erhalten)
├─ source        ki | selbst | import        ← ändert sich nie
├─ favorite, image, notes, lastCookedAt
├─ homemade?     Zutat-IDs, die gerade selbst gemacht statt gekauft werden (nicht versioniert, siehe domain/homemade.ts)
├─ blockPrep?    Zubereitung von Baukasten-Bausteinen nur bei dieser Grundlage {baustein-id: {text, minutes}} (nicht versioniert, siehe domain/sides.ts)
├─ choice?       gewählte Variante (fehlt oder gibt es nicht mehr: die erste; nicht versioniert, siehe domain/choices.ts)
├─ keepsDays?, freezable?, togo?  Vorkochen: hält gekocht X Tage (sonst shelfDays.prepared), einfrierbar, zum Mitnehmen (nicht versioniert, siehe domain/week.ts)
├─ fromBase?    Verwandlung dieser Grundlage (steht nur unter ihr, nicht im Kochbuch-Raster; ihre Zutat mit recipeId zeigt auf die Grundlage, Einheit `Portion`)
├─ blocks?       als Baustein in „Worauf hast du Lust?“: [{ part? (Teil – fehlt: ganzes Rezept), kind (carb|protein|sauce|veg|topping),
│                also? (weitere Stufen, die er abdeckt – Bolognese: kind protein, also [sauce]; gewählt sind die erledigt),
│                replaces? (fester Baustein, den er ersetzt – meine Guacamole statt der festen; nur in „Worauf hast du Lust?“),
│                directions[] (taco = Tortilla, bowl … – leer: überall; altes „wrap“ zählt als taco) }] (nicht versioniert; benennt eine neue Version einen Teil um,
│                zieht die Markierung mit – parts.ts: followBlockParts; siehe domain/craving.ts)
├─ pairs?       „Passt gut zu“: Baustein-ids (Bolognese → spaetzle, parmesan) – stehen im Stepper vorn, sobald das Rezept
│                gewählt ist, auch im Baukasten des Wochenplans (nicht versioniert)
├─ trial?       Probiergericht aus „Worauf hast du Lust?“: echtes Rezept (Plan, Kochmodus, Einkauf rechnen wie immer), aber nicht im
│                Kochbuch, Rezept des Tages, Woche planen, Plan-Auswahl, Reste-Vorschlägen; nach dem Kochen fragt die Startseite
│                „Wie war …?“ (behalten → Markierung weg, ab 4 Sternen „bewaehrt“; „Nicht speichern“ → gelöscht); nie gekocht,
│                nicht eingeplant und älter als eine Woche → beim Start weggeräumt (craving.ts: staleTrials)
├─ mix?, goesWith?  veraltet (früheres Mix & Match) – beim Start weggeräumt: Saucen ins Kochbuch, Beilagen ins Archiv (domain/mix.ts)
├─ currentVersionId ─────────────┐
├─ versions[] ◀──────────────────┘
│   └─ RecipeVersion { number, author: ki|nutzer|import, label, content }
│         └─ RecipeContent  ← ALLES Inhaltliche, unveränderlich je Version
│              title, description, servings, prepMinutes, cookMinutes, difficulty,
│              ingredients[] { id, name, amount?, unit?, note? (Hinweis „gewürfelt“), part? (Teil „Sauce“), optional?, foodRef?,
│                              recipeId? (Grundrezept zum Selbstmachen – selbst gemacht ersetzen dessen Zutaten und Schritte die Zutat, als eigener Teil;
│                                mit Einheit „Portion“ eine Grundlage: immer selbst gemacht, so viele Portionen wie die Menge, in der Vorkoch-Woche aus dem Vorgekochten),
│                              choice? (nur in dieser Variante – fehlt: in allen) },
│              steps[] { id, text, timerMinutes?, ingredientIds?, part? (Teil – fehlt: aus den Zutaten; „-“ Frisch, „*“ Zum Schluss), choice? },
│              categories[], tags[], devices[], imagePrompt?,
│              choices? (Varianten „mit Hähnchen“/„mit Tofu“ – gekocht, geplant und gerechnet wird nur die gewählte)
└─ feedback[]  TestFeedback { versionId, rating 1–5, note }  ← hängt an der GEKOCHTEN Version
```

**Warum so?**
- Die KI-Version geht nie verloren (Version 1), egal wie oft der Nutzer anpasst.
- Änderungen sind nachvollziehbar: Zutaten behalten ihre `id` über Versionen → `diffContent()`
  erkennt „300 g → 350 g Hähnchenhack“ als *Änderung* statt als *gelöscht + neu*.
- Feedback bezieht sich auf die Version, die wirklich gekocht wurde.
- **Nährwerte werden nicht gespeichert**, sondern berechnet. Kein Weg, erfundene Werte einzuschleusen.

**Beispiel (Gochujang Chicken Bowl in den Mock-Daten):**

| Version | Autor | Label | Änderung |
|---|---|---|---|
| 1 | ki | KI-Vorschlag | – |
| 2 | nutzer | Nach Test: mehr Schärfe | Hack 300 → 350 g, Gochujang 1 → 2 EL |
| 3 | nutzer | Weniger Reis | Reis 150 → 100 g |
| 4 | nutzer | Meine Kochbuch-Version | (Übernahme ins Kochbuch) |

## Einzel-Dokumente neben den Rezepten

In der CouchDB liegt jedes Rezept als eigenes Dokument (`type: 'recipe'`). Dazu kommen drei
Einzel-Dokumente, die ebenfalls auf alle Geräte abgeglichen werden:

| `_id` | Inhalt | Konflikt (offline auf zwei Geräten geändert) |
|---|---|---|
| `meine-produkte` | `MyProduct[]` – Werte vom Etikett; `replaces` (Einträge der Tabelle) und/oder `names` (Zutatennamen, die die Tabelle nicht kennt); mehrere Produkte für dieselbe Zutat = Sorten (Durchschnitt + Spanne, siehe `domain/nutrition/variants.ts`), `favorite` = Favorit (★) unter den Sorten: Rezepte rechnen mit ihm, beim Planen ohne Nachfrage; `excludes` = Ausnahmen (Schreibweisen der ersetzten Einträge, für die das Produkt nicht gilt, z. B. „vollmilch“); `brand` = Marke (optional; ältere Namen mit Marke in Klammern werden beim Anzeigen getrennt, siehe `splitBrand`). „Eigene Nährwerte“ gibt es nicht mehr – alles ist „Mein Produkt“, Marke/Packung/Barcode sind optional | vereint (siehe unten) |
| `wochenplan` | `MealPlan` – ein Plan (Julia): Abende mit Tag stehen in `week`, `items` ohne `fromWeek` sind „irgendwann diese Woche“ (auf einen Tag gelegt → `scheduleMeal` macht daraus einen Abend der Woche; „Woche leeren“ = `clearPlan`) – `items: {recipeId, servings, variants?}[]` (`variants`: gewählte Sorte je Zutat-ID → Produkt-ID, z. B. welches Pesto), abgehakte Einkäufe `checked` (räumen sich selbst auf, sobald etwas nicht mehr auf der Liste steht), gekochte Gerichte `cooked` (bis „Gekochtes aufräumen“), „Doch kaufen“ trotz Vorrat `buy`, eigene Einträge `extra: {name, addedAt, source?: 'inventur'}[]` (selbst getippt oder aus der Inventur; weg mit dem Bon oder „Erledigtes entfernen“; beim Abgleich je Name vereint), Vorkoch-Woche `week: {cookDays, bases: {recipeId, day, extra?, cooked?, adds?}[], meals: {id, day, recipeId, baseId, side?, portions?, done?}[], noLunch?, doneLunch?, start?}` (`start` = fester Wochenanfang, ein neuer Kochtag verschiebt ihn nicht; Vorgekochtes auf einem Abend = Grundlage mit `cooked`; `adds` = MHD-Funde für diese Grundlage; `extra` = Portionen ohne Abend, der „Kühlschrank“ im Wochenplan (Woche planen füllt den Topf: jede Portion landet erst hier, `potWeek`; Kärtchen auf einen Abend = `putMeal`, „Zurück in den Kühlschrank“ = `backToFridge`, Kochtag ändern = `setCookDay` – hält dabei `start` fest; „+“ am Kochtag füllt erst freie Abende, `fillEvenings`) – kein eigenes Feld, alte Wochen bleiben gültig; `portions` = Portionen an diesem Abend, wenn anders als im Haushalt (Gäste); `side` = Beilage frisch dazu, „Bolognese mit Spätzle“ – Liste und Standardmengen in `domain/sides.ts`, kommt über `weekSideNeeds` auf die Einkaufsliste; Einträge in `items` mit `fromWeek` werden aus der Woche abgeleitet, damit Einkauf und Vorrat mitrechnen; Tage 0 = Montag; nur Abendessen gespeichert – Alter, Einfrieren, Mittage und Portionen rechnet `domain/week.ts`; beim Abgleich Abende je id, doppelt belegte Abende rücken weiter), Haushalt `household: {portions, lunchDays, sides?, customSides?}` (`sides` = eigene Mengen pro Portion je Baustein, je Baustein abgeglichen; `customSides` = eigene Bausteine, ids „eigen:<gruppe>:<Name>“, als Menge abgeglichen; `sidePrep` = eigene Standard-Zubereitung je Baustein `{text, minutes}`, je Baustein abgeglichen (je Grundlage: `Recipe.blockPrep`); `side` am Abend = Bausteine mit Komma, „pasta,haehnchen,ei“; abgeglichen, anders als die Geräte-Einstellungen) | vereint (siehe unten) |
| `speisekammer` | `Pantry` – Vorräte `items` (Name, Menge nur wo bekannt, Packungsware mit `pack` = Größe einer Packung – dann zählt die Menge die geschlossenen Packungen, „4 × 500 g“; Angebrochenes als eigener Eintrag in g/ml mit `openedAt`, hält kürzer: `shelfDays.opened`/`openedJar` für Frisches, Konserven 3 Tage, Pesto 1 Woche; Tube, Würzpasten, Saucen, Nudeln/Reis auch offen ohne Erinnerung – siehe `openedDaysOf`, das Frühere von „ab Kauf“ und „ab Öffnen“ gilt; beim Kochen wird zuerst Offenes verbraucht, dann eine Packung angebrochen, Sorte `productId` vom Bon oder Barcode, Kaufdatum `boughtAt`, optional eigenes „Verbrauchen bis“ `useBy` – sonst geschätzt aus Art bzw. Lebensmittel, siehe `domain/shelfLife.ts`), eigene Richtwerte `shelfDays` (`kinds` je Art, `foods` je Lebensmittel – `0` = unbegrenzt, `reduced`/`frozen`/`thawed` für MHD-Ware, Gefrorenes, Aufgetautes), „Immer im Haus“ `basics` (genau eine Stufe je Lebensmittel: normal · nachkaufen · immer im Haus · ohne Nährwerte – siehe `domain/stage.ts`; galten zwei zugleich, gilt beim Start die genauere: nachkaufen vor ohne Nährwerte vor immer im Haus; Namen; fehlt die Liste, gilt die Vorbelegung Pasta, Reis, Gochujang, Miso, Sesam, Sojasauce; eigene Nährwerte dazu liegen als „Mein Produkt“ in `meine-produkte`), Vorgekochtes als Vorrat mit `recipeId` (Menge = Portionen, nie eine Zutat; nach „Gekocht“ fragt Mashi „Was ist übrig?“, hält im Kühlschrank `shelfDays.prepared` Tage, Standard 3, einfrierbar; „Gekocht“ zurücknehmen entfernt die dabei entstandenen Reste), Mindestbestand `restock` (je Zutat `name`, `below`, `unit`: darunter steht sie von selbst auf der Einkaufsliste, gezählt nach dem Wochenplan; Stück ↔ Gramm über die Packungsgröße vom Vorrat, Produkt oder Bon; nur Geschlossenes zählt; gleiche Zutat unter zwei Namen → die strengere Regel; Fettstufen nach Stufe; kann Mashi nicht zählen, sagt das Einstellfeld warum – siehe `domain/restock.ts`; beim Abgleich je Zutat vereint), ausgeblendete Namensvorschläge `renameDismissed` (siehe `domain/renames.ts`: nur echte Synonyme, nie automatisch umbenannt), Makro-Ziel `macroGoal` (Anteil an den Kalorien, fehlt es: 40/30/30 – schlägt bei mehreren Sorten im Vorrat die passendere vor), „Ohne Nährwerte“ `noNutrition` (Gewürze & Co., die in Rezepten wie Salz nicht mitzählen; fehlt die Liste, gilt die Vorbelegung aus `domain/nutrition/noNutrition.ts`), `cookLog` (was „Gekocht“ je geplantem Rezept genommen hat – Haken zurück = Zutaten zurück), schon importierte Bons `receipts` (Einkaufstag|Endbetrag, gegen doppelten Import), gelernte Bon-Artikel `rules` (unbekannt: Größe aus dem Namen wie „500g“, sonst die Stückzahl vom Bon; bei einem Produkt mit Packungsgröße gilt 1 Stück = 1 Packung, außer die Tabelle kennt ein eigenes Stückgewicht) (auch Stück je Packung, z. B. 10er-Eier) (Bon-Name → Name, Menge je Stück, oder „überspringen“), zuletzt bezahlte Preise `prices` (€ je g oder je Stück), alle Preise mit Einkaufsdatum `history` (Preisverlauf) und die Ersparnis je Bon `savings` (Lidl Plus, Angebote) | vereint (siehe unten) |

**Zusammenführen statt Überschreiben** (`domain/syncMerge.ts`):
- **Beim Speichern** gibt die App den Stand mit, den sie verändert hat (`base`). Der Speicherweg wendet diese
  Änderung auf das an, was gerade in der Datenbank liegt (merge3) – liegt dort inzwischen etwas vom anderen Gerät,
  bleibt es erhalten. Mengen in der Speisekammer werden dabei verrechnet (400 g verkocht + 500 g gekauft).
  Rezepte ebenso: Versionen/Bewertungen beider Seiten, einfache Felder (Favorit, Notiz …) je nachdem, wer sie geändert hat.
- **Offline-Konflikt** (beide Geräte ohne Netz geändert, kein gemeinsamer Stand bekannt): beide Fassungen werden
  vereint (union…); bei gleichem Eintrag gewinnt die neuere. Gelöschtes kann dabei wieder auftauchen – bewusst, lieber als Datenverlust.

`MyProduct` kann zusätzlich `packageAmount`/`packageUnit` (Packungsgröße – füllt beim Kassenbon die
Menge aus), `packageCount` (Stück im Pack, ganze Zahl ab 2: „2 × 90 g“ gibt es nur so – die Größe ist dann EIN Stück, Bon und Preis zählen das ganze Pack = 180 g, die Speisekammer teilt es wieder in 2 geschlossene 90 g; `boughtAmountOf`), `packagePrice` (Preis von Hand, fürs ganze Pack), `ean` (Barcode, per Scan über Open Food Facts) und `shelfDays` („hält X Tage ab Kauf“, bis 3650 = 10 Jahre; `0` = hält unbegrenzt, Mashi schätzt nicht – darum überall `!== undefined` statt „wahr“ prüfen) tragen. `PantryItem` kann `reduced` (MHD-Ware, vom Bon „RABATT 20%“ oder von Hand) und `frozenAt` (eingefroren am …, auch direkt beim Bon-Import, ganz oder Teil der Packungen) tragen; `ReceiptSavings.mhd` zählt MHD-Rabatte getrennt von den Angeboten.
Ein Produkt passt immer auch auf seinen eigenen Namen. Gelernte Bon-Artikel können über `productId`
einem Produkt zugeordnet sein – dann gilt beim nächsten Bon dessen aktuelle Packungsgröße. Kosten eines Rezepts (`domain/cost.ts`)
werden nie gespeichert, sondern aus Zutaten × bekannten Preisen berechnet; Zutaten ohne Preis werden
genannt, nicht geschätzt.

Vorschläge und Einkaufsliste werden nie gespeichert, sondern jedes Mal aus Plan + Rezepten
berechnet (`domain/mealplan.ts`). Fotos liegen zugeschnitten im Kartenformat 4:3 (höchstens 800 px breit, JPEG) direkt im Rezept – der Ausschnitt wird beim Hochladen gewählt (`ui/components/ImageCropper.tsx`). Dazu `image.original` (das Foto verkleinert auf höchstens 1600 px) und `image.crop` (Mitte als Anteil + Zoom), damit der Ausschnitt später wieder änderbar ist. Fettstufen (`domain/nutrition/fatLevels.ts`): „Milch“, „Joghurt“, „Quark“ ohne Angabe = Standard (dein Produkt ohne Stufe im Namen, sonst Tabelle); „Milch 1,5 %“, „Milch 3,5 %“, „Quark 40 %“ usw. = genau diese Stufe (Tabelle oder dein Produkt mit dieser Stufe im Namen). Eigene Produkte gelten nur für ihre Stufe. Einheit `Glas`: 1 Glas = Packungsgröße des eigenen Produkts, sonst Richtwert der Tabelle (Pesto 190 g), sonst grob 300 g.

## Geräte & Kategorien

Offene Strings (`'airfryer'`, `'hauptgericht'`), Anzeige über `catalog.ts`. Ein neues Gerät
(Reiskocher, Dampfgarer …) = ein Katalogeintrag, keine Migration. Geräte ≠ Kategorien ≠ Tags.

## Geplante Supabase-Tabellen (Phase 2)

```sql
-- Hülle
create table recipes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  status           text not null check (status in ('ki_entwurf','zum_testen','bewaehrt','kochbuch')),
  source           text not null check (source in ('ki','selbst','import')),
  favorite         boolean not null default false,
  notes            text not null default '',
  image_path       text,                 -- Pfad in Supabase Storage
  current_version  uuid,
  last_cooked_at   timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Versionen: Inhalt als jsonb (= RecipeContent). Unveränderlich, nur INSERT.
create table recipe_versions (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  number      int  not null,
  author      text not null check (author in ('ki','nutzer','import')),
  label       text,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (recipe_id, number)
);

create table test_feedback (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  version_id  uuid not null references recipe_versions on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- Jede Zeile gehört genau einem Nutzer
alter table recipes         enable row level security;
alter table recipe_versions enable row level security;
alter table test_feedback   enable row level security;
create policy own on recipes         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on recipe_versions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on test_feedback   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**Warum `content` als jsonb statt eigener Zutaten-Tabelle?** Versionen werden als Ganzes gelesen
und nie teilweise geändert. jsonb hält das einfach, und `RecipeContent` bleibt 1:1 das TypeScript-Objekt.
Für Einkaufslisten/Vorrat (später) lässt sich per Postgres-Funktion über `content->'ingredients'` suchen.

Später dazu: `food_cache` (übernommene Einträge aus Open Food Facts/USDA), `ingredient_matches`
(vom Nutzer bestätigte Zuordnung Name → Lebensmittel).
