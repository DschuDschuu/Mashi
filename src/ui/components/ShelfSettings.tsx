import { useEffect, useState } from 'react';
import { FOOD_CHOICES } from '../../domain/nutrition/localFoods';
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
];

const days = (n: number | undefined) => (n === undefined ? 'hält lange' : n === 1 ? '1 Tag' : `${n} Tage`);

/**
 * „Hält X Tage ab Kauf“ selbst einstellen – je Art und je Lebensmittel.
 * Die Lebensmittel stehen mit ihrem Wert dabei: Tomaten haben einen eigenen Richtwert,
 * der Wert für „Gemüse“ gilt nur für alle anderen. So ist nichts versteckt.
 */
export function ShelfSettings() {
  const pantry = usePantry();
  const groups = shelfOverview(FOOD_CHOICES, pantry.shelfDays);
  const save = (target: { kind: FoodKind } | { food: string } | { special: Special }, value: number | undefined) =>
    setPantryShelfDays(setShelfDays(pantry.shelfDays, target, value));
  const own = Object.keys(pantry.shelfDays?.foods ?? {}).length + Object.keys(pantry.shelfDays?.kinds ?? {}).length
    + SPECIAL.filter((s) => pantry.shelfDays?.[s.key]).length;

  return (
    <details className="panel fold shelf">
      <TileSummary icon="clock" title="Haltbarkeit"
        text={own ? `Wie lange Frisches hält · ${own} eigene ${own === 1 ? 'Wert' : 'Werte'}` : 'Wie lange Frisches hält – für „Bald verbrauchen“'} />
      <p className="muted small">Gilt ab dem Kauf, wenn am Vorrat kein Datum steht. Leer lassen = Mashis Richtwert (grau). Einzelne Produkte stellst du unter „Meine Produkte“ ein.</p>

      <div className="shelf__special">
        {SPECIAL.map((s) => (
          <label key={s.key} className="shelf__tile">
            <span className="shelf__tile-label">{s.label}</span>
            <DaysField own={pantry.shelfDays?.[s.key]} standard={SPECIAL_DAYS[s.key]} unit={s.unit} label={s.label} onSave={(v) => save({ special: s.key }, v)} />
          </label>
        ))}
      </div>

      <div className="shelf__groups">
        {groups.map((g) => {
          const mine = g.foods.filter((f) => f.own).length + (g.own ? 1 : 0);
          return (
            <details key={g.kind} className="shelf__group">
              <summary>
                <Icon name={KIND[g.kind].icon} size={18} />
                <span className="shelf__group-name">{KIND[g.kind].label}{mine > 0 && <small className="muted"> · {mine} eigene</small>}</span>
                <span className="shelf__pill">{g.kind === 'staple' ? `${g.foods.length} Sorten` : days(g.days)}</span>
                <Icon name="chevron" size={16} className="shelf__chevron" />
              </summary>
              <div className="shelf__rows">
                {g.kind !== 'staple' && (
                  <DaysRow label={g.foods.length ? 'Alle anderen' : 'Alle'} own={pantry.shelfDays?.kinds?.[g.kind]} standard={g.standard}
                    onSave={(v) => save({ kind: g.kind }, v)} />
                )}
                {g.foods.map((f) => (
                  <DaysRow key={f.id} label={f.name} own={f.own ? f.days : undefined} standard={f.standard} onSave={(v) => save({ food: f.id }, v)} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

function DaysRow({ label, own, standard, onSave }: { label: string; own?: number; standard?: number; onSave: (days: number | undefined) => void }) {
  return (
    <label className="shelf__row">
      <span>{label}{standard === undefined && !own && <span className="small muted"> · hält lange</span>}</span>
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
