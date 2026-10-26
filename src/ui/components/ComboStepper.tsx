import { useMemo, useState } from 'react';
import { baseCraving, cravingCombo } from '../../domain/craving';
import { comboText } from '../../domain/sides';
import type { Recipe } from '../../domain/types';
import { CravingSteps } from './CravingSteps';
import { Icon } from './Icon';

/**
 * Baukasten im Wochenplan als Stepper (Julia: „den neuen Baukasten auch im Wochenplan“ – statt der Chips-Reihen): die
 * Grundlage ist schon gewählt und füllt ihre Stufen (Bolognese: Protein und Sauce), den Rest geht man durch. `onAdd`
 * bekommt wie früher die gespeicherte Form der Bausteine („pasta,parmesan“) oder undefined für die Grundlage pur.
 * Eigene Rezepte stehen hier nicht zur Wahl – ein Abend der Woche ist die Grundlage plus feste Bausteine.
 */
export function ComboStepper({ base, onAdd, label = 'Zusammenstellen' }: { base: Recipe; onAdd: (side: string | undefined) => void; label?: string }) {
  const start = useMemo(() => baseCraving(base), [base]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(start.state);
  const close = () => { setOpen(false); setState(start.state); };

  if (!open) {
    return (
      <button type="button" className="btn btn--soft btn--sm combo__add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> {label} …
      </button>
    );
  }
  const combo = cravingCombo(state);
  return (
    <div className="combo-stepper">
      <CravingSteps state={state} set={setState} own={start.own} />
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => { onAdd(combo); close(); }}>
          <Icon name="plus" size={14} /> Als Abend{combo ? ` · mit ${comboText(combo)}` : ' · pur'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={close}>Abbrechen</button>
      </div>
    </div>
  );
}
