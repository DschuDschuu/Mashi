import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { TileSummary } from './TileSummary';

/**
 * Aufklappbare Kachel mit einer Liste von Zutatennamen („Immer im Haus“, „Ohne Nährwerte“):
 * Chips zum Antippen (optional) und Entfernen, darunter ein Feld zum Hinzufügen.
 */
export function NameListSettings({ icon, title, hint, names, onChange, onPick, picked, placeholder, children }: {
  icon: IconName;
  title: string;
  hint: string;
  names: string[];
  onChange: (names: string[]) => void;
  /** Name antippen (z. B. Nährwerte hinterlegen) – ohne: Chips sind nur zum Entfernen */
  onPick?: (name: string) => void;
  picked?: string | null;
  placeholder: string;
  /** unter den Chips, z. B. das Formular für den angetippten Namen */
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const n = text.trim();
    if (!n) return;
    if (!names.some((x) => x.toLocaleLowerCase('de-DE') === n.toLocaleLowerCase('de-DE'))) onChange([...names, n]);
    setText('');
  };
  const summary = names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` und ${names.length - 3} weitere` : ''}` : 'Noch nichts eingetragen';
  return (
    <details className="panel fold namelist">
      <TileSummary icon={icon} title={title} text={summary} />
      <p className="muted small">{hint}</p>
      <div className="chips">
        {names.map((n) => (
          <span key={n} className={`namechip${picked === n ? ' is-on' : ''}`}>
            {onPick
              ? <button type="button" className="namechip__name" onClick={() => onPick(n)}>{n}</button>
              : <span className="namechip__name">{n}</span>}
            <button type="button" className="namechip__x" onClick={() => onChange(names.filter((x) => x !== n))} aria-label={`${n} entfernen`}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
      {children}
      <div className="namelist__add">
        <input value={text} onChange={(e) => setText(e.target.value)} list="ingredient-names" placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={`${title}: Zutat hinzufügen`} />
        <button className="btn btn--soft btn--sm" onClick={add} disabled={!text.trim()}>Hinzufügen</button>
      </div>
    </details>
  );
}
