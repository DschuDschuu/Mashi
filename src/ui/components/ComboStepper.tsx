import { useMemo, useState } from 'react';
import { currentStep } from '../../domain/craving';
import { baseCraving, cravingCombo } from '../../domain/weekCraving';
import { comboText, sidesOf, withStyle } from '../../domain/sides';
import type { Recipe } from '../../domain/types';
import { ask } from '../confirm';
import { householdOf, usePlan } from '../../data/store';
import { useOwnChoices } from '../cravingHooks';
import { ComboSteps } from './ComboSteps';
import { CravingBuilder, useCravingView, ViewToggle } from './CravingBuilder';
import { Icon } from './Icon';

/**
 * Baukasten im Wochenplan als Teller oder Stepper (Julia: „den neuen Baukasten auch im Wochenplan“ – statt der Chips-Reihen): die
 * Grundlage ist schon gewählt und füllt ihre Stufen (Bolognese: Protein und Sauce), den Rest geht man durch. `onAdd`
 * bekommt wie früher die gespeicherte Form der Bausteine („pasta,parmesan“) oder undefined für die Grundlage pur.
 * Deine Rezepte als Bausteine stehen mit zur Wahl (Julia: deine Guacamole auch hier) – nur nicht die Grundlage selbst.
 * `lunch`: für einen Mittag – dann heißt der Knopf auch so.
 */
export function ComboStepper({ base, onAdd, label = 'Zusammenstellen', lunch = false }: { base: Recipe; onAdd: (side: string | undefined) => void; label?: string; lunch?: boolean }) {
  const start = useMemo(() => baseCraving(base), [base]);
  const mine = useOwnChoices();
  const hh = householdOf(usePlan());
  const own = useMemo(() => [...start.own, ...mine.filter((c) => c.recipeId !== base.id)], [start.own, mine, base.id]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(start.state);
  // Teller oder Liste – dieselbe gemerkte Wahl wie auf der Lust-Seite (Julia)
  const [view, setView] = useCravingView();
  const close = () => { setOpen(false); setState(start.state); };
  // „Abbrechen“ fragt nach, wenn über die Grundlage hinaus etwas gewählt ist (Julia: wie „Neu“ auf der Lust-Seite)
  const cancel = async () => {
    const chosen = JSON.stringify(state.picks) !== JSON.stringify(start.state.picks);
    if (chosen && !(await ask({ title: 'Abbrechen?', text: 'Deine Auswahl geht verloren.', confirm: 'Verwerfen', cancel: 'Weiter zusammenstellen', danger: true }))) return;
    close();
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--soft btn--sm combo__add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> {label} …
      </button>
    );
  }
  const combo = cravingCombo(state, own, base.id);
  // der Kochstil reist mit (sides.ts: withStyle): Richtung, und was du hier schon an Würze und Zubereitung wählst –
  // nur für Bausteine, die noch auf dem Teller liegen
  const onPlate = new Set(sidesOf(combo).map((x) => x.id));
  const side = withStyle(combo, { direction: state.direction, spice: state.spice, ways: Object.fromEntries(Object.entries(state.ways ?? {}).filter(([id]) => onPlate.has(id))) });
  return (
    <div className="combo-stepper">
      <div className="combo-stepper__top"><ViewToggle view={view} onChange={setView} /></div>
      <CravingBuilder view={view} state={state} set={setState} own={own} small />
      {/* fertig zusammengestellt: „So geht's“ wie am Abend – Würze und Zubereitung gleich hier einstellen (Julia) */}
      {side && !currentStep(state) && (
        <section className="combo-stepper__how">
          <h3 className="small muted">So geht's</h3>
          <ComboSteps side={side} base={base} household={hh}
            onStyle={(st) => setState({ ...state, ...(st.spice ? { spice: st.spice } : {}), ...(st.ways ? { ways: { ...state.ways, ...st.ways } } : {}) })} />
        </section>
      )}
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => { onAdd(side); close(); }}>
          <Icon name="plus" size={14} /> Für diesen {lunch ? 'Mittag' : 'Abend'}{combo ? ` · mit ${comboText(combo)}` : ' · pur'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={cancel}>Abbrechen</button>
      </div>
    </div>
  );
}
