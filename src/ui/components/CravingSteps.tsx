import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MULTI, STAGES, chooseDirection, choiceOf, closeStep, coveredBy, currentStep, directionOf, directionsFor, optionsFor, pick,
  reopen, type Choice, type CravingState,
} from '../../domain/craving';
import { SIDE_KINDS, customSideId, type SideKind } from '../../domain/sides';
import { currentContent } from '../../domain/recipe';
import { householdOf, setHousehold, usePantry, usePlan, useProducts, useRecipes } from '../../data/store';
import { formatMinutes, portionCount } from '../format';
import { toast } from '../toast';
import { Icon } from './Icon';

type Step = 'direction' | SideKind;
const STEPS: readonly Step[] = ['direction', ...STAGES];
/** „3 Min.“ ohne Umbruch dazwischen – sonst steht „Min.“ allein in der nächsten Zeile */
export const mins = (m: number) => formatMinutes(m).replace(/ /g, ' ');
const labelOf = (k: Step) => (k === 'direction' ? 'Richtung' : SIDE_KINDS.find((x) => x.kind === k)?.label ?? k);

/**
 * Der Stepper (Julia: „wie ein Flussdiagramm, das sich öffnet“): oben das Erledigte mit „Ändern“, dann die Stufe, die
 * dran ist, darunter blass, was noch kommt. Derselbe für „Worauf hast du Lust?“ und den Baukasten im Wochenplan
 * (Julia: „den neuen Baukasten auch im Wochenplan“) – wer ihn einsetzt, hält den Stand und bekommt ihn über `set`.
 */
