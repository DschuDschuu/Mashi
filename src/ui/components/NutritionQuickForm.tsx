import { useState } from 'react';
import { parseNutritionLabel } from '../../domain/nutrition/labelOcr';
import { normalizeName } from '../../domain/nutrition/localFoods';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import type { ScannedProduct } from '../../domain/nutrition/openFoodFacts';
import type { Nutrients } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { useProducts } from '../../data/store';
import { barcodeLookup } from '../../services';
import { recognizeText } from '../ocr';
import { BarcodeScanner } from './BarcodeScanner';
import { ChipSelect } from './Controls';
import { Icon } from './Icon';
import { parseNum, toField, type Values } from './productFields';

const CORE = ['kcal', 'protein', 'carbs', 'fat'] as const;
const LABEL: Record<(typeof CORE)[number], string> = { kcal: 'kcal', protein: 'Eiweiß (g)', carbs: 'Kohlenhydrate (g)', fat: 'Fett (g)' };

/**
 * Nährwerte für eine Zutat hinterlegen – ohne das große Produktformular.
 * Drei Wege: Nährwerttabelle fotografieren, bei Open Food Facts suchen (Name oder Barcode), abtippen.
 * Die Werte stehen immer zur Prüfung da. Danach die Wahl: nur Nährwerte für diesen Namen
 * („Eigene Nährwerte“) oder ein richtiges „Mein Produkt“ (Barcode, Packung – wird beim Scan/Bon erkannt).
 */
