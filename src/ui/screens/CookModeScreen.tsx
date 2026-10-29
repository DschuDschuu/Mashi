import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ask } from '../confirm';
import { leftoverSuggestions, pantryAfterPlan } from '../../domain/pantry';
import { packSuggestions } from '../../domain/packs';
import { packLabel } from '../../domain/pantryLabel';
import { currentContent } from '../../domain/recipe';
import { cookingContent } from '../../domain/homemade';
import { asCooked, formatAmount, formatQuantity, formatUnitAmount, scaleIngredients } from '../../domain/scaling';
import { orderByUse } from '../../domain/stepIngredients';
import type { Ingredient } from '../../domain/types';
import { basesFor, cookDay, cookParts, currentPlan, eatMeal, householdOf, markCooked, setPlanAmounts, useFoodTable, usePantry, usePlan, useRecipe, useRecipes } from '../../data/store';
import { coveredShare } from '../../domain/baseStock';
import { DAY_SHORT, mealTitle, servingsOf, setMealPortions, weekView } from '../../domain/week';
import type { WeekMeal } from '../../domain/mealplan';
import { alongMeals, cookDayMeal, freshFor, TODAY } from '../../domain/cookDay';
import { Stepper } from '../components/Controls';
import { specialDays } from '../../domain/shelfLife';
import { doneParts, forParts, partLabel, partsOf, preselectParts } from '../../domain/parts';
import { lastParts, rememberParts, type CookHow } from '../cookPartsMemory';
import { goBack, navigate } from '../../router';
import { Icon } from '../components/Icon';
import { PageIntro } from '../components/PageIntro';
import { StepIngredients } from '../components/StepIngredients';
import { cookedToast } from '../cookedToast';
import { toast } from '../toast';
import { useMediaQuery } from '../useMediaQuery';
import { DishNutrition } from '../components/DishNutrition';
import { pickFor } from '../../domain/nutrition/variants';
import { choicesFor } from '../useNutrition';
import { useSheet } from '../useSheet';
import { amountsText, stockText, untilLabel, UseMoreSheet } from '../components/UseMoreSheet';
import { newId } from '../../domain/recipe';
import { byUrgency, isDone, isRunning, newlyDone, pauseTimer, remainingOf, removeTimer, resumeTimer, startTimer, type CookTimer } from '../../domain/timers';

