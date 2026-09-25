import { useMemo, useState } from 'react';
import { resolveIngredient } from '../../domain/mealplan';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { recipesFromPantry, type PantryItem, type PantryUnit } from '../../domain/pantry';
import { daysLabel, daysLeft, frozenSince, specialDays, useByOf } from '../../domain/shelfLife';
import { formatAmount } from '../../domain/scaling';
import {
  addPantryItem, answerPantryCheck, forgetReceiptRule, freezePantryItem, removePantryItem, thawPantryItem, updatePantryItem,
  usePantry, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PlanTabs } from '../components/PlanTabs';
import { IngredientNames } from '../components/IngredientNames';
import { groupByKind } from '../foodGroups';
import { useUseUp } from '../useUseUp';
import { PantryMatchList, RecipeIdeaPanel } from '../components/PantryMatches';
import { ShelfSettings } from '../components/ShelfSettings';
import { toast } from '../toast';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück'];


export const quantityLabel = (item: Pick<PantryItem, 'amount' | 'unit'>) =>
  item.amount === undefined ? 'vorhanden' : `${formatAmount(item.amount, item.unit === 'Stück' ? 'Stück' : 'g')} ${item.unit ?? ''}`.trim();

/** Zahl aus einem Eingabefeld: „0,5“ und „0.5“, leer = keine Menge. */
export const parseAmount = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function PantryScreen() {
  const pantry = usePantry();
  const recipes = useRecipes();
  const products = useProducts();
  const plan = usePlan();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const table = useMemo(() => withMyProducts(foodTable, products), [products]);

  const kindOf = (item: PantryItem) => resolveIngredient({ id: item.id, name: item.name }, 1, table)?.kind;
  const toCheck = pantry.items.filter((i) => i.check);
  // Nur was nach dem Wochenplan übrig bleibt – bald Ablaufendes zuerst; Eingeplantes nicht noch einmal vorschlagen
  const { rest, keys, idea } = useUseUp();
  const matches = useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.recipeId));
    return recipesFromPantry(rest, recipes.filter((r) => !planned.has(r.id)), table, 8, keys);
  }, [rest, keys, plan, recipes, table]);
  const shelfLabel = (item: PantryItem) => {
    const d = useByOf(item, table, pantry.shelfDays);
    if (!d) return null;
    const left = daysLeft(d);
    if (item.frozenAt) {
      // Gefroren: Datum des Einfrierens – erst nach Monaten ein Hinweis
      const since = frozenSince(item.frozenAt);
      return left <= 2
        ? { text: `seit ${since} eingefroren`, urgent: true }
        : { text: `eingefroren ${new Date(item.frozenAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`, urgent: false };
    }
    return { text: left <= 2 ? daysLabel(left) : `bis ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`, urgent: left <= 2 };
  };
  const remove = (item: PantryItem) => {
    const undo = removePantryItem(item.id);
    toast(`„${item.name}“ entfernt`, { label: 'Rückgängig', run: undo });
  };
  const sorted = [...pantry.items].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  // Gefrorenes als eigene Gruppe am Ende – es hält ganz anders als der Rest seiner Art
  const groups = [
    ...groupByKind(sorted.filter((i) => !i.frozenAt), kindOf),
    ...(sorted.some((i) => i.frozenAt) ? [{ title: 'Gefroren', items: sorted.filter((i) => i.frozenAt) }] : []),
  ];

  return (
    <main className="screen screen--tabbed">
      <header className="page-head"><h1>Speisekammer</h1></header>
      <PlanTabs active="pantry" />
      <IngredientNames />

      <div className="row-2">
        <button className="btn btn--primary" onClick={() => navigate('/speisekammer/bon')}><Icon name="camera" size={18} /> Kassenbon</button>
        <button className="btn btn--soft" onClick={() => setAdding(!adding)}><Icon name="plus" size={18} /> Hinzufügen</button>
      </div>
      {adding && <AddForm onDone={() => setAdding(false)} />}

      {toCheck.length > 0 && (
        <Section icon="info" title="Noch da?">
          <p className="muted small">Beim Kochen verwendet – ohne Menge weiß Mashi nicht, ob noch etwas übrig ist.</p>
          <ul className="list">
            {toCheck.map((i) => (
              <li key={i.id} className="list__item pantry-check">
                <span className="list__title">{i.name}</span>
                <button className="btn btn--soft btn--sm" onClick={() => answerPantryCheck(i.id, true)}>Noch da</button>
                <button className="btn btn--ghost btn--sm" onClick={() => {
                  const undo = answerPantryCheck(i.id, false);
                  if (undo) toast(`„${i.name}“ aufgebraucht`, { label: 'Rückgängig', run: undo });
                }}>Aufgebraucht</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pantry.items.length === 0 ? (
        <Empty icon="archive">Noch leer. Importiere einen Kassenbon oder trag ein, was du da hast – Mashi zeigt dir dann, was du damit kochen kannst.</Empty>
      ) : (
        groups.map(({ title, items }) => {
          return (
            <Section key={title} title={`${title} (${items.length})`}>
              <ul className="pantry">
                {items.map((i) => editing === i.id
                  ? <EditRow key={i.id} item={i} estimate={useByOf({ ...i, useBy: undefined }, table, pantry.shelfDays)} onDone={() => setEditing(null)} />
                  : (
                    <li key={i.id} className="pantry__item">
                      <button className="pantry__hit" onClick={() => setEditing(i.id)} aria-label={`${i.name} bearbeiten`}>
                        <span className="pantry__name">{i.name}{i.reduced && !i.frozenAt && <span className="badge tint-peach pantry__mhd">MHD</span>}</span>
                        <span className="pantry__qty">
                          {quantityLabel(i)}
                          {shelfLabel(i) && <span className={`pantry__shelf${shelfLabel(i)!.urgent ? ' is-urgent' : ''}`}>{shelfLabel(i)!.text}</span>}
                        </span>
                      </button>
                      <button className="iconbtn iconbtn--sm" aria-label={`${i.name} entfernen`} onClick={() => remove(i)}>
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  ))}
              </ul>
            </Section>
          );
        })
      )}

      <RecipeIdeaPanel idea={idea} />

      {matches.length > 0 && (
        <Section icon="sparkles" title="Was kann ich kochen?">
          <p className="muted small">Rezepte mit den meisten Zutaten aus deiner Speisekammer. Öl, Salz und Gewürze zählen nicht mit.</p>
          <PantryMatchList matches={matches} />
        </Section>
      )}

      <ShelfSettings />

      {pantry.rules.length > 0 && (
        <details className="panel learned">
          <summary>Gelernte Bon-Artikel ({pantry.rules.length})</summary>
          <p className="muted small">So übersetzt Mashi deine Kassenbons. Falsch gelernt? Vergessen – beim nächsten Bon fragt Mashi wieder.</p>
          <ul className="learned__list">
            {[...pantry.rules].sort((a, b) => a.key.localeCompare(b.key, 'de')).map((r) => (
              <li key={r.key}>
                <span className="learned__bon">{r.key}</span>
                <span className="small muted">{r.skip ? 'wird übersprungen' : `→ ${r.name}${r.amount ? ` · ${formatAmount(r.amount, 'g')} ${r.unit} je Stück` : ''}`}</span>
                <button className="link link--muted" onClick={() => forgetReceiptRule(r.key)}>Vergessen</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

function AmountFields({ amount, unit, onAmount, onUnit }: { amount: string; unit: PantryUnit; onAmount: (v: string) => void; onUnit: (u: PantryUnit) => void }) {
  return (
    <div className="pantry-amount">
      <input inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="Menge" aria-label="Menge (leer = vorhanden)" />
      <select value={unit} onChange={(e) => onUnit(e.target.value as PantryUnit)} aria-label="Einheit">
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<PantryUnit>('g');
  const submit = () => {
    if (!name.trim()) return;
    const a = parseAmount(amount);
    addPantryItem(name, a, a === undefined ? undefined : unit);
    toast(`„${name.trim()}“ in der Speisekammer`);
    setName('');
    setAmount('');
  };
  return (
    <div className="panel stack">
      <label className="field"><span>Was?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="z. B. Hähnchenbrust" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      <p className="small muted">Menge leer lassen = einfach „vorhanden“.</p>
      <div className="row-gap">
        <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>Hinzufügen</button>
        <button className="btn btn--ghost" onClick={onDone}>Fertig</button>
      </div>
    </div>
  );
}

/** Datum für <input type="date"> (Ortszeit) */
const dateField = (d?: Date) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

function EditRow({ item, estimate, onDone }: { item: PantryItem; estimate?: Date; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  // Eigenes Datum oder die Schätzung vorausgefüllt – gespeichert wird nur, wenn du es änderst
  const initialDate = dateField(item.useBy ? new Date(item.useBy) : estimate);
  const [useBy, setUseBy] = useState(initialDate);
  const [amount, setAmount] = useState(item.amount === undefined ? '' : String(item.amount).replace('.', ','));
  const [unit, setUnit] = useState<PantryUnit>(item.unit ?? 'g');
  const [reduced, setReduced] = useState(!!item.reduced);
  /** Einfrieren: null = zu, sonst die Menge (vorausgefüllt: alles) */
  const [freezing, setFreezing] = useState<string | null>(null);
  const pantry = usePantry();
  const save = () => {
    const a = parseAmount(amount);
    const changedDate = useBy !== initialDate;
    updatePantryItem(item.id, {
      name: name.trim() || item.name, amount: a, unit: a === undefined ? undefined : unit, reduced: reduced || undefined,
      ...(changedDate ? { useBy: useBy ? new Date(`${useBy}T12:00:00`).toISOString() : undefined } : {}),
    });
    onDone();
  };
  const freeze = () => {
    const part = freezing ? parseAmount(freezing) : undefined;
    freezePantryItem(item.id, part);
    toast(part !== undefined && item.amount !== undefined && part < item.amount
      ? `${quantityLabel({ amount: part, unit: item.unit })} ${item.name} eingefroren`
      : `„${item.name}“ eingefroren`);
    onDone();
  };
  const thaw = () => {
    thawPantryItem(item.id);
    const d = specialDays('thawed', pantry.shelfDays);
    toast(`„${item.name}“ aufgetaut – hält noch ${d === 1 ? 'einen Tag' : `${d} Tage`}`);
    onDone();
  };
  return (
    <li className="pantry__item pantry__item--edit">
      <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" aria-label="Name" />
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      {item.frozenAt ? (
        <p className="small muted pantry-frozen">Eingefroren am {new Date(item.frozenAt).toLocaleDateString('de-DE')}</p>
      ) : (
        <>
          <label className="pantry-date">
            <span className="small muted">{item.useBy ? 'Verbrauchen bis' : estimate ? 'Verbrauchen bis (geschätzt)' : 'Verbrauchen bis (optional)'}</span>
            <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
          </label>
          <label className="pantry-mhd">
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            <span className="small">MHD-Ware (reduziert)</span>
          </label>
        </>
      )}
      <div className="pantry-actions">
        <button className="btn btn--primary btn--sm" onClick={save}>OK</button>
        {item.frozenAt
          ? <button className="btn btn--soft btn--sm" onClick={thaw}>Auftauen</button>
          : freezing === null && (
            <button className="btn btn--soft btn--sm" onClick={() => setFreezing(item.amount === undefined ? '' : String(item.amount).replace('.', ','))}>Einfrieren</button>
          )}
      </div>
      {freezing !== null && (
        <div className="pantry-freeze">
          {item.amount !== undefined && (
            <label className="small">Wie viel?
              <input inputMode="decimal" value={freezing} onChange={(e) => setFreezing(e.target.value)} aria-label="Menge zum Einfrieren" /> {item.unit}
            </label>
          )}
          <button className="btn btn--primary btn--sm" onClick={freeze}>Einfrieren</button>
          <button className="link link--muted" onClick={() => setFreezing(null)}>Abbrechen</button>
        </div>
      )}
    </li>
  );
}
