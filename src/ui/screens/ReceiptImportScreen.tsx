import { useEffect, useRef, useState } from 'react';
import { proposeImport, type ImportRow, type PantryUnit } from '../../domain/pantry';
import { parseReceipt, parseReceiptDate } from '../../domain/receipt';
import { parseSavings } from '../../domain/savings';
import { formatAmount } from '../../domain/scaling';
import { normalizeName } from '../../domain/nutrition/localFoods';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import { importReceipt, saveProducts, usePantry, useProducts } from '../../data/store';
import { ProductForm } from '../components/MyProductsPanel';
import { takeSharedReceipt } from '../../pwa';
import { navigate } from '../../router';
import { Icon } from '../components/Icon';
import { IngredientNames } from '../components/IngredientNames';
import { TopBar } from '../components/TopBar';
import { recognizeText } from '../ocr';
import { euro } from '../format';
import { toast } from '../toast';
import { usePricing } from '../useCosts';
import { parseAmount } from './PantryScreen';

type Stage = 'pick' | 'reading' | 'review';
/** Eine Zeile beim Prüfen – die Menge als Text, damit „0,5“ beim Tippen nicht umspringt. */
type Row = ImportRow & { amountText: string };

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück'];

/** Packungen einer Zeile – lose Ware zählt als eine (alles oder nichts einfrieren). */
const packs = (r: ImportRow) => (r.line.weightKg === undefined ? r.line.count : 1);

/** Gewicht loser Ware steht auf dem Bon (Gesamtmenge) – sonst fragt Mashi „je Stück/Packung“. */
const perPiece = (r: ImportRow) => r.line.weightKg === undefined && r.line.count > 1;

function toRow(r: ImportRow): Row {
  const shown = r.amount === undefined ? undefined : perPiece(r) && r.unit !== 'Stück' ? r.amount / r.line.count : r.amount;
  return { ...r, amountText: shown === undefined ? '' : String(shown).replace('.', ',') };
}

/** Packungsgröße, die ein neues Produkt aus dieser Zeile vorausgefüllt bekommt (je Stück). */
function packOf(r: Row): Partial<MyProduct> {
  const n = parseAmount(r.amountText);
  if (n === undefined || r.line.weightKg !== undefined) return {};
  const unit = r.unit ?? 'g';
  return { packageAmount: n, packageUnit: unit };
}

/** Zurück in eine ImportRow: Menge je Stück × Anzahl, leer = nur „vorhanden“. */
function fromRow(r: Row): ImportRow {
  const { amountText, ...row } = r;
  const n = parseAmount(amountText);
  if (n === undefined) return { ...row, amount: undefined, unit: undefined };
  const unit = row.unit ?? 'g';
  return { ...row, unit, amount: perPiece(row) && unit !== 'Stück' ? n * row.line.count : n };
}

/**
 * Kassenbon → Speisekammer. Screenshot wählen oder aus Lidl Plus hierher teilen,
 * Mashi liest die Artikel, du prüfst jede Zeile. Was du einmal festlegst (Name, Packungsgröße,
 * „Überspringen“), steht beim nächsten Bon schon da.
 */