export function CravingSteps({ state, set, own }: { state: CravingState; set: (s: CravingState) => void; own: readonly Choice[] }) {
  const step = currentStep(state);
  const now = useRef<HTMLLIElement>(null);
  // die neue Stufe ins Bild holen – auf dem Handy rutscht sie sonst unter den Rand
  useEffect(() => { now.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [step]);

  const dir = directionOf(state.direction);
  const names = (k: SideKind) => (state.picks[k] ?? []).map((id) => choiceOf(id, own)?.name ?? id);
  return (
    <ol className="lust-steps">
      {STEPS.map((k, i) => {
        const isNow = k === step;
        const done = !isNow && (k === 'direction' ? !!state.direction : state.closed.includes(k));
        // „Sauce – steckt in Bolognese“ (Julia: Bolognese ist Protein und Sauce)
        const inside = k === 'direction' ? undefined : coveredBy(state, k, own);
        return (
          <li key={k} ref={isNow ? now : undefined} className={`lust-steps__step${isNow ? ' is-now' : done ? ' is-done' : ''}`}>
            <span className="lust-steps__dot" aria-hidden="true">{done ? <Icon name="check" size={14} /> : i + 1}</span>
            <div className="lust-steps__body">
              <h2 className="lust-steps__label">
                {labelOf(k)}{isNow && k !== 'direction' && dir ? <span className="lust-steps__hint"> – passt zu {dir.name}</span> : null}
              </h2>
              {done && (
                <Done names={k === 'direction' ? [dir?.name ?? ''] : names(k)} inside={inside?.name}
                  onChange={() => set(k === 'direction' ? { ...state, direction: undefined } : reopen(state, k))} />
              )}
              {isNow && <Now state={state} step={k} own={own} set={set} />}
              {/* schon Getipptes („was mit Brokkoli“) steht vorgemerkt da, bis die Stufe dran ist */}
              {!isNow && !done && k !== 'direction' && !!state.picks[k]?.length && (
                <span className="small muted lust-steps__later">{names(k).join(', ')} vorgemerkt</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Erledigte Stufe: was gewählt ist (oder „ohne“, oder worin es steckt) und „Ändern“ */
function Done({ names, inside, onChange }: { names: string[]; inside?: string; onChange: () => void }) {
  return (
    <div className="lust-steps__done">
      {names.length
        ? <span className="lust-steps__value">{names.join(', ')}</span>
        : <span className="muted">{inside ? `steckt in ${inside}` : 'ohne'}</span>}
      <button type="button" className="link small" onClick={onChange}>Ändern</button>
    </div>
  );
}

/** Unterzeile einer Wahl: vorgekocht, aus welchem Rezept, was es mit abdeckt, wie man es macht */
function ChoiceInfo({ c }: { c: Choice }) {
  const time = c.prep?.minutes ? ` · ${mins(c.prep.minutes)}` : '';
  const with_ = c.also?.length ? ` · mit ${c.also.map((k) => labelOf(k)).join(' und ')}` : '';
  if (c.ready) return <small className="lust-steps__ready"><Icon name="fridge" size={13} /> im Kühlschrank · {portionCount(c.ready)}{with_}</small>;
  if (c.recipeId) return <small className="lust-steps__own"><Icon name="book" size={13} /> {c.from ? `aus „${c.from}“` : 'dein Rezept'}{with_}{time}</small>;
  return c.prep ? <small className="muted">{c.prep.text}{time}</small> : null;
}

/**
 * Die Stufe, die dran ist: Richtungen, eine Liste zum Antippen (eins) oder Chips (mehrere, dann „Weiter“). „+ eigene“
 * legt einen Baustein dauerhaft an (wie früher im Baukasten, Julia: „Tomaten bei Beilage“).
 */
function Now({ state, step, own, set }: { state: CravingState; step: Step; own: readonly Choice[]; set: (s: CravingState) => void }) {
  const hh = householdOf(usePlan());
  const known = useKnownNames();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (step === 'direction') {
    return (
      <div className="chips">
        {directionsFor(state, own).map((d) => <button key={d.id} type="button" className="chip" onClick={() => set(chooseDirection(state, d.id, own))}>{d.name}</button>)}
      </div>
    );
  }
  const chosen = state.picks[step] ?? [];
  const options = optionsFor(state, step, own, hh);
  const label = labelOf(step);
  const choose = (id: string) => set(pick(state, step, id, own));

  const addOwn = () => {
    const id = customSideId(step, name);
    setAdding(false);
    setName('');
    if (!id) return;
    if (!(hh.customSides ?? []).includes(id)) {
      toast(`„${name.trim()}“ als Baustein`, { label: 'Rückgängig', run: setHousehold({ ...hh, customSides: [...(hh.customSides ?? []), id] }) });
    }
    if (!chosen.includes(id)) choose(id);
  };
  const own_ = adding
    ? (
      <form className="combo__new" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Tomaten" aria-label={`Eigener Baustein: ${label}`} autoFocus enterKeyHint="done" maxLength={30}
          list="craving-known" />
        {/* Namen, die es bei dir schon gibt – dann passen Einkauf und Nährwerte (Julia: „passend zu den bisherigen Einträgen“) */}
        <datalist id="craving-known">{known.map((n) => <option key={n} value={n} />)}</datalist>
        <button type="submit" className="chip chip--sm">OK</button>
      </form>
    )
    : <button type="button" className="chip chip--sm combo__own" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> eigene</button>;

  if (MULTI.has(step)) {
    return (
      <>
        <div className="chips" role="group" aria-label={label}>
          {options.map((c) => (
            <button key={c.id} type="button" className={`chip${chosen.includes(c.id) ? ' is-on' : ''}`} aria-pressed={chosen.includes(c.id)} onClick={() => choose(c.id)}>
              {c.ready ? <Icon name="fridge" size={14} /> : c.recipeId ? <Icon name="book" size={14} /> : null}{c.name}
            </button>
          ))}
          {own_}
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
          <button key={c.id} type="button" className={`lust-steps__option${chosen.includes(c.id) ? ' is-on' : ''}${c.recipeId ? ' is-own' : ''}`} onClick={() => choose(c.id)}>
            <strong>{c.name}</strong>
            <ChoiceInfo c={c} />
          </button>
        ))}
      </div>
      <div className="lust-steps__more">
        {/* „Ohne“ nimmt auch eine frühere Wahl weg – nach „Ändern“ heißt das: doch keins */}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => set(closeStep({ ...state, picks: { ...state.picks, [step]: undefined } }, step))}>
          Ohne {label} weiter
        </button>
        {own_}
      </div>
    </>
  );
}

/** Lebensmittel-Namen, die es bei dir schon gibt: Meine Lebensmittel, Speisekammer (ohne Vorgekochtes), Rezeptzutaten */
function useKnownNames(): string[] {
  const products = useProducts();
  const pantry = usePantry();
  const recipes = useRecipes();
  return useMemo(() => {
    const names = [
      ...products.map((p) => p.name),
      ...pantry.items.filter((it) => !it.recipeId).map((it) => it.name),
      ...recipes.filter((r) => !r.archivedAt).flatMap((r) => currentContent(r).ingredients.filter((i) => !i.recipeId).map((i) => i.name)),
    ];
    return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  }, [products, pantry, recipes]);
}
