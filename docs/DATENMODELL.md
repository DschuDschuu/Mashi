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
├─ currentVersionId ─────────────┐
├─ versions[] ◀──────────────────┘
│   └─ RecipeVersion { number, author: ki|nutzer|import, label, content }
│         └─ RecipeContent  ← ALLES Inhaltliche, unveränderlich je Version
│              title, description, servings, prepMinutes, cookMinutes, difficulty,
│              ingredients[] { id, name, amount?, unit?, optional?, foodRef? },
│              steps[] { id, text, timerMinutes? },
│              categories[], tags[], devices[], imagePrompt?
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
| `meine-produkte` | `MyProduct[]` – Werte vom Etikett; `replaces` (Einträge der Tabelle) und/oder `names` (Zutatennamen, die die Tabelle nicht kennt) | neueste Fassung gewinnt |
| `wochenplan` | `MealPlan` – `items: {recipeId, servings}[]`, abgehakte Einkäufe `checked`, diese Woche gekochte Gerichte `cooked` | neueste Fassung gewinnt |
| `speisekammer` | `Pantry` – Vorräte `items` (Name, Menge nur wo bekannt, Kaufdatum `boughtAt`, optional eigenes „Verbrauchen bis“ `useBy` – sonst geschätzt aus Art bzw. Lebensmittel, siehe `domain/shelfLife.ts`), eigene Richtwerte `shelfDays` (`kinds` je Art, `foods` je Lebensmittel, `reduced`/`frozen`/`thawed` für MHD-Ware, Gefrorenes, Aufgetautes), gelernte Bon-Artikel `rules` (Bon-Name → Name, Menge je Stück, oder „überspringen“), zuletzt bezahlte Preise `prices` (€ je g oder je Stück), alle Preise mit Einkaufsdatum `history` (Preisverlauf) und die Ersparnis je Bon `savings` (Lidl Plus, Angebote) | neueste Fassung gewinnt |

`MyProduct` kann zusätzlich `packageAmount`/`packageUnit` (Packungsgröße – füllt beim Kassenbon die
Menge aus), `packagePrice` (Preis von Hand), `ean` (Barcode, per Scan über Open Food Facts) und `shelfDays` („hält X Tage ab Kauf“) tragen. `PantryItem` kann `reduced` (MHD-Ware, vom Bon „RABATT 20%“ oder von Hand) und `frozenAt` (eingefroren am …, auch direkt beim Bon-Import, ganz oder Teil der Packungen) tragen; `ReceiptSavings.mhd` zählt MHD-Rabatte getrennt von den Angeboten.
Ein Produkt passt immer auch auf seinen eigenen Namen. Gelernte Bon-Artikel können über `productId`
einem Produkt zugeordnet sein – dann gilt beim nächsten Bon dessen aktuelle Packungsgröße. Kosten eines Rezepts (`domain/cost.ts`)
werden nie gespeichert, sondern aus Zutaten × bekannten Preisen berechnet; Zutaten ohne Preis werden
genannt, nicht geschätzt.

Vorschläge und Einkaufsliste werden nie gespeichert, sondern jedes Mal aus Plan + Rezepten
berechnet (`domain/mealplan.ts`). Fotos liegen verkleinert (800 px, JPEG) direkt im Rezept.

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
