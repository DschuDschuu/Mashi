import { useState } from 'react';
import { SIDE_KINDS, comboOf, comboText, customSideId, sidesOfKind, type SideKind } from '../../domain/sides';
import { householdOf, setHousehold, usePlan } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * Baukasten (Julia: „+ Kohlenhydrat, + Protein, + Beilage, + Topping“): je Reihe ein Baustein oder keiner, dann
 * „Als Abend“ – es entsteht z. B. „Kürbissauce mit Pasta, Hähnchenbrust & Parmesan“. `onAdd` bekommt die gespeicherte
 * Form („pasta,haehnchen,parmesan“) oder undefined für die Grundlage pur. „+ eigene“ legt einen Baustein dauerhaft an.
 */
export function ComboBuilder({ onAdd, label = 'Als Abend' }: { onAdd: (side: string | undefined) => void; label?: string }) {
  const hh = householdOf(usePlan());
  const [pick, setPick] = useState<Partial<Record<SideKind, string>>>({});
  const [adding, setAdding] = useState<SideKind | null>(null);
  const [name, setName] = useState('');
  const combo = comboOf(Object.values(pick).filter((x): x is string => !!x));

  const addCustom = (kind: SideKind) => {
    const id = customSideId(kind, name);
    setAdding(null);
    setName('');
    if (!id) return;
    if (!(hh.customSides ?? []).includes(id)) {
      toast(`„${name.trim()}“ im Baukasten`, { label: 'Rückgängig', run: setHousehold({ ...hh, customSides: [...(hh.customSides ?? []), id] }) });
    }
    setPick((p) => ({ ...p, [kind]: id }));
  };

  return (
    <div className="combo">
      {SIDE_KINDS.map(({ kind, label: row }) => (
        <div key={kind} className="combo__row">
          <span className="combo__label small muted">+ {row}</span>
          <div className="chips" role="group" aria-label={`+ ${row}`}>
            {sidesOfKind(kind, hh.customSides).map((s) => (
              <button key={s.id} type="button" className={`chip chip--sm${pick[kind] === s.id ? ' is-on' : ''}`} aria-pressed={pick[kind] === s.id}
                onClick={() => setPick((p) => ({ ...p, [kind]: p[kind] === s.id ? undefined : s.id }))}>{s.name}</button>
            ))}
            {adding === kind
              ? (
                <form className="combo__new" onSubmit={(e) => { e.preventDefault(); addCustom(kind); }}>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Tomaten" aria-label={`Eigener Baustein: ${row}`} autoFocus enterKeyHint="done" maxLength={30} />
                  <button type="submit" className="chip chip--sm">OK</button>
                </form>
              )
              : <button type="button" className="chip chip--sm combo__own" onClick={() => { setAdding(kind); setName(''); }}><Icon name="plus" size={12} /> eigene</button>}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--soft btn--sm combo__add" onClick={() => { onAdd(combo); setPick({}); }}>
        <Icon name="plus" size={14} /> {label}{combo ? ` · ${comboText(combo)}` : ' · pur'}
      </button>
    </div>
  );
}
