import { useMemo, useState } from 'react';
import { DEFAULT_BASICS } from '../../domain/mealplan';
import { buildFoodList, matchesFilter, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { appliesAliases, normalizeName } from '../../domain/nutrition/localFoods';
import { brandOf, nameOf, productLabel, type MyProduct } from '../../domain/nutrition/myProducts';
import { DEFAULT_NO_NUTRITION } from '../../domain/nutrition/noNutrition';
import { averageNutrients } from '../../domain/nutrition/variants';
import type { Nutrients } from '../../domain/nutrition/types';
import { dismissRename, saveProducts, setFavoriteVariant, setNoNutrition, setPantryBasics, setPantryRestock, usePantry, useProducts, useRecipes } from '../../data/store';
import { sameRule, type RestockRule } from '../../domain/restock';
import type { PantryUnit } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { foodTable } from '../../services';
import { euro } from '../format';
import { toast } from '../toast';
import { useSwipe } from '../useSwipe';
import { useSlide } from '../useSlide';
import { Icon } from './Icon';
import { ProductForm } from './MyProductsPanel';
import { NutritionQuickForm } from './NutritionQuickForm';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('de-DE'));
/** Ausnahmen, die wirklich etwas bewirken (überflüssige alte, z. B. „Vollmilch“ beim 0,1-%-Produkt, nicht) */
const shownExcludes = (p: MyProduct) => (p.excludes ?? []).filter((x) => p.replaces.some((id) => appliesAliases(nameOf(p), id).includes(x)));
/** Alle Schreibweisen, für die ein Produkt gilt – aus der Tabelle (ohne Ausnahmen) und freie Namen */
const appliesTo = (p: MyProduct) => [...new Set([
  ...p.replaces.flatMap((id) => appliesAliases(nameOf(p), id)).filter((a) => !p.excludes?.includes(a)),
  ...(p.names ?? []),
])].map(cap);
/** Tabs: Schlüssel, kurzer Name, voller Name (für Screenreader) – Reihenfolge = Wischrichtung */
const TABS = [['produkte', 'Produkte', 'Produkte'], ['haus', 'Immer im Haus', 'Immer im Haus'], ['ohne', 'Ohne Nährwerte', 'Ohne Nährwerte']] as const;

const macros = (n: Nutrients) => `KH ${fmt(n.carbs)} · Eiweiß ${fmt(n.protein)} · Fett ${fmt(n.fat)} g`;

/**
 * „Meine Lebensmittel“ – eine Zeile je Zutat, aufklappbar: eigene Nährwerte und Produkte (auch
 * mehrere Sorten mit Favorit), „Immer im Haus“ und „Ohne Nährwerte“ als Markierung an der Zeile.
 */
