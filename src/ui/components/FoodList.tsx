import { useMemo, useState } from 'react';
import { ask } from '../confirm';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, matchesFilter, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { brandOf, productLabel, sharedOf, withShared, type MyProduct, type SharedMatch } from '../../domain/nutrition/myProducts';
import { zeroOf } from '../../domain/nutrition/noNutrition';
import { averageNutrients } from '../../domain/nutrition/variants';
import type { Nutrients } from '../../domain/nutrition/types';
import { currentProducts, dismissRename, saveProducts, setFavoriteVariant, setFoodStage, useFoodTable, usePantry, useProducts, useRecipes } from '../../data/store';
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
import { NutritionQuickForm } from './NutritionQuickForm';
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
export function FoodList() {
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
  const [adding, setAdding] = useState(false);
  const matches = matchesFilter;
  const shown = rows.filter((r) => matches(r, filter));
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
          {filter === 'produkte' ? 'Noch keine Produkte – unten hinzufügen, oder bei einem Rezept unter „Nährwerte“ eigene Werte eintragen.'
            : filter === 'haus' ? 'Noch nichts „immer im Haus“ – unten hinzufügen.' : 'Noch keine Gewürze – unten hinzufügen.'}
        </p>
      )}
      <ul className="foods">{shown.map(line)}</ul>

      </div>

      {filter === 'produkte' && <DismissedRenames keys={pantry.renameDismissed ?? []} />}

      {adding ? <AddFood tab={filter} onDone={() => setAdding(false)} /> : (
        <button type="button" className="btn btn--soft" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> {filter === 'haus' ? 'Zu „Immer im Haus“ hinzufügen' : filter === 'ohne' ? 'Gewürz hinzufügen' : 'Produkt hinzufügen'}
        </button>
      )}
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
  const saveShared = (s: SharedMatch, what: string) => {
    const old = new Map(ps.map((p) => [p.id, p]));
    store([], s);
    toast(`${what} – alle Rezepte rechnen neu`, { label: 'Rückgängig', run: () => saveProducts(currentProducts().map((x) => old.get(x.id) ?? x)) });
  };
  const rename = () => {
    const n = renaming?.trim();
    setRenaming(null);
    if (!n || !shared || n === shared.name) return;
    saveShared({ ...shared, name: n }, ps.length > 1 ? `Alle ${ps.length} Sorten heißen jetzt „${n}“` : `Heißt jetzt „${n}“`);
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
          {ps.length === 1 && brandOf(ps[0]) && <span className="brand">{brandOf(ps[0])}</span>}
          {nothing && <span className="foods__sub">nichts festgelegt</span>}
          {stage === 'haus' && <span className="foods__mark" title="Immer im Haus"><Icon name="home" size={14} /></span>}
          {rule && <span className="foods__restock" title={`Nachkaufen unter ${fmt(rule.below)} ${rule.unit}`}><Icon name="refresh" size={13} /></span>}
          {stage === 'ohne' && <span className="foods__mark" title="Gewürz – zählt nicht mit"><Icon name="leaf" size={14} /></span>}
          {ps.length > 1 && <span className="foods__sub">{ps.length} Sorten{fav ? ` · ★ ${productLabel(fav)}` : ''}</span>}
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
          <StagePicker name={row.ingredient} onTouch={onTouch} />
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
                {/* mehrere Sorten: der Name steht schon oben in der Kachel – hier nur die Marke als Chip */}
                {ps.length > 1
                  ? <span className="foods__brand">{brandOf(p) ? <span className="brand-chip">{brandOf(p)}</span> : <span className="brand-chip is-empty">ohne Marke</span>}</span>
                  : <strong>Pro 100 g</strong>}
                <span className="product__actions">
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p.id)}><Icon name="pencil" size={16} /></button>
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}><Icon name="trash" size={16} /></button>
                </span>
              </div>
              <span className="small"><strong>{fmt(p.per100g.kcal)} kcal</strong> · {macros(p.per100g)}</span>
              {p.packageAmount && <span className="small muted">Packung {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}</span>}
              {p.shelfDays && <span className="small muted">hält {p.shelfDays === 1 ? '1 Tag' : `${p.shelfDays} Tage`} ab Kauf</span>}
            </div>
          ))}

          {addingSort
            ? <NutritionQuickForm ingredient={row.ingredient} shared={ps.length ? sharedOf(ps) : undefined} onSave={save} onCancel={() => setAddingSort(false)} />
            : (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setAddingSort(true)}>
                <Icon name="plus" size={16} /> {ps.length ? 'Weitere Sorte' : 'Nährwerte hinzufügen'}
              </button>
            )}

          {/* „gilt für“ im Stil von „Wie behältst du es im Blick?“ – gemeinsam für alle Sorten, sofort gespeichert */}
          {shared && (
            <MatchChips name={shared.name} value={shared}
              onChange={(m) => saveShared({ ...shared, ...m, excludes: visibleExcludes(shared.name, m) }, ps.length > 1 ? 'Für alle Sorten gespeichert' : 'Gespeichert')} />
          )}
          <StagePicker name={row.ingredient} onTouch={onTouch} />
        </div>
      )}
    </li>
  );
}

