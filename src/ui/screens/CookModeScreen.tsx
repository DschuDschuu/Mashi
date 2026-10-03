import { useEffect, useMemo, useRef, useState } from 'react';
import { ask } from '../confirm';
import { leftoverSuggestions, pantryAfterPlan } from '../../domain/pantry';
import { packSuggestions } from '../../domain/packs';
import { packLabel } from '../../domain/pantryLabel';
import { currentContent } from '../../domain/recipe';
import { formatAmount, formatQuantity, formatUnitAmount, scaleIngredients } from '../../domain/scaling';
import { orderByUse } from '../../domain/stepIngredients';
import type { Ingredient } from '../../domain/types';
import { markCooked, setPlanAmounts, useFoodTable, usePantry, usePlan, useRecipe, useRecipes } from '../../data/store';
import { goBack, navigate } from '../../router';
import { Icon } from '../components/Icon';
import { StepIngredients } from '../components/StepIngredients';
import { cookedToast } from '../cookedToast';
import { toast } from '../toast';
import { useMediaQuery } from '../useMediaQuery';
import { DishNutrition } from '../components/DishNutrition';
import { pickFor } from '../../domain/nutrition/variants';
import { choicesFor } from '../useNutrition';
import { amountsText, stockText, untilLabel, UseMoreSheet } from '../components/UseMoreSheet';
import { newId } from '../../domain/recipe';
import { byUrgency, isDone, isRunning, newlyDone, pauseTimer, remainingOf, removeTimer, resumeTimer, startTimer, type CookTimer } from '../../domain/timers';

export function CookModeScreen({ id, servings, variants }: { id: string; servings?: number; variants?: Record<string, string> }) {
  const recipe = useRecipe(id);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  /** mehrere gleichzeitig: je Schritt mit Zeitangabe einer, dazu eigene („Ofen“) */
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [addingTimer, setAddingTimer] = useState(false);
  const [, tick] = useState(0);
  useWakeLock();
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

  const base = useMemo(() => {
    if (!recipe) return [];
    const c = currentContent(recipe);
    // Reihenfolge wie beim Kochen: was im ersten Schritt gebraucht wird, zuerst
    return orderByUse(scaleIngredients(c, servings ?? c.servings), c.steps);
  }, [recipe, servings]);
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
    if (ready && linked && recipe) setPlanAmounts(recipe.id, amounts); // gleich wie im Plan: tut nichts
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

  if (!recipe) return null;
  const c = currentContent(recipe);
  // Sorte: im Rezept gewählt – sonst die vom Plan – sonst Vorschlag (eine im Vorrat = diese)
  const own = variants ?? plan.items.find((i) => i.recipeId === recipe.id)?.variants;
  const s = c.steps[step];
  const last = step === c.steps.length - 1;
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

  const start = (minutes: number, label: string, forStep?: number) =>
    setTimers((l) => startTimer(l, { id: newId('t'), label, minutes, step: forStep }, Date.now()));
  const pause = (tid: string) => setTimers((l) => pauseTimer(l, tid, Date.now()));
  const resume = (tid: string) => setTimers((l) => resumeTimer(l, tid, Date.now()));
  const drop = (tid: string) => setTimers((l) => removeTimer(l, tid));

  const finish = () => {
    cookedToast(markCooked(recipe.id, servings ?? c.servings, amounts, pickFor(choicesFor(c), own)));
    if (recipe.status === 'zum_testen' || recipe.status === 'bewaehrt') navigate(`/rezept/${recipe.id}/test`, { replace: true });
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
          <span>Schritt {step + 1} von {c.steps.length}</span>
          <div className="bar"><div style={{ width: `${((step + 1) / c.steps.length) * 100}%` }} /></div>
        </div>
        {wide ? <span className="iconbtn-spacer" /> : (
          <button className={`iconbtn${showIngredients ? ' is-on' : ''}`} onClick={() => setShowIngredients(!showIngredients)} aria-label="Zutaten anzeigen" aria-expanded={showIngredients}>
            <Icon name="list" />
          </button>
        )}
      </header>
      <DishNutrition content={c} own={own} className="cook__nutri" />

      {(wide || showIngredients) && (
        <div className="cook__ingredients">
          <ul>
            {ingredients.map((i) => {
              const original = base.find((b) => b.id === i.id)!;
              const changed = i.id in amounts;
              return (
                <li key={i.id} className={changed ? 'is-changed' : undefined}>
                  {editing === i.id ? (
                    <AmountEdit ing={i} changed={changed} onSave={(v) => setAmount(i, v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <button type="button" className="cook__ing" onClick={() => setEditing(i.id)} disabled={i.amount === undefined}
                      aria-label={`${formatQuantity(i)} ${i.name} – Menge nur für dieses Mal ändern`}>
                      <strong>{formatQuantity(i)}</strong> {i.name}
                      {changed && <span className="small muted"> · im Rezept {formatQuantity(original)}</span>}
                    </button>
                  )}
                </li>
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
        <p className="cook__title">{c.title}</p>
        <StepIngredients step={s} ingredients={ingredients} large />
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

/** Kurzer Ton + Vibration, ohne Audiodatei. */
function ring() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  try {
    const ctx = new AudioContext();
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
