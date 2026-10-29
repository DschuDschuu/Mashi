import { useMemo, useState } from 'react';
import { baseCraving, cravingCombo } from '../../domain/craving';
import { comboText } from '../../domain/sides';
import type { Recipe } from '../../domain/types';
import { ask } from '../confirm';
import { CravingBuilder, useCravingView, ViewToggle } from './CravingBuilder';
import { Icon } from './Icon';

/**
 * Baukasten im Wochenplan als Teller oder Stepper (Julia: „den neuen Baukasten auch im Wochenplan“ – statt der Chips-Reihen): die
 * Grundlage ist schon gewählt und füllt ihre Stufen (Bolognese: Protein und Sauce), den Rest geht man durch. `onAdd`
 * bekommt wie früher die gespeicherte Form der Bausteine („pasta,parmesan“) oder undefined für die Grundlage pur.
 * Eigene Rezepte stehen hier nicht zur Wahl – ein Abend der Woche ist die Grundlage plus feste Bausteine.
 * `lunch`: für einen Mittag – dann heißt der Knopf auch so.
 */
export function ComboStepper({ base, onAdd, label = 'Zusammenstellen', lunch = false }: { base: Recipe; onAdd: (side: string | undefined) => void; label?: string; lunch?: boolean }) {
  const start = useMemo(() => baseCraving(base), [base]);
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
  const combo = cravingCombo(state);
  return (
    <div className="combo-stepper">
      <div className="combo-stepper__top"><ViewToggle view={view} onChange={setView} /></div>
      <CravingBuilder view={view} state={state} set={setState} own={start.own} small />
      <div className="row-gap">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => { onAdd(combo); close(); }}>
          <Icon name="plus" size={14} /> Für diesen {lunch ? 'Mittag' : 'Abend'}{combo ? ` · mit ${comboText(combo)}` : ' · pur'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={cancel}>Abbrechen</button>
      </div>
    </div>
  );
}
