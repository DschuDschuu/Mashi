import { useMemo, useState } from 'react';
import { ask, choose } from '../confirm';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, findFoodRow, matchesFilter, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { guessMatch, normalizeName, PROVIDER } from '../../domain/nutrition/localFoods';
import { estimateDays, FOREVER, MAX_SHELF_DAYS, setShelfDays } from '../../domain/shelfLife';
import { adoptCandidates } from '../../domain/adoptFoods';
import { brandOf, fillOrAdd, productLabel, sharedOf, valuesOf, withShared, type MyProduct, type SharedMatch } from '../../domain/nutrition/myProducts';
import { groupByCategory } from '../../domain/categories';
import { useCategoryOf } from '../useCategory';
import { CategoryPicker } from './CategoryPicker';
import { FoodPriceLink, LastPurchase } from './LastPurchase';
import { purchasesOf } from '../../domain/bons';
import { spiceName, zeroOf } from '../../domain/nutrition/noNutrition';
import { averageNutrients } from '../../domain/nutrition/variants';
import type { Nutrients } from '../../domain/nutrition/types';
import { addProduct, currentPantry, currentProducts, dismissRename, removeProduct, setPantryShelfDays, renameFoodEverywhere, saveProducts, setFavoriteVariant, setFoodStage, useFoodTable, usePantry, useProducts, useRecipes } from '../../data/store';
import { stageOf } from '../../domain/stage';
import { sortUses } from '../../domain/sortRefs';
import { StagePicker } from './StagePicker';
import { currentContent, newId } from '../../domain/recipe';
import { parseNum, toField } from './productFields';
import { foodTable } from '../../services';
import { euro } from '../format';
import { toast } from '../toast';
import { useSwipe } from '../useSwipe';
import { useSlide } from '../useSlide';
import { Icon } from './Icon';
import { ProductForm } from './MyProductsPanel';
import { MatchChips, visibleExcludes } from './MatchChips';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('de-DE'));
/** Tabs: Schlüssel, kurzer Name, voller Name (für Screenreader) – Reihenfolge = Wischrichtung */
// Ein Tab je Stufen-Knopf (gleiches Symbol, gleicher Name): Produkte = was du pflegst (normal, 🔄 nachkaufen),
// dahinter, was du einmal einstellst: 🏠 immer im Haus, 🍃 Gewürze (zählen in Rezepten nicht mit)
const TABS = [['produkte', 'Produkte', 'Produkte', 'grid'], ['haus', 'Im Haus', 'Immer im Haus', 'home'], ['ohne', 'Gewürze', 'Gewürze', 'leaf']] as const;

const macros = (n: Nutrients) => `KH ${fmt(n.carbs)} · Eiweiß ${fmt(n.protein)} · Fett ${fmt(n.fat)} g`;

/**
 * „Meine Lebensmittel“ – eine Zeile je Zutat, aufklappbar: eigene Nährwerte und Produkte (auch
 * mehrere Sorten mit Favorit), die Stufe (Nachkaufen, Immer im Haus, Gewürze) als Symbol an der Zeile.
 */
