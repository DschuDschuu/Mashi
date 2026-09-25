import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DishNutrition } from '../components/DishNutrition';
import { recipeCost, sumCosts } from '../../domain/cost';
import { suggestRecipes, type ShoppingItem, type Suggestion } from '../../domain/mealplan';
import { ingredientCompletions, longNotCooked, searchRecipes } from '../../domain/recipeSearch';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { currentContent } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import {
  addToPlan, clearPlan, removeFromPlan, setPlanServings, togglePlanCooked, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { navigate } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section, Stepper } from '../components/Controls';
import { useMissing } from '../useShoppingCount';
import { useSheet } from '../useSheet';
import { UseUpBadge } from '../components/UseUpBadge';
import { PlannedGroup } from '../components/PlannedGroup';
import { Icon, type IconName } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { StatusBadge } from '../components/StatusBadge';
import { euro, portionCount, recipeCount, relativeDay } from '../format';
import { usePricing } from '../useCosts';
import { cookedToast } from '../cookedToast';
import { useUseUp } from '../useUseUp';
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

  const table = useMemo(() => withMyProducts(foodTable, products), [products]);
  const items = plan.items
    .map((i) => ({ ...i, recipe: recipes.find((r) => r.id === i.recipeId) }))
    .filter((i): i is typeof i & { recipe: Recipe } => !!i.recipe)
    .map((i) => ({ ...i, cooked: plan.cooked.includes(i.recipeId) }))
    // Gekochtes rutscht nach unten – oben steht, was noch ansteht
    .sort((a, b) => Number(a.cooked) - Number(b.cooked));
  const { keys: useUp, plannedUseUp, dishes } = useUseUp();
  const suggestions = useMemo(() => suggestRecipes(plan, recipes.filter(plannable), table, 5, new Set(useUp.keys())), [plan, recipes, table, useUp]);
  // Für das Einkaufswagen-Symbol: wie viel noch zu kaufen ist (ohne Basics wie Öl und Gewürze)
  const missing = useMissing();
  const toBuy = missing.length;
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
      <Section icon="calendar" title={items.length ? `${items.length} ${items.length === 1 ? 'Gericht' : 'Gerichte'} · ${portionCount(portions)}` : 'Noch nichts geplant'}>
        {items.length === 0 ? (
          <Empty icon="calendar">Wähle ein Gericht – Mashi schlägt dir dann Rezepte mit ähnlichen Zutaten vor. So kaufst du weniger ein und es bleibt nichts übrig.</Empty>
        ) : (
          <ul className="list plan-list">
            {items.map(({ recipe, servings, cooked, variants }) => (
              <li key={recipe.id} className={`list__item${cooked ? ' is-cooked' : ''}`}>
                <button className={`plan-cooked${cooked ? ' is-on' : ''}`} onClick={() => cookedToast(togglePlanCooked(recipe.id))}
                  aria-pressed={cooked} aria-label={cooked ? `${currentContent(recipe).title}: doch noch nicht gekocht` : `${currentContent(recipe).title} gekocht`}>
                  <Icon name="check" size={16} />
                </button>
                <button className="plan-list__hit" onClick={() => navigate(`/rezept/${recipe.id}`)}>
                  <span className="img-badged">
                    <RecipeImage image={recipe.image} size="sm" />
                    {!cooked && <UseUpBadge compact names={plannedUseUp.get(recipe.id) ?? []} />}
                  </span>
                  <span className="suggestion__text">
                    <span className="list__title">{currentContent(recipe).title}</span>
                  </span>
                </button>
                {/* eigene Zeile unter Bild und Titel – sonst bleibt neben dem Portionen-Regler nur ein schmaler Streifen */}
                <div className="plan-list__meta">
                  <DishNutrition content={currentContent(recipe)} own={variants} recipeId={cooked ? undefined : recipe.id} />
                  {costs.get(recipe.id) && <span className="small muted">ca. {euro(costs.get(recipe.id)!.total)}</span>}
                </div>
                <div className="plan-list__servings">
                  <span className="small muted" aria-hidden="true">Portionen</span>
                  <Stepper small value={servings} onChange={(v) => setPlanServings(recipe.id, v)} label={`Portionen ${currentContent(recipe).title}`} />
                </div>
                <button className="iconbtn iconbtn--sm" aria-label={`${currentContent(recipe).title} aus dem Plan nehmen`} onClick={() => {
                  const undo = removeFromPlan(recipe.id);
                  toast(`„${currentContent(recipe).title}“ aus dem Plan genommen`, { label: 'Rückgängig', run: undo });
                }}>
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
        {items.length > 0 && (
          <button className="link link--muted center" onClick={() => confirm('Neue Woche beginnen? Plan, Haken und „Gekocht“ werden geleert – die Rezepte bleiben natürlich.') && clearPlan()}>
            Neue Woche beginnen
          </button>
        )}
      </Section>
    </>
  );

  // Rechts (Tablet) bzw. unten (Handy): was noch fehlt (immer offen), darunter was die Gerichte
  // aus der Speisekammer nehmen (zum Aufklappen) – statt „Passt dazu“.
  // Vorschläge gibt es weiter beim „Gericht hinzufügen“.
  const reserved = dishes.filter((d) => d.taken.length);
  const sideList = (
    <>
      <MissingPanel items={missing} />
      {reserved.length > 0 && <PlannedGroup dishes={reserved} urgent={plannedUseUp} />}
    </>
  );

  return (
    <main className="screen screen--tabbed">
      <header className="page-head">
        <h1>Wochenplan</h1>
        <button className="iconbtn iconbtn--box cart-btn" onClick={() => navigate('/einkauf')}
          aria-label={toBuy ? `Einkaufsliste – noch ${toBuy} Artikel` : 'Einkaufsliste'}>
          <Icon name="cart" size={22} />
          {toBuy > 0 && <span className="iconbtn__count">{toBuy}</span>}
        </button>
      </header>
      <div className="plan-layout">
        <div className="plan-layout__main">{planList}</div>
        <div className="plan-layout__side">{sideList}</div>
      </div>
      {picking && <RecipePicker recipes={recipes.filter(plannable)} planned={plan.items.map((i) => i.recipeId)} suggestions={suggestions} onPick={add} onClose={() => setPicking(false)} />}
    </main>
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
  const sheetRef = useSheet(onClose);

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
          <p className="small muted">Leg eins an oder spiel eine Sicherung ein (Einstellungen → Sicherung). KI-Ideen zuerst „Zum Testen“ vormerken.</p>
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
      <div className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Gericht auswählen" onClick={(e) => e.stopPropagation()} ref={sheetRef}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Gericht auswählen</h2>
        {candidates.length > 0 && (
          <label className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => search(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Rezept oder Zutat, z. B. Hähnchen" aria-label="Rezept suchen" autoFocus
              aria-controls="picker-results" enterKeyHint="go" />
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
        <div className="picker" id="picker-results" aria-label="Rezepte" aria-live="polite">{body}</div>
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
      <button className={`list__item picker__item${active ? ' is-active' : ''}`} aria-current={active ? 'true' : undefined} onClick={() => onPick(recipe)}>
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

/** „Fehlt noch“: was für die geplanten Gerichte noch eingekauft werden muss – immer offen, führt zur Einkaufsliste. */
function MissingPanel({ items }: { items: ShoppingItem[] }) {
  return (
    <section className="panel missing" aria-labelledby="missing-title">
      <div className="row-between">
        <h2 className="missing__title" id="missing-title"><Icon name="cart" size={18} /> Fehlt noch{items.length ? ` (${items.length})` : ''}</h2>
        {items.length > 0 && <button className="link" onClick={() => navigate('/einkauf')}>Einkaufsliste</button>}
      </div>
      {items.length === 0 ? (
        <p className="muted small">Alles da – für die geplanten Gerichte musst du nichts mehr kaufen.</p>
      ) : (
        <ul className="missing__list">
          {items.map((i) => (
            <li key={i.key}><span>{i.name}</span><span className="muted">{i.quantity}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
