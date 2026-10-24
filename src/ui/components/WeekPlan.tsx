import { useMemo, useState, type ReactNode } from 'react';
import { currentContent, newId } from '../../domain/recipe';
import {
  DAY_LONG, DAY_SHORT, addBase, mealKey, setExtra, addToBase, byEffort, canLessPortions, canSwap, earlierCookDay, keepsOf, mealTitle, mhdFinds, moveBase, putMeal, swapCookDays, putPrepared, removeMeal,
  servingsOf, setMealPortions, sortCookDays, stepPortions, swapDays, toggleLunch, transformsOf, weekdayOf, weekStarted, weekView,
  type BaseView, type DayView, type MealView, type MhdFind, type WeekView,
} from '../../domain/week';
import type { Week, Weekday } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { ComboBuilder } from './ComboBuilder';
import { preparedPortions } from '../../domain/baseStock';
import { specialDays } from '../../domain/shelfLife';
import { freezePantryItem, householdOf, setWeek, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Stepper } from './Controls';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

const title = (r?: Recipe) => (r ? currentContent(r).title : 'Gelöschtes Rezept');
/** ein Abend mit seiner Beilage („Bolognese mit Spätzle“) */
const mealText = (m?: MealView) => (m ? mealTitle(m.meal, m.recipe) : title(undefined));
const portionText = (n: number) => `${n} ${n === 1 ? 'Portion' : 'Portionen'}`;

/**
 * Deine Woche (Julia: Grundlagen am Kochtag, daraus die Abendessen): Kochtage, was an jedem Kochtag gekocht wird
 * (Portionen, einfrieren, „lässt sich auch am Sonntag vorbereiten“), MHD-Funde aus dem Einkauf und
 * „Mittags & abends“ – zum Tauschen einen Abend antippen, dann den anderen; einen freien Abend antippen: „Was gibt's?“.
 * `onPickDish` öffnet den Kochbuch-Picker für einen Abend (liegt im PlanScreen).
 */
