import { useState } from 'react';
import { FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import type { NutritionResult } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { saveProducts, useProducts } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

const foodName = (id: string) => FOOD_CHOICES.find((f) => f.id === id)?.name ?? id;
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

function ProductForm({ initial, onSave, onCancel }: { initial?: Partial<MyProduct>; onSave: (p: MyProduct) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [values, setValues] = useState<Values>({
    kcal: toField(initial?.per100g?.kcal),
    protein: toField(initial?.per100g?.protein),
    carbs: toField(initial?.per100g?.carbs),
    fat: toField(initial?.per100g?.fat),
  });
  const [replaces, setReplaces] = useState<string[]>(initial?.replaces ?? []);
  const [names, setNames] = useState<string[]>(initial?.names ?? []);
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
    if (!replaces.length && !names.length) return setError('Bitte wählen, was das Produkt ersetzen soll (z. B. Milch).');
    onSave({
      id: initial?.id ?? newId('p'),
      name: name.trim(),
      replaces,
      ...(names.length ? { names } : {}),
      per100g: { kcal, protein, carbs, fat },
      updatedAt: new Date().toISOString(),
    });
  };

  const numField = (key: keyof Values, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input inputMode="decimal" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="product-form stack">
      <label className="field">
        <span>Name (wie auf der Packung)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Milch 0,1 % (Hausmarke)" />
      </label>
      <p className="small muted">Werte vom Etikett, pro 100 g bzw. 100 ml:</p>
      <div className="row-2">{numField('kcal', 'kcal')}{numField('protein', 'Eiweiß (g)')}</div>
      <div className="row-2">{numField('carbs', 'Kohlenhydrate (g)')}{numField('fat', 'Fett (g)')}</div>

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
        <span className="small muted">{names.length ? 'Ersetzt außerdem (optional):' : 'Ersetzt in allen Rezepten:'}</span>
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
