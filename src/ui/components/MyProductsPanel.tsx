import { useState } from 'react';
import { FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import type { NutritionResult } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { shelfDaysForFood } from '../../domain/shelfLife';
import { saveProducts, usePantry, useProducts } from '../../data/store';
import type { ScannedProduct } from '../../domain/nutrition/openFoodFacts';
import { barcodeLookup } from '../../services';
import { euro } from '../format';
import { BarcodeScanner } from './BarcodeScanner';
import { toast } from '../toast';
import { Icon } from './Icon';

const foodName = (id: string) => FOOD_CHOICES.find((f) => f.id === id)?.name ?? id;

/** Was Mashi ohne Angabe schätzt – vom ersetzten Lebensmittel (Mozzarella 7 Tage) */
function shelfEstimate(replaces: string[], custom: Parameters<typeof shelfDaysForFood>[2]): string {
  const id = replaces[0];
  const days = id ? shelfDaysForFood(id, FOOD_CHOICES.find((f) => f.id === id)?.kind, custom) : undefined;
  if (!id) return 'leer = Mashi schätzt';
  return days ? `leer = geschätzt ${days} Tage` : 'leer = hält lange';
}
const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/**
 * „Meine Produkte“: was du immer in einer bestimmten Sorte kaufst. Die Werte vom Etikett
 * ersetzen beim Rechnen die allgemeinen Richtwerte – in allen Rezepten.
 */
export function MyProductsPanel() {
  const products = useProducts();
  const [editing, setEditing] = useState<MyProduct | 'neu' | null>(null);

  const save = (p: MyProduct) => {
    const exists = products.some((x) => x.id === p.id);
    saveProducts(exists ? products.map((x) => (x.id === p.id ? p : x)) : [...products, p]);
    setEditing(null);
    toast('Gespeichert – alle Rezepte rechnen neu');
  };

  const remove = (p: MyProduct) => {
    if (confirm(`„${p.name}“ entfernen? Die Rezepte rechnen dann wieder mit Richtwerten.`)) {
      saveProducts(products.filter((x) => x.id !== p.id));
    }
  };

  return (
    <div className="panel stack">
      <p className="muted small">
        Was du immer in derselben Sorte kaufst. Mashi rechnet dann in allen Rezepten mit deinen Werten vom Etikett statt mit Richtwerten.
      </p>
      {products.length === 0 && !editing && <p className="small">Noch keine Produkte.</p>}

      {products.map((p) =>
        editing !== 'neu' && editing?.id === p.id ? (
          <ProductForm key={p.id} initial={p} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div key={p.id} className="product">
            <div className="product__main">
              <strong>{p.name}</strong>
              <span className="small muted">
                {fmt(p.per100g.kcal)} kcal · {fmt(p.per100g.protein)} g Eiweiß · {fmt(p.per100g.carbs)} g KH · {fmt(p.per100g.fat)} g Fett <em>pro 100 g</em>
              </span>
              {p.packageAmount && (
                <span className="small muted">
                  Packung: {fmt(p.packageAmount)} {p.packageUnit ?? 'g'}{p.packagePrice !== undefined && <> · {euro(p.packagePrice)}</>}
                </span>
              )}
              {p.shelfDays && <span className="small muted">hält {p.shelfDays === 1 ? '1 Tag' : `${p.shelfDays} Tage`} ab Kauf</span>}
              {p.ean && <span className="small muted">Barcode: <span className="ean">{p.ean}</span></span>}
              <span className="small">
                {p.replaces.length > 0 && <>ersetzt: {p.replaces.map(foodName).join(', ')}</>}
                {p.replaces.length > 0 && !!p.names?.length && ' · '}
                {!!p.names?.length && <>gilt für: {p.names.join(', ')}</>}
              </span>
            </div>
            <div className="row-gap">
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(p)}>Bearbeiten</button>
              <button className="iconbtn iconbtn--sm" aria-label={`${p.name} entfernen`} onClick={() => remove(p)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
        ),
      )}

      {editing === 'neu' ? (
        <ProductForm onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <button className="btn btn--soft" onClick={() => setEditing('neu')}>
          <Icon name="plus" size={18} /> Produkt hinzufügen
        </button>
      )}
    </div>
  );
}

/** Zahl vom Etikett: akzeptiert „3,4“ und „3.4“. */
function parseNum(s: string): number | undefined {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

const toField = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

type Values = { kcal: string; protein: string; carbs: string; fat: string };

/**
 * Zutaten, die Mashi in diesem Rezept nicht kennt – mit der Möglichkeit, sie direkt
 * als eigenes Produkt anzulegen (Werte vom Etikett). Danach rechnen alle Rezepte damit.
 */
export function UnknownIngredients({ n }: { n: NutritionResult }) {
  const products = useProducts();
  const [open, setOpen] = useState<string | null>(null);
  const unknown = [...new Set(n.items.filter((i) => i.status === 'unmatched').map((i) => i.name))];
  if (!unknown.length) return null;

  const save = (p: MyProduct) => {
    saveProducts([...products, p]);
    setOpen(null);
    toast(`„${p.name}“ angelegt – alle Rezepte rechnen neu`);
  };

  return (
    <div className="panel stack unknown-ings">
      <p className="small">
        <strong>{unknown.length === 1 ? '1 Zutat kennt' : `${unknown.length} Zutaten kennt`} Mashi noch nicht.</strong>{' '}
        Mit den Werten vom Etikett wird die Berechnung genauer – in jedem Rezept, das sie verwendet.
      </p>
      {unknown.map((name) =>
        open === name ? (
          <ProductForm key={name} initial={{ name, names: [normalizeName(name)], replaces: [] }} onSave={save} onCancel={() => setOpen(null)} />
        ) : (
          <div key={name} className="row-between">
            <span>{name}</span>
            <button className="btn btn--soft btn--sm" onClick={() => setOpen(name)}><Icon name="plus" size={16} /> Als Produkt anlegen</button>
          </div>
        ),
      )}
    </div>
  );
}

/** Formular für ein eigenes Produkt – auch aus der Bon-Prüfung heraus nutzbar. Mit Barcode-Scan (Open Food Facts). */
export function ProductForm({ initial, onSave, onCancel }: { initial?: Partial<MyProduct>; onSave: (p: MyProduct) => void; onCancel: () => void }) {
  const products = useProducts();
  const [name, setName] = useState(initial?.name ?? '');
  const [ean, setEan] = useState(initial?.ean);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Zusatzwerte vom Scan (Zucker, Salz …) – das Formular zeigt nur die vier Hauptwerte */
  const [extra, setExtra] = useState<Partial<MyProduct['per100g']>>({});
  /** Bei bestehenden Produkten: gefundene Werte als Angebot, nicht automatisch */
  const [offer, setOffer] = useState<ScannedProduct | null>(null);
  const [values, setValues] = useState<Values>({
    kcal: toField(initial?.per100g?.kcal),
    protein: toField(initial?.per100g?.protein),
    carbs: toField(initial?.per100g?.carbs),
    fat: toField(initial?.per100g?.fat),
  });
  const [replaces, setReplaces] = useState<string[]>(initial?.replaces ?? []);
  const [names, setNames] = useState<string[]>(initial?.names ?? []);
  const [packAmount, setPackAmount] = useState(toField(initial?.packageAmount));
  const [packUnit, setPackUnit] = useState<'g' | 'ml' | 'Stück'>(initial?.packageUnit ?? 'g');
  const [packPrice, setPackPrice] = useState(toField(initial?.packagePrice));
  const [shelf, setShelf] = useState(toField(initial?.shelfDays));
  const shelfCustom = usePantry().shelfDays;
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = search.trim().toLocaleLowerCase('de-DE');
  const hits = q
    ? FOOD_CHOICES.filter((f) => f.name.toLocaleLowerCase('de-DE').includes(q) && !replaces.includes(f.id)).slice(0, 10)
    : [];

  const submit = () => {
    const kcal = parseNum(values.kcal);
    const protein = parseNum(values.protein);
    const carbs = parseNum(values.carbs);
    const fat = parseNum(values.fat);
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) {
      return setError('Bitte alle vier Werte vom Etikett eintragen (pro 100 g).');
    }
    const amount = parseNum(packAmount);
    const price = parseNum(packPrice);
    if (price !== undefined && !amount) return setError('Für den Preis braucht Mashi die Packungsgröße.');
    const shelfDays = parseNum(shelf);
    if (shelf.trim() && (!shelfDays || shelfDays > 365 || !Number.isInteger(shelfDays))) return setError('Haltbarkeit bitte in ganzen Tagen (1 bis 365).');
    onSave({
      id: initial?.id ?? newId('p'),
      name: name.trim(),
      replaces,
      ...(names.length ? { names } : {}),
      // Zusatzwerte vom Etikett (Zucker, Salz …) behalten – das Formular zeigt nur die vier Hauptwerte
      per100g: { ...initial?.per100g, ...extra, kcal, protein, carbs, fat },
      ...(ean ? { ean } : {}),
      ...(amount ? { packageAmount: amount, packageUnit: packUnit } : {}),
      ...(amount && price !== undefined ? { packagePrice: price } : {}),
      ...(shelfDays ? { shelfDays } : {}),
      updatedAt: new Date().toISOString(),
    });
  };

  const numField = (key: keyof Values, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input inputMode="decimal" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
    </label>
  );

  /** Barcode gelesen → bei Open Food Facts nachschlagen und das Formular vorausfüllen */
  /** Werte von Open Food Facts ins Formular übernehmen (nur auf Wunsch bei bestehenden Produkten) */
  const applyScan = (found: ScannedProduct) => {
    const { kcal, protein, carbs, fat, ...rest } = found.per100g;
    setName(found.name);
    setValues({ kcal: toField(kcal), protein: toField(protein), carbs: toField(carbs), fat: toField(fat) });
    setExtra(rest);
    if (found.packageAmount) {
      setPackAmount(toField(found.packageAmount));
      setPackUnit(found.packageUnit ?? 'g');
    }
    setOffer(null);
    setScanNote('Werte von Open Food Facts (von der Community gepflegt) – bitte kurz mit dem Etikett vergleichen.');
  };

  /**
   * Barcode gelesen. Neues Produkt: bei Open Food Facts nachschlagen und vorausfüllen.
   * Bestehendes Produkt: NUR den Barcode merken – deine Werte vom Etikett bleiben, übernehmen nur auf Wunsch.
   */
  const onCode = async (code: string) => {
    setScanning(false);
    const known = products.find((p) => p.ean === code && p.id !== initial?.id);
    if (known) {
      setScanNote(`Diesen Barcode hast du schon: „${known.name}“.`);
      return;
    }
    setEan(code);
    const existing = !!initial?.per100g;
    setScanNote(existing ? 'Barcode hinterlegt – deine Werte bleiben, wie sie sind.' : 'Suche bei Open Food Facts …');
    try {
      const found = await barcodeLookup.find(code);
      if (!found) {
        if (!existing) setScanNote('Bei Open Food Facts nicht gefunden – bitte die Werte vom Etikett abtippen. Der Barcode wird gemerkt.');
        return;
      }
      if (existing) setOffer(found);
      else applyScan(found);
    } catch {
      if (!existing) setScanNote('Open Food Facts ist gerade nicht erreichbar (offline?). Du kannst die Werte auch abtippen.');
    }
  };

  return (
    <div className="product-form stack">
      {ean ? (
        <div className="row-between small">
          <span>Barcode: <strong className="ean">{ean}</strong></span>
          <span className="row-gap">
            <button type="button" className="link" onClick={() => setScanning(true)}>Neu scannen</button>
            <button type="button" className="link link--muted" onClick={() => { setEan(undefined); setOffer(null); setScanNote(null); }}>Entfernen</button>
          </span>
        </div>
      ) : (
        <button type="button" className="btn btn--soft" onClick={() => setScanning(true)}>
          <Icon name="camera" size={18} /> {initial?.per100g ? 'Barcode hinterlegen' : 'Barcode scannen'}
        </button>
      )}
      {scanNote && <p className="scan-note" role="status">{scanNote}</p>}
      {offer && (
        <div className="scan-note">
          <p>Open Food Facts kennt das Produkt: <strong>{offer.name}</strong> · {fmt(offer.per100g.kcal)} kcal · {fmt(offer.per100g.protein)} g Eiweiß je 100 g.</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => applyScan(offer)}>Werte von Open Food Facts übernehmen</button>
        </div>
      )}
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
      <label className="field">
        <span>Name (wie auf der Packung)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Milch 0,1 % (Hausmarke)" />
      </label>
      <p className="small muted">Werte vom Etikett, pro 100 g bzw. 100 ml:</p>
      <div className="row-2">{numField('kcal', 'kcal')}{numField('protein', 'Eiweiß (g)')}</div>
      <div className="row-2">{numField('carbs', 'Kohlenhydrate (g)')}{numField('fat', 'Fett (g)')}</div>

      <p className="small muted">Packung (optional) – füllt beim Kassenbon die Menge aus und rechnet Kosten:</p>
      <div className="row-2">
        <label className="field"><span>Packungsgröße</span>
          <span className="pantry-amount">
            <input inputMode="decimal" value={packAmount} onChange={(e) => setPackAmount(e.target.value)} placeholder="z. B. 125" />
            <select value={packUnit} onChange={(e) => setPackUnit(e.target.value as 'g' | 'ml' | 'Stück')} aria-label="Einheit">
              <option value="g">g</option><option value="ml">ml</option><option value="Stück">Stück</option>
            </select>
          </span>
        </label>
        <label className="field"><span>Preis je Packung (€)</span>
          <input inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} placeholder="kommt sonst vom Bon" />
        </label>
      </div>
      <label className="field"><span>Hält ab Kauf (Tage, optional)</span>
        <input inputMode="numeric" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder={shelfEstimate(replaces, shelfCustom)} />
      </label>

      {names.length > 0 && (
        <div className="stack">
          <span className="small muted">Gilt für Zutaten namens:</span>
          <div className="chips">
            {names.map((x) => (
              <button key={x} type="button" className="afilter" onClick={() => setNames(names.filter((y) => y !== x))} aria-label={`${x} entfernen`}>
                {x} <Icon name="close" size={14} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        <span className="small muted">{names.length ? 'Ersetzt außerdem (optional):' : 'Ersetzt in allen Rezepten (optional, z. B. „Milch“ für deine 0,1-%-Milch):'}</span>
        {replaces.length > 0 && (
          <div className="chips">
            {replaces.map((id) => (
              <button key={id} type="button" className="afilter" onClick={() => setReplaces(replaces.filter((x) => x !== id))} aria-label={`${foodName(id)} entfernen`}>
                {foodName(id)} <Icon name="close" size={14} />
              </button>
            ))}
          </div>
        )}
        <label className="search">
          <Icon name="search" size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lebensmittel suchen, z. B. Milch" aria-label="Lebensmittel suchen" />
          {search && (
            <button type="button" className="iconbtn iconbtn--sm search__clear" onClick={() => setSearch('')} aria-label="Suche leeren">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        {hits.length > 0 && (
          <div className="chips">
            {hits.map((f) => (
              <button key={f.id} type="button" className="chip chip--sm" onClick={() => { setReplaces([...replaces, f.id]); setSearch(''); }}>
                <Icon name="plus" size={14} /> {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-gap">
        <button className="btn btn--primary" onClick={submit}>Speichern</button>
        <button className="btn btn--ghost" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
