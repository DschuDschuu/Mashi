import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MULTI, STAGES, chooseDirection, choiceOf, closeStep, cravingSteps, cravingText, cravingTitle, currentStep, directionOf,
  directionsFor, optionsFor, pick, recipeChoices, reopen, understand, type Choice, type CravingState,
} from '../../domain/craving';
import { SIDE_KINDS, type SideKind } from '../../domain/sides';
import { householdOf, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { CravingAsk } from '../components/CravingAsk';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { formatMinutes, portionCount } from '../format';

type Step = 'direction' | SideKind;
const STEPS: readonly Step[] = ['direction', ...STAGES];
/** „3 Min.“ ohne Umbruch dazwischen – sonst steht „Min.“ allein in der nächsten Zeile */
const mins = (m: number) => formatMinutes(m).replace(/ /g, ' ');
const labelOf = (k: Step) => (k === 'direction' ? 'Richtung' : SIDE_KINDS.find((x) => x.kind === k)?.label ?? k);

/** Deine Rezepte (und Teile) als Bausteine, mit dem, was davon vorgekocht im Kühlschrank steht */
function useOwnChoices(): Choice[] {
  const recipes = useRecipes();
  const pantry = usePantry();
  return useMemo(() => recipeChoices(recipes, pantry), [recipes, pantry]);
}

/**
 * „Worauf hast du Lust?“ als Stepper (Julia: „wie ein Flussdiagramm, das sich öffnet“): oben das Erledigte mit
 * „Ändern“, dann die Stufe, die dran ist, darunter blass, was noch kommt. Mit allem anfangen: das Getippte (`q`) füllt
 * vor, was Mashi daran erkennt. Noch ohne Speichern – das Gericht lebt nur auf dieser Seite.
 */
export function CravingScreen({ q }: { q: string }) {
  const own = useOwnChoices();
  const [state, setState] = useState<CravingState | undefined>(() => (q ? understand(q, own) : undefined));
  const step = state ? currentStep(state) : undefined;
  const now = useRef<HTMLLIElement>(null);

  // die neue Stufe ins Bild holen – auf dem Handy rutscht sie sonst unter den Rand
  useEffect(() => { now.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [step]);

  if (!state) {
    return (
      <main className="screen">
        <TopBar title="Worauf hast du Lust?" backTo="/" />
        {q && <p className="muted">Zu „{q}“ fällt mir noch nichts ein – fang mit einer Richtung an.</p>}
        <CravingAsk replace />
      </main>
    );
  }

  const dir = directionOf(state.direction);
  const names = (k: SideKind) => (state.picks[k] ?? []).map((id) => choiceOf(id, own)?.name ?? id);
  return (
    <main className="screen">
      <TopBar title={dir?.name ?? 'Worauf hast du Lust?'} backTo="/"
        right={<button type="button" className="link small" onClick={() => navigate('/lust', { replace: true })}>Neu anfangen</button>} />
      <ol className="lust-steps">
        {STEPS.map((k, i) => {
          const isNow = k === step;
          const done = !isNow && (k === 'direction' ? !!state.direction : state.closed.includes(k));
          return (
            <li key={k} ref={isNow ? now : undefined} className={`lust-steps__step${isNow ? ' is-now' : done ? ' is-done' : ''}`}>
              <span className="lust-steps__dot" aria-hidden="true">{done ? <Icon name="check" size={14} /> : i + 1}</span>
              <div className="lust-steps__body">
                <h2 className="lust-steps__label">
                  {labelOf(k)}{isNow && k !== 'direction' && dir ? <span className="lust-steps__hint"> – passt zu {dir.name}</span> : null}
                </h2>
                {done && (
                  <Done names={k === 'direction' ? [dir?.name ?? ''] : names(k)}
                    onChange={() => setState(k === 'direction' ? { ...state, direction: undefined } : reopen(state, k))} />
                )}
                {isNow && <Now state={state} step={k} own={own} set={setState} />}
                {/* schon Getipptes („was mit Brokkoli“) steht vorgemerkt da, bis die Stufe dran ist */}
                {!isNow && !done && k !== 'direction' && !!state.picks[k]?.length && (
                  <span className="small muted lust-steps__later">{names(k).join(', ')} vorgemerkt</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!step && <Finished state={state} own={own} />}
    </main>
  );
}

/** Erledigte Stufe: was gewählt ist (oder „ohne“) und „Ändern“ */
function Done({ names, onChange }: { names: string[]; onChange: () => void }) {
  return (
    <div className="lust-steps__done">
      <span className={names.length ? 'lust-steps__value' : 'muted'}>{names.length ? names.join(', ') : 'ohne'}</span>
      <button type="button" className="link small" onClick={onChange}>Ändern</button>
    </div>
  );
}

/** Unterzeile einer Wahl: vorgekocht, aus welchem Rezept, wie man es macht */
function ChoiceInfo({ c }: { c: Choice }) {
  if (c.ready) return <small className="lust-steps__ready"><Icon name="fridge" size={13} /> im Kühlschrank · {portionCount(c.ready)}</small>;
  const time = c.prep?.minutes ? ` · ${mins(c.prep.minutes)}` : '';
  if (c.recipeId) return <small className="lust-steps__own"><Icon name="book" size={13} /> {c.from ? `aus „${c.from}“` : 'dein Rezept'}{time}</small>;
  return c.prep ? <small className="muted">{c.prep.text}{time}</small> : null;
}

/** Die Stufe, die dran ist: Richtungen, eine Liste zum Antippen (eins) oder Chips (mehrere, dann „Weiter“) */
function Now({ state, step, own, set }: { state: CravingState; step: Step; own: Choice[]; set: (s: CravingState) => void }) {
  const hh = householdOf(usePlan());
  if (step === 'direction') {
    return (
      <div className="chips">
        {directionsFor(state, own).map((d) => <button key={d.id} type="button" className="chip" onClick={() => set(chooseDirection(state, d.id))}>{d.name}</button>)}
      </div>
    );
  }
  const chosen = state.picks[step] ?? [];
  const options = optionsFor(state, step, own, hh);
  const label = labelOf(step);
  if (MULTI.has(step)) {
    return (
      <>
        <div className="chips" role="group" aria-label={label}>
          {options.map((c) => (
            <button key={c.id} type="button" className={`chip${chosen.includes(c.id) ? ' is-on' : ''}`} aria-pressed={chosen.includes(c.id)}
              onClick={() => set(pick(state, step, c.id))}>
              {c.ready ? <Icon name="fridge" size={14} /> : c.recipeId ? <Icon name="book" size={14} /> : null}{c.name}
            </button>
          ))}
        </div>
        <button type="button" className={`btn btn--sm ${chosen.length ? 'btn--primary' : 'btn--ghost'} lust-steps__next`} onClick={() => set(closeStep(state, step))}>
          {chosen.length ? <>Weiter <Icon name="chevron" size={14} /></> : `Ohne ${label} weiter`}
        </button>
      </>
    );
  }
  return (
    <>
      <div className="lust-steps__options">
        {options.map((c) => (
          <button key={c.id} type="button" className={`lust-steps__option${chosen.includes(c.id) ? ' is-on' : ''}${c.recipeId ? ' is-own' : ''}`} onClick={() => set(pick(state, step, c.id))}>
            <strong>{c.name}</strong>
            <ChoiceInfo c={c} />
          </button>
        ))}
      </div>
      {/* „Ohne“ nimmt auch eine frühere Wahl weg – nach „Ändern“ heißt das: doch keins */}
      <button type="button" className="btn btn--ghost btn--sm lust-steps__next" onClick={() => set(closeStep({ ...state, picks: { ...state.picks, [step]: undefined } }, step))}>
        Ohne {label} weiter
      </button>
    </>
  );
}

/** Alles gewählt: Name, Bausteine und „So geht's“ – das Längste zuerst, damit alles gleichzeitig fertig ist */
function Finished({ state, own }: { state: CravingState; own: Choice[] }) {
  const hh = householdOf(usePlan());
  const steps = cravingSteps(state, own, hh);
  const text = cravingText(state, own);
  const longest = Math.max(0, ...steps.map((s) => s.minutes));
  return (
    <section className="card craving-done" aria-labelledby="craving-title">
      <h2 id="craving-title" className="craving-done__title">{cravingTitle(state, own)}</h2>
      {text ? <p className="muted">{text}</p> : <p className="muted">Noch nichts gewählt – tipp oben auf „Ändern“.</p>}
      {steps.length > 0 && (
        <>
          <h3 className="small muted craving-done__how">So geht's{longest ? ` · in etwa ${mins(longest)} fertig` : ''}</h3>
          <ol className="craving-done__steps">
            {steps.map((s) => <li key={s.id}><strong>{s.name}</strong>{s.text ? ` ${s.text}` : ''}{s.minutes ? ` · ${mins(s.minutes)}` : ''}</li>)}
          </ol>
        </>
      )}
    </section>
  );
}
