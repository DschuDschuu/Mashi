import { useState } from 'react';
import { SIDE_KINDS, SIDES, comboOf, comboText, type SideKind } from '../../domain/sides';
import { Icon } from './Icon';

/**
 * Baukasten (Julia: „+ Kohlenhydrat, + Protein, + Beilage, + Topping“): je Reihe ein Baustein oder keiner, dann
 * „Als Abend“ – es entsteht z. B. „Kürbissauce mit Pasta, Hähnchenbrust & Parmesan“. `onAdd` bekommt die gespeicherte
 * Form („pasta,haehnchen,parmesan“) oder undefined für die Grundlage pur.
 */
export function ComboBuilder({ onAdd, label = 'Als Abend' }: { onAdd: (side: string | undefined) => void; label?: string }) {
  const [pick, setPick] = useState<Partial<Record<SideKind, string>>>({});
  const combo = comboOf(Object.values(pick).filter((x): x is string => !!x));
  return (
    <div className="combo">
      {SIDE_KINDS.map(({ kind, label: row }) => (
        <div key={kind} className="combo__row">
          <span className="combo__label small muted">+ {row}</span>
          <div className="chips" role="group" aria-label={`+ ${row}`}>
            {SIDES.filter((s) => s.kind === kind).map((s) => (
              <button key={s.id} type="button" className={`chip chip--sm${pick[kind] === s.id ? ' is-on' : ''}`} aria-pressed={pick[kind] === s.id}
                onClick={() => setPick((p) => ({ ...p, [kind]: p[kind] === s.id ? undefined : s.id }))}>{s.name}</button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--soft btn--sm combo__add" onClick={() => { onAdd(combo); setPick({}); }}>
        <Icon name="plus" size={14} /> {label}{combo ? ` · ${comboText(combo)}` : ' · pur'}
      </button>
    </div>
  );
}