export function WeekPlan({ week, onPickDish }: { week: Week; onPickDish?: (day: Weekday, replaceMealId?: string) => void }) {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const table = useFoodTable();
  const hh = householdOf(plan);
  const fallback = specialDays('prepared', pantry.shelfDays);
  const view = useMemo(() => weekView(week, recipes, hh, fallback), [week, recipes, hh, fallback]);
  const cookDays = sortCookDays(week.cookDays);
  const started = weekStarted(week);
  const [swapFrom, setSwapFrom] = useState<Weekday | null>(null);
  const [what, setWhat] = useState<{ day: Weekday; replace?: MealView; from?: string } | null>(null);

  /** jede Änderung der Woche mit „Rückgängig“ */
  const change = (next: Week, text: string) => {
    if (next === week) return;
    toast(text, { label: 'Rückgängig', run: setWeek(next) });
  };

  // „+“ / „−“ am Kochtag (Julia: Portionen landen auf freien Abenden statt im Gefrierfach) – der Toast sagt, welcher Abend
  const stepBase = (b: BaseView, up: boolean) => {
    const next = stepPortions(week, b.base.recipeId, up, recipes, hh, () => newId('w'), fallback);
    const added = next.meals.find((m) => !week.meals.some((x) => x.id === m.id));
    // reicht es für einen neuen Abend, fragen statt raten (Julia: „was soll die 3. Portion sein?“) – erst als Vorrat
    // merken, „Was gibt's?“ isst dann davon; wird das Sheet geschlossen, bleibt die Portion Vorrat
    if (added) {
      change(setExtra(week, b.base.recipeId, (b.base.extra ?? 0) + 1), `${title(b.recipe)}: ${portionText(b.portions + 1)} – was gibt's am ${DAY_LONG[added.day]}?`);
      setWhat({ day: added.day, from: b.base.recipeId });
      return;
    }
    const gone = week.meals.find((m) => !next.meals.some((x) => x.id === m.id));
    const n = weekView(next, recipes, hh, fallback).bases.find((x) => x.base.recipeId === b.base.recipeId)?.portions ?? 0;
    const day = gone ? ` – ${DAY_LONG[gone.day]} wieder frei` : '';
    change(next, `${title(b.recipe)}: ${portionText(n)}${day}`);
  };

  // Kochtag dezent (Julia: „die Kochleiste soll weg, nur sehr dezent im Wochenplan“): Hinweis in der Abendzeile, die
  // Werkzeuge (Portionen, tauschen, Vorkochen) erst beim Antippen
  const cookBases = (day: Weekday) => view.bases.filter((b) => b.base.day === day);
  const cookNote = (day: Weekday) => (cookBases(day).length ? `${cookBases(day).map((b) => title(b.recipe)).join(' + ')} vorkochen` : undefined);
  const cookTools = (day: Weekday) => cookBases(day).length > 0 && (
    <CookStrip day={day} bases={cookBases(day)} week={week} recipes={recipes} cookDays={cookDays} fallback={fallback} change={change} onStep={stepBase} />
  );

  const put = (day: Weekday, recipeId: string, baseId: string, side?: string) => {
    setWhat(null);
    change(putMeal(week, day, recipeId, baseId, hh, () => newId('w'), side), `${DAY_LONG[day]}: ${mealTitle({ side }, recipes.find((r) => r.id === recipeId))}`);
  };
  const putStock = (day: Weekday, recipeId: string) => {
    setWhat(null);
    change(putPrepared(week, day, recipeId, hh, () => newId('w')), `${DAY_LONG[day]}: ${title(recipes.find((r) => r.id === recipeId))} aus dem Vorrat`);
  };
  // heute markieren, Vergangenes grau – nur wenn die Woche läuft (ohne Datum wüsste Mashi sonst nicht, welche Woche gemeint ist)
  const today = weekdayOf(new Date());
  const past = (d: Weekday) => started && view.order.indexOf(d) < view.order.indexOf(today);

  const tapDay = (d: DayView) => {
    if (swapFrom === null) {
      if (!d.meal) setWhat({ day: d.day });
      else if (!d.meal.meal.done) setSwapFrom(d.day);
      return;
    }
    if (swapFrom === d.day) return setSwapFrom(null);
    if (!canSwap(week, swapFrom, d.day)) return;
    const a = view.days.find((x) => x.day === swapFrom)?.meal, b = d.meal;
    setSwapFrom(null);
    change(swapDays(week, swapFrom, d.day), b ? `${mealText(a)} und ${mealText(b)} getauscht` : `${mealText(a)} auf ${DAY_LONG[d.day]} verschoben`);
  };

  const finds = mhdFinds(pantry.items, week, recipes, table, new Date());

  return (
    <div className="week">
      {finds.length > 0 && <MhdFinds finds={finds} week={week} change={change} />}

      <section className="week__days" aria-label={hh.lunchDays.length ? 'Mittags und abends' : 'Abends'}>
        <h2 className="h3">{hh.lunchDays.length ? 'Mittags & abends' : 'Abends'}</h2>
        {swapFrom !== null
          ? (
            <div className="week__swapbar" role="status">
              <Icon name="shuffle" size={16} />
              <span><b>{mealText(view.days.find((d) => d.day === swapFrom)?.meal)}</b> – mit welchem Abend tauschen?</span>
              <button type="button" className="link small" onClick={() => setSwapFrom(null)}>Abbrechen</button>
              {(() => {
                const m = view.days.find((d) => d.day === swapFrom)?.meal;
                if (!m) return null;
                const n = servingsOf(m.meal, hh);
                return (
                  <div className="week__swaptools">
                    {/* Portionen nur für diesen Abend (Julia: Gäste) – der Kochtag rechnet sie mit */}
                    <span className="small muted">Portionen</span>
                    <Stepper small value={n} label={`Portionen am ${DAY_LONG[m.meal.day]}`}
                      onChange={(v) => change(setMealPortions(week, m.meal.id, v, hh), `${DAY_SHORT[m.meal.day]}: ${portionText(v)}`)} />
                    <button type="button" className="link small" onClick={() => { setSwapFrom(null); setWhat({ day: m.meal.day, replace: m }); }}>Anderes Gericht</button>
                    {/* oder ganz rausnehmen (Julia) – mit Rückgängig wie jede Änderung der Woche; als Icon, damit alles in eine Zeile passt */}
                    <button type="button" className="iconbtn iconbtn--sm" aria-label="Abend löschen" onClick={() => { setSwapFrom(null); change(removeMeal(week, m.meal.id), `${mealText(m)} gestrichen`); }}><Icon name="trash" size={16} /></button>
                  </div>
                );
              })()}
              {swapFrom !== null && cookTools(swapFrom)}
            </div>
          )
          : <p className="small muted">Am Kochtag (Topf) wird die Grundlage gekocht, ihre Gerichte kommen auf die folgenden Abende. Abend antippen: tauschen, Portionen, Kochtag. Freien Abend antippen: was es gibt{hh.lunchDays.length ? '. × nimmt einen Mittag raus (Kantine, auswärts).' : '.'}</p>}
        <div className="week__list">
          {view.days.map((d) => (
            <div key={d.day} className={`week__day${past(d.day) ? ' is-past' : ''}${started && d.day === today ? ' is-today' : ''}`} aria-current={started && d.day === today ? 'date' : undefined}>
              {hh.lunchDays.includes(d.day) && <LunchRow d={d} onToggle={() => change(toggleLunch(week, d.day), d.noLunch ? `${DAY_SHORT[d.day]} mittags wieder geplant` : `${DAY_SHORT[d.day]} kein Mittagessen`)} />}
              <MealRow d={d} swapFrom={swapFrom} week={week} onTap={() => tapDay(d)} cookNote={cookNote(d.day)} />
            </div>
          ))}
        </div>
      </section>

      <div className="week__end">
        {/* „Woche leeren“ steht oben auf der Plan-Seite (Julia: gut sichtbar) */}
        <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/plan/woche')}><Icon name="pencil" size={16} /> Woche ändern</button>
      </div>

      {what && (
        <WhatSheet cook={what.from ? undefined : cookTools(what.day)} day={what.day} replace={what.replace} from={what.from} view={view} recipes={recipes} fallback={fallback} onClose={() => setWhat(null)}
          stock={preparedPortions(pantry.items)} onStock={(recipeId) => putStock(what.day, recipeId)}
          onPut={(recipeId, baseId, side) => put(what.day, recipeId, baseId, side)}
          onCookbook={onPickDish && (() => { setWhat(null); onPickDish(what.day, what.replace?.meal.id); })} />
      )}
    </div>
  );
}