export function FoodList({ adding, onAdding }: {
  /** „Lebensmittel hinzufügen“ offen – der ＋-Knopf sitzt oben in der Kopfleiste (ProductsScreen) */
  adding: boolean; onAdding: (open: boolean) => void;
}) {
  const products = useProducts();
  const pantry = usePantry();
  const basics = basicsOf(pantry);
  const zero = zeroOf(pantry);
  const recipes = useRecipes();
  // Schreibweise wie in deinen Rezepten und im Vorrat („Grünes Pesto“ statt „grünes pesto“)
  const known = useMemo(() => [...recipes.flatMap((r) => currentContent(r).ingredients.map((i) => i.name)), ...pantry.items.map((i) => i.name)], [recipes, pantry.items]);
  /** auf dieser Seite angefasste Zutaten – bleiben sichtbar, auch wenn nichts mehr festgelegt ist */
  const [touched, setTouched] = useState<string[]>([]);
  const touch = (name: string) => setTouched((t) => (t.includes(name) ? t : [...t, name]));
  const restock = useMemo(() => pantry.restock ?? [], [pantry.restock]);
  // eigene Haltbarkeit fürs Lebensmittel (früher auf der Seite „Haltbarkeit“) – steht jetzt in dessen Kachel, also sichtbar
  const ownShelf = useMemo(() => Object.keys(pantry.shelfDays?.foods ?? {}).map((id) => foodTable.byRef({ provider: PROVIDER, foodId: id })?.name).filter((n): n is string => !!n), [pantry.shelfDays]);
  const keep = useMemo(() => [...touched, ...restock.map((r) => r.name), ...ownShelf], [touched, restock, ownShelf]);
  const spiceTable = useFoodTable();
  const rows = useMemo(() => buildFoodList(products, basics, zero, foodTable, known, keep, (z) => spiceName(z, spiceTable)),
    [products, basics, zero, known, keep, spiceTable]);
  const [filter, setFilter] = useState<FoodFilter>('produkte');
  const [open, setOpen] = useState<string | null>(null);
  /** fertig hinzugefügt – als weitere Sorte gleich die Zeile aufklappen, damit man sie sieht */
  const addDone = (openKey?: string) => {
    onAdding(false);
    if (openKey) { setFilter('produkte'); setOpen(openKey); }
  };
  const matches = matchesFilter;
  const shown = rows.filter((r) => matches(r, filter));
  // in Kategorien wie im Laden (Julia) – dieselben wie in Speisekammer und Einkaufsliste
  const categoryOf = useCategoryOf();
  const groups = groupByCategory(shown, (r) => categoryOf(r.ingredient));
  // Wischen wie im Rezept: nach links = nächster Tab, nach rechts = vorheriger (am Rand bleibt es stehen)
  const step = (dir: 1 | -1) => {
    const i = TABS.findIndex(([f]) => f === filter) + dir;
    if (i >= 0 && i < TABS.length) setFilter(TABS[i][0]);
  };
  const swipe = useSwipe(() => step(1), () => step(-1));
  const slide = useSlide(TABS.findIndex(([f]) => f === filter));
  const count = (f: FoodFilter) => rows.filter((r) => matches(r, f)).length;
  const line = (r: FoodRow) => (
    <FoodLine key={r.key} row={r} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)}
      products={products} onTouch={() => touch(r.ingredient)} />
  );

  return (
    <div className="stack foods-panel">
      {/* wie die Tabs im Rezept: eine Zeile auch auf dem Handy – kurze Namen, Anzahl darunter */}
      <div className="tabs foods__tabs" role="tablist" aria-label="Filter">
        {TABS.map(([f, label, full, icon]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} aria-label={`${full} (${count(f)})`}
            className={`tab${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>
            {/* Anzahl in Klammern dahinter – eine Zeile statt zwei */}
            <span className="foods__tablabel"><Icon name={icon} size={14} /> {label} <span className="foods__count">({count(f)})</span></span>
          </button>
        ))}
      </div>
      {/* oben, gleich unter den Tabs – geöffnet über das ＋ in der Kopfleiste */}
      {/* eigener Schlüssel – „produkte“ trägt schon der Tab-Inhalt daneben (doppelt: React räumt nicht auf) */}
      {adding && <AddFood key={`neu-${filter}`} tab={filter} rows={rows} onDone={addDone} />}
      <div key={filter} className={`stack ${slide}`} role="tabpanel" {...swipe}>
      <p className="small muted">
        {/* dieselben Linien-Symbole wie an den Karten, keine bunten Emojis */}
        {filter === 'produkte'
          ? <>Was du pflegst: Sorten, Marken, Nährwerte – und <Icon name="refresh" size={13} /> Nachkaufen mit Grenze. Antippen für Details.</>
          : filter === 'haus'
            ? <>Was du immer da hast: wird nicht gezählt, bei Rezepten nie „fehlt“, auf der Einkaufsliste unter „Basics“.</>
            : <>Gewürze & Co.: immer da und zählen in Rezepten nicht mit (keine Nährwerte). Auf der Einkaufsliste unter „Basics“.</>}
      </p>

      {filter === 'produkte' && <AdoptFoods />}

      {shown.length === 0 && (
        <p className="small muted">
          {filter === 'produkte' ? 'Noch keine Produkte – oben mit ＋ hinzufügen, oder bei einem Rezept unter „Nährwerte“ eigene Werte eintragen.'
            : filter === 'haus' ? 'Noch nichts „immer im Haus“ – oben mit ＋ hinzufügen.' : 'Noch keine Gewürze – oben mit ＋ hinzufügen.'}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.id} className="foods__group" aria-label={g.title}>
          <h3 className="foods__grouptitle">{g.title}</h3>
          <ul className="foods">{g.items.map(line)}</ul>
        </section>
      ))}

      </div>

      {filter === 'produkte' && <DismissedRenames keys={pantry.renameDismissed ?? []} />}
    </div>
  );
}

function FoodLine({ row, open, onToggle, products, onTouch }: {
  row: FoodRow; open: boolean; onToggle: () => void; products: MyProduct[];
  /** Zeile merken, damit sie nach dem Ausschalten nicht verschwindet */
  onTouch: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  /** Name wird gerade getippt (Stift oben in der Kachel) */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addingSort, setAddingSort] = useState(false);
  const ps = row.products;
  const fav = ps.find((p) => p.favorite);
  // Sorten ohne eigene Werte rechnen mit der Tabelle (siehe valuesOf) – kennt die sie nicht, zählen sie nicht mit
  const tableOf = (p: MyProduct) => (p.replaces[0] ? foodTable.byRef({ provider: PROVIDER, foodId: p.replaces[0] }) : undefined) ?? foodTable.matchName(row.ingredient)?.food;
  const known = ps.map((p) => valuesOf(p, tableOf(p))).filter((v): v is Nutrients => !!v);
  const favValues = fav && valuesOf(fav, tableOf(fav));
  const values = !ps.length ? row.table?.per100g : favValues ?? (known.length > 1 ? averageNutrients(known) : known[0]);
  const average = ps.length > 1 && !favValues && known.length > 1;
  /** nur Richtwerte der Tabelle – keine Sorte hat eigene Werte */
  const tableOnly = ps.every((p) => p.noValues);
  // Name und „gilt für“ gelten für alle Sorten – direkt in der Kachel einstellbar: Stift oben, Chips unten
  const shared = ps.length ? sharedOf(ps) : undefined;
  const title = shared?.name || row.name;

  /** Speichern hält die Sorten einer Zutat gleich: Name und „gilt für“ bekommen alle (auch ältere, abweichende) */
  const store = (changed: MyProduct[], s?: SharedMatch) => {
    // bearbeitete Sorten ersetzen, neue anhängen …
    const byId = new Map(changed.map((p) => [p.id, p]));
    const next = [...products.map((x) => byId.get(x.id) ?? x), ...changed.filter((p) => !products.some((x) => x.id === p.id))];
    // … und das Gemeinsame auf alle Sorten dieser Zutat
    const group = new Set([...ps.map((p) => p.id), ...byId.keys()]);
    saveProducts(s ? next.map((x) => (group.has(x.id) ? withShared(x, s) : x)) : next);
  };
  const save = (p: MyProduct) => {
    // eine Sorte mehr oder eine bearbeitet: alle Sorten dieser Zutat bekommen dasselbe Gemeinsame
    const group = [...ps.filter((x) => x.id !== p.id), p];
    store([p], group.length > 1 ? sharedOf(group.map((x) => (x.id === p.id ? p : x))) : undefined);
    setEditing(null);
    setAddingSort(false);
    toast('Gespeichert – alle Rezepte rechnen neu');
  };
  /** Name oder „gilt für“ für alle Sorten – sofort gespeichert, mit „Rückgängig“ (wie die Stufen darunter) */
  const saveShared = (s: SharedMatch, what: string, recalc = true) => {
    const old = new Map(ps.map((p) => [p.id, p]));
    store([], s);
    toast(recalc ? `${what} – alle Rezepte rechnen neu` : what, { label: 'Rückgängig', run: () => saveProducts(currentProducts().map((x) => old.get(x.id) ?? x)) });
  };
  const rename = () => {
    const n = renaming?.trim();
    setRenaming(null);
    if (!n || !shared || n === shared.name) return;
    // die Sorten selbst – und alles, was den alten Namen trägt (Speisekammer, Bons, Preise …), zieht mit (Julia)
    const old = new Map(ps.map((p) => [p.id, p]));
    store([], { ...shared, name: n });
    const undoPantry = renameFoodEverywhere(shared.name, n, ps.map((p) => p.id));
    toast(`${ps.length > 1 ? `Alle ${ps.length} Sorten heißen` : 'Heißt'} jetzt „${n}“ – auch in der Speisekammer`, {
      label: 'Rückgängig', run: () => { saveProducts(currentProducts().map((x) => old.get(x.id) ?? x)); undoPantry(); },
    });
  };
  const remove = async (p: MyProduct) => {
    // hängen Einkäufe oder Vorrat an der Sorte und gibt es andere: fragen, wohin damit (Julia) – sonst „ohne Sorte“
    const uses = sortUses(currentPantry(), p.id);
    const others = ps.filter((x) => x.id !== p.id);
    let to: string | undefined;
    if (uses.purchases + uses.stock > 0 && others.length) {
      const what = [
        uses.purchases ? `${uses.purchases} ${uses.purchases === 1 ? 'Einkauf' : 'Einkäufe'}` : '',
        uses.stock ? `${uses.stock}× im Vorrat` : '',
      ].filter(Boolean).join(' und ');
      const answer = await choose({
        title: `„${productLabel(p)}“ entfernen?`, text: `${what} – zu welcher Sorte?`,
        choices: [...others.map((o) => ({ label: `Zu „${productLabel(o)}“`, value: o.id })), { label: 'Ohne Sorte behalten', value: '' }],
      });
      if (answer === null) return;
      to = answer || undefined;
    } else if (!(await ask({ title: `„${productLabel(p)}“ entfernen?`, text: 'Die Rezepte rechnen dann wieder mit Richtwerten.', confirm: 'Entfernen', danger: true }))) return;
    onTouch();
    toast(`„${productLabel(p)}“ entfernt`, { label: 'Rückgängig', run: removeProduct(p.id, to) });
  };
  // Stufe über den Schlüssel: „Passata“ und „Passierte Tomaten“ sind dasselbe
  const pantry = usePantry();
  const table = useFoodTable();
  const { stage, rule } = stageOf(row.ingredient, pantry, table);
  /** was Mashi ohne deinen Wert schätzt – und der Tabelleneintrag, an dem dein Wert ohne eigenes Produkt hängt */
  const estimate = estimateDays(row.ingredient, foodTable, pantry.shelfDays);
  const saveFoodShelf = (id: string, d: number | undefined) => {
    const old = currentPantry().shelfDays;
    setPantryShelfDays(setShelfDays(old, { food: id }, d));
    toast(`${title}: ${shelfText(d)}`, { label: 'Rückgängig', run: () => setPantryShelfDays(old ?? {}) });
  };
  // eine eigene Haltbarkeit ist auch etwas Festgelegtes (früher auf der Seite „Haltbarkeit“)
  const nothing = !ps.length && stage === 'normal' && !row.zero && !(estimate.id && pantry.shelfDays?.foods?.[estimate.id] !== undefined);
  /** mindestens eine Sorte mit Bon-Einkauf – dann steht „Zuletzt gekauft“ je Sorte, sonst einmal oben */
  const sortBought = ps.some((p) => purchasesOf(pantry.bons, (l) => l.productId === p.id).length > 0);
  const zeroRow = !!row.zero;
  /**
   * Die einzige Sorte zeigt nichts (Julia): keine Werte – auch nicht aus der Tabelle –, keine Marke, kein Zusatz,
   * keine Packung, kein Einkauf. Dann kein grauer Kasten; Werte über „Nährwerte eintragen“, Entfernen unten in der Kachel.
   */
  const bare = ps.length === 1 && !!ps[0].noValues && !valuesOf(ps[0], tableOf(ps[0])) && !brandOf(ps[0]) && !ps[0].detail && !ps[0].packageAmount && !sortBought;

  return (
    <li className={`foods__item${open ? ' is-open' : ''}`}>
      <div className="foods__head">
        {/* die ganze Kopfzeile klappt auf (unsichtbarer Knopf darunter) – nur der Stift liegt darüber */}
        <button type="button" className="foods__toggle" onClick={onToggle} aria-expanded={open} aria-label={`${title}: ${open ? 'zuklappen' : 'aufklappen'}`} />
        <span className="foods__name">
          {renaming !== null ? (
            <form className="foods__rename" onSubmit={(e) => { e.preventDefault(); rename(); }}>
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus aria-label={ps.length > 1 ? 'Name für alle Sorten' : 'Name'}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
              <button className="iconbtn iconbtn--sm" aria-label="Namen speichern" disabled={!renaming.trim()}><Icon name="check" size={16} /></button>
              <button type="button" className="iconbtn iconbtn--sm" aria-label="Abbrechen" onClick={() => setRenaming(null)}><Icon name="close" size={16} /></button>
            </form>
          ) : title}
          {/* Gewürze nicht umbenennen: der Name verbindet sie mit deinen Gewürzen (Packung, Preis) */}
          {open && shared && renaming === null && !zeroRow && (
            <button type="button" className="foods__pen" onClick={() => setRenaming(shared.name)} aria-label={ps.length > 1 ? 'Namen ändern – für alle Sorten' : 'Namen ändern'}>
              <Icon name="pencil" size={14} />
            </button>
          )}
          {/* Übersicht nur mit Namen (Julia) – Zusatz und Marke stehen aufgeklappt an der Sorte */}
          {nothing && <span className="foods__sub">nichts festgelegt</span>}
          {stage === 'haus' && <span className="foods__mark" title="Immer im Haus"><Icon name="home" size={14} /></span>}
          {rule && <span className="foods__restock" title={`Nachkaufen unter ${fmt(rule.below)} ${rule.unit}`}><Icon name="refresh" size={13} /></span>}
          {stage === 'ohne' && <span className="foods__mark" title="Gewürz – zählt nicht mit"><Icon name="leaf" size={14} /></span>}
          {/* Favorit nicht in der geschlossenen Karte (Julia) – der Stern steht aufgeklappt an der Sorte */}
          {ps.length > 1 && <span className="foods__sub">{ps.length} Sorten</span>}
        </span>
        <span className="foods__kcal">
          {zeroRow ? ''
            : values ? <>{average ? 'Ø ' : ''}{Math.round(values.kcal)} kcal{tableOnly && <em> Tabelle</em>}</>
              : 'keine Werte'}
        </span>
        <Icon name="chevron" size={16} />
      </div>

      {open && zeroRow && (
        <div className="foods__body">
          {ps.some((p) => !p.noValues) && <p className="small muted">Deine eigenen Werte bleiben gespeichert und zählen wieder, sobald du eine andere Stufe wählst.</p>}
          {/* Julia: Gewürze auch mit Preis – zuletzt gekauft (Bon) und die eigene Packung */}
          <LastPurchase name={row.ingredient} title={title} productIds={ps.map((p) => p.id)} />
          <SpicePack name={title} product={ps.length === 1 ? ps[0] : undefined} />
          <CategoryPicker name={row.ingredient} label={title} />
          <StagePicker name={row.ingredient} label={title} onTouch={onTouch} />
        </div>
      )}
      {open && !zeroRow && (
        <div className="foods__body">
          {nothing && <p className="small"><strong>Nichts mehr festgelegt.</strong> Die Zeile verschwindet, wenn du die Seite verlässt – oder schalte unten wieder etwas ein.</p>}
          {ps.length === 0 && (
            <p className="small muted">
              {row.table ? <>Rechnet mit dem Richtwert der Tabelle: {Math.round(row.table.per100g.kcal)} kcal · {macros(row.table.per100g)} pro 100 g.</> : 'Mashi kennt hierfür keine Werte.'}
            </p>
          )}
          {/* statt des Preisfelds: was du zuletzt wirklich bezahlt hast – je Sorte in ihrer Karte (Julia);
              hier oben nur, wenn keine Sorte einen Bon-Einkauf hat (ältere Bons kennen nur den Namen) */}
          {!sortBought && <LastPurchase name={row.ingredient} title={title} productIds={ps.map((p) => p.id)} />}
          {ps.map((p) => editing === p.id ? (
            <ProductForm key={p.id} initial={p} shared={shared} onSave={save} onCancel={() => setEditing(null)} />
          ) : bare ? null : (
            <div key={p.id} className="foods__sort">
              <div className="foods__sorthead">
                {ps.length > 1 && (
                  <button type="button" className={`variants__star${p.favorite ? ' is-on' : ''}`} aria-pressed={!!p.favorite}
                    aria-label={p.favorite ? `${p.name}: Favorit zurücknehmen` : `${p.name} als Favorit`}
                    onClick={() => { setFavoriteVariant(ps, p.favorite ? null : p.id); toast(p.favorite ? 'Favorit zurückgenommen – Rezepte rechnen wieder mit dem Durchschnitt' : `★ „${productLabel(p)}“ ist dein Favorit`); }}>
                    <Icon name="star" size={18} filled={!!p.favorite} />
                  </button>
                )}
                {/* der Name steht oben in der Kachel – hier der Zusatz als Text (Julia), die Marke als Chip darunter */}
                <span className="foods__sortname">{p.detail ?? (ps.length > 1 || p.noValues ? '' : <strong>Pro 100 g</strong>)}</span>
                <span className="product__actions">
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p.id)}><Icon name="pencil" size={16} /></button>
                  <button className="iconbtn iconbtn--sm iconbtn--danger" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}><Icon name="trash" size={16} /></button>
                </span>
              </div>
              {(brandOf(p) || (ps.length > 1 && !p.detail)) && (
                <span className="foods__brand">{brandOf(p) ? <span className="brand-chip">{brandOf(p)}</span> : <span className="brand-chip is-empty">ohne Marke</span>}</span>
              )}
              {/* kcal links, KH · Eiweiß · Fett rechts */}
              {p.noValues
                // Reihenfolge (Julia): eigene Werte → Tabelle → keine. Nachgeschaut, nicht kopiert – so bleibt sichtbar, woher die Zahl kommt
                ? (() => {
                  const t = valuesOf(p, tableOf(p));
                  return t
                    ? <>
                      <span className="small muted">Nährwerte aus der Tabelle</span>
                      <span className="small foods__values"><strong>{fmt(t.kcal)} kcal</strong><span>{macros(t)}</span></span>
                    </>
                    : <span className="small muted">Keine Nährwerte bekannt</span>;
                })()
                : <span className="small foods__values"><strong>{fmt(p.per100g.kcal)} kcal</strong><span>{macros(p.per100g)}</span></span>}
              <LastPurchase sort name={row.ingredient} title={title} productIds={[p.id]} />
              {/* gekauft: Größe und Preis stehen schon bei „Zuletzt gekauft“ (Julia) – sonst die eingetragene Packung */}
              {p.packageAmount && !purchasesOf(pantry.bons, (l) => l.productId === p.id).length && (
                <span className="small muted">Packung {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}</span>
              )}
            </div>
          ))}

          {/* einmal je Lebensmittel (Julia) – die Preis-Seite zeigt alle Sorten in einem Diagramm */}
          {sortBought && <FoodPriceLink name={row.ingredient} title={title} productIds={ps.map((p) => p.id)} />}
          {/* dasselbe Formular wie „Lebensmittel hinzufügen“ – als Sorte nur Marke, Werte, Packung */}
          {addingSort
            ? <ProductForm shared={ps.length ? sharedOf(ps) : undefined} initial={ps.length ? undefined : { name: row.name }} onSave={save} onCancel={() => setAddingSort(false)} />
            : (
              <div className="row-gap">
                {/* die einzige Sorte hat noch keine Werte: die füllen, statt eine zweite anzulegen */}
                {ps.length === 1 && ps[0].noValues && editing === null && (
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => setEditing(ps[0].id)}>
                    <Icon name="pencil" size={16} /> {valuesOf(ps[0], tableOf(ps[0])) ? 'Eigene Werte eintragen' : 'Nährwerte eintragen'}
                  </button>
                )}
                <button type="button" className="btn btn--soft btn--sm" onClick={() => setAddingSort(true)}>
                  <Icon name="plus" size={16} /> {ps.length ? 'Weitere Sorte' : 'Nährwerte hinzufügen'}
                </button>
              </div>
            )}

          {/* „gilt für“ im Stil der Stufen-Chips – gemeinsam für alle Sorten, sofort gespeichert */}
          {shared && (
            <MatchChips name={shared.name} value={shared}
              onChange={(m) => saveShared({ ...shared, ...m, excludes: visibleExcludes(shared.name, m) }, ps.length > 1 ? 'Für alle Sorten gespeichert' : 'Gespeichert')} />
          )}
          {/* Haltbarkeit in jeder Kachel (Julia) – mit eigenen Sorten gemeinsam für alle (Milch hält gleich lang, egal von
              welcher Marke), sonst als dein Wert fürs Lebensmittel (früher auf der Seite „Haltbarkeit“) */}
          {shared ? (
            // key: nach „Rückgängig“ (oder vom anderen Gerät) zeigt das Feld wieder den gespeicherten Wert
            <ShelfField key={shared.shelfDays ?? 'leer'} value={shared.shelfDays} estimate={estimate.days} onSave={(d) => saveShared({ ...shared, shelfDays: d },
              `${shelfText(d)}${d !== undefined && ps.length > 1 ? ` – alle ${ps.length} Sorten` : ''}`, false)} />
          ) : estimate.id && (
            <ShelfField key={pantry.shelfDays?.foods?.[estimate.id] ?? 'leer'} value={pantry.shelfDays?.foods?.[estimate.id]} estimate={estimate.days}
              onSave={(d) => saveFoodShelf(estimate.id!, d)} />
          )}
          <CategoryPicker name={row.ingredient} label={title} />
          <StagePicker name={row.ingredient} label={title} onTouch={onTouch} />
          {/* ohne grauen Kasten fehlt dessen Papierkorb – darum hier */}
          {bare && editing === null && (
            <button type="button" className="link pantry-set__remove" onClick={() => remove(ps[0])}><Icon name="trash" size={14} /> Lebensmittel entfernen</button>
          )}
        </div>
      )}
    </li>
  );
}

/** Meldung zur Haltbarkeit: „hält 730 Tage ab Kauf“, „hält unbegrenzt“, „schätzt wieder Mashi“ */
const shelfText = (d: number | undefined) => (d === undefined ? 'Haltbarkeit schätzt wieder Mashi'
  : d === FOREVER ? 'hält unbegrenzt – keine Erinnerung' : `hält ${d === 1 ? '1 Tag' : `${d} Tage`} ab Kauf`);

/**
 * „Hält ab Kauf“ in der Kachel; leer = Mashis Schätzung (steht grau im Feld und darunter).
 * Bis 10 Jahre; „Hält unbegrenzt“ schaltet die Schätzung ab (Julia: Salz, Zucker – nie „läuft bald ab“).
 * Gespeichert beim Verlassen des Felds bzw. beim Haken.
 */
function ShelfField({ value, estimate, onSave }: { value?: number; estimate?: number; onSave: (days: number | undefined) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  const [error, setError] = useState(false);
  const forever = value === FOREVER;
  const commit = () => {
    const t = text.trim();
    const d = t ? Number(t) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > MAX_SHELF_DAYS)) return setError(true);
    setError(false);
    if (d !== value && !(forever && d === undefined)) onSave(d);
  };
  const guess = estimate === undefined ? 'lange (ohne Erinnerung)' : estimate === 1 ? '1 Tag' : `${estimate} Tage`;
  return (
    <div className="stage shelf-shared">
      <label className="shelf-shared__row">
        <span className="small muted">Hält ab Kauf</span>
        <input inputMode="numeric" value={text} placeholder={forever ? '∞' : estimate === undefined ? '–' : String(estimate)} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} disabled={forever}
          aria-label="Hält ab Kauf, Tage" aria-invalid={error} />
        <span className="small muted">Tage</span>
      </label>
      <label className="shelf-forever small">
        <input type="checkbox" checked={forever} onChange={(e) => { setText(''); setError(false); onSave(e.target.checked ? FOREVER : undefined); }} />
        Hält unbegrenzt – nicht schätzen
      </label>
      <p className="small muted">{forever ? 'Keine Erinnerung – Mashi schätzt nicht' : value ? `Dein Wert – Mashi schätzt ${guess}` : `Leer = Mashis Schätzung: ${guess}`}</p>
      {error && <p className="small error" role="alert">Bitte ganze Tage von 1 bis {MAX_SHELF_DAYS} (10 Jahre) – oder leer lassen.</p>}
    </div>
  );
}

/**
 * Neues Lebensmittel – ein Formular: Name, darunter „Immer im Haus“ / „Gewürz“, dann Barcode oder
 * Open Food Facts und alle Felder. Gibt es das Lebensmittel schon, fragt Mashi gleich unter dem Namen,
 * ob es eine weitere Sorte ist. Gewürz: nur der Name (zählt nicht mit, keine Nährwerte).
 * @param onDone mit Schlüssel der Zeile, die danach aufgeklappt werden soll
 */
function AddFood({ tab, rows, onDone }: { tab: FoodFilter; rows: FoodRow[]; onDone: (openKey?: string) => void }) {
  const products = useProducts();
  /** der Tab gibt die Stufe vor – umschaltbar, ohne den Tab zu wechseln */
  const [stage, setStage] = useState<'haus' | 'ohne' | null>(tab === 'produkte' ? null : tab);
  /** „Ja, weitere Sorte“ gewählt: zu dieser Zeile */
  const [sortOf, setSortOf] = useState<FoodRow | null>(null);
  /** „Nein, neu anlegen“ für genau diesen Namen – dann nicht noch einmal fragen */
  const [notSort, setNotSort] = useState('');
  const existing = (n: string) => findFoodRow(rows, n, foodTable, notSort);

  const saveNew = (p: MyProduct) => {
    addProduct(p);
    if (stage === 'haus') setFoodStage(p.name, 'haus');
    toast(`„${p.name}“ gespeichert${stage === 'haus' ? ' – immer im Haus' : ''} – alle Rezepte rechnen neu`);
    onDone();
  };
  const saveSort = (row: FoodRow, p: MyProduct) => {
    // wie „Weitere Sorte“ in der Kachel: alle Sorten bekommen dasselbe Gemeinsame
    const s = sharedOf(row.products);
    const group = new Set(row.products.map((x) => x.id));
    // die einzige Sorte hat noch keine Werte? Dann füllt sich die (siehe fillOrAdd)
    const { products: next, saved } = fillOrAdd(products.map((x) => (group.has(x.id) ? withShared(x, s) : x)), withShared(p, s), row.products);
    saveProducts(next);
    toast(saved.id === p.id ? `Weitere Sorte von „${s.name}“ gespeichert – alle Rezepte rechnen neu` : `Nährwerte für „${s.name}“ gespeichert – alle Rezepte rechnen neu`);
    onDone(row.key);
  };
  // über die Stufe – so steht es nie zugleich unter „Nachkaufen“ und hier
  const addStage = (n: string, s: 'haus' | 'ohne') => {
    setFoodStage(n, s);
    toast(s === 'haus' ? `„${n}“ ist jetzt immer im Haus` : `„${n}“ steht jetzt unter „Gewürze“`);
    onDone();
  };

  if (sortOf) {
    const s = sharedOf(sortOf.products);
    return (
      <div className="panel stack add-food">
        <strong>Weitere Sorte von „{s.name}“</strong>
        <ProductForm shared={s} onSave={(p) => saveSort(sortOf, p)} onCancel={() => onDone()} />
      </div>
    );
  }
  return (
    <div className="panel stack add-food">
      <strong>Lebensmittel hinzufügen</strong>
      <ProductForm key="neu" onSave={saveNew} onCancel={() => onDone()}
        nameOnly={stage === 'ohne'} onNameOnly={(n) => addStage(n, 'ohne')}
        onNoValues={stage === 'haus' ? (n) => addStage(n, 'haus') : undefined}
        afterName={(n) => {
          const row = stage !== 'ohne' ? existing(n) : undefined;
          return (
            <>
              {row && (
                <div className="scan-note add-food__exists" role="status">
                  <p><strong>„{sharedOf(row.products).name}“</strong> gibt es schon{row.products.length > 1 ? ` (${row.products.length} Sorten)` : ''}. Ist das eine weitere Sorte, z. B. eine andere Marke?</p>
                  <div className="row-gap">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setSortOf(row)}>Ja, weitere Sorte</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNotSort(normalizeName(n))}>Nein, neu anlegen</button>
                  </div>
                </div>
              )}
              {/* genau eine Stufe oder keine – wie die Stufen-Chips in der Kachel */}
              <div className="chips">
                <button type="button" className={`chip chip--sm${stage === 'haus' ? ' is-on' : ''}`} aria-pressed={stage === 'haus'} onClick={() => setStage(stage === 'haus' ? null : 'haus')}>
                  <Icon name="home" size={14} /> Immer im Haus
                </button>
                <button type="button" className={`chip chip--sm${stage === 'ohne' ? ' is-on' : ''}`} aria-pressed={stage === 'ohne'} onClick={() => setStage(stage === 'ohne' ? null : 'ohne')}>
                  <Icon name="leaf" size={14} /> Gewürz
                </button>
              </div>
              {stage === 'ohne' && <p className="small muted">Gewürze & Co. zählen in Rezepten nicht mit – darum ohne Nährwerte.</p>}
              {stage === 'haus' && <p className="small muted">Nährwerte sind hier freiwillig – leer lassen merkt es nur als „immer im Haus“.</p>}
            </>
          );
        }} />
    </div>
  );
}

/**
 * Packung und Preis eines Gewürzes (Julia: „Gewürze auch Preis hinzufügbar“). Dafür wird es ein eigenes Lebensmittel
 * ohne Nährwerte – so zählt der Preis im Rezept anteilig („1 TL von 15 g“); mitgerechnet wird es weiter nicht.
 */
function SpicePack({ name, product }: { name: string; product?: MyProduct }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(toField(product?.packageAmount));
  const [price, setPrice] = useState(toField(product?.packagePrice));
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return product?.packageAmount ? (
      <div className="row-between spice-pack">
        <span className="small">Packung {fmt(product.packageAmount)} {product.packageUnit ?? 'g'}{product.packagePrice !== undefined ? ` · ${euro(product.packagePrice)}` : ''}</span>
        <button type="button" className="chip chip--sm" onClick={() => setEditing(true)}><Icon name="pencil" size={13} /> Ändern</button>
      </div>
    ) : (
      <button type="button" className="btn btn--soft btn--sm spice-pack" onClick={() => setEditing(true)}><Icon name="plus" size={16} /> Packung und Preis</button>
    );
  }
  const save = () => {
    const a = parseNum(amount);
    const p = parseNum(price);
    if (!(a && a > 0)) return setError('Packungsgröße bitte als Zahl, z. B. 15.');
    if (price.trim() && p === undefined) return setError('Preis bitte als Zahl, z. B. 1,49 – oder leer lassen.');
    const at = new Date().toISOString();
    const priced = { packageAmount: a, packageUnit: 'g' as const, ...(p !== undefined ? { packagePrice: p } : {}), updatedAt: at };
    const next: MyProduct = product
      ? (({ packagePrice: _, ...rest }) => ({ ...rest, ...priced }))(product)
      // „gilt für“ nur bei genauem Treffer (Paprikapulver) – „Basilikum getrocknet“ darf nie das frische ersetzen
      : { id: newId('p'), name, replaces: guessMatch(name).replaces, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, noValues: true, ...priced };
    const before = currentProducts();
    saveProducts(product ? before.map((x) => (x.id === product.id ? next : x)) : [...before, next]);
    setEditing(false);
    setError(null);
    toast(`${name}: ${fmt(a)} g${p !== undefined ? ` für ${euro(p)}` : ''}`, {
      label: 'Rückgängig',
      run: () => saveProducts(product ? currentProducts().map((x) => (x.id === product.id ? product : x)) : currentProducts().filter((x) => x.id !== next.id)),
    });
  };
  return (
    <div className="stack stack--tight spice-pack">
      <div className="row-gap">
        <label className="field"><span>Packung (g)</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z. B. 15" autoFocus />
        </label>
        <label className="field"><span>Preis (€)</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="z. B. 1,49" />
        </label>
      </div>
      {error && <p className="small error" role="alert">{error}</p>}
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" onClick={save}>Speichern</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEditing(false); setError(null); }}>Abbrechen</button>
      </div>
    </div>
  );
}

/**
 * „Aus Vorrat & Bons übernehmen“ (Julia): was du hast oder gekauft hast, bekommt eine Kachel – ohne eigene
 * Nährwerte (rechnet weiter mit der Tabelle). Nur sichtbar, solange es etwas zu übernehmen gibt.
 */
function AdoptFoods() {
  const pantry = usePantry();
  const table = useFoodTable();
  const candidates = useMemo(() => adoptCandidates(pantry.items, pantry.bons, table, [...basicsOf(pantry), ...zeroOf(pantry).map((z) => spiceName(z, table))]),
    [pantry, table]);
  if (!candidates.length) return null;
  const names = candidates.map((p) => p.name);
  const adopt = async () => {
    const list = names.length > 12 ? `${names.slice(0, 12).join(', ')} und ${names.length - 12} weitere` : names.join(', ');
    if (!(await ask({ title: `${names.length} Lebensmittel übernehmen?`, text: `${list}. Nährwerte kommen aus der Tabelle (wo sie es kennt) – eigene Werte, Haltbarkeit, Packung und Sorten stellst du dann in der Kachel ein.`, confirm: 'Übernehmen' }))) return;
    const ids = new Set(candidates.map((p) => p.id));
    saveProducts([...currentProducts(), ...candidates]);
    toast(`${names.length} Lebensmittel übernommen`, { label: 'Rückgängig', run: () => saveProducts(currentProducts().filter((p) => !ids.has(p.id))) });
  };
  return (
    <div className="scan-note adopt-foods" role="status">
      <p className="small"><strong>{names.length === 1 ? '1 Lebensmittel' : `${names.length} Lebensmittel`} aus Vorrat & Bons</strong> {names.length === 1 ? 'hat' : 'haben'} noch keine Kachel – z. B. {names.slice(0, 3).join(', ')}.</p>
      <button type="button" className="btn btn--soft btn--sm" onClick={adopt}><Icon name="plus" size={16} /> Alle übernehmen</button>
    </div>
  );
}

/** Ausgeblendete Namensvorschläge – antippen, um sie wieder vorzuschlagen */
function DismissedRenames({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <details className="panel fold">
      <summary className="small"><strong>Ausgeblendete Namensvorschläge ({keys.length})</strong></summary>
      <p className="small muted">Für diese Schreibweisen schlägt Mashi keinen einheitlichen Namen mehr vor. Antippen holt den Vorschlag zurück.</p>
      <div className="chips">
        {keys.map((k) => (
          <button key={k} type="button" className="afilter" onClick={() => dismissRename(k, true)} aria-label={`${cap(k)} wieder vorschlagen`}>
            {cap(k)} <Icon name="refresh" size={14} />
          </button>
        ))}
      </div>
    </details>
  );
}
