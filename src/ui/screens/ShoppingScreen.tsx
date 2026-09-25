import { useMemo, useState } from 'react';
import { buildShoppingList, type ShoppingItem } from '../../domain/mealplan';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { toggleShoppingItem, usePlan, useProducts, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { TopBar } from '../components/TopBar';
import { groupByKind } from '../foodGroups';

type View = 'liste' | 'basics';

/**
 * Einkaufsliste zum Wochenplan – gruppiert wie im Laden. „Basics“ sind Öl, Gewürze & Co.:
 * die hat man meist, deshalb eigener Reiter statt mitten in der Liste.
 */
export function ShoppingScreen() {
  const recipes = useRecipes();
  const products = useProducts();
  const plan = usePlan();
  const [view, setView] = useState<View>('liste');
  const table = useMemo(() => withMyProducts(foodTable, products), [products]);
  const all = useMemo(() => buildShoppingList(plan, recipes, table), [plan, recipes, table]);

  const shown = all.filter((i) => (view === 'basics' ? i.pantry : !i.pantry));
  const isDone = (i: ShoppingItem) => plan.checked.includes(i.key);
  const open = shown.filter((i) => !isDone(i));
  const done = shown.filter(isDone);
  const count = (v: View) => all.filter((i) => (v === 'basics' ? i.pantry : !i.pantry) && !isDone(i)).length;

  return (
    <main className="screen screen--tabbed">
      <TopBar title="Einkaufsliste" backTo="/plan" />
      {all.length === 0 ? (
        <Empty icon="cart">
          <span>
            Noch nichts einzukaufen – plane zuerst Gerichte für diese Woche.{' '}
            <button className="link" onClick={() => navigate('/plan', { replace: true })}>Zum Wochenplan</button>
          </span>
        </Empty>
      ) : (
        <>
          <div className="segments" role="tablist" aria-label="Einkaufsliste">
            {(['liste', 'basics'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={`segment${view === v ? ' is-on' : ''}`} onClick={() => setView(v)}>
                {v === 'liste' ? 'Liste' : 'Basics'}{count(v) ? ` (${count(v)})` : ''}
              </button>
            ))}
          </div>
          {view === 'basics' && <p className="muted small">Öl, Gewürze & Co. – hast du meist da. Abhaken, falls doch etwas fehlt.</p>}
          {open.length === 0 && <p className="muted">Alles abgehakt.</p>}
          {groupByKind(open, (i) => i.kind).map((g) => (
            <Section key={g.title} title={g.title}>
              <ul className="shopping panel">{g.items.map((i) => <ShoppingRow key={i.key} item={i} checked={false} />)}</ul>
            </Section>
          ))}
          {done.length > 0 && (
            <Section title={`Im Wagen (${done.length})`}>
              <ul className="shopping panel">{done.map((i) => <ShoppingRow key={i.key} item={i} checked />)}</ul>
            </Section>
          )}
        </>
      )}
    </main>
  );
}

function ShoppingRow({ item, checked }: { item: ShoppingItem; checked: boolean }) {
  return (
    <li className={`shopping__item${checked ? ' is-done' : ''}`}>
      <label>
        <input type="checkbox" checked={checked} onChange={() => toggleShoppingItem(item.key)} />
        <span className="shopping__text">
          <span className="shopping__name">{item.name}</span>
          {item.from.length > 1 && <span className="shopping__from">für {item.from.length} Rezepte</span>}
        </span>
        <span className="shopping__qty">{item.quantity}</span>
      </label>
    </li>
  );
}
