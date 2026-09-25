import { useState } from 'react';
import { DEFAULT_BASICS } from '../../domain/mealplan';
import { setPantryBasics, usePantry } from '../../data/store';
import { Icon } from './Icon';
import { TileSummary } from './TileSummary';

/**
 * „Immer im Haus“: was du immer im Schrank hast. Auf der Einkaufsliste unter „Basics“, nie „fehlt“ –
 * bei Vorschlägen zählt es weiter mit.
 */
export function BasicsSettings() {
  const pantry = usePantry();
  const names = pantry.basics ?? DEFAULT_BASICS;
  const [text, setText] = useState('');
  const add = () => {
    const n = text.trim();
    if (!n) return;
    if (!names.some((x) => x.toLocaleLowerCase('de-DE') === n.toLocaleLowerCase('de-DE'))) setPantryBasics([...names, n]);
    setText('');
  };
  const summary = names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` und ${names.length - 3} weitere` : ''}` : 'Noch nichts eingetragen';
  return (
    <details className="panel fold basics">
      <TileSummary icon="archive" title="Immer im Haus" text={summary} />
      <p className="muted small">Steht auf der Einkaufsliste unter „Basics“ und wird bei Rezepten nie als „fehlt“ gemeldet.</p>
      <div className="chips">
        {names.map((n) => (
          <button key={n} type="button" className="afilter" onClick={() => setPantryBasics(names.filter((x) => x !== n))} aria-label={`${n} entfernen`}>
            {n} <Icon name="close" size={12} />
          </button>
        ))}
      </div>
      <div className="basics__add">
        <input value={text} onChange={(e) => setText(e.target.value)} list="ingredient-names" placeholder="z. B. Haferflocken"
          onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Zutat hinzufügen" />
        <button className="btn btn--soft btn--sm" onClick={add} disabled={!text.trim()}>Hinzufügen</button>
      </div>
    </details>
  );
}
