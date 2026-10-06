import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ask } from '../confirm';
import { DishNutrition } from '../components/DishNutrition';
import { recipeCost, sumCosts } from '../../domain/cost';
import { suggestRecipes, type ShoppingItem, type Suggestion } from '../../domain/mealplan';
import { ingredientCompletions, longNotCooked, searchRecipes } from '../../domain/recipeSearch';
import { currentContent } from '../../domain/recipe';
import { asCooked } from '../../domain/scaling';
import { doneParts, partLabel } from '../../domain/parts';
import { pickFor } from '../../domain/nutrition/variants';
import type { Recipe } from '../../domain/types';
import { preparedOf } from '../../domain/prepared';
import { thawFit, thawNeeds, type ThawNeed } from '../../domain/pantry';
import { packLabel } from '../../domain/pantryLabel';
import { specialDays } from '../../domain/shelfLife';
import {
  addToPlan, clearCooked, eatPreparedPortions, removeFromPlan, setPlanAmounts, setPlanServings, thawPantryItem, togglePlanCooked, useFoodTable, usePantry, usePlan, useRecipes,
} from '../../data/store';
import { navigate } from '../../router';
import { CartButton } from '../components/CartButton';
import { Empty, Section, Stepper } from '../components/Controls';
import { useMissing } from '../useShoppingCount';
import { useSheet } from '../useSheet';
import { UseUpBadge } from '../components/UseUpBadge';
import { PlannedGroup } from '../components/PlannedGroup';
import { Icon, type IconName } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { amountsText, moreLabel, useMorePrompt, usePlannedMore, UseMoreSheet } from '../components/UseMoreSheet';
import { StatusBadge } from '../components/StatusBadge';
import { euro, portionCount, recipeCount, relativeDay } from '../format';
import { usePricing } from '../useCosts';
import { choicesFor } from '../useNutrition';
import { cookedToast } from '../cookedToast';
import { useUseUp } from '../useUseUp';
import { toast } from '../toast';

/** Was sich planen lässt: alles außer Archiv und reinen KI-Ideen (die sind noch kein Rezept). */
const plannable = (r: Recipe) => !r.archivedAt && r.status !== 'ki_entwurf';

/**
 * Wochenplan – Meal Prep ohne feste Tage: Gerichte sammeln, Mashi schlägt passende vor
 * (ähnliche Zutaten = weniger Einkauf, weniger Reste), daraus entsteht die Einkaufsliste.
 * Plan und Haken sind auf allen Geräten gleich (werden abgeglichen).
 */
