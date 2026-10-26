import { useMemo, useRef, useState } from 'react';
import {
  cravingContent, cravingSteps, cravingText, cravingTitle, currentStep, directionOf, matchingRecipes, recipeChoices,
  understand, type Choice, type CravingState,
} from '../../domain/craving';
import { keyOfName } from '../../domain/mealplan';
import { currentContent, newId, totalMinutes } from '../../domain/recipe';
import { servingsOf } from '../../domain/week';
import { addToPlan, createRecipe, deleteRecipe, householdOf, keepTrial, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { Stepper } from '../components/Controls';
import { CravingAsk } from '../components/CravingAsk';
import { CravingBuilder, useCravingView, ViewToggle } from '../components/CravingBuilder';
import { mins } from '../components/CravingSteps';
import { clearCraving, loadCraving, saveCraving } from '../cravingMemory';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { RecipeImage } from '../components/RecipeImage';
import { formatMinutesShort } from '../format';
import { toast } from '../toast';

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
  // angefangen und weggeblättert? Dann weiter, wo du warst (cravingMemory.ts) – sonst neu aus dem Getippten
  const [state, setState] = useState<CravingState | undefined>(() => {
    const mem = loadCraving();
    return mem && q && mem.q === q ? mem.state : q ? understand(q, own) : undefined;
  });
  const [view, setView] = useCravingView();
  const set = (next: CravingState) => {
    setState(next);
    saveCraving(q, next);
  };
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
  return (
    <main className="screen">
      <TopBar title={dir?.name ?? 'Worauf hast du Lust?'} backTo="/"
        right={(
          <span className="craving-top">
            <ViewToggle view={view} onChange={setView} />
            <button type="button" className="link small" onClick={() => { clearCraving(); navigate('/lust', { replace: true }); }}>Neu</button>
          </span>
        )} />
      <CravingBuilder view={view} state={state} set={set} own={own} />
      {!currentStep(state) && <Finished state={state} own={own} />}
      {/* im Teller nicht (Julia: dort gehören nur die eigenen Rezepte der Stufe hin – die stehen im Karussell) */}
      {view === 'list' && <Inspiration state={state} own={own} />}
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
    // das Gericht gibt es jetzt (Plan, Kochmodus, Kochbuch) – beim nächsten Mal fängt der Stepper frisch an
    clearCraving();
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