/**
 * Neues Lebensmittel – passend zum offenen Tab:
 * Produkte → Name, dann Nährwerte (Foto, Open Food Facts, abtippen) oder Produkt mit Packung.
 * Immer im Haus / Ohne Nährwerte → nur der Name.
 */
function AddFood({ tab, onDone }: { tab: FoodFilter; onDone: () => void }) {
  const products = useProducts();
  const [name, setName] = useState('');
  const [step, setStep] = useState<'name' | 'werte' | 'produkt'>('name');
  /** gleich mit „Immer im Haus“ markieren – ohne dafür in den Tab wechseln zu müssen */
  const [basic, setBasic] = useState(false);
  /** der Tab entscheidet: immer im Haus oder Gewürz */
  const ground = tab === 'ohne' ? 'ohne' : 'haus';
  const n = name.trim();
  const save = (p: MyProduct) => {
    saveProducts([...products, p]);
    if (basic) setFoodStage(n, 'haus');
    toast(`„${p.name}“ gespeichert${basic ? ' – immer im Haus' : ''} – alle Rezepte rechnen neu`);
    onDone();
  };
  const addName = () => {
    if (!n) return;
    // über die Stufe – so steht es nie zugleich unter „Nachkaufen“ und hier
    setFoodStage(n, ground);
    toast(ground === 'haus' ? `„${n}“ ist jetzt immer im Haus` : `„${n}“ steht jetzt unter „Gewürze“`);
    onDone();
  };
  if (step === 'werte') return <NutritionQuickForm ingredient={n} onSave={save} onCancel={onDone} />;
  if (step === 'produkt') return <ProductForm initial={{ name: n, names: [normalizeName(n)], replaces: [] }} onSave={save} onCancel={onDone} />;
  return (
    <div className="panel stack">
      <label className="field"><span>Welche Zutat?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" autoFocus
          placeholder={tab === 'ohne' ? 'z. B. Sumach' : tab === 'haus' ? 'z. B. Haferflocken' : 'z. B. Grünes Pesto'}
          onKeyDown={(e) => e.key === 'Enter' && tab !== 'produkte' && addName()} />
      </label>
      {tab === 'produkte' && (
        <button type="button" className={`chip chip--sm${basic ? ' is-on' : ''}`} aria-pressed={basic} onClick={() => setBasic(!basic)}>
          <Icon name="home" size={14} /> Immer im Haus
        </button>
      )}
      {tab === 'produkte' ? (
        <div className="row-gap">
          <button type="button" className="btn btn--primary btn--sm" disabled={!n} onClick={() => setStep('werte')}>Nährwerte hinzufügen</button>
          <button type="button" className="btn btn--soft btn--sm" disabled={!n} onClick={() => setStep('produkt')}>Produkt mit Packung</button>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--sm" disabled={!n} onClick={addName}>Hinzufügen</button>
      )}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>Abbrechen</button>
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
