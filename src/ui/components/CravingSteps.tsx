import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MULTI, STAGES, choiceOf, closeStep, coveredBy, currentStep, directionOf, optionsFor, pick, reopen, stockMarks, type Choice, type CravingState,
} from '../../domain/craving';
import { SIDE_KINDS, customSideId, type SideKind } from '../../domain/sides';
import { currentContent } from '../../domain/recipe';
import { householdOf, setHousehold, useFoodTable, usePantry, usePlan, useProducts, useRecipes } from '../../data/store';
import { formatMinutes, portionCount } from '../format';
import { toast } from '../toast';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

/** „3 Min.“ ohne Umbruch dazwischen – sonst steht „Min.“ allein in der nächsten Zeile */
export const mins = (m: number) => formatMinutes(m).replace(/ /g, '\u00a0');
export const labelOf = (k: SideKind) => SIDE_KINDS.find((x) => x.kind === k)?.label ?? k;

/**
 * Der Stepper (Julia: „wie ein Flussdiagramm, das sich öffnet“): oben das Erledigte mit „Ändern“, dann die Stufe, die
 * dran ist, darunter blass, was noch kommt. Er beginnt gleich beim Kohlenhydrat – die Richtung ist kein Schritt (Julia:
 * „es passt, wenn es einfach beginnt“), sie filtert nur, wenn sie vom Chip oder aus dem Textfeld kommt. Derselbe für
 * „Worauf hast du Lust?“ und den Baukasten im Wochenplan – wer ihn einsetzt, hält den Stand und bekommt ihn über `set`.
 */
