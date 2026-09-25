import { useEffect, useMemo, useRef, useState } from 'react';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { leftoverSuggestions, pantryAfterPlan } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { formatAmount, formatQuantity, formatUnitAmount, scaleIngredients } from '../../domain/scaling';
import type { Ingredient } from '../../domain/types';
import { markCooked, usePantry, usePlan, useProducts, useRecipe, useRecipes } from '../../data/store';
import { foodTable } from '../../services';
import { goBack, navigate } from '../../router';
import { Icon } from '../components/Icon';
import { StepIngredients } from '../components/StepIngredients';
import { cookedToast } from '../cookedToast';
import { toast } from '../toast';
import { useMediaQuery } from '../useMediaQuery';
import { DishNutrition } from '../components/DishNutrition';
import { pickFor } from '../../domain/nutrition/variants';
import { choicesFor } from '../useNutrition';

interface TimerState {
  step: number;
  totalMs: number;
  /** Solange er läuft: Endzeitpunkt. Pausiert: Restzeit. So bleibt er genau, auch wenn der Tab kurz schläft. */
  endsAt?: number;
  remainingMs: number;
}

export function CookModeScreen({ id, servings, variants }: { id: string; servings?: number; variants?: Record<string, string> }) {
  const recipe = useRecipe(id);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [, tick] = useState(0);
  useWakeLock();
  // Tablet quer: Zutaten dauerhaft als Spalte neben dem Schritt
  const wide = useMediaQuery('(min-width: 900px)');
  /** Mengen „nur dieses Mal“ je Zutat-ID – das Rezept bleibt, wie es ist */
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [noLeftovers, setNoLeftovers] = useState(false);
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();

  const base = useMemo(() => {
    if (!recipe) return [];
    const c = currentContent(recipe);
    return scaleIngredients(c, servings ?? c.servings);
  }, [recipe, servings]);
  // Reste mitverbrauchen – aber nicht, was andere geplante Gerichte noch brauchen
  const leftovers = useMemo(() => {
    if (!recipe) return [];
    const table = withMyProducts(foodTable, products);
    const others = { ...plan, items: plan.items.filter((i) => i.recipeId !== recipe.id) };
    return leftoverSuggestions(pantryAfterPlan(pantry, others, recipes, table), base, table);
  }, [recipe, base, pantry, plan, recipes, products]);

  // Läuft ein Timer, 4× pro Sekunde neu zeichnen
  useEffect(() => {
    if (!timer?.endsAt) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [timer?.endsAt]);

  const remaining = timer ? (timer.endsAt ? Math.max(0, timer.endsAt - Date.now()) : timer.remainingMs) : 0;
  const done = !!timer && remaining === 0;
  const alerted = useRef(false);
  useEffect(() => {
    if (done && !alerted.current) {
      alerted.current = true;
      ring();
    }
    if (!done) alerted.current = false;
  }, [done]);

  if (!recipe) return null;
  const c = currentContent(recipe);
  // Sorte: im Rezept gewählt – sonst die vom Plan – sonst Vorschlag (eine im Vorrat = diese)
  const own = variants ?? plan.items.find((i) => i.recipeId === recipe.id)?.variants;
  const s = c.steps[step];
  const last = step === c.steps.length - 1;
  const ingredients = base.map((i) => (i.id in amounts ? { ...i, amount: amounts[i.id] } : i));
  const openLeftovers = noLeftovers ? [] : leftovers.filter((l) => !(l.ingredientId in amounts));
  const setAmount = (ing: Ingredient, amount: number | undefined) => {
    const { [ing.id]: _old, ...rest } = amounts;
    const original = base.find((b) => b.id === ing.id)?.amount;
    // Wieder die Rezeptmenge → keine Ausnahme mehr
    setAmounts(amount === undefined || (original !== undefined && Math.abs(amount - original) < 1e-9) ? rest : { ...rest, [ing.id]: amount });
    setEditing(null);
  };

  const startTimer = (minutes: number) => setTimer({ step, totalMs: minutes * 60_000, remainingMs: minutes * 60_000, endsAt: Date.now() + minutes * 60_000 });
  const pause = () => timer && setTimer({ ...timer, endsAt: undefined, remainingMs: remaining });
  const resume = () => timer && setTimer({ ...timer, endsAt: Date.now() + timer.remainingMs });

  const finish = () => {
    cookedToast(markCooked(recipe.id, servings ?? c.servings, amounts, pickFor(choicesFor(c), own)));
    if (recipe.status === 'zum_testen' || recipe.status === 'bewaehrt') navigate(`/rezept/${recipe.id}/test`, { replace: true });
    else goBack(`/rezept/${recipe.id}`);
  };

  const timerHere = timer && timer.step === step;
  // Läuft ein Timer oder sind Mengen geändert, lieber nachfragen – beides wäre sonst weg
  const leave = () => {
    const running = !!timer && !done;
    const changed = Object.keys(amounts).length > 0;
    const why = running && changed ? 'Der Timer läuft noch und deine geänderten Mengen gehen verloren.'
      : running ? 'Der Timer läuft noch.' : changed ? 'Deine geänderten Mengen gehen verloren.' : '';
    if (why && !confirm(`Kochmodus beenden? ${why} Fertig gekocht? Dann lieber im letzten Schritt „Fertig“ tippen.`)) return;
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

      {openLeftovers.length > 0 && (
        <div className="cook__leftovers" role="status">
          <p><Icon name="sparkles" size={16} /> <strong>Reste mitverbrauchen?</strong> Nur für dieses Mal – das Rezept bleibt.</p>
          <div className="cook__leftover-list">
            {openLeftovers.map((l) => (
              <button key={l.ingredientId} className="btn btn--soft btn--sm" onClick={() => {
                setAmounts({ ...amounts, [l.ingredientId]: l.amount });
                toast(`${formatUnitAmount(l.amount, l.unit)} ${l.name} – nur dieses Mal`);
              }}>
                {formatUnitAmount(l.amount, l.unit)} {l.name} statt {formatAmount(l.planned, l.unit)}
              </button>
            ))}
          </div>
          <button className="link link--muted" onClick={() => setNoLeftovers(true)}>Nein danke</button>
        </div>
      )}

      <section className="cook__step" aria-live="polite">
        <p className="cook__title">{c.title}</p>
        <StepIngredients step={s} ingredients={ingredients} large />
        <p className="cook__text">{s.text}</p>

        {s.timerMinutes && !timerHere && (
          <button className="btn btn--soft btn--lg" onClick={() => startTimer(s.timerMinutes!)}>
            <Icon name="timer" /> Timer {s.timerMinutes} Min. starten
          </button>
        )}
        {timerHere && (
          <div className={`cook__timer${done ? ' is-done' : ''}`}>
            <span className="cook__time">{done ? 'Fertig!' : clock(remaining)}</span>
            <div className="row-gap">
              {!done && (timer.endsAt
                ? <button className="btn btn--soft" onClick={pause}><Icon name="pause" /> Pause</button>
                : <button className="btn btn--soft" onClick={resume}><Icon name="play" filled /> Weiter</button>)}
              <button className="btn btn--ghost" onClick={() => setTimer(null)}>{done ? 'OK' : 'Abbrechen'}</button>
            </div>
          </div>
        )}
      </section>

      {timer && !timerHere && (
        <button className="cook__pill" onClick={() => setStep(timer.step)}>
          <Icon name="timer" size={16} /> {done ? 'Timer fertig!' : clock(remaining)} · Schritt {timer.step + 1}
        </button>
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
