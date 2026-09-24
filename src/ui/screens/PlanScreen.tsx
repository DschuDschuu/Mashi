import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { recipeCost, sumCosts } from '../../domain/cost';
import { buildShoppingList, suggestRecipes, type ShoppingItem, type Suggestion } from '../../domain/mealplan';
import { ingredientCompletions, longNotCooked, searchRecipes } from '../../domain/recipeSearch';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { currentContent } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import {
  addToPlan, clearPlan, removeFromPlan, setPlanServings, togglePlanCooked, toggleShoppingItem, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section, Stepper } from '../components/Controls';
import { PlanTabs } from '../components/PlanTabs';
import { Icon, type IconName } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { StatusBadge } from '../components/StatusBadge';
import { euro, portionCount, recipeCount, relativeDay } from '../format';
import { usePricing } from '../useCosts';
import { cookedToast } from '../cookedToast';
import { toast } from '../toast';

/** Was sich planen lässt: alles außer Archiv und reinen KI-Ideen (die sind noch kein Rezept). */
const plannable = (r: Recipe) => !r.archivedAt && r.status !== 'ki_entwurf';

/**
 * „Diese Woche“ – Meal Prep ohne feste Tage: Gerichte sammeln, Mashi schlägt passende vor
 * (ähnliche Zutaten = weniger Einkauf, weniger Reste), daraus entsteht die Einkaufsliste.
 * Plan und Haken sind auf allen Geräten gleich (werden abgeglichen).
 */
