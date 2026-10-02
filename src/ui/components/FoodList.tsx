import { useMemo, useState } from 'react';
import { ask } from '../confirm';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, matchesFilter, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { productLabel, sharedOf, sortTags, withShared, type MyProduct, type SharedMatch } from '../../domain/nutrition/myProducts';
import { groupByCategory } from '../../domain/categories';
import { useCategoryOf } from '../useCategory';
import { CategoryPicker } from './CategoryPicker';
import { LastPurchase } from './LastPurchase';
import { zeroOf } from '../../domain/nutrition/noNutrition';
import { averageNutrients } from '../../domain/nutrition/variants';
import type { Nutrients } from '../../domain/nutrition/types';
import { currentProducts, dismissRename, renameFoodEverywhere, saveProducts, setFavoriteVariant, setFoodStage, useFoodTable, usePantry, useProducts, useRecipes } from '../../data/store';
import { stageOf } from '../../domain/stage';
import { StagePicker } from './StagePicker';
import { currentContent } from '../../domain/recipe';
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
  const keep = useMemo(() => [...touched, ...restock.map((r) => r.name)], [touched, restock]);
  const rows = useMemo(() => buildFoodList(products, basics, zero, foodTable, known, keep), [products, basics, zero, known, keep]);
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
  const values = ps.length === 1 ? ps[0].per100g : fav ? fav.per100g : ps.length ? averageNutrients(ps.map((p) => p.per100g)) : row.table?.per100g;
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
    if (!(await ask({ title: `„${productLabel(p)}“ entfernen?`, text: 'Die Rezepte rechnen dann wieder mit Richtwerten.', confirm: 'Entfernen', danger: true }))) return;
    onTouch();
    saveProducts(products.filter((x) => x.id !== p.id));
  };
  // Stufe über den Schlüssel: „Passata“ und „Passierte Tomaten“ sind dasselbe
  const pantry = usePantry();
  const table = useFoodTable();
  const { stage, rule } = stageOf(row.ingredient, pantry, table);
  const nothing = !ps.length && stage === 'normal' && !row.zero;
  const zeroRow = !!row.zero;

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
          {open && shared && renaming === null && (
            <button type="button" className="foods__pen" onClick={() => setRenaming(shared.name)} aria-label={ps.length > 1 ? 'Namen ändern – für alle Sorten' : 'Namen ändern'}>
              <Icon name="pencil" size={14} />
            </button>
          )}
          {/* Zusatz („leicht“) und Marke direkt neben dem Namen */}
          {ps.length === 1 && sortTags(ps[0]).map((t) => <span key={t} className="brand">{t}</span>)}
          {nothing && <span className="foods__sub">nichts festgelegt</span>}
          {stage === 'haus' && <span className="foods__mark" title="Immer im Haus"><Icon name="home" size={14} /></span>}
          {rule && <span className="foods__restock" title={`Nachkaufen unter ${fmt(rule.below)} ${rule.unit}`}><Icon name="refresh" size={13} /></span>}
          {stage === 'ohne' && <span className="foods__mark" title="Gewürz – zählt nicht mit"><Icon name="leaf" size={14} /></span>}
          {/* Favorit nicht in der geschlossenen Karte (Julia) – der Stern steht aufgeklappt an der Sorte */}
          {ps.length > 1 && <span className="foods__sub">{ps.length} Sorten</span>}
        </span>
        <span className="foods__kcal">
          {zeroRow ? ''
            : values ? <>{ps.length > 1 && !fav ? 'Ø ' : ''}{Math.round(values.kcal)} kcal{!ps.length && <em> Tabelle</em>}</>
              : 'keine Werte'}
        </span>
        <Icon name="chevron" size={16} />
      </div>

      {open && zeroRow && (
        <div className="foods__body">
          {ps.length > 0 && <p className="small muted">Deine eigenen Werte bleiben gespeichert und zählen wieder, sobald du eine andere Stufe wählst.</p>}
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
          {/* statt des Preisfelds: was du zuletzt wirklich bezahlt hast – und der Weg zur Preis-Seite */}
          <LastPurchase name={row.ingredient} title={title} productIds={ps.map((p) => p.id)} />
          {ps.map((p) => editing === p.id ? (
            <ProductForm key={p.id} initial={p} shared={shared} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div key={p.id} className="foods__sort">
              <div className="foods__sorthead">
                {ps.length > 1 && (
                  <button type="button" className={`variants__star${p.favorite ? ' is-on' : ''}`} aria-pressed={!!p.favorite}
                    aria-label={p.favorite ? `${p.name}: Favorit zurücknehmen` : `${p.name} als Favorit`}
                    onClick={() => { setFavoriteVariant(ps, p.favorite ? null : p.id); toast(p.favorite ? 'Favorit zurückgenommen – Rezepte rechnen wieder mit dem Durchschnitt' : `★ „${productLabel(p)}“ ist dein Favorit`); }}>
                    <Icon name="star" size={18} filled={!!p.favorite} />
                  </button>
                )}
                {/* mehrere Sorten: der Name steht schon oben in der Kachel – hier Zusatz und Marke als Chips */}
                {ps.length > 1
                  ? <span className="foods__brand">{sortTags(p).length ? sortTags(p).map((t) => <span key={t} className="brand-chip">{t}</span>) : <span className="brand-chip is-empty">ohne Marke</span>}</span>
                  : <strong>Pro 100 g</strong>}
                <span className="product__actions">
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p.id)}><Icon name="pencil" size={16} /></button>
                  <button className="iconbtn iconbtn--sm iconbtn--danger" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}><Icon name="trash" size={16} /></button>
                </span>
              </div>
              <span className="small"><strong>{fmt(p.per100g.kcal)} kcal</strong> · {macros(p.per100g)}</span>
              {p.packageAmount && <span className="small muted">Packung {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}</span>}
            </div>
          ))}

          {/* dasselbe Formular wie „Lebensmittel hinzufügen“ – als Sorte nur Marke, Werte, Packung */}
          {addingSort
            ? <ProductForm shared={ps.length ? sharedOf(ps) : undefined} initial={ps.length ? undefined : { name: row.name }} onSave={save} onCancel={() => setAddingSort(false)} />
            : (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setAddingSort(true)}>
                <Icon name="plus" size={16} /> {ps.length ? 'Weitere Sorte' : 'Nährwerte hinzufügen'}
              </button>
            )}

          {/* „gilt für“ im Stil der Stufen-Chips – gemeinsam für alle Sorten, sofort gespeichert */}
          {shared && (
            <MatchChips name={shared.name} value={shared}
              onChange={(m) => saveShared({ ...shared, ...m, excludes: visibleExcludes(shared.name, m) }, ps.length > 1 ? 'Für alle Sorten gespeichert' : 'Gespeichert')} />
          )}
          {/* Haltbarkeit ebenso gemeinsam: Milch hält gleich lang, egal von welcher Marke */}
          {shared && (
            // key: nach „Rückgängig“ (oder vom anderen Gerät) zeigt das Feld wieder den gespeicherten Wert
            <SharedShelf key={shared.shelfDays ?? 'leer'} shared={shared} onSave={(d) => saveShared({ ...shared, shelfDays: d },
              d ? `Hält ${d === 1 ? '1 Tag' : `${d} Tage`} ab Kauf${ps.length > 1 ? ` – alle ${ps.length} Sorten` : ''}` : 'Haltbarkeit schätzt wieder Mashi', false)} />
          )}
          <CategoryPicker name={row.ingredient} label={title} />
          <StagePicker name={row.ingredient} label={title} onTouch={onTouch} />
        </div>
      )}
    </li>
  );
}