export function PlanScreen() {
  const recipes = useRecipes();
  const plan = usePlan();
  const [picking, setPicking] = useState(false);

  const table = useFoodTable();
  const items = plan.items
    .map((i) => ({ ...i, recipe: recipes.find((r) => r.id === i.recipeId) }))
    .filter((i): i is typeof i & { recipe: Recipe } => !!i.recipe)
    .map((i) => ({ ...i, cooked: plan.cooked.includes(i.recipeId) }))
    // Gekochtes rutscht nach unten – oben steht, was noch ansteht
    .sort((a, b) => Number(a.cooked) - Number(b.cooked));
  const { keys: useUp, plannedUseUp, dishes } = useUseUp();
  const suggestions = useMemo(() => suggestRecipes(plan, recipes.filter(plannable), table, 5, new Set(useUp.keys())), [plan, recipes, table, useUp]);
  const missing = useMissing();
  const portions = items.reduce((s, i) => s + i.servings, 0);
  const { prices } = usePricing();
  // wie gekocht: „nur dieses Mal“-Mengen und dieselbe Sorte wie bei den Nährwerten (Julia: 3 statt 1 Paprika kostet auch mehr)
  const costs = useMemo(() => new Map(items.map((i) => {
    const c = asCooked(currentContent(i.recipe), i.servings, i.amounts);
    return [i.recipeId, recipeCost(c, i.servings, table, prices, pickFor(choicesFor(c), i.variants))];
  })), [items, table, prices]);
  const week = sumCosts([...costs.values()]);

  // was ein Gericht vorher auftauen muss – aus derselben Reservierung wie „Für den Wochenplan“
  const thawOf = (recipeId: string) => { const d = dishes.find((x) => x.recipeId === recipeId); return d ? thawNeeds(d, table) : []; };

  // wie „Zum Wochenplan“ im Rezept: läuft etwas daraus bald ab, erst fragen, wie viel davon
  const more = useMorePrompt();
  const add = (r: Recipe) => {
    const c = currentContent(r);
    setPicking(false);
    more.ask(c, c.servings, (amounts) => {
      if (addToPlan(r.id, c.servings, {}, amounts)) toast(`„${c.title}“ eingeplant`);
    });
  };

  const planList = (
    <>
      <Section icon="calendar" title={items.length ? `${items.length} ${items.length === 1 ? 'Gericht' : 'Gerichte'} · ${portionCount(portions)}` : 'Noch nichts geplant'}>
        {items.length === 0 ? (
          <Empty icon="calendar">Wähle ein Gericht – Mashi schlägt dir dann Rezepte mit ähnlichen Zutaten vor. So kaufst du weniger ein und es bleibt nichts übrig.</Empty>
        ) : (
          <ul className="list plan-list">
            {items.map(({ recipe, servings, cooked, variants, amounts }) => (
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
                  {cooked && <PreparedLine recipeId={recipe.id} />}
                  {!cooked && <DonePartsLine recipeId={recipe.id} />}
                  {/* mit den „nur dieses Mal“-Mengen (Julia: überall dieselbe Zahl) */}
                  <DishNutrition content={asCooked(currentContent(recipe), servings, amounts)} own={variants} recipeId={cooked ? undefined : recipe.id} />
                  {/* pro Portion, nur wenn alle Preise bekannt sind – sonst nichts (Julia, wie auf der Rezeptkarte) */}
                  {costs.get(recipe.id) && !costs.get(recipe.id)!.missing.length && <span className="small muted">ca. {euro(costs.get(recipe.id)!.perServing)} pro Portion</span>}
                </div>
                {/* eigene Zeile über die ganze Karte – neben dem Portionen-Regler wäre sie zu schmal */}
                {!cooked && <ThawPill needs={thawOf(recipe.id)} recipeId={recipe.id} title={currentContent(recipe).title} servings={servings} />}
                {!cooked && <PlanAmounts recipe={recipe} servings={servings} amounts={amounts ?? {}} />}
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
            <span>Im Plan ca. <strong>{euro(week.total)}</strong></span>
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
        {/* statt „Neue Woche“: der Plan läuft weiter – nur Gekochtes kommt raus, Vorgekochtes bleibt in der Speisekammer */}
        {plan.cooked.length > 0 && (
          <button className="link link--muted center" onClick={async () => {
            if (await ask({ title: 'Gekochte Gerichte aus dem Plan nehmen?', text: 'Geplantes bleibt, Vorgekochtes bleibt in der Speisekammer.', confirm: 'Aus dem Plan nehmen' })) clearCooked();
          }}>
            Gekochtes aufräumen
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
      {/* die Einkaufsliste sitzt jetzt oben rechts in der Speisekammer; hier führt „Fehlt noch“ hin */}
      {/* Wagen hier statt in der Speisekammer (Julia): einkaufen gehört zum Plan */}
      <header className="page-head"><h1>Wochenplan</h1><CartButton /></header>
      <div className="plan-layout">
        <div className="plan-layout__main">{planList}</div>
        <div className="plan-layout__side">{sideList}</div>
      </div>
      {more.sheet}
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

/**
 * „❄ Rinderhack auftauen“ – Verplantes liegt nur gefroren da. Ohne feste Tage weiß Mashi nicht, wann gekocht
 * wird, also steht der Hinweis, bis aufgetaut ist. Antippen taut genau das Gebrauchte auf (2 von 3 Packungen).
 */
/**
 * „3 Paprika statt 1 · ändern“ (Julia: solange es im Wochenplan steht, noch anpassbar) – oder, wenn noch nichts
 * gewählt ist und etwas aus dem Rezept bald abläuft: „Läuft bald ab: Paprika – mehr verwenden?“.
 */
function PlanAmounts({ recipe, servings, amounts }: { recipe: Recipe; servings: number; amounts: Record<string, number> }) {
  const { uses, base } = usePlannedMore(recipe, servings);
  const [open, setOpen] = useState(false);
  const chosen = Object.keys(amounts).length > 0;
  // ändern: was es zu verwenden gibt – gewählt oder bald ablaufend; gewöhnliche Reste fragt erst der Kochmodus
  const offer = uses.filter((u) => u.ingredientId in amounts || u.until);
  if (!chosen && !offer.length) return null;
  const title = currentContent(recipe).title;
  const save = (next: Record<string, number>) => {
    setOpen(false);
    setPlanAmounts(recipe.id, next);
    toast(Object.keys(next).length ? `„${title}“: ${amountsText(next, base)}` : `„${title}“ wieder wie im Rezept`,
      { label: 'Rückgängig', run: () => setPlanAmounts(recipe.id, amounts) });
  };
  return (
    <div className="plan-amounts">
      {chosen ? (
        <>
          <span className="small">{amountsText(amounts, base)}</span>
          {offer.length > 0
            ? <button type="button" className="chip chip--sm" onClick={() => setOpen(true)}><Icon name="pencil" size={13} /> Ändern</button>
            // nichts mehr im Vorrat, das man mehr verwenden könnte – nur zurück auf das Rezept
            : <button type="button" className="chip chip--sm" onClick={() => save({})}>Wie im Rezept</button>}
        </>
      ) : (
        <button type="button" className="chip chip--sm plan-amounts__soon" onClick={() => setOpen(true)}>
          {/* kurz (Julia): die Uhr sagt „läuft bald ab“, das Blatt nennt dann das Datum */}
          <Icon name="clock" size={13} /> {moreLabel(offer.map((u) => u.name))}
        </button>
      )}
      {open && <UseMoreSheet uses={offer} initial={amounts} onClose={() => setOpen(false)} onDone={save} />}
    </div>
  );
}

function ThawPill({ needs, recipeId, title, servings }: { needs: ThawNeed[]; recipeId: string; title: string; servings: number }) {
  const pantry = usePantry();
  if (!needs.length) return null;
  const names = [...new Set(needs.map((n) => n.item.name))];
  const thaw = () => {
    const undos = needs.map((n) => thawPantryItem(n.item.id, n.amount));
    const d = specialDays('thawed', pantry.shelfDays);
    toast(`${names.join(', ')} aufgetaut – hält noch ${d === 1 ? 'einen Tag' : `${d} Tage`}`, { label: 'Rückgängig', run: () => undos.reverse().forEach((u) => u()) });
  };
  // ganze Packungen passen selten genau: wofür reicht das Aufgetaute – oder eine Packung weniger?
  const fit = thawFit(needs, servings);
  const one = needs.length === 1 ? needs[0] : undefined;
  const count = one?.amount !== undefined ? ` (${one.amount} ${one.item.pack ? (one.amount === 1 ? 'Packung' : 'Packungen') : 'Stück'})` : '';
  const thawedLabel = !one ? 'Das Aufgetaute'
    : one.item.pack && one.amount !== undefined ? packLabel({ amount: one.amount * one.item.pack.amount, unit: one.item.pack.unit })
    : one.amount !== undefined ? `${one.amount} Stück`
    : one.item.amount !== undefined && (one.item.unit === 'g' || one.item.unit === 'ml') ? packLabel({ amount: one.item.amount, unit: one.item.unit })
    : 'Das Aufgetaute';
  const setTo = (n: number) => {
    setPlanServings(recipeId, n);
    toast(`„${title}“ auf ${n} Portionen – die Einkaufsliste passt sich an`, { label: 'Rückgängig', run: () => setPlanServings(recipeId, servings) });
  };
  return (
    <div className="thaw plan-list__thaw">
      <button type="button" className="eat-pill thaw-pill" onClick={thaw}>
        <Icon name="snow" size={13} /> {names.join(', ')} auftauen{count}
      </button>
      {fit.up && (
        <span className="thaw__fit">{thawedLabel} reicht für {fit.up} Portionen
          <button type="button" className="chip chip--sm" onClick={() => setTo(fit.up!)}>Auf {fit.up}</button>
        </span>
      )}
      {fit.down && (
        <span className="thaw__fit">{fit.down.packs} {fit.down.packs === 1 ? 'Packung reicht' : 'Packungen reichen'} für {fit.down.servings}
          <button type="button" className="chip chip--sm" onClick={() => setTo(fit.down!.servings)}>Auf {fit.down.servings}</button>
        </span>
      )}
    </div>
  );
}

/** Teile, die schon fertig in der Speisekammer stehen (Julia: „Sauce gestern gekocht“) – „Sauce fertig“ */
function DonePartsLine({ recipeId }: { recipeId: string }) {
  const done = doneParts(usePantry().items, recipeId);
  if (!done.length) return null;
  return <span className="small plan-done-parts"><Icon name="check" size={13} /> {done.map(partLabel).join(', ')} fertig</span>;
}

/** Gekocht – und wenn etwas übrig ist: „Vorgekocht · noch 3 Portionen“ mit „1 essen“ (Aktiv wie in der Speisekammer) */
function PreparedLine({ recipeId }: { recipeId: string }) {
  const pantry = usePantry();
  const { fresh, frozen, items } = preparedOf(pantry, recipeId);
  if (!fresh && !frozen) return <span className="plan-list__done"><Icon name="check" size={13} /> Gekocht</span>;
  // zuerst das, was am längsten steht
  const next = items.filter((x) => !x.frozenAt).sort((a, b) => (a.boughtAt ?? a.addedAt).localeCompare(b.boughtAt ?? b.addedAt))[0];
  const portions = (n: number) => `${n.toLocaleString('de-DE')} ${n === 1 ? 'Portion' : 'Portionen'}`;
  return (
    <span className="plan-list__prepared">
      <span className="plan-list__done"><Icon name="check" size={13} /> Vorgekocht{fresh ? ` · noch ${portions(fresh)}` : ''}{frozen ? ` · ${portions(frozen)} eingefroren` : ''}</span>
      {next && (
        <button type="button" className="eat-pill" onClick={() => {
          const undo = eatPreparedPortions(next.id, 1);
          toast(fresh > 1 ? `Guten Appetit! Noch ${portions(fresh - 1)}` : 'Aufgegessen', { label: 'Rückgängig', run: undo });
        }} aria-label="1 Portion essen"><Icon name="cutlery" size={13} /> 1 essen</button>
      )}
    </span>
  );
}