export function PlanScreen() {
  const recipes = useRecipes();
  const products = useProducts();
  const plan = usePlan();
  const [picking, setPicking] = useState(false);
  const [showPantry, setShowPantry] = useState(false);

  const table = useMemo(() => withMyProducts(foodTable, products), [products]);
  const items = plan.items
    .map((i) => ({ ...i, recipe: recipes.find((r) => r.id === i.recipeId) }))
    .filter((i): i is typeof i & { recipe: Recipe } => !!i.recipe)
    .map((i) => ({ ...i, cooked: plan.cooked.includes(i.recipeId) }))
    // Gekochtes rutscht nach unten – oben steht, was noch ansteht
    .sort((a, b) => Number(a.cooked) - Number(b.cooked));
  const suggestions = useMemo(() => suggestRecipes(plan, recipes.filter(plannable), table), [plan, recipes, table]);
  const shopping = useMemo(() => buildShoppingList(plan, recipes, table), [plan, recipes, table]);
  const pantryCount = shopping.filter((i) => i.pantry).length;
  const visible = shopping.filter((i) => showPantry || !i.pantry);
  const open = visible.filter((i) => !plan.checked.includes(i.key));
  const done = visible.filter((i) => plan.checked.includes(i.key));
  const portions = items.reduce((s, i) => s + i.servings, 0);
  const { prices } = usePricing();
  const costs = useMemo(() => new Map(items.map((i) => [i.recipeId, recipeCost(currentContent(i.recipe), i.servings, table, prices)])), [items, table, prices]);
  const week = sumCosts([...costs.values()]);

  const add = (r: Recipe) => {
    if (addToPlan(r.id)) toast(`„${currentContent(r).title}“ eingeplant`);
    setPicking(false);
  };

  const planList = (
    <>
      <Section icon="calendar" title={items.length ? `Diese Woche · ${items.length} ${items.length === 1 ? 'Gericht' : 'Gerichte'}, ${portionCount(portions)}` : 'Diese Woche'}>
        {items.length === 0 ? (
          <Empty icon="calendar">Wähle ein Gericht – Mashi schlägt dir dann Rezepte mit ähnlichen Zutaten vor. So kaufst du weniger ein und es bleibt nichts übrig.</Empty>
        ) : (
          <ul className="list plan-list">
            {items.map(({ recipe, servings, cooked }) => (
              <li key={recipe.id} className={`list__item${cooked ? ' is-cooked' : ''}`}>
                <button className={`plan-cooked${cooked ? ' is-on' : ''}`} onClick={() => cookedToast(togglePlanCooked(recipe.id))}
                  aria-pressed={cooked} aria-label={cooked ? `${currentContent(recipe).title}: doch noch nicht gekocht` : `${currentContent(recipe).title} gekocht`}>
                  <Icon name="check" size={16} />
                </button>
                <button className="plan-list__hit" onClick={() => navigate(`/rezept/${recipe.id}`)}>
                  <RecipeImage image={recipe.image} size="sm" />
                  <span className="suggestion__text">
                    <span className="list__title">{currentContent(recipe).title}</span>
                    {costs.get(recipe.id) && <span className="small muted">ca. {euro(costs.get(recipe.id)!.total)}</span>}
                  </span>
                </button>
                <div className="plan-list__servings">
                  <span className="small muted" aria-hidden="true">Portionen</span>
                  <Stepper value={servings} onChange={(v) => setPlanServings(recipe.id, v)} label="Portionen" />
                </div>
                <button className="iconbtn iconbtn--sm" aria-label={`${currentContent(recipe).title} aus dem Plan nehmen`} onClick={() => removeFromPlan(recipe.id)}>
                  <Icon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {week.total > 0 && (
          <p className="cost-line">
            <span>Diese Woche ca. <strong>{euro(week.total)}</strong></span>
            {(week.unknown > 0 || week.missing.length > 0) && (
              <span className="small muted">
                {week.unknown > 0 ? `${week.unknown} ${week.unknown === 1 ? 'Gericht' : 'Gerichte'} ohne Preise` : ''}
                {week.unknown > 0 && week.missing.length > 0 ? ' · ' : ''}
                {week.missing.length > 0 ? `ohne ${week.missing.slice(0, 3).join(', ')}${week.missing.length > 3 ? ' …' : ''}` : ''}
              </span>
            )}
          </p>
        )}
        <button className="btn btn--soft btn--block" onClick={() => setPicking(true)}>
          <Icon name="plus" size={18} /> Gericht hinzufügen
        </button>
      </Section>

      {suggestions.length > 0 && (
        <Section icon="sparkles" title="Passt dazu">
          <p className="muted small">Diese Rezepte teilen Zutaten mit deinem Plan.</p>
          <ul className="list">
            {suggestions.map(({ recipe, shared }) => (
              <li key={recipe.id} className="list__item suggestion">
                <button className="plan-list__hit" onClick={() => navigate(`/rezept/${recipe.id}`)}>
                  <RecipeImage image={recipe.image} size="sm" />
                  <span className="suggestion__text">
                    <span className="list__title">{currentContent(recipe).title}</span>
                    <span className="small muted">Auch drin: {shared.slice(0, 4).join(', ')}{shared.length > 4 ? ' …' : ''}</span>
                  </span>
                </button>
                <button className="btn btn--soft btn--sm" onClick={() => add(recipe)} aria-label={`${currentContent(recipe).title} einplanen`}>
                  <Icon name="plus" size={16} /> Plan
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );

  const shoppingList = items.length > 0 && (
    <Section icon="cart" title={`Einkaufsliste${open.length ? ` (${open.length})` : ''}`}>
      <div className="panel">
        {visible.length === 0 && <p className="muted small">Nichts einzukaufen.</p>}
        <ul className="shopping">
          {[...open, ...done].map((i) => <ShoppingRow key={i.key} item={i} checked={plan.checked.includes(i.key)} />)}
        </ul>
        {pantryCount > 0 && (
          <button className="link" onClick={() => setShowPantry(!showPantry)}>
            {showPantry ? 'Grundvorrat ausblenden' : `Grundvorrat zeigen (${pantryCount}: Öl, Gewürze …)`}
          </button>
        )}
      </div>
      <button className="link link--muted center" onClick={() => confirm('Neue Woche beginnen? Plan und Haken werden geleert – die Rezepte bleiben natürlich.') && clearPlan()}>
        Neue Woche beginnen
      </button>
    </Section>
  );

  return (
    <main className="screen screen--tabbed">
      <header className="page-head"><h1>Wochenplan</h1></header>
      <PlanTabs active="plan" />
      <div className="plan-layout">
        <div className="plan-layout__main">{planList}</div>
        <div className="plan-layout__side">{shoppingList}</div>
      </div>
      {picking && <RecipePicker recipes={recipes.filter(plannable)} planned={plan.items.map((i) => i.recipeId)} suggestions={suggestions} onPick={add} onClose={() => setPicking(false)} />}
    </main>
  );
}

function ShoppingRow({ item, checked }: { item: ShoppingItem; checked: boolean }) {
  return (
    <li className={`shopping__item${checked ? ' is-done' : ''}`}>
      <label>
        <input type="checkbox" checked={checked} onChange={() => toggleShoppingItem(item.key)} />
        <span className="shopping__name">{item.name}</span>
        <span className="shopping__qty">{item.quantity}</span>
      </label>
      {item.from.length > 1 && <span className="shopping__from small muted">{item.from.length} Rezepte</span>}
    </li>
  );
}

/**
 * Auswahl als Blatt von unten. Ohne Suchbegriff: Vorschläge in Gruppen
 * (passt zum Plan · Favoriten · lange nicht gekocht), darunter alle übrigen.
 * Beim Tippen: beste Treffer zuerst, Treffer markiert, Enter nimmt den ersten,
 * Pfeiltasten wählen – und Zutaten-Chips für „Was mache ich mit …?“.
 */
function RecipePicker({ recipes, planned, suggestions, onPick, onClose }: {
  recipes: Recipe[];
  planned: string[];
  suggestions: Suggestion[];
  onPick: (r: Recipe) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = recipes.filter((r) => !planned.includes(r.id));
  const query = q.trim();
  const searching = query !== '';
  const hits = searching ? searchRecipes(candidates, query) : [];
  // Chip ausblenden, wenn genau danach schon gesucht wird
  const chips = searching
    ? ingredientCompletions(candidates, query).filter((c) => c.name.toLocaleLowerCase('de-DE') !== query.toLocaleLowerCase('de-DE'))
    : [];
  const groups = searching ? [] : pickerGroups(candidates, suggestions);
  const search = (text: string) => {
    setQ(text);
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && hits[active]) { e.preventDefault(); onPick(hits[active].recipe); }
  };

  let body: ReactNode;
  if (candidates.length === 0) {
    body = recipes.length === 0 ? (
      <div className="empty picker__empty">
        <Icon name="book" size={26} />
        <div className="stack stack--tight">
          <p>Noch keine Rezepte, die du einplanen kannst.</p>
          <p className="small muted">Leg eins an oder spiel eine Sicherung ein (Mehr → Sicherung). KI-Ideen zuerst „Zum Testen“ vormerken.</p>
          <button className="btn btn--soft btn--sm" onClick={() => { onClose(); navigate('/neu/manuell'); }}>Rezept anlegen</button>
        </div>
      </div>
    ) : (
      <p className="muted small">Alle Rezepte sind schon eingeplant.</p>
    );
  } else if (searching) {
    body = hits.length ? (
      <ul className="list">
        {hits.map((h, n) => (
          <PickRow key={h.recipe.id} recipe={h.recipe} active={n === active} onPick={onPick}
            title={highlight(currentContent(h.recipe).title, h.titleMatch)}
            hint={h.ingredient ? `enthält: ${h.ingredient}` : undefined} />
        ))}
      </ul>
    ) : (
      <p className="muted small">Nichts zu „{query}“ gefunden.</p>
    );
  } else {
    body = groups.map((g) => (
      <section key={g.title} className="picker__group">
        <h3 className="picker__heading"><Icon name={g.icon} size={16} /> {g.title}</h3>
        <ul className="list">
          {g.items.map(({ recipe, hint }) => (
            <PickRow key={recipe.id} recipe={recipe} hint={hint} onPick={onPick} title={currentContent(recipe).title} />
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Gericht auswählen" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Gericht auswählen</h2>
        {candidates.length > 0 && (
          <label className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => search(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Rezept oder Zutat, z. B. Hähnchen" aria-label="Rezept suchen" autoFocus
              role="combobox" aria-expanded={searching} aria-controls="picker-results" aria-autocomplete="list" enterKeyHint="go" />
            {q && <button type="button" className="iconbtn iconbtn--sm" onClick={() => search('')} aria-label="Suche leeren"><Icon name="close" size={16} /></button>}
          </label>
        )}
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c) => (
              <button key={c.name} className="chip chip--sm" onClick={() => search(c.name)}>
                {c.name} · {recipeCount(c.count)}
              </button>
            ))}
          </div>
        )}
        <div className="picker" id="picker-results" role="listbox" aria-label="Rezepte">{body}</div>
      </div>
    </div>
  );
}

function PickRow({ recipe, title, hint, active = false, onPick }: {
  recipe: Recipe;
  title: ReactNode;
  hint?: string;
  active?: boolean;
  onPick: (r: Recipe) => void;
}) {
  return (
    <li>
      <button className={`list__item picker__item${active ? ' is-active' : ''}`} role="option" aria-selected={active} onClick={() => onPick(recipe)}>
        <RecipeImage image={recipe.image} size="sm" />
        <span className="suggestion__text">
          <span className="list__title">{title}</span>
          {hint && <span className="small muted">{hint}</span>}
        </span>
        {recipe.status !== 'kochbuch' && <StatusBadge status={recipe.status} />}
      </button>
    </li>
  );
}

/** Den getroffenen Teil des Titels hervorheben: „Crispy <mark>Häh</mark>nchen“. */
function highlight(title: string, m?: { start: number; end: number }): ReactNode {
  if (!m) return title;
  return <>{title.slice(0, m.start)}<mark>{title.slice(m.start, m.end)}</mark>{title.slice(m.end)}</>;
}

const STATUS_ORDER = { kochbuch: 0, bewaehrt: 1, zum_testen: 2, ki_entwurf: 3 };

type PickItem = { recipe: Recipe; hint?: string };

/** Jedes Rezept erscheint nur einmal – in der ersten Gruppe, in die es passt. */
function pickerGroups(candidates: Recipe[], suggestions: Suggestion[]): { title: string; icon: IconName; items: PickItem[] }[] {
  const seen = new Set<string>();
  const take = (list: PickItem[], max: number) => {
    const out = list.filter((x) => !seen.has(x.recipe.id)).slice(0, max);
    out.forEach((x) => seen.add(x.recipe.id));
    return out;
  };
  const ids = new Set(candidates.map((r) => r.id));
  const groups: { title: string; icon: IconName; items: PickItem[] }[] = [
    {
      title: 'Passt zum Plan', icon: 'sparkles',
      items: take(suggestions.filter((s) => ids.has(s.recipe.id)).map((s) => ({ recipe: s.recipe, hint: `Auch drin: ${s.shared.slice(0, 3).join(', ')}` })), 3),
    },
    { title: 'Favoriten', icon: 'heart', items: take(candidates.filter((r) => r.favorite).map((recipe) => ({ recipe })), 5) },
    {
      title: 'Lange nicht gekocht', icon: 'clock',
      items: take(longNotCooked(candidates).map((recipe) => ({ recipe, hint: recipe.lastCookedAt ? `zuletzt ${relativeDay(recipe.lastCookedAt)}` : 'noch nie gekocht' })), 3),
    },
  ];
  const rest = candidates
    .filter((r) => !seen.has(r.id))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || currentContent(a).title.localeCompare(currentContent(b).title, 'de'))
    .map((recipe) => ({ recipe }));
  groups.push({ title: groups.some((g) => g.items.length) ? 'Alle anderen' : 'Alle Rezepte', icon: 'book', items: rest });
  return groups.filter((g) => g.items.length);
}