/**
 * „Was gibt's?“ (Julia: freien Abend antippen) – aus den Grundlagen, die bis dahin gekocht sind und noch halten:
 * die Grundlage mit Beilage (Beilagen oben), ohne, oder eine Verwandlung (wenig Aufwand zuerst). Oder aus dem Kochbuch.
 */
function WhatSheet({ cook, day, replace, from, view, recipes, fallback, stock, onStock, onPut, onCookbook, onClose }: {
  cook?: ReactNode; day: Weekday; replace?: MealView; from?: string; view: WeekView; recipes: Recipe[]; fallback: number; stock: Map<string, number>;
  onStock: (recipeId: string) => void; onPut: (recipeId: string, baseId: string, side?: string) => void; onCookbook?: () => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const at = view.order.indexOf(day);
  // Vorgekochtes zuerst (damit nichts verdirbt) – was schon als Grundlage in der Woche steht, kommt unten mit
  const weekBases = new Set(view.bases.map((b) => b.base.recipeId));
  const prepared = [...stock].flatMap(([id, n]) => { const r = recipes.find((x) => x.id === id); return r && !weekBases.has(id) ? [{ r, n }] : []; });
  const options = view.bases.flatMap((b) => {
    const age = at - view.order.indexOf(b.base.day);
    const old = age >= keepsOf(b.recipe, fallback);
    if (age < 0 || !b.recipe || (old && !b.recipe.freezable)) return [];
    return [{ b, frost: old, dishes: byEffort(transformsOf(b.base.recipeId, recipes)) }];
  });
  const current = (recipeId: string, side?: string) => replace?.meal.recipeId === recipeId && replace.meal.side === side;
  const chip = (recipeId: string, baseId: string, text: string, side?: string) => (
    <button key={`${recipeId}+${side ?? ''}`} type="button" className={`chip${current(recipeId, side) ? ' is-on' : ''}`} onClick={() => onPut(recipeId, baseId, side)}>{text}</button>
  );
  const fromBase = from ? view.bases.find((b) => b.base.recipeId === from) : undefined;
  const heading = replace ? `${DAY_LONG[day]}: statt ${mealText(replace)}` : fromBase ? `${DAY_LONG[day]}: was wird aus der neuen Portion ${title(fromBase.recipe)}?` : `Was gibt's am ${DAY_LONG[day]}?`;
  // nach „+“ am Kochtag: was diese Woche schon aus der Grundlage zusammengestellt ist, zuerst (Julia: nicht das gespeicherte Rezept raten)
  const again = from ? [...new Map(view.days.flatMap((d) => (d.meal && d.meal.meal.baseId === from ? [[mealKey(d.meal.meal.recipeId, d.meal.meal.side), d.meal]] as const : []))).values()] : [];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{heading}</h2>
        {cook}
        {again.length > 0 && (
          <section className="what__base">
            <h3 className="small muted">Wie schon diese Woche</h3>
            <div className="chips" role="group" aria-label="Wie schon diese Woche">
              {again.map((m) => <button key={m.meal.id} type="button" className="chip" onClick={() => onPut(m.meal.recipeId, from!, m.meal.side)}>{mealText(m)}</button>)}
            </div>
          </section>
        )}
        {prepared.length > 0 && (
          <section className="what__base">
            <h3 className="small muted">Aus dem Vorrat</h3>
            <div className="chips" role="group" aria-label="Aus dem Vorrat">
              {prepared.map(({ r, n }) => (
                <button key={r.id} type="button" className="chip" onClick={() => onStock(r.id)}>{title(r)} · {portionText(n)}</button>
              ))}
            </div>
          </section>
        )}
        {options.length > 0
          ? <h3 className="small muted">Aus der Woche</h3>
          : <p className="small muted">Bis {DAY_LONG[day]} ist noch nichts vorgekocht, das dann noch hält.</p>}
        {[...options].sort((x, y) => Number(y.b.base.recipeId === from) - Number(x.b.base.recipeId === from)).map(({ b, frost, dishes }) => (
          <section key={b.base.recipeId} className="what__base">
            <p className="what__head">
              <b>{title(b.recipe)}</b>
              <span className="small muted"> · vom {DAY_LONG[b.base.day]}{b.base.extra ? ` · ${portionText(b.base.extra)} übrig` : ''}{frost ? ' · aus dem Gefrierfach' : ''}</span>
            </p>
            <div className="chips" role="group" aria-label={`Aus ${title(b.recipe)}`}>
              {dishes.length > 0 ? dishes.map((r) => chip(r.id, b.base.recipeId, title(r))) : chip(b.base.recipeId, b.base.recipeId, title(b.recipe))}
            </div>
            {/* Grundlage mit Bausteinen (Julia: Baukasten statt nur „+ Beilage“) */}
            {dishes.length > 0 && <ComboBuilder label="Zusammenstellen" onAdd={(side) => onPut(b.base.recipeId, b.base.recipeId, side)} />}
          </section>
        ))}
        {onCookbook && (
          <button type="button" className="btn btn--soft btn--block" onClick={onCookbook}><Icon name="book" size={18} /> Aus dem Kochbuch …</button>
        )}
      </div>
    </div>
  );
}

