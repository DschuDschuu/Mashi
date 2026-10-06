import { useEffect, useState } from 'react';
import { newId } from '../../domain/recipe';
import { FINISH, partLabel, partsOf, REST, suggestedPart } from '../../domain/parts';
import { stepIngredients } from '../../domain/stepIngredients';
import type { Ingredient, Step, Unit } from '../../domain/types';
import { Icon } from './Icon';
import { AutoTextarea } from './AutoTextarea';
import { IngredientNames } from './IngredientNames';
import { renameKey, renameSuggestion, type RenameOptions } from '../../domain/renames';
import { dismissRename } from '../../data/store';
import { useRenameOptions } from '../useRenames';

/** Auswahl „＋ Neuer Teil …“ – kein echter Teil, öffnet das Eingabefeld */
const NEW_PART = '\u0000neu';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Glas', 'Bund', 'Handvoll', 'cm', 'Messlöffel'];

/** Zutatenliste bearbeiten – geteilt von Testfeedback und Rezeptformular. */
export function IngredientEditor({ items, onChange, newItem }: { items: Ingredient[]; onChange: (i: Ingredient[]) => void; newItem: () => Ingredient }) {
  const update = (idx: number, patch: Partial<Ingredient>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const renameOpts = useRenameOptions();
  /** Teile des Rezepts (Julia: „Sauce“, „Salat“ – getrennt kochbar) und für welche Zutat gerade ein neuer getippt wird */
  const parts = partsOf({ ingredients: items }).filter((p) => p !== REST);
  const [newPartFor, setNewPartFor] = useState<string | null>(null);
  return (
    <div className="editor">
      <h3 className="small muted">Zutaten</h3>
      {/* Gleiche Vorschläge wie in der Speisekammer – gleiche Namen, damit Vorrat und Nährwerte die Zutat wiederfinden */}
      <IngredientNames />
      {items.map((it, idx) => (
        <div key={it.id} className="editor__row">
          <AmountInput value={it.amount} onChange={(amount) => update(idx, { amount })} />
          <select className="editor__unit" aria-label="Einheit" value={it.unit ?? ''} onChange={(e) => update(idx, { unit: (e.target.value || undefined) as Unit | undefined })}>
            <option value="">–</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input className="editor__name" aria-label="Zutat" placeholder="Zutat" list="ingredient-names" value={it.name} onChange={(e) => update(idx, { name: e.target.value })} />
          <button type="button" className="iconbtn iconbtn--sm" aria-label={`${it.name || 'Zutat'} entfernen`} onClick={() => onChange(items.filter((_, i) => i !== idx))}>
            <Icon name="close" size={16} />
          </button>
          {newPartFor === it.id ? (
            <input className="editor__part" autoFocus placeholder="Teil, z. B. Sauce" aria-label={`Neuer Teil für ${it.name || 'Zutat'}`}
              onBlur={(e) => { update(idx, { part: e.target.value.trim() || undefined }); setNewPartFor(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          ) : (
            <select className="editor__part" aria-label={`Teil von ${it.name || 'Zutat'}`} value={it.part ?? ''}
              onChange={(e) => (e.target.value === NEW_PART ? setNewPartFor(it.id) : update(idx, { part: e.target.value || undefined }))}>
              <option value="">Ohne Teil</option>
              {parts.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value={NEW_PART}>＋ Neuer Teil …</option>
            </select>
          )}
          {/* Hinweis zur Zutat (Julia: „gewürfelt“, „fein gehackt“) – steht im Rezept, bei den Schritten und im Kochmodus */}
          <input className="editor__note" aria-label={`Hinweis zu ${it.name || 'Zutat'}`} placeholder="Hinweis, z. B. gewürfelt" value={it.note ?? ''}
            onChange={(e) => update(idx, { note: e.target.value || undefined })} onBlur={(e) => update(idx, { note: e.target.value.trim() || undefined })} />
          <RenameHint name={it.name} options={renameOpts} onApply={(to) => update(idx, { name: to })} />
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
            {/* Teil des Schritts – Mashi schlägt ihn aus den Zutaten vor, „Zum Schluss“ bringt Teile zusammen (Julia) */}
            {partsOf({ ingredients }).length > 0 && (
              <label className="editor__steppart small">
                <span className="muted">Teil</span>
                <select value={s.part ?? ''} aria-label={`Teil von Schritt ${idx + 1}`} onChange={(e) => update(idx, { part: e.target.value || undefined })}>
                  <option value="">Automatisch ({partLabel(suggestedPart(s, { ingredients }))})</option>
                  {[...partsOf({ ingredients }), FINISH].map((p) => <option key={p} value={p}>{partLabel(p)}</option>)}
                </select>
              </label>
            )}
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

/** „→ Milch?“ unter einer Zutat, die einheitlich anders heißt – übernehmen oder nicht mehr vorschlagen */
function RenameHint({ name, options, onApply }: { name: string; options: RenameOptions; onApply: (to: string) => void }) {
  const to = renameSuggestion(name, options);
  if (!to) return null;
  return (
    <p className="rename-hint small">
      <span>Einheitlich: <strong>{to}</strong>?</span>
      <button type="button" className="link" onClick={() => onApply(to)}>Übernehmen</button>
      <button type="button" className="link link--muted" onClick={() => dismissRename(renameKey(name))}>Nicht mehr vorschlagen</button>
    </p>
  );
}

const toText = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
const toNumber = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
};

/**
 * Menge mit Komma („1,5“) wie überall in Mashi – ein Zahlenfeld (type="number") versteht das auf
 * manchen Handys nicht. Der Text bleibt beim Tippen stehen („1,“ springt nicht um).
 */
function AmountInput({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(toText(value));
  // von außen geändert (z. B. Portionen umgerechnet) → übernehmen, eigenes Tippen aber nicht überschreiben
  useEffect(() => { if (toNumber(text) !== value) setText(toText(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="editor__amount" inputMode="decimal" aria-label="Menge" value={text}
      onChange={(e) => { setText(e.target.value); onChange(toNumber(e.target.value)); }} />
  );
}
