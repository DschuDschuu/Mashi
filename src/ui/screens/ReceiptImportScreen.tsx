import { useEffect, useRef, useState } from 'react';
import { proposeImport, type ImportRow, type PantryUnit } from '../../domain/pantry';
import { parseReceipt } from '../../domain/receipt';
import { formatAmount } from '../../domain/scaling';
import { importReceipt, usePantry } from '../../data/store';
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

/** Gewicht loser Ware steht auf dem Bon (Gesamtmenge) – sonst fragt Mashi „je Stück/Packung“. */
const perPiece = (r: ImportRow) => r.line.weightKg === undefined && r.line.count > 1;

function toRow(r: ImportRow): Row {
  const shown = r.amount === undefined ? undefined : perPiece(r) && r.unit !== 'Stück' ? r.amount / r.line.count : r.amount;
  return { ...r, amountText: shown === undefined ? '' : String(shown).replace('.', ',') };
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

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const taking = rows.filter((r) => !r.skip).length;

  const apply = () => {
    const n = importReceipt(rows.map(fromRow));
    toast(n ? `${n} Artikel in der Speisekammer` : 'Gemerkt – nichts übernommen');
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
