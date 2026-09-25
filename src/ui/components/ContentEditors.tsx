import { newId } from '../../domain/recipe';
import { stepIngredients } from '../../domain/stepIngredients';
import type { Ingredient, Step, Unit } from '../../domain/types';
import { Icon } from './Icon';
import { AutoTextarea } from './AutoTextarea';
import { IngredientNames } from './IngredientNames';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Bund', 'Handvoll', 'cm', 'Messlöffel'];

/** Zutatenliste bearbeiten – geteilt von Testfeedback und Rezeptformular. */
export function IngredientEditor({ items, onChange, newItem }: { items: Ingredient[]; onChange: (i: Ingredient[]) => void; newItem: () => Ingredient }) {
  const update = (idx: number, patch: Partial<Ingredient>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div className="editor">
      <h3 className="small muted">Zutaten</h3>
      {/* Gleiche Vorschläge wie in der Speisekammer – gleiche Namen, damit Vorrat und Nährwerte die Zutat wiederfinden */}
      <IngredientNames />
      {items.map((it, idx) => (
        <div key={it.id} className="editor__row">
          <input
            className="editor__amount" type="number" inputMode="decimal" min={0} step="any" aria-label="Menge"
            value={it.amount === undefined ? '' : Math.round(it.amount * 100) / 100}
            onChange={(e) => update(idx, { amount: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <select className="editor__unit" aria-label="Einheit" value={it.unit ?? ''} onChange={(e) => update(idx, { unit: (e.target.value || undefined) as Unit | undefined })}>
            <option value="">–</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input className="editor__name" aria-label="Zutat" placeholder="Zutat" list="ingredient-names" value={it.name} onChange={(e) => update(idx, { name: e.target.value })} />
          <button type="button" className="iconbtn iconbtn--sm" aria-label={`${it.name || 'Zutat'} entfernen`} onClick={() => onChange(items.filter((_, i) => i !== idx))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => onChange([...items, newItem()])}><Icon name="plus" size={16} /> Zutat hinzufügen</button>
    </div>
  );
}

/** `ingredients`: die aktuelle Zutatenliste des Formulars – daraus wählt man pro Schritt aus. */
export function StepEditor({ steps, ingredients, onChange }: { steps: Step[]; ingredients: Ingredient[]; onChange: (s: Step[]) => void }) {
  const update = (idx: number, patch: Partial<Step>) => onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  /** Schritt um eine Position verschieben (-1 = nach oben). Der Schritt behält ID, Timer und Zutaten. */
  const move = (idx: number, by: -1 | 1) => {
    const next = [...steps];
    [next[idx], next[idx + by]] = [next[idx + by], next[idx]];
    onChange(next);
  };
  return (
    <div className="editor">
      <h3 className="small muted">Zubereitung</h3>
      {steps.map((s, idx) => (
        <div key={s.id} className="editor__step">
          <span className="steps__num">{idx + 1}</span>
          <div className="editor__stepbody">
            <AutoTextarea aria-label={`Schritt ${idx + 1}`} value={s.text} onChange={(e) => update(idx, { text: e.target.value })} />
            <label className="editor__timer">
              <Icon name="timer" size={14} />
              <input type="number" inputMode="numeric" min={0} placeholder="–" aria-label="Timer in Minuten" value={s.timerMinutes ?? ''}
                onChange={(e) => update(idx, { timerMinutes: e.target.value ? Number(e.target.value) : undefined })} />
              <span>Min. Timer</span>
            </label>
            <StepIngredientPicker step={s} ingredients={ingredients} onChange={(ingredientIds) => update(idx, { ingredientIds })} />
          </div>
          <div className="editor__stepactions">
            <button type="button" className="iconbtn iconbtn--sm" aria-label={`Schritt ${idx + 1} nach oben`} disabled={idx === 0} onClick={() => move(idx, -1)}>
              <Icon name="up" size={18} />
            </button>
            <button type="button" className="iconbtn iconbtn--sm" aria-label={`Schritt ${idx + 1} nach unten`} disabled={idx === steps.length - 1} onClick={() => move(idx, 1)}>
              <Icon name="down" size={18} />
            </button>
            <button type="button" className="iconbtn iconbtn--sm" aria-label={`Schritt ${idx + 1} entfernen`} onClick={() => onChange(steps.filter((_, i) => i !== idx))}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="link" onClick={() => onChange([...steps, { id: newId('s'), text: '' }])}><Icon name="plus" size={16} /> Schritt hinzufügen</button>
    </div>
  );
}

/**
 * Zutaten eines Schritts an-/abwählen. Solange nichts angetippt wurde, gilt die
 * automatische Erkennung; der erste Tipp macht daraus eine feste Zuordnung.
 */
function StepIngredientPicker({ step, ingredients, onChange }: {
  step: Step;
  ingredients: Ingredient[];
  onChange: (ids: string[] | undefined) => void;
}) {
  const named = ingredients.filter((i) => i.name.trim());
  const selected = new Set(stepIngredients(step, named).map((i) => i.id));
  const auto = step.ingredientIds === undefined;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(named.filter((i) => next.has(i.id)).map((i) => i.id));
  };
  if (!named.length) return null;
  return (
    <details className="editor__ings">
      <summary>Zutaten für diesen Schritt ({selected.size}) · {auto ? 'automatisch erkannt' : 'von dir festgelegt'}</summary>
      <div className="chips">
        {named.map((i) => (
          <button key={i.id} type="button" className={`chip chip--sm${selected.has(i.id) ? ' is-on' : ''}`} aria-pressed={selected.has(i.id)} onClick={() => toggle(i.id)}>
            {i.name}
          </button>
        ))}
      </div>
      {!auto && (
        <button type="button" className="link link--muted" onClick={() => onChange(undefined)}>Wieder automatisch erkennen</button>
      )}
    </details>
  );
}
