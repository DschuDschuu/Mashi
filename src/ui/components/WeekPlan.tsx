import { useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { currentContent, newId } from '../../domain/recipe';
import {
  DAY_LONG, DAY_SHORT, addBase, mealKey, setExtra, addToBase, byEffort, canLessPortions, canSwap, earlierCookDay, keepsOf, mealTitle, mhdFinds, fillEvenings, groupMeals, mixedBases, moveBase, putMeal, swapCookDays, putPrepared, removeMeal, backToFridge, fridgeOf, setCookDay,
  servingsOf, setMealPortions, sortCookDays, stepPortions, swapSlots, sameSlot, slotOf, toggleLunch, transformsOf, weekdayOf, weekStarted, weekView,
  type BaseView, type DayView, type FridgeView, type MealView, type MhdFind, type Slot, type WeekView,
} from '../../domain/week';
import type { Household, Week, Weekday } from '../../domain/mealplan';
import { cookStart } from '../../domain/cookDay';
import type { Recipe } from '../../domain/types';
import { ComboStepper } from './ComboStepper';
import { comboText } from '../../domain/sides';
import { preparedPortions } from '../../domain/baseStock';
import { specialDays } from '../../domain/shelfLife';
import { freezeFromFridge, freezePantryItem, householdOf, setPrepInfo, setWeek, unfreezeToFridge, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
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
/** „Dienstag mittags“ / „Dienstag“ */
const slotText = (s: Slot) => `${DAY_LONG[s.day]}${s.lunch ? ' mittags' : ''}`;
const slotShort = (s: Slot) => `${DAY_SHORT[s.day]}${s.lunch ? ' mittags' : ''}`;
/** das Essen eines Tages auf einem Platz */
const mealOf = (d: DayView | undefined, s: Slot) => (s.lunch ? d?.lunch : d?.meal);

/**
 * Deine Woche (Julia: Grundlagen am Kochtag, daraus die Essen): Kochtage, was an jedem Kochtag gekocht wird
 * (Portionen, einfrieren, „lässt sich auch am Sonntag vorbereiten“), MHD-Funde aus dem Einkauf und
 * „Mittags & abends“ – Mittage sind Plätze wie die Abende (Julia): zum Tauschen einen Platz antippen, dann den anderen;
 * einen freien Platz antippen: „Was gibt's?“. `onPickDish` öffnet den Kochbuch-Picker (liegt im PlanScreen).
 */
export function WeekPlan({ week, onPickDish }: { week: Week; onPickDish?: (slot: Slot, replaceMealId?: string) => void }) {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const table = useFoodTable();
  const hh = householdOf(plan);
  const fallback = specialDays('prepared', pantry.shelfDays);
  const view = useMemo(() => weekView(week, recipes, hh, fallback), [week, recipes, hh, fallback]);
  const cookDays = sortCookDays(week.cookDays);
  const started = weekStarted(week);
  const [swapFrom, setSwapFrom] = useState<Slot | null>(null);
  const [hold, setHold] = useState<Slot | null>(null);
  const [what, setWhat] = useState<{ slot: Slot; replace?: MealView; from?: string } | null>(null);
  const dayOf = (day: Weekday) => view.days.find((x) => x.day === day);
  const at = (s: Slot) => mealOf(dayOf(s.day), s);

  /** jede Änderung der Woche mit „Rückgängig“ */
  const change = (next: Week, text: string) => {
    if (next === week) return;
    toast(text, { label: 'Rückgängig', run: setWeek(next) });
  };

  // Portionen an einem Mittag oder Abend (Julia: „+1 nimmt aus dem Kühlschrank“) – der Toast sagt, woher sie kommt
  const portions = (m: MealView, v: number) => {
    const next = setMealPortions(week, m.meal.id, v, hh);
    const fridge = (w: Week) => w.bases.find((b) => b.recipeId === m.meal.baseId)?.extra ?? 0;
    const cooking = view.bases.find((b) => b.base.recipeId === m.meal.baseId);
    const from = fridge(next) < fridge(week) ? ' – aus dem Kühlschrank' : fridge(next) > fridge(week) ? ' – zurück in den Kühlschrank'
      : v > servingsOf(m.meal, hh) && cooking && !cooking.base.cooked ? ' – wird mehr gekocht' : '';
    change(next, `${slotShort(slotOf(m.meal))}: ${portionText(v)}${from}`);
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
      setWhat({ slot: slotOf(added), from: b.base.recipeId });
      return;
    }
    const gone = week.meals.find((m) => !next.meals.some((x) => x.id === m.id));
    const n = weekView(next, recipes, hh, fallback).bases.find((x) => x.base.recipeId === b.base.recipeId)?.portions ?? 0;
    const day = added ? ` – auch am ${DAY_LONG[added.day]}` : gone ? ` – ${slotText(slotOf(gone))} wieder frei` : '';
    change(next, `${title(b.recipe)}: ${portionText(n)}${day}`);
  };

  // Kochtag dezent (Julia: „die Kochleiste soll weg, nur sehr dezent im Wochenplan“): Hinweis in der Abendzeile, die
  // Werkzeuge (Portionen, tauschen, Vorkochen) erst beim Antippen
  const cookBases = (day: Weekday) => view.bases.filter((b) => b.base.day === day);
  const cookNote = (day: Weekday) => (cookBases(day).length ? `${cookBases(day).map((b) => title(b.recipe)).join(' + ')} vorkochen` : undefined);
  const cookTools = (day: Weekday) => cookBases(day).length > 0 && (
    <CookStrip household={hh} day={day} bases={cookBases(day)} week={week} recipes={recipes} cookDays={cookDays} fallback={fallback} change={change} onStep={stepBase} />
  );

  const put = (slot: Slot, recipeId: string, baseId: string, side?: string) => {
    setWhat(null);
    const next = putMeal(week, slot, recipeId, baseId, hh, () => newId('w'), side);
    if (next === week) return;
    // hält bis dahin nicht frisch (Julia: „geht doch, einfach mit einfrieren“) – Grundlage gleich als einfrierbar markieren,
    // das Essen heißt dann „am Vortag auftauen“; Rückgängig nimmt beides zurück
    const freeze = mealOf(weekView(next, recipes, hh, fallback).days.find((x) => x.day === slot.day), slot)?.tooOld;
    const undoFreeze = freeze ? setPrepInfo(baseId, { freezable: true }) : undefined;
    const undoWeek = setWeek(next);
    const base = title(recipes.find((r) => r.id === baseId));
    toast(`${slotText(slot)}: ${mealTitle({ side }, recipes.find((r) => r.id === recipeId))}${freeze ? ` – ${base} einfrieren, am Vortag auftauen` : ''}`,
      { label: 'Rückgängig', run: () => { undoWeek(); undoFreeze?.(); } });
    return next;
  };

  // Kühlschrank (Julia: „ich koche X Portionen und verteile sie“): Kärtchen antippen, dann einen freien Platz ab dem Kochtag
  const stock = useMemo(() => preparedPortions(pantry.items), [pantry.items]);
  const fridge = fridgeOf(week, recipes, hh, fallback, stock);
  const [pick, setPick] = useState<string | null>(null);
  const [dish, setDish] = useState<Slot | null>(null);
  const picked = fridge.find((f) => f.base.recipeId === pick && f.cards > 0);
  const ord = (d: Weekday) => view.order.indexOf(d);
  const tone = (baseId: string) => { const i = week.bases.findIndex((b) => b.recipeId === baseId); return i < 0 ? '' : ` tone-${i % 6}`; };
  // eine Grundlage mit Gerichten oder Bausteinen fragt gleich „Was wird daraus?“ – ein fertiges Rezept nicht
  const asks = (baseId: string) => transformsOf(baseId, recipes).length > 0 || Object.keys(recipes.find((r) => r.id === baseId)?.blockPrep ?? {}).length > 0;
  const pickTarget = (s: Slot): 'yes' | 'frost' | 'no' | undefined => {
    if (!picked || at(s)) return undefined;
    const age = ord(s.day) - ord(picked.base.day);
    // mittags am Kochtag ist noch nichts gekocht (Schon-Gekochtes aus der Speisekammer geht)
    if (age < 0 || (s.lunch && age === 0 && !picked.base.cooked)) return 'no';
    return age >= keepsOf(picked.recipe, fallback) ? 'frost' : 'yes';
  };
  const place = (slot: Slot, id: string) => {
    const next = put(slot, id, id);
    if (!next) return;
    if (!fridgeOf(next, recipes, hh, fallback, stock).find((f) => f.base.recipeId === id)?.cards) setPick(null);
    if (asks(id)) setDish(slot);
  };
  const putStock = (slot: Slot, recipeId: string) => {
    setWhat(null);
    change(putPrepared(week, slot, recipeId, hh, () => newId('w')), `${slotText(slot)}: ${title(recipes.find((r) => r.id === recipeId))} aus dem Vorrat`);
  };
  // Kärtchen einfrieren statt verteilen (Julia) – mit Rückgängig; ist alles weg, ist auch nichts mehr gewählt
  const freezeCard = (f: FridgeView) => {
    const undo = freezeFromFridge(f.base.recipeId);
    if (!undo) return;
    if (f.cards <= 1) setPick(null);
    toast(`${portionText(Math.min(hh.portions, f.left))} ${title(f.recipe)} ${f.base.cooked ? 'eingefroren' : 'kommt ins Gefrierfach'}`, { label: 'Rückgängig', run: undo });
  };
  const unfreeze = (f: FridgeView) => {
    const undo = unfreezeToFridge(f.base.recipeId);
    if (undo) toast(`${title(f.recipe)}: wieder im Kühlschrank`, { label: 'Rückgängig', run: undo });
  };
  // heute markieren, Vergangenes grau – nur wenn die Woche läuft (ohne Datum wüsste Mashi sonst nicht, welche Woche gemeint ist)
  const today = weekdayOf(new Date());
  const past = (d: Weekday) => started && view.order.indexOf(d) < view.order.indexOf(today);

  const tapSlot = (s: Slot) => {
    const m = at(s);
    if (picked && swapFrom === null) {
      const t = pickTarget(s);
      if (t === 'yes' || t === 'frost') return place(s, picked.base.recipeId);
      setPick(null);
    }
    // Antippen öffnet das Fenster (ändern, tauschen, zurück in den Kühlschrank); ein freier Platz fragt „Was gibt's?“
    if (swapFrom === null) {
      if (!m) setWhat({ slot: s });
      else if (!m.meal.done) setDish(s);
      return;
    }
    if (sameSlot(swapFrom, s)) return setSwapFrom(null);
    if (!canSwap(week, swapFrom, s)) return;
    const a = at(swapFrom);
    setSwapFrom(null);
    change(swapSlots(week, swapFrom, s), m ? `${mealText(a)} und ${mealText(m)} getauscht` : `${mealText(a)} auf ${slotText(s)} verschoben`);
  };
  const holdSlot = (s: Slot) => { setSwapFrom(null); setPick(null); setHold(s); };

  const finds = mhdFinds(pantry.items, week, recipes, table, new Date());
  const rowProps = (d: DayView, s: Slot) => {
    const m = mealOf(d, s);
    return {
      slot: s, m, swapFrom, week, onTap: () => tapSlot(s), onHold: () => holdSlot(s), pickTarget: pickTarget(s),
      tone: m ? tone(m.meal.baseId) : '',
    };
  };

  return (
    <div className="week">
      {finds.length > 0 && <MhdFinds finds={finds} week={week} change={change} />}

      {fridge.length > 0 && (
        <Fridge items={fridge} order={view.order} pick={picked ? pick : null} household={hh} tone={tone}
          onPick={(id) => { setSwapFrom(null); setPick((p) => (p === id ? null : id)); }}
          onCookDay={(f, d) => change(setCookDay(week, f.base.recipeId, d, hh), `${title(f.recipe)}: gekocht am ${DAY_LONG[d]}`)}
          onFreezable={(f) => toast(`${title(f.recipe)} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(f.base.recipeId, { freezable: true }) })}
          onFreezeCard={freezeCard} onUnfreeze={unfreeze} />
      )}

      <section className="week__days" aria-label={hh.lunchDays.length ? 'Mittags und abends' : 'Abends'}>
        <h2 className="h3">{hh.lunchDays.length ? 'Mittags & abends' : 'Abends'}</h2>
        {swapFrom !== null
          ? (
            <div className="week__swapbar" role="status">
              <Icon name="shuffle" size={16} />
              <span><b>{mealText(at(swapFrom))}</b> – mit welchem Platz tauschen?</span>
              <button type="button" className="link small" onClick={() => setSwapFrom(null)}>Abbrechen</button>
            </div>
          )
          : !picked && <p className="small muted">Antippen: ändern, tauschen oder zurück in den Kühlschrank. Lange drücken: Portionen und Kochtag.</p>}
        {/* Gerichte einer Grundlage im Wechsel (Julia: „besser hintereinander, dann ist das Vorkochen der Extras leichter“) */}
        {mixedBases(week).map((id) => (
          <p key={id} className="small week__hint">
            <Icon name="shuffle" size={14} /> {title(recipes.find((x) => x.id === id))}: Gerichte im Wechsel – hintereinander lassen sich die Extras leichter vorbereiten.
            <button type="button" className="link small" onClick={() => change(groupMeals(week, id), `${title(recipes.find((x) => x.id === id))}: hintereinander gelegt`)}>Hintereinander legen</button>
          </p>
        ))}
        <div className="week__list">
          {view.days.map((d) => {
            const lunchDay = hh.lunchDays.includes(d.day);
            return (
              <div key={d.day} className={`week__day${past(d.day) ? ' is-past' : ''}${started && d.day === today ? ' is-today' : ''}`} aria-current={started && d.day === today ? 'date' : undefined}>
                {lunchDay && (d.noLunch
                  ? <LunchOff day={d.day} onToggle={() => change(toggleLunch(week, d.day, hh), `${DAY_SHORT[d.day]} mittags wieder geplant`)} />
                  : (
                    <div className="lunch-slot">
                      <MealRow {...rowProps(d, { day: d.day, lunch: true })} part="mittags" />
                      <button type="button" className="lunch__x" onClick={() => change(toggleLunch(week, d.day, hh), `${DAY_SHORT[d.day]} kein Mittagessen${d.lunch && !d.lunch.meal.done ? ' – zurück im Kühlschrank' : ''}`)}
                        aria-label={`${DAY_SHORT[d.day]} kein Mittagessen`}><Icon name="close" size={14} /></button>
                    </div>
                  ))}
                <MealRow {...rowProps(d, { day: d.day })} part={lunchDay ? 'abends' : undefined} cookNote={cookNote(d.day)}
                  potTone={cookBases(d.day)[0] ? tone(cookBases(d.day)[0].base.recipeId) : ''} />
              </div>
            );
          })}
        </div>
      </section>

      <div className="week__end">
        {/* „Woche leeren“ steht oben auf der Plan-Seite (Julia: gut sichtbar) */}
        <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/plan/woche')}><Icon name="pencil" size={16} /> Woche ändern</button>
      </div>

      {hold !== null && (
        <DaySheet slot={hold} m={at(hold)} onClose={() => setHold(null)} cook={cookTools(hold.day)}
          onPortions={portions}
          onOther={(m) => { setHold(null); setWhat({ slot: slotOf(m.meal), replace: m }); }}
          onDelete={(m) => { setHold(null); change(removeMeal(week, m.meal.id), `${mealText(m)} gestrichen`); }}
          onFreeze={(m) => { setHold(null); toast(`${title(recipes.find((r) => r.id === m.meal.baseId))} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(m.meal.baseId, { freezable: true }) }); }} servings={(m) => servingsOf(m.meal, hh)} />
      )}

      {dish !== null && (() => {
        const m = at(dish);
        if (!m || m.meal.done) return null;
        // Julia: „Kochmodus starten“ direkt hier – am Kochtag vorkochen, das Essen kommt im selben Durchgang mit
        const go = cookStart(view, m, hh);
        const base = view.bases.find((b) => b.base.recipeId === m.meal.baseId);
        return (
          <DishSheet m={m} view={view} recipes={recipes} asks={asks(m.meal.baseId)} servings={servingsOf(m.meal, hh)} onClose={() => setDish(null)}
            onCook={go && (() => navigate(go.prep ? `/rezept/${go.baseId}/kochen?p=${go.portions}&vorkochen=1` : `/rezept/${go.recipeId}/kochen?p=${go.portions}&meal=${go.mealId}`))}
            cookNote={go?.prep ? `${title(base?.recipe)} vorkochen (${go.portions} Portionen) – das Frische für heute kommt mit`
              : !go && base && !base.base.cooked ? `Kochen geht nach dem Vorkochen am ${DAY_LONG[base.base.day]}.` : undefined}
            onPut={(recipeId, side) => put(dish, recipeId, m.meal.baseId, side)}
            onPortions={(v) => portions(m, v)}
            onSwap={() => { setDish(null); setPick(null); setSwapFrom(dish); }}
            onBack={() => { setDish(null); change(backToFridge(week, m.meal.id, hh), `${mealText(m)} – zurück im Kühlschrank`); }}
            onFreeze={() => toast(`${title(recipes.find((r) => r.id === m.meal.baseId))} lässt sich einfrieren`, { label: 'Rückgängig', run: setPrepInfo(m.meal.baseId, { freezable: true }) })} />
        );
      })()}

      {what && (
        <WhatSheet cook={what.from ? undefined : cookTools(what.slot.day)} slot={what.slot} replace={what.replace} from={what.from} view={view} recipes={recipes} fallback={fallback} onClose={() => setWhat(null)}
          stock={preparedPortions(pantry.items)} onStock={(recipeId) => putStock(what.slot, recipeId)}
          onPut={(recipeId, baseId, side) => put(what.slot, recipeId, baseId, side)}
          onCookbook={onPickDish && (() => { setWhat(null); onPickDish(what.slot, what.replace?.meal.id); })} />
      )}
    </div>
  );
}