export function NutritionQuickForm({ ingredient, onSave, onCancel }: {
  ingredient: string;
  onSave: (p: MyProduct) => void;
  onCancel: () => void;
}) {
  const products = useProducts();
  const [values, setValues] = useState<Values>({ kcal: '', protein: '', carbs: '', fat: '' });
  /** Zusatzwerte (Zucker, Salz …) – gespeichert, aber nicht im Formular */
  const [extra, setExtra] = useState<Partial<Nutrients>>({});
  /** Treffer von Open Food Facts – liefert Barcode, Name und Packung fürs „Mein Produkt“ */
  const [source, setSource] = useState<ScannedProduct | null>(null);
  const [way, setWay] = useState<'suche' | null>(null);
  const [query, setQuery] = useState(ingredient);
  const [hits, setHits] = useState<ScannedProduct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveAs, setSaveAs] = useState<'werte' | 'produkt'>('werte');
  const [productName, setProductName] = useState(ingredient);

  const take = (found: ScannedProduct, text: string) => {
    const { kcal, protein, carbs, fat, ...rest } = found.per100g;
    setValues({ kcal: toField(kcal), protein: toField(protein), carbs: toField(carbs), fat: toField(fat) });
    setExtra(rest);
    setSource(found);
    setProductName(found.name);
    setHits(null);
    setWay(null);
    setNote(text);
  };

  const readLabel = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('Lese Etikett … 0 %');
    try {
      const text = await recognizeText(file, (p) => setBusy(`Lese Etikett … ${Math.round(p * 100)} %`));
      const { per100g, missing } = parseNutritionLabel(text);
      const { kcal, protein, carbs, fat, ...rest } = per100g;
      // Erkanntes eintragen, schon Getipptes nicht mit „leer“ überschreiben
      setValues((v) => ({
        kcal: kcal !== undefined ? toField(kcal) : v.kcal,
        protein: protein !== undefined ? toField(protein) : v.protein,
        carbs: carbs !== undefined ? toField(carbs) : v.carbs,
        fat: fat !== undefined ? toField(fat) : v.fat,
      }));
      setExtra(rest);
      setNote(missing.length === 4
        ? 'Auf dem Foto war keine Nährwerttabelle zu lesen. Tipp: nah und gerade fotografieren – oder die Werte abtippen.'
        : missing.length
          ? `Vom Etikett gelesen – ${missing.map((k) => LABEL[k].replace(' (g)', '')).join(', ')} bitte noch abtippen. Kurz mit dem Etikett vergleichen.`
          : 'Vom Etikett gelesen – bitte kurz vergleichen, die Texterkennung verliest sich manchmal.');
    } catch (e) {
      console.error('Mashi: Etikett ließ sich nicht lesen', e);
      setError('Das Foto ließ sich nicht lesen. Beim ersten Mal braucht die Texterkennung Internet.');
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setBusy('Suche bei Open Food Facts …');
    try {
      setHits(await barcodeLookup.search(q));
    } catch {
      setError('Open Food Facts ist gerade nicht erreichbar (offline?). Du kannst die Werte auch abtippen.');
    } finally {
      setBusy(null);
    }
  };

  const onCode = async (code: string) => {
    setScanning(false);
    setError(null);
    setBusy('Suche bei Open Food Facts …');
    try {
      const found = await barcodeLookup.find(code);
      if (found) {
        take(found, 'Werte von Open Food Facts (von der Community gepflegt) – bitte kurz mit dem Etikett vergleichen.');
        setSaveAs('produkt'); // eine bestimmte Packung – als Produkt wiedererkennbar
      } else {
        setSource({ ean: code, name: ingredient, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
        setNote('Bei Open Food Facts nicht gefunden – bitte die Werte vom Etikett abtippen. Der Barcode wird gemerkt, wenn du es als Produkt speicherst.');
      }
    } catch {
      setError('Open Food Facts ist gerade nicht erreichbar (offline?). Du kannst die Werte auch abtippen.');
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    const [kcal, protein, carbs, fat] = CORE.map((k) => parseNum(values[k]));
    if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) {
      return setError('Bitte alle vier Werte eintragen (pro 100 g bzw. 100 ml).');
    }
    const asProduct = saveAs === 'produkt';
    const ean = asProduct && source?.ean && !products.some((p) => p.ean === source.ean) ? source.ean : undefined;
    onSave({
      id: newId('p'),
      name: asProduct ? productName.trim() || ingredient : ingredient,
      replaces: [],
      names: [normalizeName(ingredient)],
      per100g: { ...extra, kcal, protein, carbs, fat },
      ...(asProduct
        ? { ...(ean ? { ean } : {}), ...(source?.packageAmount ? { packageAmount: source.packageAmount, packageUnit: source.packageUnit } : {}) }
        : { generic: true }),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="product-form stack quicknut">
      <strong>Nährwerte für „{ingredient}“</strong>
      <div className="quicknut__ways">
        <label className={`btn btn--soft btn--sm${busy ? ' is-disabled' : ''}`}>
          <Icon name="camera" size={16} /> Etikett fotografieren
          <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { void readLabel(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" className={`btn btn--soft btn--sm${way === 'suche' ? ' is-on' : ''}`} disabled={!!busy} onClick={() => setWay(way === 'suche' ? null : 'suche')}>
          <Icon name="search" size={16} /> Open Food Facts
        </button>
        <button type="button" className="btn btn--soft btn--sm" disabled={!!busy} onClick={() => setScanning(true)}>
          <Icon name="camera" size={16} /> Barcode
        </button>
      </div>
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}

      {way === 'suche' && (
        <div className="stack stack--tight">
          <div className="quicknut__search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()}
              aria-label="Bei Open Food Facts suchen" placeholder="z. B. Kimchi" />
            <button type="button" className="btn btn--primary btn--sm" disabled={!query.trim() || !!busy} onClick={() => void search()}>Suchen</button>
          </div>
          {hits && hits.length === 0 && <p className="small muted">Nichts mit vollständigen Nährwerten gefunden. Anderes Wort probieren – oder abtippen.</p>}
          {hits && hits.length > 0 && (
            <ul className="quicknut__hits">
              {hits.map((h) => (
                <li key={h.ean}>
                  <button type="button" onClick={() => take(h, 'Werte von Open Food Facts (von der Community gepflegt) – passt die Sorte? Sonst anderen Treffer wählen.')}>
                    <span>{h.name}</span>
                    <span className="small muted">{Math.round(h.per100g.kcal)} kcal · {toField(h.per100g.protein)} g Eiweiß</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {busy && <p className="small muted" role="status">{busy}</p>}
      {note && <p className="scan-note" role="status">{note}</p>}

      <p className="small muted">Pro 100 g bzw. 100 ml – oder einfach abtippen:</p>
      <div className="row-2">
        {CORE.slice(0, 2).map((k) => field(k))}
      </div>
      <div className="row-2">
        {CORE.slice(2).map((k) => field(k))}
      </div>

      <div className="stack stack--tight">
        <span className="small muted">Speichern als</span>
        <ChipSelect single options={[
          { value: 'werte', label: `Nur Nährwerte für „${ingredient}“` },
          { value: 'produkt', label: 'Mein Produkt' },
        ]} selected={[saveAs]} onChange={([v]) => v && setSaveAs(v as 'werte' | 'produkt')} />
        <p className="small muted">
          {saveAs === 'werte'
            ? 'Gilt für jede Zutat namens „' + ingredient + '“, egal welche Marke.'
            : 'Eine bestimmte Packung: wird beim Barcode-Scan und auf dem Kassenbon wiedererkannt. Packung und Preis kannst du später unter „Meine Produkte“ ergänzen.'}
        </p>
        {saveAs === 'produkt' && (
          <label className="field"><span>Name (wie auf der Packung)</span>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} />
          </label>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-gap">
        <button type="button" className="btn btn--primary" onClick={submit}>Speichern</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );

  function field(k: (typeof CORE)[number]) {
    return (
      <label key={k} className="field">
        <span>{LABEL[k]}</span>
        <input inputMode="decimal" value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
      </label>
    );
  }
}