export function CookModeScreen({ id, servings: asked, variants, prep, mealId }: {
  id: string; servings?: number; variants?: Record<string, string>;
  /** Kochtag der Vorkoch-Woche: die Grundlage auf Vorrat kochen (week.ts) */
  prep?: boolean;
  /** ein Abendessen der Woche: die Grundlage kommt aus dem Vorgekochten */
  mealId?: string;
}) {
  const recipe = useRecipe(id);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  /** mehrere gleichzeitig: je Schritt mit Zeitangabe einer, dazu eigene („Ofen“) */
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [addingTimer, setAddingTimer] = useState(false);
  const [, tick] = useState(0);
  useWakeLock();
  // den Ton-Kontext beim Verlassen schließen – sonst bleibt je Besuch einer offen (Code-Review #23)
  useEffect(() => closeAudio, []);
  // Tablet quer: Zutaten dauerhaft als Spalte neben dem Schritt
  const wide = useMediaQuery('(min-width: 900px)');
  /** Mengen „nur dieses Mal“ je Zutat-ID – das Rezept bleibt, wie es ist */
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [noLeftovers, setNoLeftovers] = useState(false);
  const [noPacks, setNoPacks] = useState(false);
  /** Blatt offen: für noch offene Reste („Menge wählen“) oder für schon gewählte („Anpassen“) */
  const [pickLeftovers, setPickLeftovers] = useState<'open' | 'chosen' | null>(null);
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  // Kochtag in einem Durchgang (Julia: „10 Portionen vorkochen, aber heute schon was davon essen“): das Essen von heute
  // aus dieser Grundlage kommt frisch dazu – mit den Portionen aus dem Wochenplan, beim Start änderbar
  const hh = householdOf(plan);
  const todayMeal = prep && plan.week ? cookDayMeal(plan.week, id) : undefined;
  const fresh = useMemo(() => (todayMeal ? freshFor(todayMeal, recipes, hh) : undefined), [todayMeal, recipes, hh]);
  /** Portionen für heute – undefined: wie im Plan, null: heute nicht mitkochen */
  const [todayN, setTodayN] = useState<number | null>();
  const plannedN = todayMeal ? servingsOf(todayMeal, hh) : 0;
  const freshN = fresh ? (todayN === undefined ? plannedN : todayN) : null;
  // so viele Portionen werden vorgekocht – mehr für heute nimmt erst aus dem Kühlschrank (wie „+1“ im Wochenplan)
  const prepFor = (n: number | null): number | undefined => {
    if (!plan.week) return asked;
    const week = todayMeal && n !== null && n !== plannedN ? setMealPortions(plan.week, todayMeal.id, n, hh) : plan.week;
    return weekView(week, recipes, hh).bases.find((b) => b.base.recipeId === id)?.portions ?? asked;
  };
  // Abendessen der Vorkoch-Woche (?meal=): die Grundlage kommt aus dem Kühlschrank – nicht noch einmal kochen
  const thisMeal = mealId ? plan.week?.meals.find((m) => m.id === mealId) : undefined;
  const mealBase = thisMeal?.baseId;
  // Julia: dasselbe Gericht in den nächsten Tagen → das Frische gleich mitkochen (am Kochtag nur, wenn heute frisch gekocht wird)
  const eatNow = prep ? (fresh ? todayMeal : undefined) : thisMeal;
  // so lange es frisch bleibt – nach „Hält gekocht“ am Gericht, sonst 2 Tage (Julia)
  const offer = plan.week && eatNow ? alongMeals(plan.week, eatNow, recipes, specialDays('prepared', pantry.shelfDays)) : undefined;
  const along = offer?.meals ?? [];
  /** abgewählt – sonst wird alles mitgekocht, was angeboten wird */
  const [skipAlong, setSkipAlong] = useState<string[]>([]);
  const alongOn = !prep || freshN ? along.filter((m) => !skipAlong.includes(m.id)) : [];
  const alongN = alongOn.reduce((n, m) => n + servingsOf(m, hh), 0);
  const servings = prep ? prepFor(freshN) : asked !== undefined && alongN ? asked + alongN : asked;
  /** so, wie gekocht wird – selbst gemachte Gnocchi mit ihren Zutaten und Schritten als eigener Teil (siehe homemade.ts) */
  // sonst: Vorgekochtes deckt seine Grundlage (baseStock.ts) – wie beim Abziehen, wenn du fertig bist (store: basesFor)
  const full = useMemo(() => {
    if (!recipe) return undefined;
    if (mealBase) return cookingContent(recipe, recipes, [mealBase]);
    const { without, supply } = basesFor(recipe, servings ?? currentContent(recipe).servings);
    return cookingContent(recipe, recipes, without, coveredShare(supply));
  }, [recipe, recipes, mealBase, servings, pantry.items, plan.week]);
  /** Rezept-Teile, die du heute kochst (Julia: „Sauce gestern, Nudeln und Fleisch heute“) – null = alle noch nicht fertigen */
  const [chosen, setChosen] = useState<string[] | null>(null);
  /** Dialog „Was kochst du heute?“ beim Start – einmal je Besuch, solange noch mindestens zwei Teile offen sind (Julia: Mashi erkennt Vorgekochtes selbst) */
  const [askParts, setAskParts] = useState(true);
  const done = useMemo(() => (recipe ? doneParts(pantry.items, recipe.id) : []), [recipe, pantry.items]);
  const today = useMemo(() => {
    if (!full) return [];
    return chosen ?? partsOf(full).filter((p) => !done.includes(p));
  }, [full, chosen, done]);

  const base = useMemo(() => {
    if (!full) return [];
    // nur die Teile von heute – mit „zum Schluss“, wenn das Gericht damit fertig wird
    const c = forParts(full, today, done);
    // Reihenfolge wie beim Kochen: was im ersten Schritt gebraucht wird, zuerst
    const own = orderByUse(scaleIngredients(c, servings ?? c.servings), c.steps);
    // das Frische für heute dahinter – für die Portionen von heute (und morgen Mittag), nicht für alle (Julia)
    return fresh && freshN ? [...own, ...orderByUse(scaleIngredients(fresh, freshN + alongN), fresh.steps)] : own;
  }, [full, servings, today, done, fresh, freshN, alongN]);
  // Reste mitverbrauchen – aber nicht, was andere geplante Gerichte noch brauchen
  const table = useFoodTable();
  const { leftovers, packs } = useMemo(() => {
    if (!recipe) return { leftovers: [], packs: [] };
    const others = { ...plan, items: plan.items.filter((i) => i.recipeId !== recipe.id) };
    const rest = pantryAfterPlan(pantry, others, recipes, table);
    // „Ganze Packung?“ – 600 g Hack bei Packungen à 500 g. Die Rest-Frage („alle 3 Tomaten?“) geht vor.
    // (auch: „4 Paprika laufen morgen ab – wie viele verwendest du?“)
    const leftovers = leftoverSuggestions(rest, base, table);
    const packs = packSuggestions(rest, base, table).filter((p) => !leftovers.some((l) => l.ingredientId === p.ingredientId));
    return { leftovers, packs };
  }, [recipe, base, pantry, plan, recipes, table]);

  // Eingeplant (gleiche Portionen)? Dann gelten die Mengen aus dem Plan auch beim Kochen – und was du hier
  // änderst, landet wieder im Plan (Julia): Plan, Reservierung und Kochmodus zeigen immer dasselbe
  const planned = recipe ? plan.items.find((i) => i.recipeId === recipe.id) : undefined;
  const linked = !!recipe && !!planned && planned.servings === (servings ?? currentContent(recipe).servings);
  const seeded = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (seeded.current || !recipe) return;
    seeded.current = true;
    if (linked && planned?.amounts) setAmounts(planned.amounts);
    setReady(true);
  }, [recipe, linked, planned]);
  useEffect(() => {
    // gleich wie im Plan: tut nichts. Das Frische für heute gehört nicht zum Plan-Eintrag der Grundlage
    if (ready && linked && recipe) setPlanAmounts(recipe.id, Object.fromEntries(Object.entries(amounts).filter(([k]) => !k.startsWith(TODAY))));
  }, [ready, linked, recipe, amounts]);

  // Läuft ein Timer, 4× pro Sekunde neu zeichnen
  const anyRunning = timers.some((t) => t.endsAt);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [anyRunning]);

  const now = Date.now();
  // jeder Timer klingelt genau einmal – auch wenn zwei zugleich ablaufen
  const rung = useRef(new Set<string>());
  useEffect(() => {
    const ids = newlyDone(timers, rung.current, Date.now());
    if (!ids.length) return;
    ids.forEach((x) => rung.current.add(x));
    ring();
  });

  if (!recipe || !full) return null;
  const c = full;
  const parts = partsOf(c);
  const cook = forParts(c, today, done);
  // Kochtag: erst die Grundlage, dann das Frische für heute
  const all = [...cook.steps, ...(fresh && freshN ? fresh.steps : [])];
  // nur „zusammenstellen“ ohne eigene Schritte: ein Schritt, damit „Fertig“ erreichbar bleibt
  const steps = all.length ? all : [{ id: 'nur-fertig', text: 'Für diese Auswahl gibt es keine eigenen Schritte – tippe auf „Fertig“.' }];
  const todayTitle = todayMeal ? mealTitle(todayMeal, recipes.find((r) => r.id === todayMeal.recipeId)) : '';
  const toggleToday = () => {
    setTodayN(freshN ? null : plannedN);
    setStep(0);
  };
  // nur, was angehakt ist – sonst, was angeboten wird
  const alongText = along.length === 1 ? `+ ${slotLabel(along[0])} · ${alongN || servingsOf(along[0], hh)}` : `+ ${alongOn.length || along.length} weitere${alongN ? ` · ${alongN}` : ''}`;
  const toggleAlong = () => setSkipAlong(alongOn.length ? along.map((m) => m.id) : []);
  const open = parts.filter((p) => !done.includes(p));
  const togglePart = (p: string) => {
    const on = today.includes(p);
    // nichts mehr gewählt geht nur, wenn ohnehin alles fertig ist
    if (on && today.length === 1 && open.length) return;
    setChosen(on ? today.filter((x) => x !== p) : parts.filter((x) => x === p || today.includes(x)));
    setStep(0);
  };
  // Sorte: im Rezept gewählt – sonst die vom Plan – sonst Vorschlag (eine im Vorrat = diese)
  const own = variants ?? plan.items.find((i) => i.recipeId === recipe.id)?.variants;
  /**
   * „Was kochst du heute?“ (Julia): Was schon gekocht ist, erkennt Mashi an der Speisekammer – gewählt wird nur unter den
   * offenen Teilen. Alles Offene heute = wie ohne Auswahl (null), sonst genau die gewählten Teile.
   * Bestätigt (nicht nur weggewischt) und kein Abend aus dem Plan: als „wie letztes Mal“ merken.
   */
  const how: CookHow = prep ? 'vorkochen' : 'normal';
  const startParts = (heute: string[], confirmed: boolean, eat: number | null, skip: string[]) => {
    setAskParts(false);
    setChosen(heute.length && heute.length < open.length ? heute : null);
    setStep(0);
    if (fresh) setTodayN(eat);
    setSkipAlong(skip);
    if (confirmed && !mealId && open.length > 1) rememberParts(recipe.id, how, heute);
  };
  // Vorauswahl: Abend aus dem Plan → alles Offene; sonst wie letztes Mal; sonst beim Vorkochen alles außer „Frisch“.
  // Am Kochtag mit Essen von heute wird auch ohne Teile gefragt – wie viele heute mitessen (Julia: „einfach nachfragen“),
  // ebenso, wenn es dasselbe in den nächsten Tagen gibt (gleich mitkochen?)
  const pre = askParts && (open.length > 1 || fresh || along.length) ? preselectParts(open, { prep, meal: !!mealId, last: mealId ? undefined : lastParts(recipe.id, how) }) : undefined;
  const s = steps[Math.min(step, steps.length - 1)];
  const freshStep = s.id.startsWith(TODAY);
  const last = step >= steps.length - 1;
  const ingredients = base.map((i) => (i.id in amounts ? { ...i, amount: amounts[i.id] } : i));
  const openLeftovers = noLeftovers ? [] : leftovers.filter((l) => !(l.ingredientId in amounts));
  /** schon mehr gewählt (im Plan oder hier) – „eine Paprika mehr oder weniger“ lässt sich noch anpassen */
  const chosenLeftovers = leftovers.filter((l) => l.ingredientId in amounts);
  const openPacks = noPacks ? [] : packs.filter((p) => !(p.ingredientId in amounts));
  const setAmount = (ing: Ingredient, amount: number | undefined) => {
    const { [ing.id]: _old, ...rest } = amounts;
    const original = base.find((b) => b.id === ing.id)?.amount;
    // Wieder die Rezeptmenge → keine Ausnahme mehr
    setAmounts(amount === undefined || (original !== undefined && Math.abs(amount - original) < 1e-9) ? rest : { ...rest, [ing.id]: amount });
    setEditing(null);
  };

  // beim Tipp den Ton freischalten – später klingelt der Timer ohne Tipp, das erlaubt iOS nur so (Code-Review #23)
  const start = (minutes: number, label: string, forStep?: number) => {
    unlockAudio();
    setTimers((l) => startTimer(l, { id: newId('t'), label, minutes, step: forStep }, Date.now()));
  };
  const pause = (tid: string) => setTimers((l) => pauseTimer(l, tid, Date.now()));
  const resume = (tid: string) => {
    unlockAudio();
    setTimers((l) => resumeTimer(l, tid, Date.now()));
  };
  const drop = (tid: string) => setTimers((l) => removeTimer(l, tid));

  const finish = () => {
    // Kochtag (Julia: „Vorkochen starten“): Portionen in die Speisekammer, dann die nächste Grundlage des Tages
    // mit dem Essen von heute in einem Durchgang: das ist dann auch gleich gegessen
    if (prep) {
      const result = cookDay(recipe.id, todayMeal && freshN ? { mealId: todayMeal.id, portions: freshN, along: alongOn.map((m) => m.id) } : undefined);
      if (result) {
        const total = result.fresh + result.frozen;
        const portions = `${total} ${total === 1 ? 'Portion' : 'Portionen'}`;
        toast(result.ate
          ? `${c.title}: ${portions} gekocht, ${result.ate} davon heute${result.frozen ? `, ${result.frozen} eingefroren` : ''} – ${alongN ? `für ${alongOn.map(slotLabel).join(', ')} gleich abfüllen` : 'guten Appetit!'}`
          : `${c.title}: ${portions} in der Speisekammer${result.frozen ? `, davon ${result.frozen} eingefroren` : ''}`, { label: 'Rückgängig', run: result.undo });
        const p = currentPlan();
        const day = p.week?.bases.find((b) => b.recipeId === recipe.id)?.day;
        const next = p.week ? weekView(p.week, recipes, householdOf(p)).bases.find((b) => b.base.day === day && !b.base.cooked) : undefined;
        if (next) navigate(`/rezept/${next.base.recipeId}/kochen?p=${next.portions}&vorkochen=1`, { replace: true });
        else navigate(result.ate ? '/' : '/plan', { replace: true });
        return;
      }
    }
    // Abendessen der Woche: frische Zutaten raus, die Grundlage aus dem Vorgekochten
    if (mealId) {
      const result = eatMeal(mealId, alongOn.map((m) => m.id));
      if (result) {
        const later = alongN ? `Für ${alongOn.map(slotLabel).join(', ')} gleich abfüllen` : '';
        toast(result.used.length ? `Aus der Speisekammer: ${result.used.join(', ')}${later ? ` – ${later.toLowerCase()}` : ''}` : later ? `${later} – guten Appetit!` : 'Guten Appetit!', { label: 'Rückgängig', run: result.undo });
        navigate('/', { replace: true });
        return;
      }
    }
    const pick = pickFor(choicesFor(c), own);
    if (parts.length) {
      // nur Teile: die stehen jetzt als Vorgekocht in der Speisekammer – das Gericht ist noch nicht gekocht
      const result = cookParts(recipe.id, today, servings ?? c.servings, amounts, pick);
      if (result.stored.length) {
        toast(`${result.stored.join(', ')} steht in der Speisekammer – den Rest kochst du später`, result.undo ? { label: 'Rückgängig', run: result.undo } : undefined);
        goBack(`/rezept/${recipe.id}`);
        return;
      }
      cookedToast(result);
    } else cookedToast(markCooked(recipe.id, servings ?? c.servings, amounts, pick));
    // Probiergericht: erst essen, dann bewerten (Julia: „ich brauch Zeit zwischen Kochen und Essen“) – die Startseite fragt
    if (recipe.trial) navigate('/', { replace: true });
    else if (recipe.status === 'zum_testen' || recipe.status === 'bewaehrt') navigate(`/rezept/${recipe.id}/test`, { replace: true });
    else goBack(`/rezept/${recipe.id}`);
  };

  // der Timer dieses Schritts groß im Schritt – alle anderen unten in der Leiste, Dringendes zuerst
  const here = timers.find((t) => t.step === step);
  const others = byUrgency(timers.filter((t) => t !== here), now);
  // Läuft ein Timer oder sind Mengen geändert, lieber nachfragen – beides wäre sonst weg
  const leave = async () => {
    const running = timers.filter((t) => isRunning(t, Date.now())).length;
    // eingeplant: die Mengen stehen im Plan, beim Verlassen geht nichts verloren
    const changed = !linked && Object.keys(amounts).length > 0;
    const clocks = running === 1 ? 'Ein Timer läuft noch' : `${running} Timer laufen noch`;
    const why = running && changed ? `${clocks} und deine geänderten Mengen gehen verloren.`
      : running ? `${clocks}.` : changed ? 'Deine geänderten Mengen gehen verloren.' : '';
    if (why && !(await ask({ title: 'Kochmodus beenden?', text: `${why} Fertig gekocht? Dann lieber im letzten Schritt „Fertig“ tippen.`, confirm: 'Beenden', cancel: 'Weiterkochen', danger: true }))) return;
    goBack(`/rezept/${recipe.id}`);
  };

  return (
    <main className={`cook${wide ? ' cook--wide' : ''}`}>
      <header className="cook__head">
        <button className="iconbtn" onClick={leave} aria-label="Kochmodus beenden"><Icon name="close" /></button>
        <div className="cook__progress">
          <span>Schritt {step + 1} von {steps.length}</span>
          <div className="bar"><div style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        </div>
        {wide ? <span className="iconbtn-spacer" /> : (
          <button className={`iconbtn${showIngredients ? ' is-on' : ''}`} onClick={() => setShowIngredients(!showIngredients)} aria-label="Zutaten anzeigen" aria-expanded={showIngredients}>
            <Icon name="list" />
          </button>
        )}
      </header>
      <PageIntro id="kochen" />
      {/* Julia: was schon in der Speisekammer steht, erkennt Mashi selbst – gefragt wird nur nach den offenen Teilen; bleibt eins übrig, wird das gekocht */}
      {pre && (
        <PartsAskSheet parts={open} done={done} initial={pre.parts} onDone={startParts}
          today={fresh ? { title: todayTitle, portions: plannedN } : undefined} prep={prep ? { title: c.title, portionsFor: prepFor } : undefined}
          along={along.map((m) => ({ id: m.id, label: slotLabel(m), portions: servingsOf(m, hh) }))} freshUntil={offer ? DAY_SHORT[offer.until] : ''}
          hint={pre.fromLast ? 'Wie letztes Mal' : prep && pre.parts.length < open.length ? '„Frisch“ kochst du am Abend' : undefined} />
      )}
      {/* Julia: welche Teile heute – fertige (Vorgekocht) stehen mit Haken da; am Kochtag auch das Essen von heute */}
      {(parts.length > 0 || fresh || along.length > 0) && (
        <div className="cook__parts" role="group" aria-label="Was kochst du heute?">
          <span className="small muted">Heute:</span>
          {parts.map((p) => {
            const isDone = done.includes(p);
            const on = today.includes(p);
            return (
              <button key={p} type="button" className={`chip chip--sm${on ? ' is-on' : ''}`} aria-pressed={on} disabled={isDone} onClick={() => togglePart(p)}>
                {isDone ? <><Icon name="check" size={13} /> {partLabel(p)} fertig</> : partLabel(p)}
              </button>
            );
          })}
          {fresh && (
            <button type="button" className={`chip chip--sm${freshN ? ' is-on' : ''}`} aria-pressed={!!freshN} onClick={toggleToday}>
              {todayTitle}{freshN ? ` · ${freshN}` : ''}
            </button>
          )}
          {along.length > 0 && (!prep || !!freshN) && (
            <button type="button" className={`chip chip--sm${alongN ? ' is-on' : ''}`} aria-pressed={alongN > 0} onClick={toggleAlong}>
              {alongText}
            </button>
          )}
        </div>
      )}
      {/* mit den Mengen von gerade (3 statt 1 Paprika) – wie Plan-Karte und Reste */}
      <DishNutrition content={asCooked(c, servings ?? c.servings, amounts)} own={own} className="cook__nutri" />

      {(wide || showIngredients) && (
        <div className="cook__ingredients">
          <ul>
            {ingredients.map((i, n) => {
              const original = base.find((b) => b.id === i.id)!;
              const changed = i.id in amounts;
              // Kochtag: wofür welche Menge – die Grundlage für alle Portionen, das Frische nur für heute
              const head = fresh && freshN && i.id.startsWith(TODAY) && !ingredients[n - 1]?.id.startsWith(TODAY)
                ? `Heute frisch dazu · ${freshN + alongN} ${freshN + alongN === 1 ? 'Portion' : 'Portionen'}${alongN ? ` (${alongN} für ${alongOn.map(slotLabel).join(', ')})` : ''}` : undefined;
              return (
                <Fragment key={i.id}>
                {n === 0 && fresh && freshN && !i.id.startsWith(TODAY) && <li className="cook__ing-head small muted">Vorkochen · {servings} Portionen</li>}
                {n === 0 && !prep && alongN > 0 && <li className="cook__ing-head small muted">{servings} Portionen · {alongN} davon für {alongOn.map(slotLabel).join(', ')}</li>}
                {head && <li className="cook__ing-head small muted">{head}</li>}
                <li className={changed ? 'is-changed' : undefined}>
                  {editing === i.id ? (
                    <AmountEdit ing={i} changed={changed} onSave={(v) => setAmount(i, v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <button type="button" className="cook__ing" onClick={() => setEditing(i.id)} disabled={i.amount === undefined}
                      aria-label={`${formatQuantity(i)} ${i.name} – Menge nur für dieses Mal ändern`}>
                      <strong>{formatQuantity(i)}</strong> {i.name}{i.note && <span className="muted">, {i.note}</span>}
                      {changed && <span className="small muted"> · im Rezept {formatQuantity(original)}</span>}
                    </button>
                  )}
                </li>
                </Fragment>
              );
            })}
          </ul>
          <p className="small muted">Menge antippen, um sie nur für dieses Mal zu ändern.</p>
        </div>
      )}

      {chosenLeftovers.length > 0 && (
        <div className="cook__chosen" role="status">
          <span className="small">{amountsText(Object.fromEntries(chosenLeftovers.map((l) => [l.ingredientId, amounts[l.ingredientId]])), base)}</span>
          <button className="chip chip--sm" onClick={() => setPickLeftovers('chosen')}><Icon name="pencil" size={13} /> Anpassen</button>
        </div>
      )}

      {openLeftovers.length > 0 && (
        <div className="cook__leftovers" role="status">
          <p><Icon name="sparkles" size={16} /> <strong>{openLeftovers.every((l) => l.until) ? 'Läuft bald ab – mehr verwenden?' : 'Reste mitverbrauchen?'}</strong> Nur für dieses Mal – das Rezept bleibt.</p>
          <p className="small">
            {openLeftovers.map((l) => `${l.name}: ${stockText(l.have, l)} da${l.until ? `, ${untilLabel(l.until)}` : ''}`).join(' · ')}
          </p>
          <div className="cook__leftover-list">
            <button className="btn btn--soft btn--sm" onClick={() => setPickLeftovers('open')}>Menge wählen</button>
          </div>
          <button className="link link--muted" onClick={() => setNoLeftovers(true)}>Nein danke</button>
        </div>
      )}
      {pickLeftovers === 'open' && (
        <UseMoreSheet uses={openLeftovers} onClose={() => setPickLeftovers(null)} onDone={(more) => {
          setPickLeftovers(null);
          if (!Object.keys(more).length) return setNoLeftovers(true);
          setAmounts({ ...amounts, ...more });
          toast('Nur für dieses Mal geändert');
        }} />
      )}
      {pickLeftovers === 'chosen' && (
        // mit allen gewählten Mengen – das Blatt behält die übrigen (von Hand geänderten) bei
        <UseMoreSheet uses={chosenLeftovers} initial={amounts} onClose={() => setPickLeftovers(null)} onDone={(next) => {
          setPickLeftovers(null);
          setAmounts(next);
          toast(linked ? 'Geändert – auch im Wochenplan' : 'Nur für dieses Mal geändert');
        }} />
      )}

      {openPacks.length > 0 && (
        <div className="cook__leftovers" role="status">
          <p><Icon name="archive" size={16} /> <strong>Ganze Packung verwenden?</strong> Nur für dieses Mal – das Rezept bleibt.</p>
          <div className="cook__leftover-list">
            {openPacks.map((p) => (
              <button key={p.ingredientId} className="btn btn--soft btn--sm" onClick={() => {
                setAmounts({ ...amounts, [p.ingredientId]: p.amount });
                toast(`${formatUnitAmount(p.amount, p.unit)} ${p.name} – nur dieses Mal`);
              }}>
                {formatUnitAmount(p.amount, p.unit)} {p.name} statt {formatAmount(p.planned, p.unit)}
              </button>
            ))}
          </div>
          <p className="small muted">
            {openPacks.map((p) => `Packung à ${packLabel(p.pack)}${p.wouldOpen > 0 ? ` – sonst bleiben ${packLabel({ amount: p.wouldOpen, unit: p.pack.unit })} offen` : ''}`).join(' · ')}
          </p>
          <button className="link link--muted" onClick={() => setNoPacks(true)}>Nein danke</button>
        </div>
      )}

      <section className="cook__step" aria-live="polite">
        <p className="cook__title">{freshStep ? `Heute: ${todayTitle}` : c.title}</p>
        {/* je Schritt nur seine Seite – sonst stünden bei „Zwiebeln anbraten“ auch die Zwiebeln von heute */}
        <StepIngredients step={s} ingredients={ingredients.filter((i) => i.id.startsWith(TODAY) === freshStep)} large />
        <p className="cook__text">{s.text}</p>

        {s.timerMinutes && !here && (
          <button className="btn btn--soft btn--lg" onClick={() => start(s.timerMinutes!, `Schritt ${step + 1}`, step)}>
            <Icon name="timer" /> Timer {s.timerMinutes} Min. starten
          </button>
        )}
        {here && (
          <div className={`cook__timer${isDone(here, now) ? ' is-done' : ''}`}>
            <span className="cook__time">{isDone(here, now) ? 'Fertig!' : clock(remainingOf(here, now))}</span>
            <div className="row-gap">
              {!isDone(here, now) && (here.endsAt
                ? <button className="btn btn--soft" onClick={() => pause(here.id)}><Icon name="pause" /> Pause</button>
                : <button className="btn btn--soft" onClick={() => resume(here.id)}><Icon name="play" filled /> Weiter</button>)}
              <button className="btn btn--ghost" onClick={() => drop(here.id)}>{isDone(here, now) ? 'OK' : 'Abbrechen'}</button>
            </div>
          </div>
        )}
        {addingTimer
          ? <AddTimer onStart={(m, label) => start(m, label)} onClose={() => setAddingTimer(false)} />
          : <button className="link cook__addlink" onClick={() => setAddingTimer(true)}><Icon name="plus" size={16} /> Eigener Timer</button>}
      </section>

      {others.length > 0 && (
        <ul className="cook__timers" aria-label="Laufende Timer">
          {others.map((t) => {
            const done = isDone(t, now);
            const label = <><Icon name="timer" size={16} /> {t.label}</>;
            return (
              <li key={t.id} className={`cook__trow${done ? ' is-done' : ''}`}>
                {t.step !== undefined
                  ? <button className="cook__tlabel" onClick={() => setStep(t.step!)} aria-label={`${t.label} – zum Schritt`}>{label}</button>
                  : <span className="cook__tlabel">{label}</span>}
                <span className="cook__tclock">{done ? 'fertig!' : clock(remainingOf(t, now))}</span>
                {!done && (t.endsAt
                  ? <button className="iconbtn iconbtn--sm" onClick={() => pause(t.id)} aria-label={`${t.label} pausieren`}><Icon name="pause" size={16} /></button>
                  : <button className="iconbtn iconbtn--sm" onClick={() => resume(t.id)} aria-label={`${t.label} weiterlaufen lassen`}><Icon name="play" size={16} filled /></button>)}
                <button className="iconbtn iconbtn--sm" onClick={() => drop(t.id)} aria-label={done ? `${t.label}: OK` : `${t.label} abbrechen`}>
                  <Icon name={done ? 'check' : 'close'} size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="cook__nav">
        <button className="btn btn--soft btn--xl" onClick={() => setStep(step - 1)} disabled={step === 0}>Zurück</button>
        {last
          ? <button className="btn btn--primary btn--xl" onClick={finish}><Icon name="check" /> Fertig</button>
          : <button className="btn btn--primary btn--xl" onClick={() => setStep(step + 1)}>Weiter</button>}
      </footer>
    </main>
  );
}

/** Menge „nur dieses Mal“ eintippen – 0,5 und 0.5 gehen beide; leer = zurück zur Rezeptmenge. */
function AmountEdit({ ing, changed, onSave, onCancel }: { ing: Ingredient; changed: boolean; onSave: (amount: number | undefined) => void; onCancel: () => void }) {
  const [text, setText] = useState(String(Math.round((ing.amount ?? 0) * 100) / 100).replace('.', ','));
  const submit = () => {
    const n = Number(text.replace(',', '.').trim());
    onSave(text.trim() && Number.isFinite(n) && n > 0 ? n : undefined);
  };
  return (
    <form className="cook__edit" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={`Menge ${ing.name}`}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <span>{ing.unit ?? ''} {ing.name}</span>
      <button className="btn btn--primary btn--sm">OK</button>
      {changed && <button type="button" className="link link--muted" onClick={() => onSave(undefined)}>Wie im Rezept</button>}
    </form>
  );
}

/** „Fr mittags“ – für das Mitkochen */
const slotLabel = (m: Pick<WeekMeal, 'day' | 'lunch'>) => `${DAY_SHORT[m.day]} ${m.lunch ? 'mittags' : 'abends'}`;

const QUICK_MINUTES = [5, 10, 15, 20, 30];

/** Eigener Timer: Schnellwahl für nasse Hände, sonst eigene Zeit; der Name ist freiwillig („Ofen“) */
function AddTimer({ onStart, onClose }: { onStart: (minutes: number, label: string) => void; onClose: () => void }) {
  const [minutes, setMinutes] = useState('');
  const [name, setName] = useState('');
  const typed = Number(minutes.replace(',', '.'));
  const go = (m: number) => {
    onStart(m, name.trim() || `${m.toLocaleString('de-DE')}-Min.-Timer`);
    onClose();
  };
  return (
    <div className="cook__addtimer">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wofür? (optional, z. B. Ofen)" aria-label="Name des Timers" />
      <div className="cook__quick">
        {QUICK_MINUTES.map((m) => <button key={m} type="button" className="chip" onClick={() => go(m)}>{m} Min.</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (typed > 0) go(typed); }}>
        <input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minuten" aria-label="Eigene Zeit in Minuten" />
        <button className="btn btn--primary btn--sm" disabled={!(typed > 0)}>Starten</button>
        <button type="button" className="link link--muted" onClick={onClose}>Abbrechen</button>
      </form>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Bildschirm bleibt beim Kochen an – falls der Browser es kann. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let left = false;
    const request = () => navigator.wakeLock?.request('screen').then((l) => {
      if (left) void l.release(); // Kochmodus schon verlassen
      else lock = l;
    }).catch(() => {});
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      left = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}

/**
 * „Was kochst du heute?“ (Julia: mehrere Teile wählbar, nicht nur „Nur Sauce kochen“): jedes offene Teil zum
 * An- und Abhaken, der Knopf sagt, was passiert („Sauce + Dressing kochen“). Vorgekochtes erkennt Mashi in der
 * Speisekammer (kein „schon gekocht“-Haken). Wegwischen ohne Wahl = die Vorauswahl.
 * Am Kochtag steht das Essen von heute mit dabei (Julia: „wie im Wochenplan eingestellt bzw. einfach nachfragen“):
 * angehakt mit den Portionen aus dem Plan, hier noch änderbar – und darüber, wie viel dafür vorgekocht wird.
 */
function PartsAskSheet({ parts, done, initial, hint, today, prep, along, freshUntil, onDone }: {
  parts: string[]; done: string[]; initial: string[]; hint?: string;
  /** das Essen von heute aus dieser Grundlage – Portionen wie im Wochenplan */
  today?: { title: string; portions: number };
  /** Vorkochen: so viele Portionen, wenn heute so viele mitessen (null = heute nicht) */
  prep?: { title: string; portionsFor: (eat: number | null) => number | undefined };
  /** dasselbe Gericht, solange es frisch bleibt (Julia: frisch gleich mitkochen) – je Essen abwählbar */
  along: { id: string; label: string; portions: number }[];
  /** letzter Tag, an dem das Mitgekochte noch frisch ist („Sa“) */
  freshUntil: string;
  onDone: (heute: string[], confirmed: boolean, eat: number | null, skip: string[]) => void;
}) {
  const ref = useSheet(() => onDone(initial, false, today?.portions ?? null, []));
  const [picked, setPicked] = useState(initial);
  const [eat, setEat] = useState<number | null>(today?.portions ?? null);
  const [skip, setSkip] = useState<string[]>([]);
  // Reihenfolge wie im Rezept, egal in welcher Reihenfolge getippt wird
  const toggle = (p: string) => setPicked((now) => (now.includes(p) ? now.filter((x) => x !== p) : parts.filter((x) => x === p || now.includes(x))));
  // nur ein Teil (oder keiner): nichts zu wählen, gefragt wird nur nach heute
  const many = parts.length > 1;
  const label = today || !many ? 'Kochmodus starten' : picked.length === parts.length ? 'Alles kochen' : picked.length ? `${picked.map(partLabel).join(' + ')} kochen` : 'Wähle, was du kochst';
  const prepN = prep?.portionsFor(eat);
  return (
    <div className="sheet-backdrop" onClick={() => onDone(initial, false, today?.portions ?? null, [])}>
      <div className="sheet parts-ask" role="dialog" aria-modal="true" aria-label="Was kochst du heute?" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Was kochst du heute?</h2>
        {prep && prepN !== undefined && today && (
          <p className="small muted">{prep.title} vorkochen: {prepN} {prepN === 1 ? 'Portion' : 'Portionen'}{eat ? `, ${eat} davon heute` : ''}</p>
        )}
        {done.length > 0 && <p className="small muted">Schon gekocht und in der Speisekammer: {done.map(partLabel).join(' · ')}</p>}
        {hint && many && <p className="small muted parts-ask__hint"><Icon name="refresh" size={14} /> {hint}</p>}
        {many && (
          <div className="parts-ask__list" role="group" aria-label="Teile">
            {parts.map((p) => {
              const on = picked.includes(p);
              return (
                <button key={p} type="button" role="checkbox" aria-checked={on} className={`parts-ask__item${on ? ' is-on' : ''}`} onClick={() => toggle(p)}>
                  <span className="parts-ask__box" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
                  <strong>{partLabel(p)}</strong>
                  {!on && <small>später</small>}
                </button>
              );
            })}
          </div>
        )}
        {today && (
          <div className="parts-ask__list" role="group" aria-label="Heute Abend">
            <button type="button" role="checkbox" aria-checked={eat !== null} className={`parts-ask__item${eat !== null ? ' is-on' : ''}`} onClick={() => setEat(eat === null ? today.portions : null)}>
              <span className="parts-ask__box" aria-hidden="true">{eat !== null && <Icon name="check" size={16} />}</span>
              <strong>Heute Abend: {today.title}</strong>
              {eat === null && <small>später</small>}
            </button>
            {eat !== null && (
              <div className="row-between parts-ask__today">
                <span className="small">Frisch für so viele Portionen</span>
                <Stepper small value={eat} onChange={setEat} label="Portionen für heute" />
              </div>
            )}
          </div>
        )}
        {/* dasselbe gibt es bald wieder – nur, wenn heute überhaupt frisch gekocht wird */}
        {along.length > 0 && (!today || eat !== null) && (
          <div className="parts-ask__list" role="group" aria-label="Gleich mitkochen">
            <p className="small muted parts-ask__sub">Gleich mitkochen – frisch bis {freshUntil}</p>
            {along.map((a) => {
              const on = !skip.includes(a.id);
              return (
                <button key={a.id} type="button" role="checkbox" aria-checked={on} className={`parts-ask__item${on ? ' is-on' : ''}`}
                  onClick={() => setSkip(on ? [...skip, a.id] : skip.filter((x) => x !== a.id))}>
                  <span className="parts-ask__box" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
                  <strong>{a.label}</strong>
                  <small>+{a.portions} {a.portions === 1 ? 'Portion' : 'Portionen'}</small>
                </button>
              );
            })}
          </div>
        )}
        <button type="button" className="btn btn--primary btn--block btn--lg parts-ask__go" disabled={many && !picked.length} onClick={() => onDone(picked, true, eat, skip)}>
          {label}
        </button>
      </div>
    </div>
  );
}

/**
 * EIN Ton-Kontext für den Kochmodus (Code-Review #23): iOS/Safari spielt nur Ton aus einem Kontext, der bei einem
 * Tipp angelegt bzw. fortgesetzt wurde – ein neuer Kontext je Alarm (aus dem Timer heraus) blieb dort stumm, und
 * jeder blieb offen. Vibration gibt es auf dem iPhone nicht; bei Stummschalter ist auch der Ton aus.
 */
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* kein Audio verfügbar */
  }
}
function closeAudio() {
  void audio?.close().catch(() => undefined);
  audio = null;
}

/** Kurzer Ton + Vibration, ohne Audiodatei. */
function ring() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  try {
    unlockAudio(); // ohne vorherigen Tipp (z. B. Desktop) trotzdem versuchen
    const ctx = audio;
    if (!ctx) return;
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* kein Audio verfügbar */
  }
}
