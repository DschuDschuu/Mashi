import { useMemo, useState } from 'react';
import { DEFAULT_BASICS } from '../../domain/mealplan';
import { buildFoodList, matchesFilter, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import { DEFAULT_NO_NUTRITION } from '../../domain/nutrition/noNutrition';
import { averageNutrients } from '../../domain/nutrition/variants';
import type { Nutrients } from '../../domain/nutrition/types';
import { saveProducts, setFavoriteVariant, setNoNutrition, setPantryBasics, usePantry, useProducts, useRecipes } from '../../data/store';
import { currentContent } from '../../domain/recipe';
import { foodTable } from '../../services';
import { euro } from '../format';
import { toast } from '../toast';
import { useSwipe } from '../useSwipe';
import { Icon } from './Icon';
import { ProductForm } from './MyProductsPanel';
import { NutritionQuickForm } from './NutritionQuickForm';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const foodName = (id: string) => FOOD_CHOICES.find((f) => f.id === id)?.name ?? id;
/** Tabs: Schlüssel, kurzer Name, voller Name (für Screenreader) – Reihenfolge = Wischrichtung */
const TABS = [['alle', 'Alle', 'Alle'], ['produkte', 'Produkte', 'Meine Produkte'], ['haus', 'Im Haus', 'Immer im Haus'], ['ohne', 'Ohne', 'Ohne Nährwerte']] as const;

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
  const rows = useMemo(() => buildFoodList(products, basics, zero, foodTable, known, touched), [products, basics, zero, known, touched]);
  const [filter, setFilter] = useState<FoodFilter>('alle');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = rows.filter((r) => matchesFilter(r, filter));
  // Wischen wie im Rezept: nach links = nächster Tab, nach rechts = vorheriger (am Rand bleibt es stehen)
  const step = (dir: 1 | -1) => {
    const i = TABS.findIndex(([f]) => f === filter) + dir;
    if (i >= 0 && i < TABS.length) setFilter(TABS[i][0]);
  };
  const swipe = useSwipe(() => step(1), () => step(-1));
  const count = (f: FoodFilter) => rows.filter((r) => matchesFilter(r, f)).length;

  return (
    <div className="stack">
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
      <div className="stack" role="tabpanel" {...swipe}>
      <p className="small muted">
        {filter === 'produkte' ? 'Mit deinen eigenen Werten – vom Etikett, aus Open Food Facts oder abgetippt, mit oder ohne Packung.'
          : filter === 'haus' ? 'Steht auf der Einkaufsliste unter „Basics“ und wird bei Rezepten nie als „fehlt“ gemeldet.'
          : filter === 'ohne' ? 'Gewürze & Co., die in Rezepten wie Salz nicht mitzählen.'
            : 'Alles, was du selbst über Zutaten festgelegt hast. Antippen für Details.'}
      </p>

      {shown.length === 0 && <p className="small">Hier ist noch nichts.</p>}
      <ul className="foods">
        {shown.map((r) => (
          <FoodLine key={r.key} row={r} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)}
            products={products} basics={basics} zero={zero} onTouch={() => touch(r.ingredient)} />
        ))}
      </ul>

      </div>

      {adding ? <AddFood onDone={() => setAdding(false)} basics={basics} zero={zero} /> : (
        <button type="button" className="btn btn--soft" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Lebensmittel hinzufügen
        </button>
      )}
    </div>
  );
}

