import { useState } from 'react';
import { comboSteps, prepOf, sideOf, type ComboStep } from '../../domain/sides';
import type { Household } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { currentContent } from '../../domain/recipe';
import { DAY_LONG, type CarbCarry } from '../../domain/week';
import { setSidePrep } from '../../data/store';
import { useSheet } from '../useSheet';
import { toast } from '../toast';
import { Stepper } from './Controls';
import { Icon } from './Icon';

/**
 * „So geht's“ für einen Baukasten-Abend (Julia: „woher weiß ich, wie ich das zubereite?“) – das Längste zuerst, jeder
 * Baustein mit Stift zum Ändern: als Standard oder nur bei dieser Grundlage.
 */
export function ComboSteps({ side, base, household, carry }: { side: string; base: Recipe; household: Household; carry?: CarbCarry }) {
  const [edit, setEdit] = useState<ComboStep | null>(null);
  // zweimal Nudeln: am ersten Abend mitkochen, am zweiten nur aufwärmen (3 Min.) – danach neu nach Dauer ordnen
  const steps = comboSteps(side, currentContent(base).title, household, base).map((s): ComboStep => {
    if (!carry || s.id !== carry.side) return s;
    if (carry.from !== undefined) return { ...s, text: `von ${DAY_LONG[carry.from]} aufwärmen`, minutes: 3 };
    return carry.with !== undefined ? { ...s, text: `${s.text ?? 'kochen'} – gleich für ${DAY_LONG[carry.with]} mitkochen` } : s;
  }).sort((a, b) => b.minutes - a.minutes);
  return (
    <>
      <ol className="combo-steps">
        {steps.map((s) => (
          <li key={s.id ?? 'base'}>
            <span><b>{s.name}</b> {s.text ?? <span className="muted">– noch keine Zubereitung</span>}{s.minutes > 0 ? <span className="muted"> · {s.minutes} Min.</span> : null}
              {s.source === 'grundlage' && <span className="tag">nur hier</span>}</span>
            {s.id && <button type="button" className="iconbtn iconbtn--sm" aria-label={`Zubereitung ${s.name} ändern`} onClick={() => setEdit(s)}><Icon name="pencil" size={14} /></button>}
          </li>
        ))}
      </ol>
      {edit?.id && <PrepSheet sideId={edit.id} base={base} household={household} onClose={() => setEdit(null)} />}
    </>
  );
}

/** Zubereitung eines Bausteins ändern – ohne `base` nur als Standard (Einstellungen) */
export function PrepSheet({ sideId, base, household, onClose }: { sideId: string; base?: Recipe; household: Household; onClose: () => void }) {
  const ref = useSheet(onClose);
  const side = sideOf(sideId);
  const here = base?.blockPrep?.[sideId];
  const now = prepOf(sideId, household, base);
  const [text, setText] = useState(now?.text ?? '');
  const [minutes, setMinutes] = useState(now?.minutes ?? 5);
  const [onlyBase, setOnlyBase] = useState(!!here);
  const baseTitle = base ? currentContent(base).title : '';
  const own = onlyBase ? !!here : !!household.sidePrep?.[sideId];

  const save = () => {
    const prep = text.trim() ? { text: text.trim(), minutes } : undefined;
    const undos = [setSidePrep(sideId, prep, onlyBase && base ? base.id : undefined)];
    // von „nur hier“ auf Standard gewechselt: die Abweichung bei der Grundlage fällt weg
    if (!onlyBase && base && here) undos.push(setSidePrep(sideId, undefined, base.id));
    toast(`${side?.name ?? 'Baustein'}: ${onlyBase ? `nur bei ${baseTitle}` : 'Standard'} gespeichert`, { label: 'Rückgängig', run: () => undos.reverse().forEach((u) => u()) });
    onClose();
  };
  const reset = () => {
    const undo = setSidePrep(sideId, undefined, onlyBase && base ? base.id : undefined);
    toast(`${side?.name ?? 'Baustein'}: wieder ${onlyBase ? 'wie überall' : 'Mashis Standard'}`, { label: 'Rückgängig', run: undo });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Zubereitung ${side?.name ?? ''}`} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{side?.name}: so bereitest du es zu</h2>
        <label className="field">Zubereitung<input value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. halbieren und kurz mitbraten" maxLength={120} /></label>
        <div className="row-between">
          <span>Minuten <small className="muted">0 = nur dazu/drüber</small></span>
          <Stepper small min={0} max={90} value={minutes} onChange={setMinutes} label="Minuten" />
        </div>
        {base && (
          <label className="row-gap small">
            <input type="checkbox" checked={onlyBase} onChange={(e) => setOnlyBase(e.target.checked)} /> Nur bei {baseTitle} so
          </label>
        )}
        <div className="variants__actions">
          {own && <button type="button" className="btn btn--ghost" onClick={reset}>Zurücksetzen</button>}
          <button type="button" className="btn btn--primary" onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
