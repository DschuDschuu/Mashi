import { useState } from 'react';
import { appliesAliases, FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';
import { fatGroupOf, fatLevel } from '../../domain/nutrition/fatLevels';
import { brandOf, nameOf, type MyProduct } from '../../domain/nutrition/myProducts';
import type { NutritionResult } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { shelfDaysForFood } from '../../domain/shelfLife';
import { saveProducts, usePantry, useProducts } from '../../data/store';
import type { ScannedProduct } from '../../domain/nutrition/openFoodFacts';
import { barcodeLookup } from '../../services';
import { BarcodeScanner } from './BarcodeScanner';
import { toast } from '../toast';
import { Icon } from './Icon';
import { NutritionQuickForm } from './NutritionQuickForm';
import { BrandNames } from './BrandNames';
import { parseNum, toField, type Values } from './productFields';

/** „entrahmte milch“ → „Entrahmte Milch“ (gespeichert wird klein) – wie die Namen der Tabelle */
const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('de-DE'));

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
        Mit ihren Nährwerten – vom Etikett-Foto, aus Open Food Facts oder abgetippt – wird die Berechnung genauer, in jedem Rezept.
      </p>
      {unknown.map((name) =>
        open === name ? (
          <NutritionQuickForm key={name} ingredient={name} onSave={save} onCancel={() => setOpen(null)} />
        ) : (
          <div key={name} className="row-between">
            <span>{name}</span>
            <button className="btn btn--soft btn--sm" onClick={() => setOpen(name)}><Icon name="plus" size={16} /> Nährwerte hinzufügen</button>
          </div>
        ),
      )}
    </div>
  );
}

