import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MULTI, STAGES, chooseDirection, choiceOf, closeStep, cravingContent, cravingSteps, cravingText, cravingTitle, currentStep,
  directionOf, directionsFor, matchingRecipes, optionsFor, pick, recipeChoices, reopen, understand, type Choice, type CravingState,
} from '../../domain/craving';
import { keyOfName } from '../../domain/mealplan';
import { currentContent, newId, totalMinutes } from '../../domain/recipe';
import { SIDE_KINDS, type SideKind } from '../../domain/sides';
import { servingsOf } from '../../domain/week';
import { addToPlan, createRecipe, deleteRecipe, householdOf, keepTrial, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { Stepper } from '../components/Controls';
import { CravingAsk } from '../components/CravingAsk';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { RecipeImage } from '../components/RecipeImage';
import { formatMinutes, formatMinutesShort, portionCount } from '../format';
import { toast } from '../toast';

type Step = 'direction' | SideKind;
const STEPS: readonly Step[] = ['direction', ...STAGES];
/** „3 Min.“ ohne Umbruch dazwischen – sonst steht „Min.“ allein in der nächsten Zeile */
const mins = (m: number) => formatMinutes(m).replace(/ /g, ' ');
const labelOf = (k: Step) => (k === 'direction' ? 'Richtung' : SIDE_KINDS.find((x) => x.kind === k)?.label ?? k);

/**
 * Deine Rezepte (und Teile) als Bausteine, mit dem, was davon vorgekocht im Kühlschrank steht – Portionen, die im
 * Wochenplan schon einen Abend haben, zählen nicht (die sind ja verplant)
 */
function useOwnChoices(): Choice[] {
  const recipes = useRecipes();
  const pantry = usePantry();
  const plan = usePlan();
  return useMemo(() => {
    const hh = householdOf(plan);
    const reserved = new Map<string, number>();
    for (const m of plan.week?.meals ?? []) if (!m.done) reserved.set(m.baseId, (reserved.get(m.baseId) ?? 0) + servingsOf(m, hh));
    return recipeChoices(recipes, pantry, reserved);
  }, [recipes, pantry, plan]);
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
      <Inspiration state={state} own={own} />
    </main>
  );
}

/** „Passt dazu aus deinem Kochbuch“ – fertige Rezepte zur bisherigen Auswahl (Julia: sich von Rezepten inspirieren lassen) */
function Inspiration({ state, own }: { state: CravingState; own: Choice[] }) {
  const recipes = useRecipes();
  const table = useFoodTable();
  const list = useMemo(() => matchingRecipes(state, { recipes, own, keyOf: (n) => keyOfName(n, table) }), [state, recipes, own, table]);
  if (!list.length) return null;
  return (
    <section className="craving-ideas" aria-labelledby="craving-ideas-title">
      <h2 className="small muted craving-ideas__title" id="craving-ideas-title">Passt dazu aus deinem Kochbuch</h2>
      <ul className="prep__list">
        {list.map((r) => {
          const c = currentContent(r);
          return (
            <li key={r.id}>
              <button type="button" className="prep__item" onClick={() => navigate(`/rezept/${r.id}`)}>
                <RecipeImage image={r.image} size="sm" />
                <span className="prep__text">
                  <strong>{c.title}</strong>
                  <span className="small muted">{formatMinutesShort(totalMinutes(c))}{r.favorite ? ' · Favorit' : ''}</span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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

/**
 * Alles gewählt: Name, Bausteine und „So geht's“ – das Längste zuerst, damit alles gleichzeitig fertig ist. Darunter
 * jetzt kochen, in den Wochenplan oder gleich als Rezept speichern. Kochen und Plan legen ein Probiergericht an
 * (Recipe.trial): ein echtes Rezept, aber erst nach „Wie war's?“ auf der Startseite im Kochbuch (Julia: erst testen).
 */
function Finished({ state, own }: { state: CravingState; own: Choice[] }) {
  const hh = householdOf(usePlan());
  const recipes = useRecipes();
  const [title, setTitle] = useState(() => cravingTitle(state, own));
  const [servings, setServings] = useState(Math.max(1, hh.portions));
  // dasselbe Gericht nicht zweimal anlegen (erst „In den Wochenplan“, dann doch „Jetzt kochen“) – solange nichts geändert ist
  const made = useRef<{ key: string; id: string } | null>(null);
  const steps = cravingSteps(state, own, hh);
  const text = cravingText(state, own);
  const longest = Math.max(0, ...steps.map((s) => s.minutes));

  const ensure = (trial: boolean): string => {
    const key = JSON.stringify([state.picks, title.trim(), servings]);
    const known = made.current?.key === key && recipes.find((r) => r.id === made.current!.id);
    if (known) {
      if (!trial && known.trial) keepTrial(known.id);
      return known.id;
    }
    const content = cravingContent(state, { own, recipes, household: hh, servings, title, newId: () => newId('i') });
    const id = createRecipe(content, { source: 'selbst', status: 'zum_testen', ...(trial ? { trial: true } : {}) });
    made.current = { key, id };
    return id;
  };
  const cook = () => navigate(`/rezept/${ensure(true)}/kochen?p=${servings}`);
  const toPlan = () => {
    const id = ensure(true);
    if (addToPlan(id, servings)) toast(`„${title.trim() || 'Dein Gericht'}“ im Wochenplan`, { label: 'Rückgängig', run: () => { deleteRecipe(id); made.current = null; } });
    else toast('Steht schon im Wochenplan');
  };
  const save = () => {
    const id = ensure(false);
    toast(`„${title.trim() || 'Dein Gericht'}“ im Kochbuch`, { label: 'Rückgängig', run: () => { deleteRecipe(id); made.current = null; } });
    navigate(`/rezept/${id}`);
  };

  return (
    <section className="card craving-done" aria-labelledby="craving-title">
      <h2 id="craving-title" className="visually-hidden">Dein Gericht</h2>
      <label className="field craving-done__name">
        <span className="small muted">Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </label>
      {text ? <p className="muted">{text}</p> : <p className="muted">Noch nichts gewählt – tipp oben auf „Ändern“.</p>}
      {steps.length > 0 && (
        <>
          <h3 className="small muted craving-done__how">So geht's{longest ? ` · in etwa ${mins(longest)} fertig` : ''}</h3>
          <ol className="craving-done__steps">
            {steps.map((s) => <li key={s.id}><strong>{s.name}</strong>{s.text ? ` ${s.text}` : ''}{s.minutes ? ` · ${mins(s.minutes)}` : ''}</li>)}
          </ol>
        </>
      )}
      {text && (
        <>
          <div className="row-between craving-done__servings">
            <span className="small muted">Portionen</span>
            <Stepper small value={servings} min={1} max={12} label="Portionen" onChange={setServings} />
          </div>
          <div className="craving-done__actions">
            <button type="button" className="btn btn--primary btn--block" onClick={cook}><Icon name="play" size={16} /> Jetzt kochen</button>
            <div className="craving-done__row">
              <button type="button" className="btn btn--soft" onClick={toPlan}><Icon name="calendar" size={16} /> In den Wochenplan</button>
              <button type="button" className="btn btn--soft" onClick={save}><Icon name="book" size={16} /> Als Rezept speichern</button>
            </div>
            <p className="small muted craving-done__note">Nach dem Kochen fragt dich die Startseite, wie es war – dann entscheidest du, ob es ins Kochbuch kommt.</p>
          </div>
        </>
      )}
    </section>
  );
}
