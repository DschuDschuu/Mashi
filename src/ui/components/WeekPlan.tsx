import { useMemo, useState } from 'react';
import { currentContent, newId } from '../../domain/recipe';
import {
  DAY_LONG, DAY_SHORT, addBase, addToBase, canSwap, earlierCookDay, mhdFinds, moveBase, setExtra, sortCookDays, swapDays, toggleLunch,
  weekStarted, weekView, withCookDays, type BaseView, type DayView, type MhdFind,
} from '../../domain/week';
import type { Week, Weekday } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { specialDays } from '../../domain/shelfLife';
import { freezePantryItem, householdOf, setWeek, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { toast } from '../toast';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

const title = (r?: Recipe) => (r ? currentContent(r).title : 'Gelöschtes Rezept');
const portionText = (n: number) => `${n} ${n === 1 ? 'Portion' : 'Portionen'}`;

/**
 * Deine Woche (Julia: Grundlagen am Kochtag, daraus die Abendessen): Kochtage, was an jedem Kochtag gekocht wird
 * (Portionen, einfrieren, „lässt sich auch am Sonntag vorbereiten“), MHD-Funde aus dem Einkauf und
 * „Mittags & abends“ – zum Tauschen einen Abend antippen, dann den anderen.
 */
export function WeekPlan({ week }: { week: Week }) {
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

  /** jede Änderung der Woche mit „Rückgängig“ */
  const change = (next: Week, text: string) => {
    if (next === week) return;
    toast(text, { label: 'Rückgängig', run: setWeek(next) });
  };

  const toggleCookDay = (d: Weekday) => {
    if (started) return toast('Schon gekocht – Kochtage lassen sich in dieser Woche nicht mehr ändern. Tauschen geht weiter.');
    const days = week.cookDays.includes(d) ? week.cookDays.filter((x) => x !== d) : [...week.cookDays, d];
    if (!days.length) return;
    change(withCookDays(week, days, () => newId('w')), `Neu verteilt – Kochtage ${sortCookDays(days).map((x) => DAY_SHORT[x]).join(', ')}`);
  };

  const tapDay = (d: DayView) => {
    if (swapFrom === null) {
      if (d.meal && !d.meal.meal.done) setSwapFrom(d.day);
      return;
    }
    if (swapFrom === d.day) return setSwapFrom(null);
    if (!canSwap(week, swapFrom, d.day)) return;
    const a = view.days.find((x) => x.day === swapFrom)?.meal, b = d.meal;
    setSwapFrom(null);
    change(swapDays(week, swapFrom, d.day), b ? `${title(a?.recipe)} und ${title(b.recipe)} getauscht` : `${title(a?.recipe)} auf ${DAY_LONG[d.day]} verschoben`);
  };

  const finds = mhdFinds(pantry.items, week, recipes, table, new Date());

  return (
    <div className="week">
      <div className="daypick" role="group" aria-label="Kochtage">
        {DAY_SHORT.map((d, i) => (
          <button key={d} type="button" className={`daypick__day${week.cookDays.includes(i) ? ' is-on' : ''}`} aria-pressed={week.cookDays.includes(i)} onClick={() => toggleCookDay(i)}>
            {d}<small>{week.cookDays.includes(i) ? 'kochen' : '·'}</small>
          </button>
        ))}
      </div>

      <button type="button" className="week__shop" onClick={() => navigate('/einkauf')}>
        <Icon name="cart" size={20} />
        <span><strong>Einkaufen vor {DAY_LONG[cookDays[0] ?? 6]}</strong><small>Grundlagen in großer Menge + was frisch dazukommt</small></span>
        <Icon name="chevron" size={16} />
      </button>

      {finds.length > 0 && <MhdFinds finds={finds} week={week} change={change} />}

      {cookDays.map((day) => (
        <CookDay key={day} day={day} bases={view.bases.filter((b) => b.base.day === day)} week={week} recipes={recipes} first={cookDays[0]} fallback={fallback} change={change} />
      ))}

      <section className="week__days" aria-label={hh.lunchDays.length ? 'Mittags und abends' : 'Abends'}>
        <h2 className="h3">{hh.lunchDays.length ? 'Mittags & abends' : 'Abends'}</h2>
        {swapFrom !== null
          ? (
            <div className="week__swapbar" role="status">
              <Icon name="shuffle" size={16} />
              <span><b>{title(view.days.find((d) => d.day === swapFrom)?.meal?.recipe)}</b> – mit welchem Abend tauschen?</span>
              <button type="button" className="link small" onClick={() => setSwapFrom(null)}>Abbrechen</button>
            </div>
          )
          : <p className="small muted">Abend antippen, um ihn mit einem anderen zu tauschen{hh.lunchDays.length ? '. × nimmt einen Mittag raus (Kantine, auswärts).' : '.'}</p>}
        <div className="week__list">
          {view.days.map((d) => (
            <div key={d.day} className="week__day">
              {hh.lunchDays.includes(d.day) && <LunchRow d={d} onToggle={() => change(toggleLunch(week, d.day), d.noLunch ? `${DAY_SHORT[d.day]} mittags wieder geplant` : `${DAY_SHORT[d.day]} kein Mittagessen`)} />}
              <MealRow d={d} swapFrom={swapFrom} week={week} onTap={() => tapDay(d)} />
            </div>
          ))}
        </div>
      </section>

      <div className="week__end">
        <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/plan/woche')}><Icon name="pencil" size={16} /> Woche ändern</button>
        <button type="button" className="link link--muted small" onClick={() => void (async () => {
          if (await ask({ title: 'Woche beenden?', text: 'Die Woche verschwindet aus dem Plan. Vorgekochtes bleibt in der Speisekammer.', confirm: 'Beenden' })) {
            toast('Woche beendet', { label: 'Rückgängig', run: setWeek(undefined) });
          }
        })()}>Woche beenden</button>
      </div>
    </div>
  );
}

/** Ein Kochtag: was gekocht wird – Portionen anpassen, einfrieren, „auch am Sonntag“, Vorkochen starten */
function CookDay({ day, bases, week, recipes, first, fallback, change }: {
  day: Weekday; bases: BaseView[]; week: Week; recipes: Recipe[]; first: Weekday; fallback: number; change: (w: Week, text: string) => void;
}) {
  if (!bases.length) {
    return (
      <section className="cookday">
        <div className="cookday__head"><h3>{DAY_LONG[day]}</h3><span className="small muted">frei</span></div>
        <p className="small muted cookday__free">Kein Vorkochen nötig – unter der Woche nur verwandeln.</p>
      </section>
    );
  }
  const open = bases.filter((b) => !b.base.cooked);
  const minutes = bases.reduce((n, b) => n + (b.recipe ? currentContent(b.recipe).prepMinutes + currentContent(b.recipe).cookMinutes : 0), 0);
  return (
    <section className="cookday">
      <div className="cookday__head">
        <h3>{DAY_LONG[day]} kochen</h3>
        {minutes > 0 && <span className="small muted"><Icon name="clock" size={14} /> ca. {minutes >= 60 ? `${Math.floor(minutes / 60)} Std. ` : ''}{minutes % 60 ? `${minutes % 60} Min.` : ''}</span>}
      </div>
      {bases.map((b) => {
        const min = b.portions - (b.base.extra ?? 0);
        const early = earlierCookDay(week, b.base.recipeId, recipes, fallback);
        return (
          <div key={b.base.recipeId} className="cookday__base">
            <div className="cookday__item">
              <RecipeImage image={b.recipe?.image} size="sm" />
              <div className="cookday__text">
                <button type="button" className="cookday__name" onClick={() => navigate(`/rezept/${b.base.recipeId}`)}>{title(b.recipe)}</button>
                {b.base.cooked
                  ? <span className="tag tag--done"><Icon name="check" size={12} /> gekocht · in der Speisekammer</span>
                  : (
                    <span className="portions" role="group" aria-label={`Portionen ${title(b.recipe)}`}>
                      <button type="button" aria-label="eine Portion weniger" disabled={b.portions <= min}
                        onClick={() => change(setExtra(week, b.base.recipeId, (b.base.extra ?? 0) - 1), `${title(b.recipe)}: ${portionText(b.portions - 1)}`)}><Icon name="minus" size={14} /></button>
                      <b>{portionText(b.portions)}</b>
                      <button type="button" aria-label="eine Portion mehr"
                        onClick={() => change(setExtra(week, b.base.recipeId, (b.base.extra ?? 0) + 1), `${title(b.recipe)}: ${portionText(b.portions + 1)}`)}><Icon name="plus" size={14} /></button>
                    </span>
                  )}
                <span className="small muted">
                  {b.evenings} {b.evenings === 1 ? 'Abend' : 'Abende'}{b.lunches ? ` + ${b.lunches} ${b.lunches === 1 ? 'Mittag' : 'Mittage'}` : ''}{b.base.extra ? ` + ${b.base.extra} als Vorrat` : ''}
                </span>
                {(b.base.adds ?? []).map((a) => <span key={a} className="tag tag--mhd">+ {a} aus dem Einkauf (MHD)</span>)}
                {!b.base.cooked && b.frozen > 0 && <span className="tag tag--frost"><Icon name="snow" size={12} /> {portionText(b.frozen)} einfrieren</span>}
              </div>
            </div>
            {!b.base.cooked && early && (
              <div className="cookday__early">
                <Icon name="info" size={16} />
                <span>Lässt sich auch am {DAY_LONG[early.day]} vorbereiten – dann ist {DAY_LONG[day]} frei{early.needsFreeze ? ' (eine Portion einfrieren)' : ''}.</span>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => change(moveBase(week, b.base.recipeId, first), `${title(b.recipe)} am ${DAY_LONG[first]}`)}>Auf {DAY_LONG[first]} legen</button>
              </div>
            )}
          </div>
        );
      })}
      {open.length > 0 && (
        <div className="cookday__foot">
          <button type="button" className="btn btn--primary btn--block" onClick={() => navigate(`/rezept/${open[0].base.recipeId}/kochen?p=${open[0].portions}&vorkochen=1`)}>
            <Icon name="play" size={16} /> Vorkochen starten
          </button>
        </div>
      )}
    </section>
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
  const text = !l ? '' : l.kind === 'rest' ? <>Rest vom Vorabend: <b>{title(l.recipe)}</b></>
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

function MealRow({ d, swapFrom, week, onTap }: { d: DayView; swapFrom: Weekday | null; week: Week; onTap: () => void }) {
  const m = d.meal;
  const mode = swapFrom === null ? '' : swapFrom === d.day ? ' is-picked' : canSwap(week, swapFrom, d.day) ? ' is-target' : ' is-blocked';
  const hint = swapFrom === null || swapFrom === d.day ? null : mode === ' is-target' ? <span className="meal__hint">hierhin</span> : <span className="meal__hint meal__hint--no">vor dem Kochtag</span>;
  if (!m) {
    return (
      <button type="button" className={`meal meal--free${mode}`} disabled={swapFrom === null || mode === ' is-blocked'} onClick={onTap}>
        <span className="meal__day">{DAY_SHORT[d.day]}</span>
        <span className="meal__text small muted">frei – Reste, auswärts, spontan</span>
        {hint}
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
      aria-label={`${title(m.recipe)} am ${DAY_LONG[d.day]}${swapFrom === null && !m.meal.done ? ' – antippen zum Tauschen' : ''}`}>
      <span className="meal__day">{DAY_SHORT[d.day]}</span>
      <RecipeImage image={m.recipe?.image} size="sm" />
      <span className="meal__text"><strong>{title(m.recipe)}</strong>{note}</span>
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
