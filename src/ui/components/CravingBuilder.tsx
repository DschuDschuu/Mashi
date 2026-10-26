import { useState } from 'react';
import type { Choice, CravingState } from '../../domain/craving';
import { loadView, saveView, type CravingView } from '../cravingMemory';
import { CravingPlate } from './CravingPlate';
import { CravingSteps } from './CravingSteps';

/** Teller oder Liste – gemerkt auf dem Gerät, Standard Teller (Julia) */
export function useCravingView(): [CravingView, (v: CravingView) => void] {
  const [view, setView] = useState<CravingView>(loadView);
  return [view, (v) => { setView(v); saveView(v); }];
}

/**
 * Das Zusammenstellen in der gewählten Ansicht (Julia: „die kreative Ansicht oder beim Stepper bleiben“) – beide zeigen
 * denselben Stand, umschalten verliert nichts. Auf der Lust-Seite und im Wochenplan.
 */
export function CravingBuilder({ view, state, set, own, small = false }: {
  view: CravingView; state: CravingState; set: (s: CravingState) => void; own: readonly Choice[]; small?: boolean;
}) {
  return view === 'plate' ? <CravingPlate state={state} set={set} own={own} small={small} /> : <CravingSteps state={state} set={set} own={own} />;
}

/** Umschalter Teller | Liste */
export function ViewToggle({ view, onChange }: { view: CravingView; onChange: (v: CravingView) => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Ansicht">
      <button type="button" className={view === 'plate' ? 'is-on' : ''} aria-pressed={view === 'plate'} aria-label="Teller" onClick={() => onChange('plate')}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M12 3v5.5M3 12h5.5" /></svg>
      </button>
      <button type="button" className={view === 'list' ? 'is-on' : ''} aria-pressed={view === 'list'} aria-label="Liste" onClick={() => onChange('list')}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
      </button>
    </div>
  );
}