export function CravingSteps({ state, set, own }: { state: CravingState; set: (s: CravingState) => void; own: readonly Choice[] }) {
  const step = currentStep(state);
  const now = useRef<HTMLLIElement>(null);
  // die neue Stufe ins Bild holen – auf dem Handy rutscht sie sonst unter den Rand
  useEffect(() => { now.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [step]);

  const names = (k: SideKind) => (state.picks[k] ?? []).map((id) => choiceOf(id, own)?.name ?? id);
  return (
    <ol className="lust-steps">
      {STAGES.map((k, i) => {
        const isNow = k === step;
        const done = !isNow && state.closed.includes(k);
        // „Sauce – steckt in Bolognese“ (Julia: Bolognese ist Protein und Sauce)
        const inside = coveredBy(state, k, own);
        return (
          <li key={k} ref={isNow ? now : undefined} className={`lust-steps__step${isNow ? ' is-now' : done ? ' is-done' : ''}`}>
            <span className="lust-steps__dot" aria-hidden="true">{done ? <Icon name="check" size={14} /> : i + 1}</span>
            <div className="lust-steps__body">
              <h2 className="lust-steps__label">{labelOf(k)}</h2>
              {done && <Done names={names(k)} inside={inside?.name} onChange={() => set(reopen(state, k))} />}
              {isNow && <StageOptions key={k} state={state} step={k} own={own} set={set} mini />}
              {/* schon Getipptes („was mit Brokkoli“) steht vorgemerkt da, bis die Stufe dran ist */}
              {!isNow && !done && !!state.picks[k]?.length && (
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

/** Unterzeile einer Rezept-Karte: vorgekocht, aus welchem Rezept, was es mit abdeckt */
function CardInfo({ c }: { c: Choice }) {
  const with_ = c.also?.length ? `mit ${c.also.map(labelOf).join(' und ')}` : '';
  if (c.ready) return <small className="lust-steps__ready"><Icon name="fridge" size={12} /> {portionCount(c.ready)}{with_ ? ` · ${with_}` : ''}</small>;
  return <small className="muted">{c.from ? `aus „${c.from}“` : with_ || 'dein Rezept'}</small>;
}

/**
 * Die Stufe, die dran ist (Julia: „die Zutaten ohne die Anweisung“ – wie man es macht, steht am Ende unter „So geht's“):
 * feste Bausteine als Chips, darunter deine Rezepte als Karussell mit Bild. Bei Kohlenhydrat und Protein schließt ein
 * Tipp die Stufe, bei Sauce, Gemüse und Topping sammelt man bis „Weiter“. „+ eigene“ legt einen Baustein dauerhaft an.
 * Dieselbe Auswahl im Stepper und unter dem Teller (CravingPlate).
 */
export function StageOptions({ state, step, own, set, mini = false }: {
  state: CravingState; step: SideKind; own: readonly Choice[]; set: (s: CravingState) => void;
  /** kleines Karussell (Julia: im Stepper „unten mit Mini-Karussell“) */ mini?: boolean;
}) {
  const hh = householdOf(usePlan());
  const known = useKnownNames();
  const stock = useStockMarks();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // kam eine Richtung vom Chip („Bowl“), zeigt Mashi nur Passendes – „alle zeigen“ hebt das für diese Stufe auf
  const [all, setAll] = useState(false);
  const dir = directionOf(state.direction);
  const options = optionsFor(state, step, own, hh, all, stock);
  const fixed = options.filter((c) => !c.recipeId);
  const mine = options.filter((c) => c.recipeId);
  const chosen = state.picks[step] ?? [];
  const label = labelOf(step);
  const multi = MULTI.has(step);
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

  return (
    <>
      <div className="chips" role="group" aria-label={label}>
        {fixed.map((c) => (
          <button key={c.id} type="button" className={`chip${chosen.includes(c.id) ? ' is-on' : ''}`} aria-pressed={chosen.includes(c.id)} onClick={() => choose(c.id)}>
            {c.stock && <span className={`stock-dot stock-dot--${c.stock}`} aria-hidden="true" />}
            {c.name}
            {c.stock && <span className="visually-hidden">{c.stock === 'bald' ? ' – bald verbrauchen' : ' – hast du da'}</span>}
          </button>
        ))}
        {adding
          ? (
            <form className="combo__new" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Tomaten" aria-label={`Eigener Baustein: ${label}`} autoFocus enterKeyHint="done" maxLength={30}
                list="craving-known" />
              {/* Namen, die es bei dir schon gibt – dann passen Einkauf und Nährwerte (Julia: „passend zu den bisherigen Einträgen“) */}
              <datalist id="craving-known">{known.map((n) => <option key={n} value={n} />)}</datalist>
              <button type="submit" className="chip chip--sm">OK</button>
            </form>
          )
          : <button type="button" className="chip combo__own" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> eigene</button>}
      </div>
      {/* die Punkte erklären sich nicht von selbst – nur zeigen, was gerade vorkommt */}
      {fixed.some((c) => c.stock) && (
        <p className="small muted stock-legend">
          {fixed.some((c) => c.stock === 'da') && <span><span className="stock-dot stock-dot--da" aria-hidden="true" /> hast du da</span>}
          {fixed.some((c) => c.stock === 'bald') && <span><span className="stock-dot stock-dot--bald" aria-hidden="true" /> bald verbrauchen</span>}
        </p>
      )}
      {dir && (
        <button type="button" className="link small lust-steps__all" onClick={() => setAll(!all)}>
          {all ? `nur, was zu ${dir.name} passt` : 'alle zeigen'}
        </button>
      )}
      {/* deine Rezepte mit Bild (Julia: „eigene Rezepte haben ja Bilder“) – Vorgekochtes zuerst */}
      {mine.length > 0 && (
        <ul className={`lust-carousel${mini ? ' lust-carousel--mini' : ''}`} aria-label={`Deine Rezepte: ${label}`}>
          {mine.map((c) => (
            <li key={c.id}>
              <button type="button" className={`lust-card${chosen.includes(c.id) ? ' is-on' : ''}`} aria-pressed={chosen.includes(c.id)} onClick={() => choose(c.id)}>
                <RecipeImage image={c.image} className="lust-card__img" />
                <strong className="lust-card__name">{c.name}</strong>
                <CardInfo c={c} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="lust-steps__more">
        {multi
          ? (
            <button type="button" className={`btn btn--sm ${chosen.length ? 'btn--primary' : 'btn--ghost'}`} onClick={() => set(closeStep(state, step))}>
              {chosen.length ? <>Weiter <Icon name="chevron" size={14} /></> : `Ohne ${label} weiter`}
            </button>
          )
          : (
            // „Ohne“ nimmt auch eine frühere Wahl weg – nach „Ändern“ heißt das: doch keins
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set(closeStep({ ...state, picks: { ...state.picks, [step]: undefined } }, step))}>
              Ohne {label} weiter
            </button>
          )}
      </div>
    </>
  );
}

/** Vorrats-Punkte: was von den Bausteinen zu Hause ist oder bald weg muss (stockMarks) – einmal je Vorrat, nicht je Chip */
function useStockMarks() {
  const pantry = usePantry();
  const table = useFoodTable();
  return useMemo(() => stockMarks(pantry, table), [pantry, table]);
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