function FoodLine({ row, open, onToggle, products, basics, zero, onTouch }: {
  row: FoodRow; open: boolean; onToggle: () => void; products: MyProduct[]; basics: string[]; zero: string[];
  /** Zeile merken, damit sie nach dem Ausschalten nicht verschwindet */
  onTouch: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [addingSort, setAddingSort] = useState(false);
  const ps = row.products;
  const fav = ps.find((p) => p.favorite);
  const values = ps.length === 1 ? ps[0].per100g : fav ? fav.per100g : ps.length ? averageNutrients(ps.map((p) => p.per100g)) : row.table?.per100g;
  const hasPack = ps.some((p) => p.ean || p.packageAmount);

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
    toast(row.zero ? `„${row.ingredient}“ zählt wieder mit` : `„${row.ingredient}“ zählt in Rezepten nicht mehr mit`, { label: 'Rückgängig', run: () => setNoNutrition(before) });
  };
  const nothing = !ps.length && !row.basic && !row.zero;

  return (
    <li className={`foods__item${open ? ' is-open' : ''}`}>
      <button type="button" className="foods__head" onClick={onToggle} aria-expanded={open}>
        <span className="foods__name">
          {row.name}
          {nothing && <span className="foods__sub">nichts festgelegt</span>}
          {row.basic && <Icon name="home" size={14} />}
          {row.zero && <Icon name="leaf" size={14} />}
          {hasPack && <Icon name="bookmark" size={14} />}
          {ps.length > 1 && <span className="foods__sub">{ps.length} Sorten{fav ? ` · ★ ${fav.name}` : ''}</span>}
        </span>
        <span className="foods__kcal">
          {row.zero && !ps.length ? 'ohne Nährwerte'
            : values ? <>{ps.length > 1 && !fav ? 'Ø ' : ''}{Math.round(values.kcal)} kcal{!ps.length && <em> Tabelle</em>}</>
              : 'keine Werte'}
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {open && (
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
                    onClick={() => { setFavoriteVariant(ps, p.favorite ? null : p.id); toast(p.favorite ? 'Favorit zurückgenommen – Rezepte rechnen wieder mit dem Durchschnitt' : `★ „${p.name}“ ist dein Favorit`); }}>
                    <Icon name="star" size={18} filled={!!p.favorite} />
                  </button>
                )}
                <strong>{ps.length > 1 ? p.name : 'Pro 100 g'}</strong>
                <span className="product__actions">
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p.id)}><Icon name="pencil" size={16} /></button>
                  <button className="iconbtn iconbtn--sm" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}><Icon name="trash" size={16} /></button>
                </span>
              </div>
              <span className="small"><strong>{fmt(p.per100g.kcal)} kcal</strong> · {macros(p.per100g)}</span>
              {p.packageAmount && <span className="small muted">Packung {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}</span>}
              {p.shelfDays && <span className="small muted">hält {p.shelfDays === 1 ? '1 Tag' : `${p.shelfDays} Tage`} ab Kauf</span>}
              {p.ean && <span className="small muted">Barcode <span className="ean">{p.ean}</span></span>}
              {(p.replaces.length > 0 || !!p.names?.length) && (
                <span className="small muted">
                  {p.replaces.length > 0 && <>ersetzt: {p.replaces.map(foodName).join(', ')}</>}
                  {p.replaces.length > 0 && !!p.names?.length && ' · '}
                  {!!p.names?.length && <>gilt für: {p.names.join(', ')}</>}
                </span>
              )}
            </div>
          ))}

          {addingSort
            ? <NutritionQuickForm ingredient={row.ingredient} onSave={save} onCancel={() => setAddingSort(false)} />
            : (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setAddingSort(true)}>
                <Icon name="plus" size={16} /> {ps.length ? 'Weitere Sorte' : 'Eigene Nährwerte'}
              </button>
            )}

          <div className="foods__flags">
            <button type="button" className={`favchip${row.basic ? ' is-on' : ''}`} aria-pressed={!!row.basic} onClick={toggleBasic}>
              <Icon name="home" size={14} /> Immer im Haus
            </button>
            <button type="button" className={`favchip${row.zero ? ' is-on' : ''}`} aria-pressed={!!row.zero} onClick={toggleZero}>
              <Icon name="leaf" size={14} /> Ohne Nährwerte
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Neues Lebensmittel: erst der Name, dann was du festlegen willst */
function AddFood({ onDone, basics, zero }: { onDone: () => void; basics: string[]; zero: string[] }) {
  const products = useProducts();
  const [name, setName] = useState('');
  const [step, setStep] = useState<'name' | 'werte' | 'produkt'>('name');
  const n = name.trim();
  const save = (p: MyProduct) => {
    saveProducts([...products, p]);
    toast(`„${p.name}“ gespeichert – alle Rezepte rechnen neu`);
    onDone();
  };
  if (step === 'werte') return <NutritionQuickForm ingredient={n} onSave={save} onCancel={onDone} />;
  if (step === 'produkt') return <ProductForm initial={{ name: n, names: [normalizeName(n)], replaces: [] }} onSave={save} onCancel={onDone} />;
  return (
    <div className="panel stack">
      <label className="field"><span>Welche Zutat?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="z. B. Grünes Pesto" autoFocus />
      </label>
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" disabled={!n} onClick={() => setStep('werte')}>Nährwerte hinzufügen</button>
        <button type="button" className="btn btn--soft btn--sm" disabled={!n} onClick={() => setStep('produkt')}>Produkt mit Packung</button>
      </div>
      <div className="row-gap">
        <button type="button" className="favchip" disabled={!n} onClick={() => { setPantryBasics([...basics, n]); toast(`„${n}“ ist jetzt immer im Haus`); onDone(); }}>
          <Icon name="home" size={14} /> Nur „Immer im Haus“
        </button>
        <button type="button" className="favchip" disabled={!n} onClick={() => { setNoNutrition([...zero, n]); toast(`„${n}“ zählt in Rezepten nicht mehr mit`); onDone(); }}>
          <Icon name="leaf" size={14} /> Nur „Ohne Nährwerte“
        </button>
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>Abbrechen</button>
    </div>
  );
}
