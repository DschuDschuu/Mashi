import { useState } from 'react';
import { DISCOUNT_LABEL, type BonLine, type SavedBon } from '../../domain/bons';
import { productLabel, sortTags } from '../../domain/nutrition/myProducts';
import type { PantryUnit } from '../../domain/pantry';
import type { DiscountKind, LineDiscount } from '../../domain/receipt';
import { editBon, usePantry, useProducts } from '../../data/store';
import { Empty } from '../components/Controls';
import { Icon } from '../components/Icon';
import { IngredientNames } from '../components/IngredientNames';
import { TopBar } from '../components/TopBar';
import { euro } from '../format';
import { toast } from '../toast';
import { lineAmount, linePrice } from '../usePurchases';
import { parseAmount } from './PantryScreen';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück'];
const KINDS: DiscountKind[] = ['angebot', 'lidlplus', 'mhd'];
const field = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

export const bonTitle = (b: Pick<SavedBon, 'date'>) => new Date(b.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });

/**
 * Ein gespeicherter Kassenbon (Julia): alle Zeilen ansehen, antippen zum Korrigieren – Menge, Zuordnung,
 * Preis und Rabatt. Vorrat, Preisverlauf und das Gelernte für den nächsten Bon ziehen mit.
 */
export function BonScreen({ id }: { id: string }) {
  const bon = usePantry().bons?.find((b) => b.id === id);
  const products = useProducts();
  const [editing, setEditing] = useState<number | null>(null);

  if (!bon) {
    return (
      <main className="screen">
        <TopBar title="Kassenbon" backTo="/preise" />
        <Empty icon="cart"><span>Diesen Bon gibt es nicht mehr – Mashi hebt die letzten 100 auf.</span></Empty>
      </main>
    );
  }
  const taken = bon.lines.filter((l) => !l.skip).length;
  const saved = bon.savings ? bon.savings.offers + bon.savings.lidlPlus + bon.savings.mhd : 0;
  return (
    <main className="screen">
      <TopBar title={`Einkauf vom ${bonTitle(bon)}`} backTo="/preise" />
      <IngredientNames />
      <p className="muted small">
        {taken} Artikel{bon.total !== undefined && <> · zu zahlen <strong>{euro(bon.total)}</strong></>}{saved > 0 && <> · gespart <strong>{euro(saved)}</strong></>}
      </p>
      <ul className="bonview">
        {bon.lines.map((l, i) => {
          const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
          return editing === i ? (
            <li key={i} className="bonview__line is-editing">
              <LineEdit line={l} onDone={(patch) => {
                setEditing(null);
                if (!patch) return;
                const undo = editBon(bon.id, i, patch);
                toast('Geändert – Vorrat und Preise ziehen mit', { label: 'Rückgängig', run: undo });
              }} />
            </li>
          ) : (
            <li key={i} className={`bonview__line${l.skip ? ' is-skip' : ''}`}>
              <button type="button" className="bonview__open" disabled={l.skip} onClick={() => setEditing(i)}
                aria-label={l.skip ? `${l.bon} – übersprungen` : `${l.name} ändern`}>
                <span className="bonview__name">
                  {l.skip ? l.bon : l.name}
                  {p && sortTags(p).map((t) => <span key={t} className="brand">{t}</span>)}
                </span>
                <span className="bonview__price">{linePrice(l)}</span>
                <span className="small muted bonview__sub">
                  {l.skip ? 'übersprungen' : [l.bon, lineAmount(l), l.freeze ? 'eingefroren' : '', l.reduced ? 'MHD-Ware' : ''].filter(Boolean).join(' · ')}
                </span>
                {!l.skip && <Icon name="pencil" size={14} />}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

/** Menge je Stück zeigen, wenn mehrere gekauft – wie bei der Bon-Prüfung */
const perPiece = (l: Pick<BonLine, 'weightKg' | 'count'>, unit?: PantryUnit) => l.weightKg === undefined && l.count > 1 && unit !== 'Stück';

/** Eine Zeile korrigieren – onDone(null) = abgebrochen */
function LineEdit({ line, onDone }: { line: BonLine; onDone: (patch: Partial<BonLine> | null) => void }) {
  const products = useProducts();
  const [name, setName] = useState(line.name);
  const [productId, setProductId] = useState(line.productId ?? '');
  const [count, setCount] = useState(String(line.count));
  const [unit, setUnit] = useState<PantryUnit>(line.unit ?? 'g');
  const shown = line.amount === undefined ? undefined : perPiece(line, line.unit) ? line.amount / line.count : line.amount;
  const [amount, setAmount] = useState(field(shown));
  const [price, setPrice] = useState(field(line.price));
  // was vom Bon kam (Betrag und „20%“), bleibt erkennbar – geänderter Betrag oder Art: Prozent fällt weg, Mashi rechnet
  const [discounts, setDiscounts] = useState<{ kind: DiscountKind; text: string; from?: LineDiscount }[]>(
    (line.discounts ?? []).map((d) => ({ kind: d.kind, text: field(d.amount), from: d })));
  const [error, setError] = useState<string | null>(null);
  const loose = line.weightKg !== undefined;

  const save = () => {
    const n = loose ? 1 : Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 99) return setError('Anzahl bitte als ganze Zahl (1 bis 99).');
    const a = amount.trim() ? parseAmount(amount) : undefined;
    if (amount.trim() && a === undefined) return setError('Die Menge verstehe ich nicht – z. B. 500 oder 0,5.');
    const pr = price.trim() ? parseAmount(price) : undefined;
    if (price.trim() && pr === undefined) return setError('Den Preis verstehe ich nicht – z. B. 2,49.');
    const ds = discounts.map((d): LineDiscount => {
      const amount = parseAmount(d.text) ?? 0;
      const keep = d.from?.percent !== undefined && d.from.kind === d.kind && d.from.amount === amount;
      return { kind: d.kind, amount, ...(keep ? { percent: d.from!.percent } : {}) };
    }).filter((d) => d.amount > 0);
    if (pr !== undefined && ds.reduce((s, d) => s + d.amount, 0) > pr) return setError('Der Rabatt ist höher als der Preis.');
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    const total = a === undefined ? undefined : perPiece({ weightKg: line.weightKg, count: n }, unit) ? a * n : a;
    onDone({ name: name.trim(), productId: productId || undefined, count: n, amount: total, unit, price: pr, discounts: ds });
  };

  return (
    <div className="stack stack--tight bonedit">
      <span className="bonrow__bon">{line.bon}</span>
      <label className="field"><span>Name in der Speisekammer</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" />
      </label>
      {products.length > 0 && (
        <label className="field"><span>Mein Produkt / Sorte</span>
          <select value={productId} onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            setProductId(e.target.value);
            if (p) setName(p.name);
          }}>
            <option value="">keins</option>
            {[...products].sort((a, b) => productLabel(a).localeCompare(productLabel(b), 'de')).map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
          </select>
        </label>
      )}
      <div className="row-2">
        {!loose && (
          <label className="field"><span>Anzahl</span>
            <input inputMode="numeric" value={count} onChange={(e) => {
              // in Stück ist die Menge die Anzahl – dann zieht sie mit (sonst müsste man beides ändern)
              if (unit === 'Stück' && amount === count) setAmount(e.target.value);
              setCount(e.target.value);
            }} />
          </label>
        )}
        <label className="field"><span>{perPiece({ weightKg: line.weightKg, count: Number(count) || 1 }, unit) ? 'Menge je Stück' : 'Menge'}</span>
          <span className="pantry-amount">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="leer = vorhanden" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as PantryUnit)} aria-label="Einheit">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </span>
        </label>
      </div>
      <label className="field"><span>Preis auf dem Bon (vor Rabatt, €)</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      {discounts.map((d, i) => (
        <div key={i} className="bonedit__discount">
          <select value={d.kind} onChange={(e) => setDiscounts(discounts.map((x, n) => (n === i ? { ...x, kind: e.target.value as DiscountKind } : x)))} aria-label="Art des Rabatts">
            {KINDS.map((k) => <option key={k} value={k}>{DISCOUNT_LABEL[k]}</option>)}
          </select>
          <span>−</span>
          <input inputMode="decimal" value={d.text} onChange={(e) => setDiscounts(discounts.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))} aria-label="Rabatt in Euro" />
          <span>€</span>
          <button type="button" className="iconbtn iconbtn--sm iconbtn--danger" aria-label="Rabatt entfernen" onClick={() => setDiscounts(discounts.filter((_, n) => n !== i))}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="link small bonedit__add" onClick={() => setDiscounts([...discounts, { kind: 'angebot', text: '' }])}>
        <Icon name="plus" size={14} /> Rabatt
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-gap">
        <button type="button" className="btn btn--primary" onClick={save}>Speichern</button>
        <button type="button" className="btn btn--ghost" onClick={() => onDone(null)}>Abbrechen</button>
      </div>
    </div>
  );
}
