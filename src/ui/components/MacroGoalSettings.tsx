import { useState } from 'react';
import { DEFAULT_MACRO_GOAL, type MacroGoal } from '../../domain/nutrition/variants';
import { setMacroGoal, useMacroGoal } from '../../data/store';
import { toast } from '../toast';

const FIELDS: [keyof MacroGoal, string][] = [['carbs', 'Kohlenhydrate'], ['protein', 'Eiweiß'], ['fat', 'Fett']];

/**
 * Dein Makro-Ziel als Anteil an den Kalorien. Liegen mehrere Sorten im Vorrat (zwei Pestos),
 * schlägt Mashi beim Planen und Kochen die vor, die näher dran liegt. Gilt auf allen Geräten.
 */
export function MacroGoalSettings() {
  const goal = useMacroGoal();
  const [values, setValues] = useState<Record<keyof MacroGoal, string>>({ carbs: String(goal.carbs), protein: String(goal.protein), fat: String(goal.fat) });
  const nums = FIELDS.map(([k]) => Number(values[k]));
  const sum = nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  const valid = nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) && sum === 100;
  const changed = FIELDS.some(([k]) => Number(values[k]) !== goal[k]);
  const save = () => {
    const [carbs, protein, fat] = nums;
    setMacroGoal({ carbs, protein, fat });
    toast(`Ziel ${carbs} / ${protein} / ${fat} gespeichert`);
  };
  return (
    <div className="panel stack macrogoal">
      <div>
        <strong>Makro-Ziel</strong>
        <p className="small muted">Anteil an den Kalorien. Hast du mehrere Sorten derselben Zutat im Vorrat (z. B. zwei Pestos), schlägt Mashi beim Planen und Kochen die vor, die näher dran liegt. Gilt auf allen Geräten.</p>
      </div>
      <div className="macrogoal__fields">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="field">
            <span>{label} %</span>
            <input inputMode="numeric" value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value.replace(/[^0-9]/g, '') })} />
          </label>
        ))}
      </div>
      {!valid && <p className="small error" role="alert">Zusammen müssen es 100 % sein (gerade {sum} %).</p>}
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" disabled={!valid || !changed} onClick={save}>Speichern</button>
        {(goal.carbs !== DEFAULT_MACRO_GOAL.carbs || goal.protein !== DEFAULT_MACRO_GOAL.protein || goal.fat !== DEFAULT_MACRO_GOAL.fat) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setMacroGoal(DEFAULT_MACRO_GOAL); setValues({ carbs: '40', protein: '30', fat: '30' }); }}>Zurück auf 40 / 30 / 30</button>
        )}
      </div>
    </div>
  );
}
