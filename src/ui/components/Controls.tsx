import type { ReactNode } from 'react';
import type { Rating } from '../../domain/types';
import { DEVICES } from '../../domain/catalog';
import { deviceIcon } from '../catalogIcons';
import { Icon, type IconName } from './Icon';

export function Stepper({ value, min = 1, max = 24, onChange, label }: { value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Weniger">
        <Icon name="minus" size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Mehr">
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function Stars({ value, onChange, size = 34 }: { value: number; onChange?: (v: Rating) => void; size?: number }) {
  return (
    <div className="stars" role={onChange ? 'radiogroup' : undefined} aria-label="Bewertung">
      {([1, 2, 3, 4, 5] as Rating[]).map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} von 5`} onClick={() => onChange(n)} className={n <= value ? 'is-on' : ''}>
            <Icon name="star" size={size} filled={n <= value} />
          </button>
        ) : (
          <span key={n} className={n <= value ? 'is-on' : ''}><Icon name="star" size={size} filled={n <= value} /></span>
        ),
      )}
    </div>
  );
}

/** Mehrfachauswahl als Chips. */
export function ChipSelect<T extends string>({ options, selected, onChange, single = false }: {
  options: { value: T; label: ReactNode }[];
  selected: T[];
  onChange: (next: T[]) => void;
  single?: boolean;
}) {
  const toggle = (v: T) => {
    if (single) onChange(selected.includes(v) ? [] : [v]);
    else onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip${selected.includes(o.value) ? ' is-on' : ''}`} aria-pressed={selected.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, icon, action, children }: { title: string; icon?: IconName; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <h2>{icon && <Icon name={icon} size={20} />}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div>{children}</div>
    </div>
  );
}

/** Geräteauswahl als quadratische Kacheln mit Linien-Icon (Mehrfachauswahl). */
export function DevicePicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="devpick">
      {DEVICES.map((d) => (
        <button key={d.id} type="button" className={`devpick__item${selected.includes(d.id) ? ' is-on' : ''}`} aria-pressed={selected.includes(d.id)} onClick={() => toggle(d.id)}>
          <Icon name={deviceIcon(d.id)} size={24} />
          {d.label}
        </button>
      ))}
    </div>
  );
}

/** Ein/Aus-Schalter mit Beschriftung – die ganze Zeile ist antippbar. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span className="switch-row__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <span className={`switch${checked ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
    </button>
  );
}
