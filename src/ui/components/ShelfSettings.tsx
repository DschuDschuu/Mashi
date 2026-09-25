import { useEffect, useState } from 'react';
import { FOOD_CHOICES } from '../../domain/nutrition/localFoods';
import type { FoodKind } from '../../domain/nutrition/types';
import { setShelfDays, shelfOverview, SPECIAL_DAYS, type Special } from '../../domain/shelfLife';
import { setPantryShelfDays, usePantry } from '../../data/store';

const KIND_LABEL: Record<FoodKind, string> = {
  vegetable: 'Gemüse', fruit: 'Obst', protein: 'Fleisch & Fisch', egg: 'Eier', dairy: 'Milchprodukte',
  bread: 'Brot & Wraps', staple: 'Frische Teigwaren',
};

const SPECIAL: [Special, string][] = [
  ['reduced', 'MHD-Ware (reduziert) hält noch'],
  ['frozen', 'Gefrorenes: Hinweis nach'],
  ['thawed', 'Aufgetautes hält noch'],
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

  return (
    <details className="panel learned shelf">
      <summary>Haltbarkeit einstellen</summary>
      <p className="muted small">
        So lange hält etwas ab dem Kauf, wenn am Vorrat kein Datum steht. Leer = Mashis Richtwert (grau).
        Für ein einzelnes Produkt geht es auch unter „Meine Produkte“.
      </p>
      <div className="shelf__rows shelf__special">
        {SPECIAL.map(([key, label]) => (
          <DaysRow key={key} label={label} own={pantry.shelfDays?.[key]} standard={SPECIAL_DAYS[key]} unit={key === 'frozen' ? 'Tagen' : 'Tage'} onSave={(v) => save({ special: key }, v)} />
        ))}
      </div>
      {groups.map((g) => {
        const own = g.foods.filter((f) => f.own).length + (g.own ? 1 : 0);
        return (
          <details key={g.kind} className="shelf__group">
            <summary>
              <span>{KIND_LABEL[g.kind]}</span>
              <span className="small muted">{g.kind === 'staple' ? `${g.foods.length} Sorten` : days(g.days)}{own ? ` · ${own} eigene` : ''}</span>
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
    </details>
  );
}

/** Speichert erst beim Verlassen des Felds – nicht bei jedem Tastendruck (jede Speicherung wird synchronisiert). */
function DaysRow({ label, own, standard, unit = 'Tage', onSave }: { label: string; own?: number; standard?: number; unit?: string; onSave: (days: number | undefined) => void }) {
  const [text, setText] = useState(own ? String(own) : '');
  useEffect(() => setText(own ? String(own) : ''), [own]); // von einem anderen Gerät geändert

  const commit = () => {
    const n = Math.round(Number(text.replace(',', '.').trim()));
    const value = text.trim() && n >= 1 && n <= 365 ? n : undefined;
    if (value !== own) onSave(value);
    setText(value ? String(value) : '');
  };

  return (
    <label className="shelf__row">
      <span>{label}{standard === undefined && !own && <span className="small muted"> · hält lange</span>}</span>
      <span className="shelf__input">
        <input inputMode="numeric" value={text} placeholder={standard === undefined ? '–' : String(standard)}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`${label}: ${unit}`} />
        {unit}
      </span>
    </label>
  );
}
