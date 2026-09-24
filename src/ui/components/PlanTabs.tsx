import { navigate } from '../../router';

/** Umschalter im Tab „Plan“: Wochenplan und Speisekammer gehören zusammen (planen → einkaufen → kochen). */
export function PlanTabs({ active }: { active: 'plan' | 'pantry' }) {
  return (
    <div className="segments" role="tablist" aria-label="Plan">
      <button role="tab" aria-selected={active === 'plan'} className={`segment${active === 'plan' ? ' is-on' : ''}`}
        onClick={() => active !== 'plan' && navigate('/plan', { replace: true })}>Diese Woche</button>
      <button role="tab" aria-selected={active === 'pantry'} className={`segment${active === 'pantry' ? ' is-on' : ''}`}
        onClick={() => active !== 'pantry' && navigate('/speisekammer', { replace: true })}>Speisekammer</button>
    </div>
  );
}