/** Formular für ein eigenes Produkt – auch aus der Bon-Prüfung heraus nutzbar. Mit Barcode-Scan (Open Food Facts). */
export function ProductForm({ initial, onSave, onCancel }: { initial?: Partial<MyProduct>; onSave: (p: MyProduct) => void; onCancel: () => void }) {
  const products = useProducts();
  // Ältere Namen mit Marke in Klammern: getrennt anzeigen – gespeichert wird es beim Speichern
  const [name, setName] = useState(initial?.name ? nameOf({ name: initial.name, brand: initial.brand }) : '');
  const [brand, setBrand] = useState(initial?.name ? brandOf({ name: initial.name, brand: initial.brand }) ?? '' : '');
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
  const [excludes, setExcludes] = useState<string[]>(initial?.excludes ?? []);
  // Milch/Joghurt/Quark: welche anderen Stufen rechnen mit der Tabelle? („Milch 1,5 % und Milch 3,5 %“)
  const group = replaces.map(fatGroupOf).find(Boolean);
  const mine = fatLevel(name)?.label ?? group?.plain;
  const otherLevels = group ? group.ids.map((id) => FOOD_CHOICES.find((c) => c.id === id)).filter(Boolean)
    .map((c) => fatLevel(c!.name)?.label ?? group.plain).filter((l) => l !== mine).join(' und ') : '';
  /** Eine Schreibweise aus- oder wieder einschließen; sind alle aus, fällt der ganze Eintrag weg */
  const toggleAlias = (id: string, alias: string) => {
    const next = excludes.includes(alias) ? excludes.filter((x) => x !== alias) : [...excludes, alias];
    const all = appliesAliases(name || initial?.name || '', id);
    if (all.every((al) => next.includes(al))) {
      setReplaces(replaces.filter((x) => x !== id));
      setExcludes(next.filter((x) => !all.includes(x)));
    } else setExcludes(next);
  };
  const [packAmount, setPackAmount] = useState(toField(initial?.packageAmount));
  const [packUnit, setPackUnit] = useState<'g' | 'ml' | 'Stück'>(initial?.packageUnit ?? 'g');
  const [packPrice, setPackPrice] = useState(toField(initial?.packagePrice));
  const [shelf, setShelf] = useState(toField(initial?.shelfDays));
  const shelfCustom = usePantry().shelfDays;
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = search.trim().toLocaleLowerCase('de-DE');
  // eigener Zutatenname – nur, wenn die Tabelle ihn nicht genau so kennt und er noch nicht dabei ist
  const freeName = q && !FOOD_CHOICES.some((f) => normalizeName(f.name) === normalizeName(q)) && !names.includes(normalizeName(q)) ? normalizeName(q) : '';
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
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      replaces,
      ...(names.length ? { names } : {}),
      // nur Ausnahmen, die zu einem ersetzten Eintrag gehören
      // nur Ausnahmen, die sichtbar sind – überflüssige (z. B. „Vollmilch“ beim 0,1-%-Produkt) fallen still weg
      ...(() => { const ex = excludes.filter((x) => replaces.some((id) => appliesAliases(name, id).includes(x))); return ex.length ? { excludes: ex } : {}; })(),
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
    if (found.brand) setBrand(found.brand);
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
      <div className="row-2">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Milch 0,1 %" />
        </label>
        <label className="field">
          <span>Marke (optional)</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} list="brand-names" placeholder="z. B. Milbona" />
        </label>
      </div>
      <BrandNames />
      <p className="small muted">Werte vom Etikett, pro 100 g bzw. 100 ml:</p>
      <div className="row-2">{numField('kcal', 'kcal')}{numField('carbs', 'Kohlenhydrate (g)')}</div>
      <div className="row-2">{numField('protein', 'Eiweiß (g)')}{numField('fat', 'Fett (g)')}</div>

      <p className="small muted">Packung (optional) – füllt beim Kassenbon die Menge aus und rechnet Kosten:</p>
      <div className="row-2 product-form__pack">
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

      {/* EIN Feld: Tabellen-Einträge (mit allen Schreibweisen als Chips) und freie Namen */}
      <div className="stack">
        <span className="small muted">Gilt für diese Zutaten in deinen Rezepten:</span>
        {(replaces.length > 0 || names.length > 0) && (
          <div className="chips giltfuer">
            {replaces.flatMap((id) => appliesAliases(name || initial?.name || '', id).map((al) => {
              const off = excludes.includes(al);
              return (
                <button key={id + al} type="button" className={`afilter${off ? ' is-off' : ''}`}
                  aria-label={off ? `${cap(al)} wieder einschließen` : `${cap(al)} ausnehmen`}
                  onClick={() => toggleAlias(id, al)}>
                  {cap(al)} <Icon name={off ? 'refresh' : 'close'} size={14} />
                </button>
              );
            }))}
            {names.map((x) => (
              <button key={x} type="button" className="afilter" onClick={() => setNames(names.filter((y) => y !== x))} aria-label={`${cap(x)} entfernen`}>
                {cap(x)} <Icon name="close" size={14} />
              </button>
            ))}
          </div>
        )}
        {replaces.some((id) => appliesAliases(name, id).some((a) => excludes.includes(a))) && <p className="small muted">Durchgestrichen = ausgenommen: dort rechnet Mashi mit dem Richtwert. Antippen holt es zurück.</p>}
        {otherLevels && <p className="small muted">{otherLevels} rechnen mit der Tabelle – für eigene Werte leg dafür ein eigenes Produkt an (z. B. „{otherLevels.split(' und ')[0]}“).</p>}
        <label className="search">
          <Icon name="search" size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zutat hinzufügen, z. B. Milch" aria-label="Zutat hinzufügen" />
          {search && (
            <button type="button" className="iconbtn iconbtn--sm search__clear" onClick={() => setSearch('')} aria-label="Suche leeren">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        {(hits.length > 0 || freeName) && (
          <div className="chips">
            {hits.map((f) => (
              <button key={f.id} type="button" className="chip chip--sm" onClick={() => { setReplaces([...replaces, f.id]); setSearch(''); }}>
                <Icon name="plus" size={14} /> {f.name}
              </button>
            ))}
            {/* Kennt die Tabelle den Namen nicht genau: als eigene Zutat übernehmen („Kimchi-Paste“) */}
            {freeName && (
              <button type="button" className="chip chip--sm" onClick={() => { setNames([...names, freeName]); setSearch(''); }}>
                <Icon name="plus" size={14} /> „{search.trim()}“ als Zutat
              </button>
            )}
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
