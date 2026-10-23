import { useMemo, useState, type FormEvent } from 'react';
import { comboContent, goesTogether, mixChoices, MIX_ROLES, SIDE_DEFAULT_GRAMS, type MixRole } from '../../domain/mix';
import { deductRecipe, pantryAfterPlan } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { chosenContent } from '../../domain/choices';
import type { Recipe } from '../../domain/types';
import { addCombo, createSide, toggleGoesTogether, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { mixIcon } from '../catalogIcons';
import { Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { NutritionTiles } from '../components/Nutrition';
import { StockLine } from '../components/StockLine';
import { TopBar } from '../components/TopBar';
import { portionCount } from '../format';
import { toast } from '../toast';
import { useNutrition } from '../useNutrition';

/**
 * Mix & Match (Julia): je eine Sauce und eine Beilage antippen, sehen, was die Kombination pro Portion hat und
 * ob alles da ist – und ab in den Wochenplan. Die Bausteine stehen nur hier, nicht im Kochbuch.
 */
export function MixScreen() {
  const recipes = useRecipes();
  const [picked, setPicked] = useState<Record<string, string>>({});
  // Gewähltes, das es nicht mehr gibt (archiviert, zurück ins Kochbuch), zählt nicht mehr
  const chosen = MIX_ROLES.map((role) => recipes.find((r) => r.id === picked[role.id] && r.mix === role.id && !r.archivedAt));
  const complete = chosen.every((r): r is Recipe => !!r);

  return (
    <main className="screen">
      <TopBar title="Mix & Match" backTo="/kochbuch" />
      <p className="muted small mix__intro">Sauce und Beilage frei kombinieren. Was hier steht, taucht im Kochbuch nicht auf.</p>
      {MIX_ROLES.map((role, n) => (
        <RoleSection key={role.id} role={role} recipes={recipes} picked={chosen[n]}
          // was zum Gewählten der anderen Seite passt, bekommt einen Stern
          others={chosen.filter((r, m): r is Recipe => m !== n && !!r)}
          onPick={(id) => setPicked((p) => ({ ...p, [role.id]: p[role.id] === id ? '' : id }))} />
      ))}
      {complete
        ? <Combo key={chosen.map((r) => r.id).join('+')} parts={chosen} />
        : chosen.some(Boolean) && (
          <p className="muted small mix__hint">
            Wähl noch {MIX_ROLES.filter((_, n) => !chosen[n]).map((r) => `eine ${r.label}`).join(' und ')}.
          </p>
        )}
    </main>
  );
}

function RoleSection({ role, recipes, picked, others, onPick }: {
  role: MixRole; recipes: Recipe[]; picked?: Recipe; others: Recipe[]; onPick: (id: string) => void;
}) {
  const list = mixChoices(recipes, role.id);
  const [adding, setAdding] = useState(false);
  // Beilagen sind schnell angelegt (Name + Menge); alles andere ist ein richtiges Rezept → Formular
  const add = () => (role.id === 'beilage' ? setAdding(!adding) : navigate(`/neu/manuell?mix=${role.id}`));
  return (
    <section className="mix__role">
      <div className="row-between">
        <h2 className="h3">{role.plural}</h2>
        <button type="button" className="link" onClick={add} aria-expanded={role.id === 'beilage' ? adding : undefined}>
          <Icon name="plus" size={16} /> Neue {role.label}
        </button>
      </div>
      {adding && <NewSide onDone={(id) => { setAdding(false); if (id) onPick(id); }} />}
      {list.length ? (
        // Kacheln mit Icon je Baustein (Julia) – der Stern oben rechts zeigt, was zur anderen Seite passt
        <div className={`mix__tiles mix__tiles--${role.id}`} role="group" aria-label={role.plural}>
          {list.map((r) => {
            const fits = others.some((o) => goesTogether(r, o));
            const title = currentContent(r).title;
            return (
              <button key={r.id} type="button" className={`mix-tile${picked?.id === r.id ? ' is-on' : ''}`} aria-pressed={picked?.id === r.id} onClick={() => onPick(r.id)}>
                <span className="mix-tile__icon"><Icon name={mixIcon(title, role.id)} size={30} /></span>
                <span className="mix-tile__name">{title}</span>
                {fits && <span className="mix-tile__star"><Icon name="star" size={15} filled /><span className="visually-hidden"> – passt gut dazu</span></span>}
              </button>
            );
          })}
        </div>
      ) : !adding && (
        <p className="muted small">
          Noch keine {role.plural}. Leg oben eine an – oder verschieb ein Rezept aus dem Kochbuch (im Rezept ⋯ → „In Mix & Match“).
        </p>
      )}
      {picked && (
        <button type="button" className="link link--muted mix__open" onClick={() => navigate(`/rezept/${picked.id}`)}>
          {currentContent(picked).title} ansehen <Icon name="chevron" size={14} />
        </button>
      )}
    </section>
  );
}

/** Beilage anlegen: nur Name und Menge pro Portion (Julia: „so 100 g pro Person“) */
function NewSide({ onDone }: { onDone: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState(SIDE_DEFAULT_GRAMS);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = createSide(name, grams);
    toast(`${name.trim()} angelegt`);
    onDone(id);
  };
  return (
    <form className="panel mix__new" onSubmit={submit}>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Gnocchi" autoFocus enterKeyHint="done" />
      </label>
      <div className="row-between">
        <span className="muted small">Gramm pro Portion</span>
        <Stepper small value={grams} min={10} max={500} step={10} onChange={setGrams} label="Gramm pro Portion" />
      </div>
      <div className="row-between">
        <button type="button" className="btn btn--ghost" onClick={() => onDone()}>Abbrechen</button>
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>Anlegen</button>
      </div>
    </form>
  );
}

/** Die gewählte Kombination: passt-zu, Nährwerte pro Portion, Vorrat, Portionen und „In den Plan“ */
function Combo({ parts }: { parts: Recipe[] }) {
  const [servings, setServings] = useState(2);
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const table = useFoodTable();
  // jeder Baustein in seiner gewählten Variante (siehe choices.ts)
  const combo = useMemo(() => comboContent(parts.map(chosenContent), servings), [parts, servings]);
  const n = useNutrition(combo);
  // wie auf der Rezeptseite: mit dem, was nach dem Wochenplan frei bleibt; leere Speisekammer → nichts dazu
  const stock = useMemo(
    () => (pantry.items.length ? deductRecipe(pantryAfterPlan(pantry, plan, recipes, table), combo, servings, table).stock : undefined),
    [pantry, plan, recipes, table, combo, servings],
  );
  const [a, b] = parts;
  const fits = goesTogether(a, b);

  const toPlan = () => {
    const r = addCombo(parts.map((p) => p.id), servings);
    const title = (id: string) => currentContent(parts.find((p) => p.id === id)!).title;
    const now = (id: string) => r.plan.items.find((i) => i.recipeId === id)?.servings ?? servings;
    const notes = [
      ...r.more.map((id) => `${title(id)} jetzt ${portionCount(now(id))}`),
      ...r.cooked.map((id) => `${title(id)} ist schon gekocht`),
    ];
    const text = `${combo.title} im Wochenplan${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
    toast(text, r.added.length || r.more.length ? { label: 'Rückgängig', run: r.undo } : undefined);
  };

  return (
    <section className="panel mix__combo" aria-label="Deine Kombination">
      <div className="row-between">
        <h2 className="h3">{combo.title}</h2>
        <button type="button" className={`chip chip--sm${fits ? ' is-on' : ''}`} aria-pressed={fits} onClick={() => toggleGoesTogether(a.id, b.id)}>
          <Icon name="star" size={14} filled={fits} /> Passt gut
        </button>
      </div>
      <span className="muted small">pro Portion</span>
      <NutritionTiles n={n} />
      <StockLine content={combo} stock={stock} />
      <div className="row-between">
        <span className="muted">Portionen</span>
        <Stepper small value={servings} onChange={setServings} label="Portionen" />
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={toPlan}>
        <Icon name="calendar" size={18} /> In den Wochenplan
      </button>
    </section>
  );
}