export function ReceiptImportScreen({ shared }: { shared: boolean }) {
  const pantry = usePantry();
  const { packageFor } = usePricing();
  const [stage, setStage] = useState<Stage>('pick');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  /** Einkaufsdatum vom Bon – für den Preisverlauf */
  const [paidAt, setPaidAt] = useState<string | undefined>();
  const [savings, setSavings] = useState<ReturnType<typeof parseSavings> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const evaluate = (t: string) => {
    const lines = parseReceipt(t);
    if (!lines.length) {
      setError('Darin hat Mashi keine Artikel gefunden. Unten kannst du den erkannten Text prüfen und korrigieren.');
      setStage('pick');
      return;
    }
    setError(null);
    setPaidAt(parseReceiptDate(t));
    setSavings(parseSavings(t));
    setRows(proposeImport(lines, pantry.rules, packageFor).map(toRow));
    setStage('review');
  };

  const read = async (image: Blob) => {
    setStage('reading');
    setProgress(0);
    setError(null);
    try {
      const t = await recognizeText(image, setProgress);
      setText(t);
      evaluate(t);
    } catch (e) {
      console.error('Mashi: Texterkennung fehlgeschlagen', e);
      setError('Die Texterkennung ließ sich nicht starten. Beim ersten Mal braucht sie Internet, um sich zu laden. Alternativ: Text einfügen.');
      setStage('pick');
    }
  };

  // Aus Lidl Plus geteilt → Bild liegt schon bereit
  useEffect(() => {
    if (!shared) return;
    void takeSharedReceipt().then((img) => {
      if (img) void read(img);
      else setError('Das geteilte Bild ist nicht angekommen. Wähle den Screenshot bitte hier aus.');
    });
    // nur beim Öffnen – „read“ hängt nicht von späteren Änderungen ab
  }, [shared]);

  const update = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const products = useProducts();
  /** Zeile, für die gerade ein neues Produkt angelegt wird */
  const [creating, setCreating] = useState<number | null>(null);

  /** Zeile einem eigenen Produkt zuordnen: Name und Packungsgröße kommen dann vom Produkt */
  const assign = (i: number, p?: MyProduct) => {
    if (!p) return update(i, { productId: undefined });
    const pack = p.packageAmount && rows[i].line.weightKg === undefined
      ? { amountText: String(p.packageAmount).replace('.', ','), unit: p.packageUnit ?? 'g' }
      : {};
    update(i, { productId: p.id, name: p.name, ...pack });
  };
  const taking = rows.filter((r) => !r.skip).length;

  const apply = () => {
    const n = importReceipt(rows.map(fromRow), paidAt, savings);
    const frozen = rows.filter((r) => !r.skip && r.freeze).length;
    toast(n ? `${n} Artikel in der Speisekammer${frozen ? `, davon ${frozen} eingefroren` : ''}` : 'Gemerkt – nichts übernommen');
    navigate('/speisekammer', { replace: true });
  };

  return (
    <main className="screen">
      <TopBar title="Kassenbon importieren" backTo="/speisekammer" />
      <IngredientNames />

      {stage === 'pick' && (
        <div className="stack">
          <div className="tip tint-sky">
            <Icon name="info" size={20} />
            <p>In <strong>Lidl Plus</strong> den Kassenbon öffnen, Screenshot machen und über <strong>Teilen → Mashi</strong> schicken – oder den Screenshot hier auswählen. Das Bild bleibt auf deinem Gerät.</p>
          </div>
          <button className="btn btn--primary btn--block btn--lg" onClick={() => file.current?.click()}>
            <Icon name="image" size={20} /> Screenshot auswählen
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void read(f);
          }} />
          {error && <p className="error" role="alert">{error}</p>}
          <details className="panel" open={!!text}>
            <summary>Oder Text einfügen</summary>
            <p className="muted small">Z. B. mit Google Lens „Text kopieren“ – oder den erkannten Text hier korrigieren.</p>
            <textarea className="import-text" rows={10} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'EUR\nSpaghetti 0,99 A\nSpeisequark mager 0,79 x 3 2,37 A\nZu zahlen …'} aria-label="Bon-Text" />
            <button className="btn btn--soft" disabled={!text.trim()} onClick={() => evaluate(text)}>Auswerten</button>
          </details>
        </div>
      )}

      {stage === 'reading' && (
        <div className="thinking">
          <Icon name="camera" size={40} />
          <p><strong>Mashi liest den Bon …</strong></p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="muted small">{progress === 0 ? 'Texterkennung wird geladen – beim ersten Mal dauert das etwas.' : `${Math.round(progress * 100)} %`}</p>
        </div>
      )}

      {stage === 'review' && (
        <div className="stack">
          <p className="muted">
            {paidAt && <>Einkauf vom <strong>{new Date(paidAt).toLocaleDateString('de-DE')}</strong> · </>}
            {savings && (savings.lidlPlus > 0 || savings.offers > 0 || savings.mhd > 0) && (
              <>Gespart: {([['Lidl Plus', savings.lidlPlus], ['Angebote', savings.offers], ['MHD-Ware', savings.mhd]] as const)
                .filter(([, v]) => v > 0)
                .map(([label, v], n) => <span key={label}>{n > 0 && ' · '}{label} <strong>{euro(v)}</strong></span>)} · </>
            )}
            {rows.length} Artikel gefunden. Prüfe Name und Menge – <strong>Name wie im Rezept</strong> (z. B. „Hähnchenbrust“), damit Mashi den Vorrat beim Kochen findet. Mengen leer lassen = „vorhanden“.
          </p>
          <ul className="bonrows">
            {rows.map((r, i) => (
              <li key={`${r.key}-${i}`} className={`bonrow${r.skip ? ' is-skip' : ''}`}>
                <div className="bonrow__head">
                  <span className="bonrow__bon">{r.line.name}</span>
                  {r.known && <span className="badge tint-mint">bekannt</span>}
                  <span className="small muted bonrow__meta">
                    {r.line.weightKg !== undefined ? `${formatAmount(r.line.weightKg * 1000, 'g')} g · ` :r.line.count > 1 ? `${r.line.count} × · ` : ''}{r.line.price !== undefined ? euro(r.line.price) : ''}
                  </span>
                </div>
                {!r.skip && (
                  <div className="bonrow__edit">
                    <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} list="ingredient-names" aria-label="Name in der Speisekammer" />
                    <div className="pantry-amount">
                      <input inputMode="decimal" value={r.amountText} onChange={(e) => update(i, { amountText: e.target.value })}
                        placeholder={perPiece(r) ? 'je Stück' : 'Menge'} aria-label={perPiece(r) ? `Menge je Stück (${r.line.count} Stück gekauft)` : 'Menge'} />
                      <select value={r.unit ?? 'g'} onChange={(e) => update(i, { unit: e.target.value as PantryUnit })} aria-label="Einheit">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    {perPiece(r) && <span className="small muted">× {r.line.count} gekauft</span>}
                  </div>
                )}
                {!r.skip && (
                  <div className="bonrow__flags">
                    <label className="bonrow__mhd">
                      <input type="checkbox" checked={!!r.reduced} onChange={(e) => update(i, { reduced: e.target.checked })} />
                      <span>MHD-Ware</span>
                      {r.line.reduced && <span className="small muted">· auf dem Bon „RABATT“</span>}
                    </label>
                    <label className="bonrow__mhd">
                      <input type="checkbox" checked={!!r.freeze} onChange={(e) => update(i, { freeze: e.target.checked ? packs(r) : undefined })} />
                      <span>Einfrieren</span>
                    </label>
                    {!!r.freeze && packs(r) > 1 && (
                      <label className="small bonrow__freeze">
                        <select value={r.freeze} onChange={(e) => update(i, { freeze: Number(e.target.value) })} aria-label="Wie viele Packungen einfrieren">
                          {Array.from({ length: packs(r) }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        von {packs(r)} · Rest frisch
                      </label>
                    )}
                  </div>
                )}
                {!r.skip && (products.length > 0 || creating !== i) && (
                  <div className="bonrow__product">
                    {products.length > 0 && (
                      <label className="bonrow__productlabel">
                        <span className="small muted">Mein Produkt:</span>
                        <select value={r.productId ?? ''} onChange={(e) => assign(i, products.find((p) => p.id === e.target.value))}>
                          <option value="">keins</option>
                          {[...products].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                    )}
                    {!r.productId && creating !== i && (
                      <button className="link" onClick={() => setCreating(i)}><Icon name="plus" size={14} /> Als neues Produkt anlegen</button>
                    )}
                  </div>
                )}
                {creating === i && (
                  <ProductForm
                    initial={{ name: r.line.name, names: [normalizeName(r.line.name)], replaces: [], ...packOf(r) }}
                    onSave={(p) => { saveProducts([...products, p]); assign(i, p); setCreating(null); toast(`„${p.name}“ angelegt`); }}
                    onCancel={() => setCreating(null)}
                  />
                )}
                <button className="link bonrow__skip" onClick={() => update(i, { skip: !r.skip })}>
                  {r.skip ? 'Doch übernehmen' : 'Überspringen'}
                </button>
              </li>
            ))}
          </ul>
          <details className="panel">
            <summary>Erkannten Text ansehen</summary>
            <textarea className="import-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Erkannter Text" />
            <button className="btn btn--soft" onClick={() => evaluate(text)}>Neu auswerten</button>
          </details>
          <button className="btn btn--primary btn--block btn--lg" onClick={apply} disabled={!rows.length}>
            {taking ? `${taking} in die Speisekammer` : 'Nur merken, nichts übernehmen'}
          </button>
          <p className="muted small center">Übersprungenes merkt sich Mashi auch – der nächste Bon fragt nicht wieder.</p>
        </div>
      )}
    </main>
  );
}