/**
 * Kochzeile in der Tagesliste (Julia: „die Kochtage in den Wochenplan, das Vorkochen nicht so groß – ich will sehen,
 * was geplant ist“): was an dem Tag vorgekocht wird, mit Portionen, „⇄“ zum Tauschen mit einem anderen Kochtag
 * (Grundlagen samt Abenden, week.ts: swapCookDays) und Vorkochen.
 */
function CookStrip({ day, bases, week, recipes, cookDays, fallback, change, onStep }: {
  day: Weekday; bases: BaseView[]; week: Week; recipes: Recipe[]; cookDays: Weekday[]; fallback: number; change: (w: Week, text: string) => void;
  onStep: (b: BaseView, up: boolean) => void;
}) {
  const others = cookDays.filter((d) => d !== day);
  const open = bases.filter((b) => !b.base.cooked);
  const swaps = others.map((d) => (
    <button key={d} type="button" className="chip chip--sm" aria-label={`Kochtag ${DAY_LONG[day]} mit ${DAY_LONG[d]} tauschen`}
      onClick={() => change(swapCookDays(week, day, d), `${DAY_LONG[day]} und ${DAY_LONG[d]} getauscht`)}><Icon name="shuffle" size={12} /> {DAY_SHORT[d]}</button>
  ));
  return (
    <div className={`cookstrip${bases.length ? '' : ' cookstrip--free'}`}>
      {!bases.length && <span className="cookstrip__base"><Icon name="pot" size={16} /><span className="small muted">Kochtag – nichts vorzukochen</span></span>}
      {bases.map((b) => {
        const early = earlierCookDay(week, b.base.recipeId, recipes, fallback);
        return (
          <div key={b.base.recipeId} className="cookstrip__base">
            <Icon name="pot" size={16} />
            <span className="cookstrip__text">
              <span><b>Kochen:</b> <button type="button" className="cookstrip__name" onClick={() => navigate(`/rezept/${b.base.recipeId}`)}>{title(b.recipe)}</button></span>
              <span className="small muted">
                {b.evenings} {b.evenings === 1 ? 'Abend' : 'Abende'}{b.lunches ? ` + ${b.lunches} ${b.lunches === 1 ? 'Mittag' : 'Mittage'}` : ''}{b.base.extra ? ` + ${b.base.extra} Vorrat` : ''}
                {!b.base.cooked && b.frozen > 0 && <> · <Icon name="snow" size={11} /> {portionText(b.frozen)} einfrieren</>}
              </span>
              {(b.base.adds ?? []).map((a) => <span key={a} className="tag tag--mhd">+ {a} (MHD)</span>)}
              {!b.base.cooked && early && (
                <button type="button" className="link small" onClick={() => change(moveBase(week, b.base.recipeId, early.day), `${title(b.recipe)} am ${DAY_LONG[early.day]}`)}>
                  geht auch am {DAY_LONG[early.day]}{early.needsFreeze ? ' (eine Portion einfrieren)' : ''} – dorthin legen
                </button>
              )}
            </span>
            {b.base.cooked
              ? <span className="tag tag--done"><Icon name="check" size={12} /> gekocht</span>
              : (
                <span className="portions" role="group" aria-label={`Portionen ${title(b.recipe)}`}>
                  <button type="button" aria-label="eine Portion weniger" disabled={!canLessPortions(week, b.base.recipeId)} onClick={() => onStep(b, false)}><Icon name="minus" size={14} /></button>
                  <b>{b.portions}</b>
                  <button type="button" aria-label="eine Portion mehr" onClick={() => onStep(b, true)}><Icon name="plus" size={14} /></button>
                </span>
              )}
          </div>
        );
      })}
      {(swaps.length > 0 || open.length > 0) && (
        <div className="cookstrip__actions">
          {swaps.length > 0 && <span className="small muted">tauschen mit</span>}
          {swaps}
          {open.length > 0 && (
            <button type="button" className="btn btn--soft btn--sm cookstrip__go" onClick={() => navigate(`/rezept/${open[0].base.recipeId}/kochen?p=${open[0].portions}&vorkochen=1`)}>
              <Icon name="play" size={14} /> Vorkochen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LunchRow({ d, onToggle }: { d: DayView; onToggle: () => void }) {
  if (d.noLunch) {
    return (
      <div className="lunch lunch--off">
        <span className="lunch__label">{DAY_SHORT[d.day]} mittags</span>
        <span className="lunch__text small muted">kein Mittagessen diese Woche</span>
        <button type="button" className="link small" onClick={onToggle}>wieder planen</button>
      </div>
    );
  }
  const l = d.lunch;
  const text = !l ? '' : l.kind === 'rest' ? <>Rest vom Vorabend: <b>{mealTitle(l, l.recipe)}</b></>
    : l.kind === 'box' ? <><b>{title(l.recipe)}</b> <span className="muted">· {l.reason === 'abend-frei' ? 'gestern Abend war frei' : 'der Vorabend lässt sich schlecht mitnehmen'}</span></>
    : <span className="muted">{l.reason === 'nichts-gekocht' ? 'noch nichts vorgekocht' : 'nichts zum Mitnehmen – Rezept als „zum Mitnehmen“ markieren'}</span>;
  return (
    <div className="lunch">
      <span className="lunch__label">{DAY_SHORT[d.day]} mittags</span>
      <span className="lunch__text small">{text}{l && l.kind !== 'none' && l.frost && <span className="tag tag--frost"><Icon name="snow" size={11} /> einfrieren</span>}</span>
      <button type="button" className="lunch__x" onClick={onToggle} aria-label={`${DAY_SHORT[d.day]} kein Mittagessen`}><Icon name="close" size={14} /></button>
    </div>
  );
}

function MealRow({ d, swapFrom, week, onTap, cookNote }: { d: DayView; swapFrom: Weekday | null; week: Week; onTap: () => void; cookNote?: string }) {
  const cook = cookNote && <span className="meal__cook">{cookNote}</span>;
  const pot = cookNote && <span className="meal__pot" role="img" aria-label={`Kochtag: ${cookNote}`} title={`Kochtag: ${cookNote}`}><Icon name="pot" size={15} /></span>;
  const m = d.meal;
  const mode = swapFrom === null ? '' : swapFrom === d.day ? ' is-picked' : canSwap(week, swapFrom, d.day) ? ' is-target' : ' is-blocked';
  const hint = swapFrom === null || swapFrom === d.day ? null : mode === ' is-target' ? <span className="meal__hint">hierhin</span> : <span className="meal__hint meal__hint--no">vor dem Kochtag</span>;
  if (!m) {
    return (
      <button type="button" className={`meal meal--free${mode}`} disabled={mode === ' is-blocked'} onClick={onTap}
        aria-label={swapFrom === null ? `${DAY_LONG[d.day]} frei – antippen: Was gibt's?` : undefined}>
        {pot}
        <span className="meal__day">{DAY_SHORT[d.day]}</span>
        <span className="meal__text small muted">frei – Reste, auswärts oder antippen{cook}</span>
        {hint ?? (swapFrom === null && <span className="meal__grip" aria-hidden="true"><Icon name="plus" size={18} /></span>)}
      </button>
    );
  }
  const base = m.meal.recipeId === m.meal.baseId;
  const note = m.meal.done ? <span className="tag tag--done"><Icon name="check" size={12} /> gegessen</span>
    : m.tooOld ? <span className="tag tag--warn">hält nicht so lange – tauschen?</span>
    : m.frost ? <span className="tag tag--frost"><Icon name="snow" size={12} /> am Vortag auftauen</span>
    : m.age === 0 ? <span className="tag tag--eat">frisch vom Kochtag</span>
    : <span className="tag tag--eat">{base ? 'aufwärmen' : `vom ${DAY_LONG[m.cookDay]}`}</span>;
  return (
    <button type="button" className={`meal${mode}${m.meal.done ? ' is-done' : ''}`} disabled={m.meal.done || mode === ' is-blocked'} onClick={onTap}
      aria-label={`${mealText(m)} am ${DAY_LONG[d.day]}${swapFrom === null && !m.meal.done ? ' – antippen zum Tauschen' : ''}`}>
      {pot}
      <span className="meal__day">{DAY_SHORT[d.day]}</span>
      <RecipeImage image={m.recipe?.image} size="sm" />
      <span className="meal__text"><strong>{mealText(m)}</strong>{note}{m.meal.portions && <span className="tag">{portionText(m.meal.portions)}</span>}{cook}</span>
      {hint ?? (swapFrom === d.day ? <span className="meal__hint">gewählt</span> : !m.meal.done && <span className="meal__grip" aria-hidden="true"><Icon name="dots" size={18} /></span>)}
    </button>
  );
}

/** Beim Einkauf reduziert gefunden – Mashi fragt immer nach, bevor sich die Woche ändert */
function MhdFinds({ finds, week, change }: { finds: MhdFind[]; week: Week; change: (w: Week, text: string) => void }) {
  const recipes = useRecipes();
  const first = sortCookDays(week.cookDays)[0] ?? 6;
  return (
    <section className="finds" aria-label="Beim Einkauf gefunden">
      <h2 className="h3">Beim Einkauf gefunden</h2>
      {finds.map((f) => (
        <div key={f.item.id} className="find">
          <Icon name="cart" size={18} />
          <div className="find__text">
            <strong>{f.item.name} · MHD</strong>
            {f.kind === 'covered' && <span className="small">Steckt schon in <b>{title(f.recipe)}</b> – wird beim Kochen zuerst verbraucht.</span>}
            {f.kind === 'match' && <span className="small">Passt zu <b>{title(f.recipe)}</b> – am {DAY_LONG[first]} mitkochen?</span>}
            {f.kind === 'free' && <span className="small">In eine Grundlage geben?</span>}
            <span className="find__actions">
              {f.kind === 'match' && (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => change(addBase(week, f.recipe.id, () => newId('w')), `${title(f.recipe)} am ${DAY_LONG[first]} – in der Woche`)}>
                  In die Woche
                </button>
              )}
              {f.kind !== 'covered' && week.bases.map((b) => (
                <button key={b.recipeId} type="button" className="btn btn--soft btn--sm" onClick={() => change(addToBase(week, b.recipeId, f.item.name), `${f.item.name} kommt in ${title(recipes.find((r) => r.id === b.recipeId))}`)}>
                  In {title(recipes.find((r) => r.id === b.recipeId))}
                </button>
              ))}
              {f.kind !== 'covered' && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { freezePantryItem(f.item.id); toast(`${f.item.name} eingefroren`); }}>
                  <Icon name="snow" size={14} /> Einfrieren
                </button>
              )}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
