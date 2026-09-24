import { useMemo, useState } from 'react';
import { resolveIngredient } from '../../domain/mealplan';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { recipesFromPantry, type PantryItem, type PantryUnit } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { formatAmount } from '../../domain/scaling';
import type { FoodKind } from '../../domain/nutrition/types';
import {
  addPantryItem, addToPlan, answerPantryCheck, forgetReceiptRule, removePantryItem, updatePantryItem,
  usePantry, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PlanTabs } from '../components/PlanTabs';
import { RecipeImage } from '../components/RecipeImage';
import { IngredientNames } from '../components/IngredientNames';
import { toast } from '../toast';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück'];

/** Gruppen wie im Laden – damit die Liste nicht nur ein langer Haufen ist. */
const GROUPS: { title: string; kinds: (FoodKind | undefined)[] }[] = [
  { title: 'Fleisch, Fisch & Eier', kinds: ['protein', 'egg'] },
  { title: 'Milchprodukte', kinds: ['dairy'] },
  { title: 'Nudeln, Reis & Brot', kinds: ['staple', 'bread'] },
  { title: 'Obst & Gemüse', kinds: ['vegetable', 'fruit'] },
  { title: 'Sonstiges', kinds: [undefined] },
];

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

  const kindOf = (item: PantryItem) => resolveIngredient({ id: item.id, name: item.name }, 1, table)?.food?.kind;
  const toCheck = pantry.items.filter((i) => i.check);
  const matches = useMemo(() => recipesFromPantry(pantry, recipes, table), [pantry, recipes, table]);
  const sorted = [...pantry.items].sort((a, b) => a.name.localeCompare(b.name, 'de'));

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
                <button className="btn btn--ghost btn--sm" onClick={() => answerPantryCheck(i.id, false)}>Aufgebraucht</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pantry.items.length === 0 ? (
        <Empty icon="archive">Noch leer. Importiere einen Kassenbon oder trag ein, was du da hast – Mashi zeigt dir dann, was du damit kochen kannst.</Empty>
      ) : (
        GROUPS.map((g) => {
          const items = sorted.filter((i) => g.kinds.includes(kindOf(i)));
          if (!items.length) return null;
          return (
            <Section key={g.title} title={`${g.title} (${items.length})`}>
              <ul className="pantry">
                {items.map((i) => editing === i.id
                  ? <EditRow key={i.id} item={i} onDone={() => setEditing(null)} />
                  : (
                    <li key={i.id} className="pantry__item">
                      <button className="pantry__hit" onClick={() => setEditing(i.id)} aria-label={`${i.name} bearbeiten`}>
                        <span className="pantry__name">{i.name}</span>
                        <span className="pantry__qty">{quantityLabel(i)}</span>
                      </button>
                      <button className="iconbtn iconbtn--sm" aria-label={`${i.name} entfernen`} onClick={() => removePantryItem(i.id)}>
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  ))}
              </ul>
            </Section>
          );
        })
      )}

      {matches.length > 0 && (
        <Section icon="sparkles" title="Was kann ich kochen?">
          <p className="muted small">Rezepte mit den meisten Zutaten aus deiner Speisekammer. Öl, Salz und Gewürze zählen nicht mit.</p>
          <ul className="list">
            {matches.map((m) => {
              const inPlan = plan.items.some((i) => i.recipeId === m.recipe.id);
              return (
                <li key={m.recipe.id} className="list__item suggestion">
                  <button className="plan-list__hit" onClick={() => navigate(`/rezept/${m.recipe.id}`)}>
                    <RecipeImage image={m.recipe.image} size="sm" />
                    <span className="suggestion__text">
                      <span className="list__title">{currentContent(m.recipe).title}</span>
                      <span className="small muted">
                        {m.missing.length === 0 ? 'Alles da' : `${m.have.length} von ${m.have.length + m.missing.length} da · fehlt: ${m.missing.slice(0, 3).join(', ')}${m.missing.length > 3 ? ' …' : ''}`}
                      </span>
                    </span>
                  </button>
                  {!inPlan && (
                    <button className="btn btn--soft btn--sm" onClick={() => { addToPlan(m.recipe.id); toast('Eingeplant'); }} aria-label={`${currentContent(m.recipe).title} einplanen`}>
                      <Icon name="plus" size={16} /> Plan
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

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

function EditRow({ item, onDone }: { item: PantryItem; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(item.amount === undefined ? '' : String(item.amount).replace('.', ','));
  const [unit, setUnit] = useState<PantryUnit>(item.unit ?? 'g');
  const save = () => {
    const a = parseAmount(amount);
    updatePantryItem(item.id, { name: name.trim() || item.name, amount: a, unit: a === undefined ? undefined : unit });
    onDone();
  };
  return (
    <li className="pantry__item pantry__item--edit">
      <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" aria-label="Name" />
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      <button className="btn btn--primary btn--sm" onClick={save}>OK</button>
    </li>
  );
}
