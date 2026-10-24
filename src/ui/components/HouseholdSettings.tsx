import { useState } from 'react';
import { DAY_SHORT } from '../../domain/week';
import { WORKDAYS } from '../../domain/mealplan';
import { SIDE_KINDS, sideGrams, sidesOfKind } from '../../domain/sides';
import { PrepSheet } from './ComboSteps';
import { Icon } from './Icon';
import { householdOf, setHousehold, usePlan } from '../../data/store';
import { toast } from '../toast';
import { Stepper, Switch } from './Controls';

/**
 * Woche & Vorkochen (Julia): Portionen pro Mahlzeit und „Mittagessen mitplanen“ – auf allen Geräten gleich
 * (liegt im abgeglichenen Plan, nicht in den Geräte-Einstellungen).
 */
export function HouseholdSettings() {
  const hh = householdOf(usePlan());
  const lunch = hh.lunchDays.length > 0;
  const [prepFor, setPrepFor] = useState<string | null>(null);
  const set = (patch: Partial<typeof hh>, text: string) => toast(text, { label: 'Rückgängig', run: setHousehold({ ...hh, ...patch }) });
  const toggleDay = (d: number) => {
    const days = hh.lunchDays.includes(d) ? hh.lunchDays.filter((x) => x !== d) : [...hh.lunchDays, d].sort((a, b) => a - b);
    set({ lunchDays: days }, days.length ? `Mittags an ${days.map((x) => DAY_SHORT[x]).join(', ')}` : 'Mittagessen nicht mehr mitgeplant');
  };
  return (
    <div className="panel stack">
      <Switch
        label="Mittagessen mitplanen"
        hint="Meist der Rest vom Vorabend – lässt der sich schlecht mitnehmen, eine Box aus deinen Grundlagen. Portionen und Einkauf rechnen mit. Gilt auf allen Geräten."
        checked={lunch}
        onChange={(on) => set({ lunchDays: on ? [...WORKDAYS] : [] }, on ? 'Mittagessen wird mitgeplant' : 'Mittagessen nicht mehr mitgeplant')}
      />
      {lunch && (
        <div className="daypick daypick--small" role="group" aria-label="Mittagessen an diesen Tagen">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" className={`daypick__day${hh.lunchDays.includes(i) ? ' is-on' : ''}`} aria-pressed={hh.lunchDays.includes(i)} onClick={() => toggleDay(i)}>{d}</button>
          ))}
        </div>
      )}
      <div className="row-between">
        <span>
          <strong>Portionen pro Mahlzeit</strong>
          <small className="muted" style={{ display: 'block' }}>Für wie viele Personen die Woche rechnet</small>
        </span>
        <Stepper small value={hh.portions} min={1} max={8} label="Portionen pro Mahlzeit"
          onChange={(portions) => set({ portions }, `${portions} ${portions === 1 ? 'Portion' : 'Portionen'} pro Mahlzeit`)} />
      </div>
      {/* Beilagen der Woche (Julia: feste Mengen, einmal hier anpassen statt bei jedem Abend) */}
      <details className="household__sides">
        <summary><strong>Bausteine pro Portion</strong> <small className="muted">für den Baukasten in der Woche</small></summary>
        {SIDE_KINDS.map(({ kind, label }) => [<h4 key={kind} className="small muted household__kind">{label}</h4>, ...sidesOfKind(kind, hh.customSides).map((s) => {
          // kleine Mengen (Parmesan, Sesam) in 5er-Schritten, Ei in Stück
          const piece = s.unit === 'Stück';
          const step = piece ? 1 : s.grams < 50 ? 5 : 25;
          return (
          <div key={s.id} className="row-between">
            <span>{s.name} <small className="muted">{piece ? 'Stück' : 'in g'}</small>
              {/* Zubereitung als Standard (Julia: „woher weiß ich, wie ich das zubereite?“) */}
              <button type="button" className="iconbtn iconbtn--sm" aria-label={`Zubereitung ${s.name}`} onClick={() => setPrepFor(s.id)}><Icon name="pencil" size={14} /></button>
              {/* eigene Bausteine (Julia: „Tomaten“) wieder rausnehmen – alte Abende damit behalten ihren Namen (steht in der id) */}
              {s.id.startsWith('eigen:') && <button type="button" className="link small" onClick={() => {
                const { [s.id]: _g, ...sides } = hh.sides ?? {};
                set({ customSides: (hh.customSides ?? []).filter((x) => x !== s.id), sides: Object.keys(sides).length ? sides : undefined }, `${s.name} entfernt`);
              }}> entfernen</button>}
            </span>
            <Stepper small value={sideGrams(s.id, hh)} min={step} max={piece ? 6 : 600} step={step} label={`${s.name} pro Portion${piece ? '' : ' in Gramm'}`}
              onChange={(g) => {
                // Standardwert = keine eigene Angabe – so gelten spätere bessere Standardwerte auch hier
                const { [s.id]: _old, ...rest } = hh.sides ?? {};
                const sides = g === s.grams ? rest : { ...rest, [s.id]: g };
                set({ sides: Object.keys(sides).length ? sides : undefined }, `${s.name}: ${g}${piece ? ' Stück' : ' g'} pro Portion`);
              }} />
          </div>
          );
        })])}
      </details>
      {prepFor && <PrepSheet sideId={prepFor} household={hh} onClose={() => setPrepFor(null)} />}
    </div>
  );
}
