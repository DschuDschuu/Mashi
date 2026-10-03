import { useEffect, useState } from 'react';
import { FOOD_CHOICES } from '../../domain/nutrition/localFoods';
import { navigate } from '../../router';
import type { FoodKind } from '../../domain/nutrition/types';
import { setShelfDays, shelfOverview, SPECIAL_DAYS, type Special } from '../../domain/shelfLife';
import { setPantryShelfDays, usePantry } from '../../data/store';
import { Icon, type IconName } from './Icon';
import { TileSummary } from './TileSummary';

const KIND: Record<FoodKind, { label: string; icon: IconName }> = {
  vegetable: { label: 'Gemüse', icon: 'leaf' }, fruit: { label: 'Obst', icon: 'leaf' }, protein: { label: 'Fleisch & Fisch', icon: 'drumstick' },
  egg: { label: 'Eier', icon: 'cookie' }, dairy: { label: 'Milchprodukte', icon: 'cup' }, bread: { label: 'Brot & Wraps', icon: 'bread' },
  staple: { label: 'Frische Teigwaren', icon: 'rice' },
};

/** Sonderfälle als kleine Kacheln: Name, Zahl, Einheit */
const SPECIAL: { key: Special; label: string; unit: string }[] = [
  { key: 'reduced', label: 'MHD-Ware hält', unit: 'Tage' },
  { key: 'frozen', label: 'Gefroren: Hinweis nach', unit: 'Tagen' },
  { key: 'thawed', label: 'Aufgetaut hält', unit: 'Tage' },
  { key: 'opened', label: 'Angebrochen hält', unit: 'Tage' },
  { key: 'openedJar', label: 'Angebrochenes Glas hält', unit: 'Tage' },
  { key: 'prepared', label: 'Vorgekochtes hält', unit: 'Tage' },
];


/**
 * „Hält X Tage ab Kauf“ selbst einstellen – hier nur je Art und die Sonderfälle (MHD-Ware, Angebrochenes …).
 * Einzelne Lebensmittel stellst du in ihrer Kachel unter „Meine Lebensmittel“ ein (Julia: dort ist alles zu einem
 * Lebensmittel an einer Stelle). Lebensmittel mit eigenem Richtwert (Spinat 3, Zwiebeln 21) folgen der Art nicht.
 */
export function ShelfSettings() {
  const pantry = usePantry();
  const groups = shelfOverview(FOOD_CHOICES, pantry.shelfDays);
  const save = (target: { kind: FoodKind } | { food: string } | { special: Special }, value: number | undefined) =>
    setPantryShelfDays(setShelfDays(pantry.shelfDays, target, value));
  const ownFoods = Object.keys(pantry.shelfDays?.foods ?? {}).length;
  const own = Object.keys(pantry.shelfDays?.kinds ?? {}).length + SPECIAL.filter((s) => pantry.shelfDays?.[s.key]).length;
  // „Frische Teigwaren“ hat keinen Wert für die Art – nur einzelne Lebensmittel, und die stehen in ihren Kacheln
  const kinds = groups.filter((g) => g.kind !== 'staple');

  return (
    <details className="panel fold shelf">
      <TileSummary icon="clock" title="Haltbarkeit"
        text={own ? `Wie lange Frisches hält · ${own} eigene ${own === 1 ? 'Wert' : 'Werte'}` : 'Wie lange Frisches hält – für „Bald verbrauchen“'} />
      <p className="muted small">Gilt ab dem Kauf, wenn am Vorrat kein Datum steht. Leer lassen = Mashis Richtwert (grau).</p>

      <div className="shelf__special">
        {SPECIAL.map((s) => (
          <label key={s.key} className="shelf__tile">
            <span className="shelf__tile-label">{s.label}</span>
            <DaysField own={pantry.shelfDays?.[s.key]} standard={SPECIAL_DAYS[s.key]} unit={s.unit} label={s.label} onSave={(v) => save({ special: s.key }, v)} />
          </label>
        ))}
      </div>

      <div className="shelf__rows">
        {kinds.map((g) => (
          <DaysRow key={g.kind} icon={KIND[g.kind].icon} label={KIND[g.kind].label} own={pantry.shelfDays?.kinds?.[g.kind]} standard={g.standard}
            onSave={(v) => save({ kind: g.kind }, v)} />
        ))}
      </div>
      <p className="small muted">
        Gilt für alles dieser Art ohne eigenen Richtwert. Einzelne Lebensmittel stellst du in ihrer Kachel ein
        {ownFoods > 0 && <> – {ownFoods === 1 ? '1 hat' : `${ownFoods} haben`} einen eigenen Wert</>}.
      </p>
      <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('/produkte')}>
        <Icon name="apple" size={16} /> Meine Lebensmittel
      </button>
    </details>
  );
}

function DaysRow({ label, icon, own, standard, onSave }: { label: string; icon?: IconName; own?: number; standard?: number; onSave: (days: number | undefined) => void }) {
  return (
    <label className="shelf__row">
      <span>{icon && <Icon name={icon} size={16} />} {label}{standard === undefined && !own && <span className="small muted"> · hält lange</span>}</span>
      <DaysField own={own} standard={standard} unit="Tage" label={label} onSave={onSave} />
    </label>
  );
}

/** Zahl und Einheit in einem runden Feld. Speichert erst beim Verlassen – jede Speicherung wird synchronisiert. */
function DaysField({ own, standard, unit, label, onSave }: { own?: number; standard?: number; unit: string; label: string; onSave: (days: number | undefined) => void }) {
  const [text, setText] = useState(own ? String(own) : '');
  useEffect(() => setText(own ? String(own) : ''), [own]); // von einem anderen Gerät geändert

  const commit = () => {
    const n = Math.round(Number(text.replace(',', '.').trim()));
    const value = text.trim() && n >= 1 && n <= 365 ? n : undefined;
    if (value !== own) onSave(value);
    setText(value ? String(value) : '');
  };

  return (
    <span className={`days-field${own ? ' is-own' : ''}`}>
      <input inputMode="numeric" value={text} placeholder={standard === undefined ? '–' : String(standard)}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`${label}: ${unit}`} />
      <span aria-hidden="true">{unit}</span>
    </span>
  );
}
