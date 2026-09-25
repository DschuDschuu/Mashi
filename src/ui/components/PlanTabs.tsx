import { navigate } from '../../router';
import { useSwipe } from '../useSwipe';

type Active = 'pantry' | 'prices';
const ORDER: { key: Active; label: string; path: string }[] = [
  { key: 'pantry', label: 'Vorräte', path: '/speisekammer' },
  { key: 'prices', label: 'Preise', path: '/preise' },
];

/** Umschalter im Tab „Speisekammer“: Vorräte und Preise – beides kommt vom Kassenbon. */
export function PantryTabs({ active }: { active: Active }) {
  return (
    <div className="segments" role="tablist" aria-label="Speisekammer">
      {ORDER.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} className={`segment${active === t.key ? ' is-on' : ''}`}
          onClick={() => active !== t.key && navigate(t.path, { replace: true })}>{t.label}</button>
      ))}
    </div>
  );
}

/** Wischen zwischen Vorräten und Preisen – wie zwischen den Tabs eines Rezepts. */
export function usePantrySwipe(active: Active) {
  const i = ORDER.findIndex((t) => t.key === active);
  const go = (n: number) => ORDER[n] && navigate(ORDER[n].path, { replace: true });
  return useSwipe(() => go(i + 1), () => go(i - 1));
}
