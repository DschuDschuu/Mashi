import { useMemo, useState } from 'react';
import type { ShoppingItem } from '../../domain/mealplan';
import { shoppingList } from '../../domain/restock';
import { addExtra, clearDoneExtras, removeExtra, toggleBuyAnyway, toggleShoppingItem, useFoodTable, usePantry, usePlan, useProducts, useRecipes } from '../../data/store';
import { IngredientNames } from '../components/IngredientNames';
import { toast } from '../toast';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { groupByCategory } from '../../domain/categories';
import { useCategoryOf } from '../useCategory';

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
  const table = useFoodTable();
  const all = useMemo(() => shoppingList(plan, recipes, table, pantry, products), [plan, recipes, table, pantry, products]);

  const shown = all.filter((i) => (view === 'basics' ? i.pantry : !i.pantry));
  const isDone = (i: ShoppingItem) => plan.checked.includes(i.key);
  const open = shown.filter((i) => !isDone(i) && !i.covered);
  const categoryOf = useCategoryOf();
  const done = shown.filter(isDone);
  const have = shown.filter((i) => i.covered && !isDone(i));
  const count = (v: View) => all.filter((i) => (v === 'basics' ? i.pantry : !i.pantry) && !isDone(i) && !i.covered).length;

  return (
    <main className="screen screen--tabbed">
      <TopBar title="Einkaufsliste" backTo="/speisekammer" />
      {/* eigene Einträge: „Spülmittel“, „Backpapier“ – auch ohne Plan */}
      <AddExtra />
      {all.length === 0 ? (
        <Empty icon="cart">
          <span>
            Noch nichts einzukaufen – plane Gerichte oder schreib oben selbst etwas auf.{' '}
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
          {view === 'basics' && <p className="muted small">Öl, „Immer im Haus“ und „Gewürze“ (einstellbar unter Speisekammer → Meine Lebensmittel) – hast du meist da. Abhaken, falls doch etwas fehlt.</p>}
          {open.length === 0 && (
            <p className="muted">
              Alles erledigt.{' '}
              {view === 'liste' && <button className="link" onClick={() => navigate('/speisekammer/bon')}>Eingekauft? Kassenbon importieren</button>}
            </p>
          )}
          {groupByCategory(open, (i) => categoryOf(i.name)).map((g) => (
            <Section key={g.title} title={g.title}>
              <ul className="shopping panel">{g.items.map((i) => <ShoppingRow key={i.key} item={i} checked={false} />)}</ul>
            </Section>
          ))}
          {done.length > 0 && (
            <Section title={`Im Wagen (${done.length})`}>
              <ul className="shopping panel">{done.map((i) => <ShoppingRow key={i.key} item={i} checked />)}</ul>
              {/* eigene Einträge verschwinden mit dem Bon – oder hier von Hand */}
              {done.some((i) => i.extra) && (
                <button className="link link--muted" onClick={() => {
                  const undo = clearDoneExtras();
                  toast('Erledigte Einträge entfernt', { label: 'Rückgängig', run: undo });
                }}>Erledigtes entfernen</button>
              )}
            </Section>
          )}
          {have.length > 0 && (
            <Section title={`Hast du schon (${have.length})`}>
              <ul className="shopping panel">
                {have.map((i) => (
                  <li key={i.key} className="shopping__item is-have">
                    <div className="shopping__row">
                      <span className="shopping__text">
                        <span className="shopping__name">{i.name}</span>
                        <span className="shopping__from">Benötigt {i.quantity || 'etwas'} · Im Vorrat {i.have}</span>
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
              <button className="link" onClick={() => navigate('/speisekammer/bon')}>Eingekauft? Kassenbon importieren</button>
              <br />Das hakt Gekauftes hier ab.
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
    <li className={`shopping__item${checked ? ' is-done' : ''}${item.extra && !item.from.length && !item.restock ? ' shopping__item--extra' : ''}`}>
      <label>
        <input type="checkbox" checked={checked} onChange={() => toggleShoppingItem(item.key)} />
        <span className="shopping__text">
          <span className="shopping__name">{item.name}</span>
          {item.from.length > 1 && <span className="shopping__from">für {item.from.length} Rezepte</span>}
          {/* Nachkaufen: der Hinweis nennt den Vorrat schon selbst */}
          {item.restock && !checked && <span className="shopping__from shopping__restock"><Icon name="refresh" size={12} /> {item.restock}</span>}
          {item.have && !item.restock && !checked && <span className="shopping__from">Im Vorrat {item.have}</span>}
          {item.note && !checked && <span className="shopping__from">{item.note}</span>}
        </span>
        <span className="shopping__qty">{item.quantity}</span>
      </label>
      {/* eigener Eintrag ohne Rezept: wieder weg */}
      {item.extra && !item.from.length && !item.restock && !checked && (
        <button className="iconbtn iconbtn--sm" aria-label={`${item.name} von der Liste nehmen`} onClick={() => {
          removeExtra(item.name);
          toast(`„${item.name}“ von der Liste`, { label: 'Rückgängig', run: () => addExtra(item.name) });
        }}><Icon name="close" size={16} /></button>
      )}
      {item.have && !checked && buyAnyway && (
        <button className="link link--muted shopping__undo" onClick={() => toggleBuyAnyway(item.key)}>Vorrat abziehen</button>
      )}
    </li>
  );
}

/** „Etwas aufschreiben“ – ein Feld, Vorschläge aus deinen Zutaten, Enter oder ＋ */
function AddExtra() {
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    addExtra(n);
    setName('');
  };
  return (
    <form className="shopping__add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <IngredientNames />
      <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="Etwas aufschreiben …" aria-label="Eigener Eintrag" />
      <button type="submit" className="iconbtn iconbtn--box" disabled={!name.trim()} aria-label="Auf die Liste"><Icon name="plus" size={20} /></button>
    </form>
  );
}
