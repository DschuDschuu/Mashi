import { useEffect, useRef, useState } from 'react';
import { currentContent } from '../../domain/recipe';
import { formatQuantity, scaleIngredients } from '../../domain/scaling';
import { markCooked, useRecipe } from '../../data/store';
import { goBack, navigate } from '../../router';
import { Icon } from '../components/Icon';
import { StepIngredients } from '../components/StepIngredients';
import { useMediaQuery } from '../useMediaQuery';

interface TimerState {
  step: number;
  totalMs: number;
  /** Solange er läuft: Endzeitpunkt. Pausiert: Restzeit. So bleibt er genau, auch wenn der Tab kurz schläft. */
  endsAt?: number;
  remainingMs: number;
}

export function CookModeScreen({ id, servings }: { id: string; servings?: number }) {
  const recipe = useRecipe(id);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [, tick] = useState(0);
  useWakeLock();
  // Tablet quer: Zutaten dauerhaft als Spalte neben dem Schritt
  const wide = useMediaQuery('(min-width: 900px)');

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
  const s = c.steps[step];
  const last = step === c.steps.length - 1;
  const ingredients = scaleIngredients(c, servings ?? c.servings);

  const startTimer = (minutes: number) => setTimer({ step, totalMs: minutes * 60_000, remainingMs: minutes * 60_000, endsAt: Date.now() + minutes * 60_000 });
  const pause = () => timer && setTimer({ ...timer, endsAt: undefined, remainingMs: remaining });
  const resume = () => timer && setTimer({ ...timer, endsAt: Date.now() + timer.remainingMs });

  const finish = () => {
    markCooked(recipe.id);
    if (recipe.status === 'zum_testen' || recipe.status === 'bewaehrt') navigate(`/rezept/${recipe.id}/test`, { replace: true });
    else goBack(`/rezept/${recipe.id}`);
  };

  const timerHere = timer && timer.step === step;

  return (
    <main className={`cook${wide ? ' cook--wide' : ''}`}>
      <header className="cook__head">
        <button className="iconbtn" onClick={() => goBack(`/rezept/${recipe.id}`)} aria-label="Kochmodus beenden"><Icon name="close" /></button>
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

      {(wide || showIngredients) && (
        <ul className="cook__ingredients">
          {ingredients.map((i) => <li key={i.id}><strong>{formatQuantity(i)}</strong> {i.name}</li>)}
        </ul>
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

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Bildschirm bleibt beim Kochen an – falls der Browser es kann. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const request = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
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