export function FoodList() {
  const products = useProducts();
  const pantry = usePantry();
  const basics = pantry.basics ?? DEFAULT_BASICS;
  const zero = pantry.noNutrition ?? DEFAULT_NO_NUTRITION;
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
  const shown = rows.filter((r) => matchesFilter(r, filter));
  // Wischen wie im Rezept: nach links = nächster Tab, nach rechts = vorheriger (am Rand bleibt es stehen)
  const step = (dir: 1 | -1) => {
    const i = TABS.findIndex(([f]) => f === filter) + dir;
    if (i >= 0 && i < TABS.length) setFilter(TABS[i][0]);
  };
  const swipe = useSwipe(() => step(1), () => step(-1));
  const slide = useSlide(TABS.findIndex(([f]) => f === filter));
  const count = (f: FoodFilter) => rows.filter((r) => matchesFilter(r, f)).length;

  return (
    <div className="stack foods-panel">
      {/* wie die Tabs im Rezept: eine Zeile auch auf dem Handy – kurze Namen, Anzahl darunter */}
      <div className="tabs foods__tabs" role="tablist" aria-label="Filter">
        {TABS.map(([f, label, full]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} aria-label={`${full} (${count(f)})`}
            className={`tab${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>
            <span>{label}</span>
            <small>{count(f)}</small>
          </button>
        ))}
      </div>
      <div key={filter} className={`stack ${slide}`} role="tabpanel" {...swipe}>
      <p className="small muted">
        {filter === 'produkte' ? 'Alles, was du dauerhaft verwendest – mit deinen Werten oder vorerst dem Richtwert der Tabelle. Antippen für Details.'
          : filter === 'haus' ? 'Produkte, die du immer da hast: auf der Einkaufsliste unter „Basics“, bei Rezepten nie „fehlt“.'
            : 'Gewürze & Co.: zählen in Rezepten nicht mit und stehen auf der Einkaufsliste automatisch unter „Basics“.'}
      </p>

      {shown.length === 0 && <p className="small">Hier ist noch nichts.</p>}
      <ul className="foods">
        {shown.map((r) => (
          <FoodLine key={r.key} row={r} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)}
            products={products} basics={basics} zero={zero} restock={restock} onTouch={() => touch(r.ingredient)} />
        ))}
      </ul>

      </div>

      {filter === 'produkte' && <DismissedRenames keys={pantry.renameDismissed ?? []} />}

      {adding ? <AddFood tab={filter} onDone={() => setAdding(false)} basics={basics} zero={zero} /> : (
        <button type="button" className="btn btn--soft" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> {filter === 'haus' ? 'Zu „Immer im Haus“ hinzufügen' : filter === 'ohne' ? 'Zu „Ohne Nährwerte“ hinzufügen' : 'Produkt hinzufügen'}
        </button>
      )}
    </div>
  );
}

function FoodLine({ row, open, onToggle, products, basics, zero, restock, onTouch }: {
  row: FoodRow; open: boolean; onToggle: () => void; products: MyProduct[]; basics: string[]; zero: string[]; restock: RestockRule[];
  /** Zeile merken, damit sie nach dem Ausschalten nicht verschwindet */
  onTouch: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [addingSort, setAddingSort] = useState(false);
  const ps = row.products;
  const fav = ps.find((p) => p.favorite);
  const values = ps.length === 1 ? ps[0].per100g : fav ? fav.per100g : ps.length ? averageNutrients(ps.map((p) => p.per100g)) : row.table?.per100g;

  const save = (p: MyProduct) => {
    saveProducts(products.some((x) => x.id === p.id) ? products.map((x) => (x.id === p.id ? p : x)) : [...products, p]);
    setEditing(null);
    setAddingSort(false);
    toast('Gespeichert – alle Rezepte rechnen neu');
  };
  const remove = (p: MyProduct) => {
    if (!confirm(`„${p.name}“ entfernen? Die Rezepte rechnen dann wieder mit Richtwerten.`)) return;
    onTouch();
    saveProducts(products.filter((x) => x.id !== p.id));
  };
  // Umschalten mit „Rückgängig“ – die alte Liste zurück
  const toggleBasic = () => {
    onTouch();
    const before = basics;
    setPantryBasics(row.basic ? basics.filter((b) => b !== row.basic) : [...basics, row.ingredient]);
    toast(row.basic ? `„${row.ingredient}“ nicht mehr immer im Haus` : `„${row.ingredient}“ ist jetzt immer im Haus`, { label: 'Rückgängig', run: () => setPantryBasics(before) });
  };
  const toggleZero = () => {
    onTouch();
    const before = zero;
    setNoNutrition(row.zero ? zero.filter((z) => z !== row.zero) : [...zero, row.ingredient]);
    toast(row.zero ? `„${row.ingredient}“ zählt wieder mit – jetzt unter „Produkte“` : `„${row.ingredient}“ steht jetzt unter „Ohne Nährwerte“`, { label: 'Rückgängig', run: () => setNoNutrition(before) });
  };
  const rule = restock.find((r) => sameRule(r, { name: row.ingredient }));
  const [restockOpen, setRestockOpen] = useState(false);
  const toggleRestock = () => {
    onTouch();
    if (!rule) { setRestockOpen(true); return; }
    const before = restock;
    setPantryRestock(restock.filter((r) => r !== rule));
    setRestockOpen(false);
    toast(`„${row.ingredient}“ kommt nicht mehr von selbst auf die Liste`, { label: 'Rückgängig', run: () => setPantryRestock(before) });
  };
  const nothing = !ps.length && !row.basic && !row.zero && !rule;
  const zeroRow = !!row.zero;

  return (
    <li className={`foods__item${open ? ' is-open' : ''}`}>
      <button type="button" className="foods__head" onClick={onToggle} aria-expanded={open}>
        <span className="foods__name">
          {row.name}
          {ps.length === 1 && brandOf(ps[0]) && <span className="brand">{brandOf(ps[0])}</span>}
          {nothing && <span className="foods__sub">nichts festgelegt</span>}
          {!zeroRow && row.basic && <Icon name="home" size={14} />}
          {!zeroRow && rule && <span className="foods__restock" title={`Nachkaufen unter ${fmt(rule.below)} ${rule.unit}`}><Icon name="refresh" size={13} /></span>}
          {ps.length > 1 && <span className="foods__sub">{ps.length} Sorten{fav ? ` · ★ ${productLabel(fav)}` : ''}</span>}
        </span>
        <span className="foods__kcal">
          {zeroRow ? ''
            : values ? <>{ps.length > 1 && !fav ? 'Ø ' : ''}{Math.round(values.kcal)} kcal{!ps.length && <em> Tabelle</em>}</>
              : 'keine Werte'}
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {open && zeroRow && (
        <div className="foods__body">
          <p className="small muted">
            Zählt in Rezepten nicht mit und steht auf der Einkaufsliste unter „Basics“.
            {ps.length > 0 && ' Deine eigenen Werte bleiben gespeichert und zählen wieder, wenn du es zurückholst.'}
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn--soft btn--sm" onClick={toggleZero}><Icon name="refresh" size={16} /> Wieder mitzählen</button>
          </div>
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
            <ProductForm key={p.id} initial={p} onSave={save} onCancel={() => setEditing(null)} />
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
                <strong>{ps.length > 1 ? <>{nameOf(p)}{brandOf(p) && <span className="brand">{brandOf(p)}</span>}</> : 'Pro 100 g'}</strong>
                <span className="product__actions">
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p.id)}><Icon name="pencil" size={16} /></button>
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}><Icon name="trash" size={16} /></button>
                </span>
              </div>
              <span className="small"><strong>{fmt(p.per100g.kcal)} kcal</strong> · {macros(p.per100g)}</span>
              {p.packageAmount && <span className="small muted">Packung {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}</span>}
              {p.shelfDays && <span className="small muted">hält {p.shelfDays === 1 ? '1 Tag' : `${p.shelfDays} Tage`} ab Kauf</span>}
              {appliesTo(p).length > 0 && (
                <span className="small muted">
                  gilt für: {appliesTo(p).join(', ')}
                  {shownExcludes(p).length > 0 && <> · nicht für: {shownExcludes(p).map(cap).join(', ')}</>}
                </span>
              )}
            </div>
          ))}

          {addingSort
            ? <NutritionQuickForm ingredient={row.ingredient} onSave={save} onCancel={() => setAddingSort(false)} />
            : (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setAddingSort(true)}>
                <Icon name="plus" size={16} /> {ps.length ? 'Weitere Sorte' : 'Nährwerte hinzufügen'}
              </button>
            )}

          <div className="foods__flags">
            <button type="button" className={`favchip${row.basic ? ' is-on' : ''}`} aria-pressed={!!row.basic} onClick={toggleBasic}>
              <Icon name="home" size={14} /> Immer im Haus
            </button>
            <button type="button" className={`favchip${rule ? ' is-on' : ''}`} aria-pressed={!!rule} aria-expanded={restockOpen || !!rule} onClick={toggleRestock}>
              <Icon name="refresh" size={14} /> Nachkaufen
            </button>
            {/* verschiebt die Zeile – die eigenen Werte bleiben gespeichert */}
            <button type="button" className="favchip" onClick={toggleZero}>
              <Icon name="leaf" size={14} /> Zu „Ohne Nährwerte“
            </button>
          </div>
          {(rule || restockOpen) && (
            <RestockField ingredient={row.ingredient} rule={rule} restock={restock} products={ps} onCancel={() => setRestockOpen(false)} onSaved={() => setRestockOpen(false)} />
          )}
        </div>
      )}
    </li>
  );
}

const RESTOCK_UNITS: PantryUnit[] = ['Stück', 'Glas', 'g', 'ml'];

/**
 * „Nachkaufen, wenn weniger als 4 Stück da sind“ – ein Hinweis auf der Einkaufsliste, keine Menge.
 * Gespeichert wird beim Verlassen des Felds bzw. sofort bei der Einheit.
 */
function RestockField({ ingredient, rule, restock, products, onCancel, onSaved }: {
  ingredient: string; rule?: RestockRule; restock: RestockRule[]; products: MyProduct[]; onCancel: () => void; onSaved: () => void;
}) {
  const [below, setBelow] = useState(rule ? fmt(rule.below) : '');
  const [unit, setUnit] = useState<PantryUnit>(rule?.unit ?? 'Stück');
  const save = (b = below, u = unit) => {
    const n = Number(b.replace(',', '.'));
    if (!(n > 0)) return;
    if (rule && rule.below === n && rule.unit === u) return;
    const next: RestockRule = { name: rule?.name ?? ingredient, below: n, unit: u };
    setPantryRestock([...restock.filter((r) => !sameRule(r, next)), next]);
    if (!rule) toast(`„${ingredient}“ kommt unter ${fmt(n)} ${u} von selbst auf die Einkaufsliste`);
    onSaved();
  };
  // Stück vom Bon kommen oft als Gramm – ohne Packungsgröße kann Mashi dann nicht zählen
  const noPack = (unit === 'Stück' || unit === 'Glas') && !products.some((p) => p.packageAmount);
  return (
    <div className="restock">
      <label className="restock__row">
        <span className="small">Auf die Einkaufsliste, wenn weniger als</span>
        <span className="pantry-amount">
          <input inputMode="decimal" value={below} autoFocus={!rule} placeholder="z. B. 4" aria-label="Mindestbestand"
            onChange={(e) => setBelow(e.target.value)} onBlur={() => save()}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape' && !rule) onCancel(); }} />
          <select value={unit} aria-label="Einheit" onChange={(e) => { const u = e.target.value as PantryUnit; setUnit(u); save(below, u); }}>
            {RESTOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </span>
        <span className="small">da {below.trim() === '1' || below.trim() === '' ? 'ist' : 'sind'}.</span>
      </label>
      {noPack && <p className="small muted">Kommt es vom Kassenbon in Gramm, zählt Mashi die Stück über die Packungsgröße (vom Bon gelernt oder am Produkt).</p>}
    </div>
  );
}

/**
 * Neues Lebensmittel – passend zum offenen Tab:
 * Produkte → Name, dann Nährwerte (Foto, Open Food Facts, abtippen) oder Produkt mit Packung.
 * Immer im Haus / Ohne Nährwerte → nur der Name.
 */
function AddFood({ tab, onDone, basics, zero }: { tab: FoodFilter; onDone: () => void; basics: string[]; zero: string[] }) {
  const products = useProducts();
  const [name, setName] = useState('');
  const [step, setStep] = useState<'name' | 'werte' | 'produkt'>('name');
  /** gleich mit „Immer im Haus“ markieren – ohne dafür in den Tab wechseln zu müssen */
  const [basic, setBasic] = useState(false);
  const n = name.trim();
  const save = (p: MyProduct) => {
    saveProducts([...products, p]);
    if (basic && !basics.some((b) => normalizeName(b) === normalizeName(n))) setPantryBasics([...basics, n]);
    toast(`„${p.name}“ gespeichert${basic ? ' – immer im Haus' : ''} – alle Rezepte rechnen neu`);
    onDone();
  };
  const addName = () => {
    if (!n) return;
    if (tab === 'haus') { setPantryBasics([...basics, n]); toast(`„${n}“ ist jetzt immer im Haus`); }
    else { setNoNutrition([...zero, n]); toast(`„${n}“ steht jetzt unter „Ohne Nährwerte“`); }
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
        <button type="button" className={`favchip${basic ? ' is-on' : ''}`} aria-pressed={basic} onClick={() => setBasic(!basic)}>
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