/**
 * Lange gedrückt (Julia: „antippen = tauschen, lang draufbleiben = Vorkochtag und Portionen ändern“): alles zu einem
 * Abend an einem Ort – Portionen, anderes Gericht, löschen und, am Kochtag, was vorgekocht wird.
 */
function DaySheet({ slot, m: shown, cook, servings, onPortions, onOther, onDelete, onFreeze, onClose }: {
  slot: Slot; m?: MealView; cook: ReactNode; servings: (m: MealView) => number; onPortions: (m: MealView, v: number) => void;
  onOther: (m: MealView) => void; onDelete: (m: MealView) => void; onFreeze: (m: MealView) => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const m = shown && !shown.meal.done ? shown : undefined;
  const what = slot.lunch ? 'Mittag' : 'Abend';
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={slotText(slot)} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{slotText(slot)}{m ? `: ${mealText(m)}` : ''}</h2>
        {/* hält nicht bis hierhin (Julia: „ich kann das doch einfrieren“) – einfrierbar machen, dann „am Vortag auftauen“ */}
        {m?.tooOld && (
          <p className="small daysheet__freeze">
            <Icon name="snow" size={14} /> Hält bis {DAY_LONG[slot.day]} nicht frisch.
            <button type="button" className="link small" onClick={() => onFreeze(m)}>Einfrieren und am Vortag auftauen</button>
          </p>
        )}
        {m && (
          <div className="daysheet__meal">
            <div className="row-between">
              <span>Portionen an diesem {what}</span>
              <Stepper small value={servings(m)} onChange={(v) => onPortions(m, v)} label={`Portionen ${slotText(slot)}`} />
            </div>
            <div className="row-gap">
              <button type="button" className="btn btn--soft btn--sm" onClick={() => onOther(m)}><Icon name="refresh" size={14} /> Anderes Gericht</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(m)}><Icon name="trash" size={14} /> Vom {what} entfernen</button>
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
function WhatSheet({ cook, slot, replace, from, view, recipes, fallback, stock, onStock, onPut, onCookbook, onClose }: {
  cook?: ReactNode; slot: Slot; replace?: MealView; from?: string; view: WeekView; recipes: Recipe[]; fallback: number; stock: Map<string, number>;
  onStock: (recipeId: string) => void; onPut: (recipeId: string, baseId: string, side?: string) => void; onCookbook?: () => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const day = slot.day;
  const at = view.order.indexOf(day);
  const eaten = view.days.flatMap((d) => [d.lunch, d.meal]).filter((m): m is MealView => !!m);
  // Vorgekochtes zuerst (damit nichts verdirbt) – was schon als Grundlage in der Woche steht, kommt unten mit
  const weekBases = new Set(view.bases.map((b) => b.base.recipeId));
  const prepared = [...stock].flatMap(([id, n]) => { const r = recipes.find((x) => x.id === id); return r && !weekBases.has(id) ? [{ r, n }] : []; });
  const options = view.bases.flatMap((b) => {
    const age = at - view.order.indexOf(b.base.day);
    const old = age >= keepsOf(b.recipe, fallback);
    // mittags am Kochtag ist es noch nicht gekocht
    if (age < 0 || (slot.lunch && age === 0 && !b.base.cooked) || !b.recipe) return [];
    return [{ b, frost: old, dishes: byEffort(transformsOf(b.base.recipeId, recipes)) }];
  });
  const current = (recipeId: string, side?: string) => replace?.meal.recipeId === recipeId && replace.meal.side === side;
  const chip = (recipeId: string, baseId: string, text: string, side?: string) => (
    <button key={`${recipeId}+${side ?? ''}`} type="button" className={`chip${current(recipeId, side) ? ' is-on' : ''}`} onClick={() => onPut(recipeId, baseId, side)}>{text}</button>
  );
  const fromBase = from ? view.bases.find((b) => b.base.recipeId === from) : undefined;
  const heading = replace ? `${slotText(slot)}: statt ${mealText(replace)}` : fromBase ? `${slotText(slot)}: was wird aus der neuen Portion ${title(fromBase.recipe)}?` : `Was gibt's am ${slotText(slot)}?`;
  // nach „+“ am Kochtag: was diese Woche schon aus der Grundlage zusammengestellt ist, zuerst (Julia: nicht das gespeicherte Rezept raten)
  const again = from ? [...new Map(eaten.filter((m) => m.meal.baseId === from).map((m) => [mealKey(m.meal.recipeId, m.meal.side), m] as const)).values()] : [];
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
              {[...new Set(eaten.flatMap((x) => (x.meal.baseId === b.base.recipeId && x.meal.recipeId === b.base.recipeId && x.meal.side ? [x.meal.side] : [])))]
                .map((side) => chip(b.base.recipeId, b.base.recipeId, `mit ${comboText(side)}`, side))}
              {dishes.length > 0 ? dishes.map((r) => chip(r.id, b.base.recipeId, title(r))) : chip(b.base.recipeId, b.base.recipeId, title(b.recipe))}
            </div>
            {/* Grundlage mit Bausteinen (Julia: Baukasten statt nur „+ Beilage“) */}
            {dishes.length > 0 && b.recipe && <ComboStepper base={b.recipe} lunch={slot.lunch} onAdd={(side) => onPut(b.base.recipeId, b.base.recipeId, side)} />}
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
                {b.evenings} {b.evenings === 1 ? 'Abend' : 'Abende'}{b.lunches ? ` + ${b.lunches} ${b.lunches === 1 ? 'Mittag' : 'Mittage'}` : ''}{b.base.extra ? ` + ${b.base.extra} im Kühlschrank` : ''}{b.base.freeze ? ` + ${b.base.freeze} eingefroren` : ''}
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
function Fridge({ items, order, pick, household, tone, onPick, onCookDay, onFreezable, onFreezeCard, onUnfreeze }: {
  items: FridgeView[]; order: Weekday[]; pick: string | null; household: Household; tone: (baseId: string) => string;
  onPick: (baseId: string) => void; onCookDay: (f: FridgeView, day: Weekday) => void; onFreezable: (f: FridgeView) => void;
  onFreezeCard: (f: FridgeView) => void; onUnfreeze: (f: FridgeView) => void;
}) {
  const [daysFor, setDaysFor] = useState<string | null>(null);
  const left = items.reduce((n, f) => n + f.left, 0);
  const frozen = items.reduce((n, f) => n + (f.base.freeze ?? 0), 0);
  const picked = items.find((f) => f.base.recipeId === pick);
  // alles verteilt (Julia): nur eine Zeile, damit die Abende nicht nach unten rutschen – antippen öffnet ihn
  const [open, setOpen] = useState(false);
  if (!left && !open) {
    return (
      <button type="button" className="fridge fridge--closed" aria-expanded={false} onClick={() => setOpen(true)} aria-label="Kühlschrank: alles verteilt – öffnen">
        <Icon name="fridge" size={20} />
        <span className="fridge__title">Kühlschrank</span>
        <span className="small fridge__left">alles verteilt{frozen ? ` · ${portionText(frozen)} eingefroren` : ''} <Icon name="check" size={14} /></span>
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
      <p className="small muted">{picked ? `${title(picked.recipe)} gewählt – tippe einen freien Platz ab ${DAY_LONG[picked.base.day]} oder friere es ein.` : left ? 'Kärtchen antippen, dann einen freien Platz – oder einfrieren.' : 'Alles, was gekocht wird, hat einen Platz.'}</p>
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
                <button type="button" className="link small" onClick={() => onFreezable(f)}>Einfrieren</button>
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
            {/* gewählt: auf einen Platz legen – oder einfrieren statt verteilen (Julia) */}
            {pick === id && f.cards > 0 && (
              <div className="fridge__pickbar">
                <button type="button" className="btn btn--soft btn--sm" onClick={() => onFreezeCard(f)}><Icon name="snow" size={14} /> Einfrieren</button>
                <span className="small muted">oder einen freien Platz antippen</span>
              </div>
            )}
            {(f.base.freeze ?? 0) > 0 && (
              <p className="small fridge__frozen">
                <Icon name="snow" size={14} /> {portionText(f.base.freeze!)} {f.base.cooked ? 'eingefroren' : 'ins Gefrierfach'}
                <button type="button" className="link small" onClick={() => onUnfreeze(f)}>doch verteilen</button>
              </p>
            )}
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
function DishSheet({ m, view, recipes, asks, servings, onCook, cookNote, onPut, onPortions, onSwap, onBack, onFreeze, onClose }: {
  m: MealView; view: WeekView; recipes: Recipe[]; asks: boolean; servings: number;
  /** fehlt: nichts zu kochen (nur aufwärmen) oder erst nach dem Vorkochen */
  onCook?: () => void; cookNote?: string;
  onPut: (recipeId: string, side?: string) => void; onPortions: (v: number) => void; onSwap: () => void; onBack: () => void; onFreeze: () => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const baseId = m.meal.baseId;
  const base = recipes.find((r) => r.id === baseId);
  const dishes = byEffort(transformsOf(baseId, recipes));
  const combos = [...new Set(view.days.flatMap((x) => [x.lunch, x.meal]).flatMap((x) => (x?.meal.baseId === baseId && x.meal.recipeId === baseId && x.meal.side ? [x.meal.side] : [])))];
  const on = (recipeId: string, side?: string) => m.meal.recipeId === recipeId && m.meal.side === side;
  const chip = (recipeId: string, text: string, side?: string) => (
    <button key={`${recipeId}+${side ?? ''}`} type="button" className={`chip${on(recipeId, side) ? ' is-on' : ''}`} aria-pressed={on(recipeId, side)} onClick={() => onPut(recipeId, side)}>{text}</button>
  );
  const status = m.meal.freshCooked ? 'schon mitgekocht – nur noch aufwärmen oder einpacken' : m.frost ? 'aus dem Gefrierfach – am Vortag auftauen' : m.age === 0 ? 'frisch gekocht' : `aufwärmen · ${m.age} ${m.age === 1 ? 'Tag' : 'Tage'} alt`;
  const slot = slotOf(m.meal);
  const day = slot.day;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={slotText(slot)} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{slotText(slot)}: {mealText(m)}</h2>
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
            {base && <ComboStepper base={base} lunch={slot.lunch} onAdd={(side) => onPut(baseId, side)} />}
          </section>
        )}
        <div className="row-between dish__portions">
          <span>Portionen an diesem {slot.lunch ? 'Mittag' : 'Abend'}</span>
          <Stepper small value={servings} onChange={onPortions} label={`Portionen ${slotText(slot)}`} />
        </div>
        {onCook && <button type="button" className="btn btn--primary btn--block dish__cook" onClick={onCook}><Icon name="play" size={18} /> Kochmodus starten</button>}
        {cookNote && <p className="small muted dish__cooknote">{cookNote}</p>}
        <div className="row-gap dish__actions">
          <button type="button" className="btn btn--soft btn--sm" onClick={onSwap}><Icon name="shuffle" size={14} /> Tauschen</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}><Icon name="fridge" size={14} /> Zurück in den Kühlschrank</button>
          <button type="button" className={`btn ${onCook ? 'btn--soft' : 'btn--primary'} btn--sm`} onClick={onClose}>Fertig</button>
        </div>
      </div>
    </div>
  );
}

/** Mittagstag, diese Woche aber kein Mittagessen (Kantine, auswärts) */
function LunchOff({ day, onToggle }: { day: Weekday; onToggle: () => void }) {
  return (
    <div className="lunch lunch--off">
      <span className="lunch__label">{DAY_SHORT[day]} mittags</span>
      <span className="lunch__text small muted">kein Mittagessen diese Woche</span>
      <button type="button" className="link small" onClick={onToggle}>wieder planen</button>
    </div>
  );
}

/**
 * Ein Platz (mittags oder abends): Antippen öffnet das Fenster, lange drücken die Werkzeuge. Ist ein Kärtchen aus dem
 * Kühlschrank gewählt (`pickTarget`), zeigen freie Plätze, ob es dorthin darf – und ob es bis dahin eingefroren werden muss.
 */
function MealRow({ slot, m, swapFrom, week, onTap, onHold, cookNote, pickTarget, tone = '', potTone = '', part }: {
  slot: Slot; m?: MealView; swapFrom: Slot | null; week: Week; onTap: () => void; onHold: () => void; cookNote?: string;
  pickTarget?: 'yes' | 'frost' | 'no'; tone?: string; potTone?: string; part?: 'mittags' | 'abends';
}) {
  const press = useLongPress(onHold, onTap);
  const pot = cookNote && <span className={`meal__pot${potTone}`} role="img" aria-label={`Kochtag: ${cookNote}`} title={`Kochtag: ${cookNote}`}><Icon name="pot" size={15} /></span>;
  const picked = swapFrom !== null && sameSlot(swapFrom, slot);
  const mode = pickTarget ? (pickTarget === 'no' ? ' is-blocked' : ' is-target')
    : swapFrom === null ? '' : picked ? ' is-picked' : canSwap(week, swapFrom, slot) ? ' is-target' : ' is-blocked';
  const notYet = slot.lunch ? 'noch nicht gekocht' : 'vor dem Kochtag';
  const hint = pickTarget ? (pickTarget === 'no' ? <span className="meal__hint meal__hint--no">{notYet}</span> : <span className="meal__hint">{pickTarget === 'frost' ? 'hierher · einfrieren' : 'hierher'}</span>)
    : swapFrom === null || picked ? null : mode === ' is-target' ? <span className="meal__hint">hierhin</span> : <span className="meal__hint meal__hint--no">{notYet}</span>;
  const label = <span className="meal__day">{DAY_SHORT[slot.day]}{part && <small>{part}</small>}</span>;
  const cls = slot.lunch ? ' meal--lunch' : '';
  if (!m) {
    return (
      <button type="button" className={`meal meal--free${cls}${mode}`} disabled={mode === ' is-blocked'} {...press}
        aria-label={pickTarget && pickTarget !== 'no' ? `${slotText(slot)} frei – hierher legen` : swapFrom === null && !pickTarget ? `${slotText(slot)} frei – antippen: Was gibt's?` : undefined}>
        {pot}
        {label}
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
    <button type="button" className={`meal${cls}${mode}${m.meal.done ? ' is-done' : ''}`} disabled={m.meal.done || mode === ' is-blocked'} {...press}
      aria-label={`${mealText(m)} am ${slotText(slot)}${swapFrom === null && !m.meal.done ? ' – antippen zum Ändern' : ''}`}>
      {pot}
      {tone && <span className={`meal__tone${tone}`} aria-hidden="true" />}
      {label}
      <RecipeImage image={m.recipe?.image} size="sm" />
      <span className="meal__text"><strong>{mealText(m)}</strong>{note}{m.meal.portions && <span className="tag">{portionText(m.meal.portions)}</span>}</span>
      {hint ?? (picked ? <span className="meal__hint">gewählt</span> : !m.meal.done && <span className="meal__grip" aria-hidden="true"><Icon name="chevron" size={16} /></span>)}
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