/** „Hält ab Kauf“ in der Kachel – gemeinsam für alle Sorten; leer = Mashi schätzt. Gespeichert beim Verlassen des Felds. */
function SharedShelf({ shared, onSave }: { shared: SharedMatch; onSave: (days: number | undefined) => void }) {
  const [text, setText] = useState(shared.shelfDays ? String(shared.shelfDays) : '');
  const [error, setError] = useState(false);
  const commit = () => {
    const t = text.trim();
    const d = t ? Number(t) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 365)) return setError(true);
    setError(false);
    if (d !== shared.shelfDays) onSave(d);
  };
  return (
    <div className="stage shelf-shared">
      <label className="shelf-shared__row">
        <span className="small muted">Hält ab Kauf</span>
        <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Hält ab Kauf, Tage" aria-invalid={error} />
        <span className="small muted">Tage</span>
      </label>
      {error && <p className="small error" role="alert">Bitte ganze Tage von 1 bis 365 – oder leer lassen.</p>}
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
  const existing = (n: string) => {
    const k = normalizeName(n);
    if (!k || k === notSort) return undefined;
    return rows.find((r) => r.products.length > 0 && [r.name, r.ingredient, sharedOf(r.products).name].some((x) => normalizeName(x) === k));
  };

  const saveNew = (p: MyProduct) => {
    saveProducts([...products, p]);
    if (stage === 'haus') setFoodStage(p.name, 'haus');
    toast(`„${p.name}“ gespeichert${stage === 'haus' ? ' – immer im Haus' : ''} – alle Rezepte rechnen neu`);
    onDone();
  };
  const saveSort = (row: FoodRow, p: MyProduct) => {
    // wie „Weitere Sorte“ in der Kachel: alle Sorten bekommen dasselbe Gemeinsame
    const s = sharedOf(row.products);
    const group = new Set(row.products.map((x) => x.id));
    saveProducts([...products.map((x) => (group.has(x.id) ? withShared(x, s) : x)), withShared(p, s)]);
    toast(`Weitere Sorte von „${s.name}“ gespeichert – alle Rezepte rechnen neu`);
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
