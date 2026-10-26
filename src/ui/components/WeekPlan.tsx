import { useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { currentContent, newId } from '../../domain/recipe';
import {
  DAY_LONG, DAY_SHORT, addBase, mealKey, setExtra, addToBase, byEffort, canLessPortions, canSwap, earlierCookDay, keepsOf, mealTitle, mhdFinds, fillEvenings, groupMeals, mixedBases, moveBase, putMeal, swapCookDays, putPrepared, removeMeal, backToFridge, fridgeOf, setCookDay,
  servingsOf, setMealPortions, sortCookDays, stepPortions, swapDays, toggleLunch, transformsOf, weekdayOf, weekStarted, weekView,
  type BaseView, type DayView, type FridgeView, type MealView, type MhdFind, type WeekView,
} from '../../domain/week';
import type { Household, Week, Weekday } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { ComboStepper } from './ComboStepper';
import { comboText } from '../../domain/sides';
import { preparedPortions } from '../../domain/baseStock';
import { specialDays } from '../../domain/shelfLife';
import { freezePantryItem, householdOf, setPrepInfo, setWeek, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
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
  const [hold, setHold] = useState<Weekday | null>(null);
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
    // fertiges Rezept (keine Verwandlungen, Julia: Lasagne): es gibt nur eins – direkt auf den Abend, ohne Nachfrage
    if (added && transformsOf(b.base.recipeId, recipes).length) {
      change(setExtra(week, b.base.recipeId, (b.base.extra ?? 0) + 1), `${title(b.recipe)}: ${portionText(b.portions + 1)} – was gibt's am ${DAY_LONG[added.day]}?`);
      setWhat({ day: added.day, from: b.base.recipeId });
      return;
    }
    const gone = week.meals.find((m) => !next.meals.some((x) => x.id === m.id));
    const n = weekView(next, recipes, hh, fallback).bases.find((x) => x.base.recipeId === b.base.recipeId)?.portions ?? 0;
    const day = added ? ` – auch am ${DAY_LONG[added.day]}` : gone ? ` – ${DAY_LONG[gone.day]} wieder frei` : '';
    change(next, `${title(b.recipe)}: ${portionText(n)}${day}`);
  };

  // Kochtag dezent (Julia: „die Kochleiste soll weg, nur sehr dezent im Wochenplan“): Hinweis in der Abendzeile, die
  // Werkzeuge (Portionen, tauschen, Vorkochen) erst beim Antippen
  // mehr geplant, als das Rezept ergibt (Julia) – diese Abende bekommen einen Hinweis
  const cookBases = (day: Weekday) => view.bases.filter((b) => b.base.day === day);
  const cookNote = (day: Weekday) => (cookBases(day).length ? `${cookBases(day).map((b) => title(b.recipe)).join(' + ')} vorkochen` : undefined);
  const cookTools = (day: Weekday) => cookBases(day).length > 0 && (
    <CookStrip household={hh} day={day} bases={cookBases(day)} week={week} recipes={recipes} cookDays={cookDays} fallback={fallback} change={change} onStep={stepBase} />
  );

  const put = (day: Weekday, recipeId: string, baseId: string, side?: string) => {
    setWhat(null);
    const next = putMeal(week, day, recipeId, baseId, hh, () => newId('w'), side);
    if (next === week) return;
    // hält bis dahin nicht frisch (Julia: „geht doch, einfach mit einfrieren“) – Grundlage gleich als einfrierbar markieren,
    // der Abend heißt dann „am Vortag auftauen“; Rückgängig nimmt beides zurück
    const freeze = weekView(next, recipes, hh, fallback).days.find((x) => x.day === day)?.meal?.tooOld;
    const undoFreeze = freeze ? setPrepInfo(baseId, { freezable: true }) : undefined;
    const undoWeek = setWeek(next);
    const base = title(recipes.find((r) => r.id === baseId));
    toast(`${DAY_LONG[day]}: ${mealTitle({ side }, recipes.find((r) => r.id === recipeId))}${freeze ? ` – ${base} einfrieren, am Vortag auftauen` : ''}`,
      { label: 'Rückgängig', run: () => { undoWeek(); undoFreeze?.(); } });
    return next;
  };

  // Kühlschrank (Julia: „ich koche X Portionen und verteile sie“): Kärtchen antippen, dann einen freien Abend ab dem Kochtag
  const stock = useMemo(() => preparedPortions(pantry.items), [pantry.items]);
  const fridge = fridgeOf(week, recipes, hh, fallback, stock);
  const [pick, setPick] = useState<string | null>(null);
  const [dish, setDish] = useState<Weekday | null>(null);
  const picked = fridge.find((f) => f.base.recipeId === pick && f.cards > 0);
  const ord = (d: Weekday) => view.order.indexOf(d);
  const tone = (baseId: string) => { const i = week.bases.findIndex((b) => b.recipeId === baseId); return i < 0 ? '' : ` tone-${i % 6}`; };
  // eine Grundlage mit Gerichten oder Bausteinen fragt gleich „Was wird daraus?“ – ein fertiges Rezept nicht
  const asks = (baseId: string) => transformsOf(baseId, recipes).length > 0 || Object.keys(recipes.find((r) => r.id === baseId)?.blockPrep ?? {}).length > 0;
  const pickTarget = (d: DayView): 'yes' | 'frost' | 'no' | undefined => {
    if (!picked || d.meal) return undefined;
    const age = ord(d.day) - ord(picked.base.day);
    return age < 0 ? 'no' : age >= keepsOf(picked.recipe, fallback) ? 'frost' : 'yes';
  };
  const place = (day: Weekday, id: string) => {
    const next = put(day, id, id);
    if (!next) return;
    if (!fridgeOf(next, recipes, hh, fallback, stock).find((f) => f.base.recipeId === id)?.cards) setPick(null);
    if (asks(id)) setDish(day);
  };
  const putStock = (day: Weekday, recipeId: string) => {
    setWhat(null);
    change(putPrepared(week, day, recipeId, hh, () => newId('w')), `${DAY_LONG[day]}: ${title(recipes.find((r) => r.id === recipeId))} aus dem Vorrat`);
  };
  // heute markieren, Vergangenes grau – nur wenn die Woche läuft (ohne Datum wüsste Mashi sonst nicht, welche Woche gemeint ist)
  const today = weekdayOf(new Date());
  const past = (d: Weekday) => started && view.order.indexOf(d) < view.order.indexOf(today);

  const tapDay = (d: DayView) => {
    if (picked && swapFrom === null) {
      const t = pickTarget(d);
      if (t === 'yes' || t === 'frost') return place(d.day, picked.base.recipeId);
      setPick(null);
    }
    // Antippen öffnet das Abend-Fenster (ändern, tauschen, zurück in den Kühlschrank); ein freier Abend fragt „Was gibt's?“
    if (swapFrom === null) {
      if (!d.meal) setWhat({ day: d.day });
      else if (!d.meal.meal.done) setDish(d.day);
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

      {fridge.length > 0 && (
        <Fridge items={fridge} order={view.order} pick={picked ? pick : null} household={hh} tone={tone}
          onPick={(id) => { setSwapFrom(null); setPick((p) => (p === id ? null : id)); }}
          onCookDay={(f, d) => change(setCookDay(week, f.base.recipeId, d, hh), `${title(f.recipe)}: gekocht am ${DAY_LONG[d]}`)}
          onFreeze={(f) => toast(`${title(f.recipe)} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(f.base.recipeId, { freezable: true }) })} />
      )}

      <section className="week__days" aria-label={hh.lunchDays.length ? 'Mittags und abends' : 'Abends'}>
        <h2 className="h3">{hh.lunchDays.length ? 'Mittags & abends' : 'Abends'}</h2>
        {swapFrom !== null
          ? (
            <div className="week__swapbar" role="status">
              <Icon name="shuffle" size={16} />
              <span><b>{mealText(view.days.find((d) => d.day === swapFrom)?.meal)}</b> – mit welchem Abend tauschen?</span>
              <button type="button" className="link small" onClick={() => setSwapFrom(null)}>Abbrechen</button>
            </div>
          )
          : !picked && <p className="small muted">Abend antippen: ändern, tauschen oder zurück in den Kühlschrank. Lange drücken: Portionen und Kochtag.</p>}
        {/* Gerichte einer Grundlage im Wechsel (Julia: „besser hintereinander, dann ist das Vorkochen der Extras leichter“) */}
        {mixedBases(week).map((id) => (
          <p key={id} className="small week__hint">
            <Icon name="shuffle" size={14} /> {title(recipes.find((x) => x.id === id))}: Gerichte im Wechsel – hintereinander lassen sich die Extras leichter vorbereiten.
            <button type="button" className="link small" onClick={() => change(groupMeals(week, id), `${title(recipes.find((x) => x.id === id))}: hintereinander gelegt`)}>Hintereinander legen</button>
          </p>
        ))}
        <div className="week__list">
          {view.days.map((d) => (
            <div key={d.day} className={`week__day${past(d.day) ? ' is-past' : ''}${started && d.day === today ? ' is-today' : ''}`} aria-current={started && d.day === today ? 'date' : undefined}>
              {hh.lunchDays.includes(d.day) && <LunchRow d={d} onToggle={() => change(toggleLunch(week, d.day), d.noLunch ? `${DAY_SHORT[d.day]} mittags wieder geplant` : `${DAY_SHORT[d.day]} kein Mittagessen`)} />}
              <MealRow d={d} swapFrom={swapFrom} week={week} onTap={() => tapDay(d)} onHold={() => { setSwapFrom(null); setPick(null); setHold(d.day); }} cookNote={cookNote(d.day)}
                pickTarget={pickTarget(d)} tone={d.meal ? tone(d.meal.meal.baseId) : ''} potTone={cookBases(d.day)[0] ? tone(cookBases(d.day)[0].base.recipeId) : ''} />
            </div>
          ))}
        </div>
      </section>

      <div className="week__end">
        {/* „Woche leeren“ steht oben auf der Plan-Seite (Julia: gut sichtbar) */}
        <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/plan/woche')}><Icon name="pencil" size={16} /> Woche ändern</button>
      </div>

      {hold !== null && (() => {
        const d = view.days.find((x) => x.day === hold)!;
        return (
          <DaySheet d={d} onClose={() => setHold(null)} cook={cookTools(hold)}
            onPortions={(m, v) => change(setMealPortions(week, m.meal.id, v, hh), `${DAY_SHORT[m.meal.day]}: ${portionText(v)}`)}
            onOther={(m) => { setHold(null); setWhat({ day: m.meal.day, replace: m }); }}
            onDelete={(m) => { setHold(null); change(removeMeal(week, m.meal.id), `${mealText(m)} gestrichen`); }}
            onFreeze={(m) => { setHold(null); toast(`${title(recipes.find((r) => r.id === m.meal.baseId))} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(m.meal.baseId, { freezable: true }) }); }} servings={(m) => servingsOf(m.meal, hh)} />
        );
      })()}

      {dish !== null && (() => {
        const m = view.days.find((x) => x.day === dish)?.meal;
        if (!m || m.meal.done) return null;
        return (
          <DishSheet m={m} view={view} recipes={recipes} asks={asks(m.meal.baseId)} servings={servingsOf(m.meal, hh)} onClose={() => setDish(null)}
            onPut={(recipeId, side) => put(dish, recipeId, m.meal.baseId, side)}
            onPortions={(v) => change(setMealPortions(week, m.meal.id, v, hh), `${DAY_SHORT[dish]}: ${portionText(v)}`)}
            onSwap={() => { setDish(null); setPick(null); setSwapFrom(dish); }}
            onBack={() => { setDish(null); change(backToFridge(week, m.meal.id, hh), `${mealText(m)} – zurück im Kühlschrank`); }}
            onFreeze={() => toast(`${title(recipes.find((r) => r.id === m.meal.baseId))} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(m.meal.baseId, { freezable: true }) })} />
        );
      })()}

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
 * Lange gedrückt (Julia: „antippen = tauschen, lang draufbleiben = Vorkochtag und Portionen ändern“): alles zu einem
 * Abend an einem Ort – Portionen, anderes Gericht, löschen und, am Kochtag, was vorgekocht wird.
 */
function DaySheet({ d, cook, servings, onPortions, onOther, onDelete, onFreeze, onClose }: {
  d: DayView; cook: ReactNode; servings: (m: MealView) => number; onPortions: (m: MealView, v: number) => void;
  onOther: (m: MealView) => void; onDelete: (m: MealView) => void; onFreeze: (m: MealView) => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const m = d.meal && !d.meal.meal.done ? d.meal : undefined;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={DAY_LONG[d.day]} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{DAY_LONG[d.day]}{m ? `: ${mealText(m)}` : ''}</h2>
        {/* hält nicht bis hierhin (Julia: „ich kann das doch einfrieren“) – einfrierbar machen, dann „am Vortag auftauen“ */}
        {m?.tooOld && (
          <p className="small daysheet__freeze">
            <Icon name="snow" size={14} /> Hält bis {DAY_LONG[d.day]} nicht frisch.
            <button type="button" className="link small" onClick={() => onFreeze(m)}>Einfrieren und am Vortag auftauen</button>
          </p>
        )}
        {m && (
          <div className="daysheet__meal">
            <div className="row-between">
              <span>Portionen an diesem Abend</span>
              <Stepper small value={servings(m)} onChange={(v) => onPortions(m, v)} label={`Portionen am ${DAY_LONG[d.day]}`} />
            </div>
            <div className="row-gap">
              <button type="button" className="btn btn--soft btn--sm" onClick={() => onOther(m)}><Icon name="refresh" size={14} /> Anderes Gericht</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(m)}><Icon name="trash" size={14} /> Vom Abend entfernen</button>
            </div>
          </div>
        )}
        {cook && <><h3 className="small muted">Kochtag</h3>{cook}</>}
        {!m && !cook && <p className="small muted">Hier gibt es nichts einzustellen.</p>}
      </div>
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
    if (age < 0 || !b.recipe) return [];
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
              <span className="small muted"> · vom {DAY_LONG[b.base.day]}{b.base.extra ? ` · ${portionText(b.base.extra)} übrig` : ''}{frost ? (b.recipe?.freezable ? ' · aus dem Gefrierfach' : ' · hält nicht so lange – wird eingefroren') : ''}</span>
            </p>
            <div className="chips" role="group" aria-label={`Aus ${title(b.recipe)}`}>
              {/* eigene Zusammenstellungen dieser Woche zuerst (Julia: „ich konnte nur das feste Rezept nehmen, nicht mein Baukasten-Gericht“) */}
              {[...new Set(view.days.flatMap((x) => (x.meal?.meal.baseId === b.base.recipeId && x.meal.meal.recipeId === b.base.recipeId && x.meal.meal.side ? [x.meal.meal.side] : [])))]
                .map((side) => chip(b.base.recipeId, b.base.recipeId, `mit ${comboText(side)}`, side))}
              {dishes.length > 0 ? dishes.map((r) => chip(r.id, b.base.recipeId, title(r))) : chip(b.base.recipeId, b.base.recipeId, title(b.recipe))}
            </div>
            {/* Grundlage mit Bausteinen (Julia: Baukasten statt nur „+ Beilage“) */}
            {dishes.length > 0 && b.recipe && <ComboStepper base={b.recipe} onAdd={(side) => onPut(b.base.recipeId, b.base.recipeId, side)} />}
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
function CookStrip({ household, day, bases, week, recipes, cookDays, fallback, change, onStep }: {
  household: Household;
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
              {(() => {
                // Rezept-Ertrag gegen Plan (Julia: „mir fehlt, wie viele Portionen jedes Gericht laut Rezept ergibt“)
                const y = b.recipe ? currentContent(b.recipe).servings : 0;
                if (!y || b.base.cooked) return null;
                return (
                  <span className={`small${b.portions < y ? ' cookstrip__over' : ' muted'}`}>
                    Rezept ergibt {y} · geplant {b.portions}
                    {/* weniger verplant als gekocht: Rest auf freie Abende (fillEvenings), was keinen Abend findet, bleibt Vorrat */}
                    {b.portions < y && <> – <button type="button" className="link small" onClick={() => change(
                      fillEvenings(setExtra(week, b.base.recipeId, (b.base.extra ?? 0) + y - b.portions), b.base.recipeId, recipes, household, () => newId('w'), fallback),
                      `${title(b.recipe)}: ${y - b.portions} weitere eingeplant`)}>{y - b.portions} weitere einplanen</button></>}
                  </span>
                );
              })()}
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

/**
 * Der Kühlschrank: je Grundlage die Portionen ohne Abend als Kärtchen in ihrer Farbe. „gekocht am So“ antippen ändert
 * den Kochtag (die Abende rücken nach). Hält etwas nicht bis zum letzten Abend, schlägt Mashi Einfrieren oder später kochen vor.
 */
function Fridge({ items, order, pick, household, tone, onPick, onCookDay, onFreeze }: {
  items: FridgeView[]; order: Weekday[]; pick: string | null; household: Household; tone: (baseId: string) => string;
  onPick: (baseId: string) => void; onCookDay: (f: FridgeView, day: Weekday) => void; onFreeze: (f: FridgeView) => void;
}) {
  const [daysFor, setDaysFor] = useState<string | null>(null);
  const left = items.reduce((n, f) => n + f.left, 0);
  const picked = items.find((f) => f.base.recipeId === pick);
  // alles verteilt (Julia): nur eine Zeile, damit die Abende nicht nach unten rutschen – antippen öffnet ihn
  const [open, setOpen] = useState(false);
  if (!left && !open) {
    return (
      <button type="button" className="fridge fridge--closed" aria-expanded={false} onClick={() => setOpen(true)} aria-label="Kühlschrank: alles verteilt – öffnen">
        <Icon name="fridge" size={20} />
        <span className="fridge__title">Kühlschrank</span>
        <span className="small fridge__left">alles verteilt <Icon name="check" size={14} /></span>
      </button>
    );
  }
  return (
    <section className="fridge" aria-label="Kühlschrank">
      <div className="fridge__head">
        <Icon name="fridge" size={20} />
        <h2 className="h3">Kühlschrank</h2>
        {left
          ? <span className="small fridge__left is-left">{portionText(left)} übrig</span>
          : <button type="button" className="link small" aria-expanded onClick={() => setOpen(false)}>zuklappen</button>}
      </div>
      <p className="small muted">{picked ? `${title(picked.recipe)} gewählt – tippe einen freien Abend ab ${DAY_LONG[picked.base.day]}.` : left ? 'Kärtchen antippen, dann einen freien Abend.' : 'Alles, was gekocht wird, hat einen Abend.'}</p>
      {items.map((f) => {
        const id = f.base.recipeId;
        const name = title(f.recipe);
        const fresh = `frisch bis ${DAY_SHORT[f.freshUntil]}`;
        return (
          <div key={id} className={`fridge__base${tone(id)}`}>
            <div className="fridge__line">
              <span className="tone-dot" aria-hidden="true" />
              <strong>{name}</strong>
              {f.base.cooked
                ? <span className="small muted">gekocht · {fresh}</span>
                : <button type="button" className="link small" aria-expanded={daysFor === id} aria-label={`gekocht am ${DAY_LONG[f.base.day]}, ${fresh} – Kochtag ändern`} onClick={() => setDaysFor(daysFor === id ? null : id)}>gekocht am {DAY_SHORT[f.base.day]} · {fresh}</button>}
              {f.recipe?.freezable && f.freshUntil !== order[6] && <span className="fridge__snow" title="danach aus dem Gefrierfach"><Icon name="snow" size={13} /></span>}
            </div>
            {daysFor === id && (
              <div className="chips fridge__days" role="group" aria-label={`Kochtag ${name}`}>
                {order.map((d) => (
                  <button key={d} type="button" className={`chip chip--sm${d === f.base.day ? ' is-on' : ''}`} aria-pressed={d === f.base.day} aria-label={DAY_LONG[d]}
                    onClick={() => { setDaysFor(null); onCookDay(f, d); }}>{DAY_SHORT[d]}</button>
                ))}
              </div>
            )}
            {/* Julia: nur vorschlagen, wenn etwas nicht bis zum letzten Abend hält */}
            {f.short && (
              <p className="small fridge__short">
                <Icon name="info" size={14} /> Hält nur bis {DAY_LONG[f.freshUntil]}.
                <button type="button" className="link small" onClick={() => onFreeze(f)}>Einfrieren</button>
                {!f.base.cooked && <button type="button" className="link small" onClick={() => setDaysFor(id)}>Später kochen</button>}
              </p>
            )}
            <div className="fridge__cards">
              {Array.from({ length: f.cards }, (_, i) => {
                const on = pick === id && i === 0;
                const n = Math.min(household.portions, f.left - i * household.portions);
                return (
                  <button key={i} type="button" className={`fridge__card${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={`${name}, ${portionText(n)}${on ? ', gewählt' : ''}`} onClick={() => onPick(id)}>
                    {portionText(n)}
                  </button>
                );
              })}
              <span className="small muted">{f.left ? `${portionText(f.left)} übrig` : 'alles verteilt'}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Ein verteilter Abend (Julia: „Was wird daraus?“): bei einer Grundlage die gespeicherten Gerichte, was diese Woche schon
 * zusammengestellt ist, und der Baukasten. Dazu Portionen, Tauschen und „Zurück in den Kühlschrank“.
 */
function DishSheet({ m, view, recipes, asks, servings, onPut, onPortions, onSwap, onBack, onFreeze, onClose }: {
  m: MealView; view: WeekView; recipes: Recipe[]; asks: boolean; servings: number;
  onPut: (recipeId: string, side?: string) => void; onPortions: (v: number) => void; onSwap: () => void; onBack: () => void; onFreeze: () => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const baseId = m.meal.baseId;
  const base = recipes.find((r) => r.id === baseId);
  const dishes = byEffort(transformsOf(baseId, recipes));
  const combos = [...new Set(view.days.flatMap((x) => (x.meal?.meal.baseId === baseId && x.meal.meal.recipeId === baseId && x.meal.meal.side ? [x.meal.meal.side] : [])))];
  const on = (recipeId: string, side?: string) => m.meal.recipeId === recipeId && m.meal.side === side;
  const chip = (recipeId: string, text: string, side?: string) => (
    <button key={`${recipeId}+${side ?? ''}`} type="button" className={`chip${on(recipeId, side) ? ' is-on' : ''}`} aria-pressed={on(recipeId, side)} onClick={() => onPut(recipeId, side)}>{text}</button>
  );
  const status = m.frost ? 'aus dem Gefrierfach – am Vortag auftauen' : m.age === 0 ? 'frisch gekocht' : `aufwärmen · ${m.age} ${m.age === 1 ? 'Tag' : 'Tage'} alt`;
  const day = m.meal.day;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={DAY_LONG[day]} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{DAY_LONG[day]}: {mealText(m)}</h2>
        <p className="small muted dish__status">{m.frost && <Icon name="snow" size={13} />} {status}</p>
        {m.tooOld && (
          <p className="small daysheet__freeze">
            <Icon name="snow" size={14} /> Hält bis {DAY_LONG[day]} nicht frisch.
            <button type="button" className="link small" onClick={onFreeze}>Einfrieren und am Vortag auftauen</button>
          </p>
        )}
        {asks && (
          <section className="what__base">
            <h3 className="small muted">Was wird daraus?</h3>
            <div className="chips" role="group" aria-label="Gericht daraus">
              {chip(baseId, title(base))}
              {combos.map((side) => chip(baseId, `mit ${comboText(side)}`, side))}
              {dishes.map((r) => chip(r.id, title(r)))}
            </div>
            {base && <ComboStepper base={base} onAdd={(side) => onPut(baseId, side)} />}
          </section>
        )}
        <div className="row-between dish__portions">
          <span>Portionen an diesem Abend</span>
          <Stepper small value={servings} onChange={onPortions} label={`Portionen am ${DAY_LONG[day]}`} />
        </div>
        <div className="row-gap dish__actions">
          <button type="button" className="btn btn--soft btn--sm" onClick={onSwap}><Icon name="shuffle" size={14} /> Tauschen</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}><Icon name="fridge" size={14} /> Zurück in den Kühlschrank</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>Fertig</button>
        </div>
      </div>
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

/**
 * Ein Abend: Antippen öffnet das Abend-Fenster, lange drücken die Werkzeuge. Ist ein Kärtchen aus dem Kühlschrank gewählt
 * (`pickTarget`), zeigen freie Abende, ob es dorthin darf – und ob es bis dahin eingefroren werden muss.
 */
function MealRow({ d, swapFrom, week, onTap, onHold, cookNote, pickTarget, tone = '', potTone = '' }: {
  d: DayView; swapFrom: Weekday | null; week: Week; onTap: () => void; onHold: () => void; cookNote?: string;
  pickTarget?: 'yes' | 'frost' | 'no'; tone?: string; potTone?: string;
}) {
  const press = useLongPress(onHold, onTap);
  const pot = cookNote && <span className={`meal__pot${potTone}`} role="img" aria-label={`Kochtag: ${cookNote}`} title={`Kochtag: ${cookNote}`}><Icon name="pot" size={15} /></span>;
  const m = d.meal;
  const mode = pickTarget ? (pickTarget === 'no' ? ' is-blocked' : ' is-target')
    : swapFrom === null ? '' : swapFrom === d.day ? ' is-picked' : canSwap(week, swapFrom, d.day) ? ' is-target' : ' is-blocked';
  const hint = pickTarget ? (pickTarget === 'no' ? <span className="meal__hint meal__hint--no">vor dem Kochtag</span> : <span className="meal__hint">{pickTarget === 'frost' ? 'hierher · einfrieren' : 'hierher'}</span>)
    : swapFrom === null || swapFrom === d.day ? null : mode === ' is-target' ? <span className="meal__hint">hierhin</span> : <span className="meal__hint meal__hint--no">vor dem Kochtag</span>;
  if (!m) {
    return (
      <button type="button" className={`meal meal--free${mode}`} disabled={mode === ' is-blocked'} {...press}
        aria-label={pickTarget && pickTarget !== 'no' ? `${DAY_LONG[d.day]} frei – hierher legen` : swapFrom === null && !pickTarget ? `${DAY_LONG[d.day]} frei – antippen: Was gibt's?` : undefined}>
        {pot}
        <span className="meal__day">{DAY_SHORT[d.day]}</span>
        <span className="meal__text small muted">frei</span>
        {hint ?? (swapFrom === null && <span className="meal__grip" aria-hidden="true"><Icon name="plus" size={18} /></span>)}
      </button>
    );
  }
  const base = m.meal.recipeId === m.meal.baseId;
  const note = m.meal.done ? <span className="tag tag--done"><Icon name="check" size={12} /> gegessen</span>
    : m.tooOld ? <span className="tag tag--warn">hält nicht so lange – lange drücken</span>
    : m.frost ? <span className="tag tag--frost"><Icon name="snow" size={12} /> am Vortag auftauen</span>
    : m.age === 0 ? <span className="tag tag--eat">frisch vom Kochtag</span>
    : <span className="tag tag--eat">{base ? 'aufwärmen' : `vom ${DAY_LONG[m.cookDay]}`}</span>;
  return (
    <button type="button" className={`meal${mode}${m.meal.done ? ' is-done' : ''}`} disabled={m.meal.done || mode === ' is-blocked'} {...press}
      aria-label={`${mealText(m)} am ${DAY_LONG[d.day]}${swapFrom === null && !m.meal.done ? ' – antippen zum Ändern' : ''}`}>
      {pot}
      {tone && <span className={`meal__tone${tone}`} aria-hidden="true" />}
      <span className="meal__day">{DAY_SHORT[d.day]}</span>
      <RecipeImage image={m.recipe?.image} size="sm" />
      <span className="meal__text"><strong>{mealText(m)}</strong>{note}{m.meal.portions && <span className="tag">{portionText(m.meal.portions)}</span>}</span>
      {hint ?? (swapFrom === d.day ? <span className="meal__hint">gewählt</span> : !m.meal.done && <span className="meal__grip" aria-hidden="true"><Icon name="chevron" size={16} /></span>)}
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

/**
 * Kurz tippen = onTap, lange drücken (½ s) = onHold – danach kein Klick mehr. Rechtsklick (Desktop) zählt wie lange
 * drücken. Bewegt sich der Finger (Scrollen), zählt es nicht.
 */
function useLongPress(onHold: () => void, onTap: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => { held.current = true; onHold(); }, 500);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); clear(); held.current = true; onHold(); },
    onClick: () => { if (held.current) { held.current = false; return; } onTap(); },
  };
}
