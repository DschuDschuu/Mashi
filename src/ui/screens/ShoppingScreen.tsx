import { useMemo, useState } from 'react';
import { buildShoppingList, type ShoppingItem } from '../../domain/mealplan';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { toggleBuyAnyway, toggleShoppingItem, usePantry, usePlan, useProducts, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { TopBar } from '../components/TopBar';
import { groupByKind } from '../foodGroups';

type View = 'liste' | 'basics';

/**
 * Einkaufsliste zum Wochenplan – gruppiert wie im Laden. „Basics“ sind Öl, Gewürze & Co.:
 * die hat man meist, deshalb eigener Reiter statt mitten in der Liste.
 * Mit Speisekammer: Vorrat ist abgezogen; was ganz reicht, steht unter „Hast du schon“.
 */
export function ShoppingScreen() {
  const recipes = useRecipes();
  const products = useProducts();
  const plan = usePlan();
  const pantry = usePantry();
  const [view, setView] = useState<View>('liste');
  const table = useMemo(() => withMyProducts(foodTable, products), [products]);
  const all = useMemo(() => buildShoppingList(plan, recipes, table, pantry), [plan, recipes, table, pantry]);

  const shown = all.filter((i) => (view === 'basics' ? i.pantry : !i.pantry));
  const isDone = (i: ShoppingItem) => plan.checked.includes(i.key);
  const open = shown.filter((i) => !isDone(i) && !i.covered);
  const done = shown.filter(isDone);
  const have = shown.filter((i) => i.covered && !isDone(i));
  const count = (v: View) => all.filter((i) => (v === 'basics' ? i.pantry : !i.pantry) && !isDone(i) && !i.covered).length;

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
          {view === 'basics' && <p className="muted small">Öl, Gewürze und „Immer im Haus“ (einstellbar in der Speisekammer) – hast du meist da. Abhaken, falls doch etwas fehlt.</p>}
          {open.length === 0 && (
            <p className="muted">
              Alles erledigt.{' '}
              {view === 'liste' && <button className="link" onClick={() => navigate('/speisekammer/bon')}>Eingekauft? Kassenbon importieren</button>}
            </p>
          )}
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
          {have.length > 0 && (
            <Section title={`Hast du schon (${have.length})`}>
              <p className="muted small">Laut Speisekammer genug da. Stimmt nicht? „Doch kaufen“.</p>
              <ul className="shopping panel">
                {have.map((i) => (
                  <li key={i.key} className="shopping__item is-have">
                    <div className="shopping__row">
                      <span className="shopping__text">
                        <span className="shopping__name">{i.name}</span>
                        <span className="shopping__from">brauchst {i.quantity || 'etwas'} · hast {i.have}</span>
                      </span>
                      <button className="link" onClick={() => toggleBuyAnyway(i.key)}>Doch kaufen</button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {open.length > 0 && view === 'liste' && (
            <p className="muted small center">
              <button className="link" onClick={() => navigate('/speisekammer/bon')}>Eingekauft? Kassenbon importieren</button> – hakt Gekauftes hier ab.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function ShoppingRow({ item, checked }: { item: ShoppingItem; checked: boolean }) {
  const buyAnyway = !!usePlan().buy?.includes(item.key);
  return (
    <li className={`shopping__item${checked ? ' is-done' : ''}`}>
      <label>
        <input type="checkbox" checked={checked} onChange={() => toggleShoppingItem(item.key)} />
        <span className="shopping__text">
          <span className="shopping__name">{item.name}</span>
          {item.from.length > 1 && <span className="shopping__from">für {item.from.length} Rezepte</span>}
          {item.have && !checked && <span className="shopping__from">vorrätig: {item.have}</span>}
        </span>
        <span className="shopping__qty">{item.quantity}</span>
      </label>
      {item.have && !checked && buyAnyway && (
        <button className="link link--muted shopping__undo" onClick={() => toggleBuyAnyway(item.key)}>Vorrat abziehen</button>
      )}
    </li>
  );
}
