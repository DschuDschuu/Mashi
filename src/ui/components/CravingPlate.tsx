import { useState } from 'react';
import { choiceOf, coveredBy, coversOf, currentStep, reopen, type Choice, type CravingState } from '../../domain/craving';
import type { SideKind } from '../../domain/sides';
import { labelOf, StageOptions } from './CravingSteps';
import { Icon } from './Icon';

/** Wo jedes Schild auf dem Teller liegt (Julia: Topping in der Mitte, Protein und Sauce nebeneinander; die oberen lieber
 * über den Tellerrand als auf den mittleren Kreis) in %: x die Mitte, y oben die Unterkante, unten die Oberkante, damit
 * lange Namen nach außen wachsen; Topping mittig */
const FIELDS: { kind: SideKind; x: number; y: number; d?: string }[] = [
  { kind: 'carb', x: 31, y: 31, d: 'M150 150 L22 150 A128 128 0 0 1 150 22 Z' },
  { kind: 'protein', x: 69, y: 31, d: 'M150 150 L150 22 A128 128 0 0 1 278 150 Z' },
  { kind: 'veg', x: 31, y: 69, d: 'M150 150 L150 278 A128 128 0 0 1 22 150 Z' },
  { kind: 'sauce', x: 69, y: 69, d: 'M150 150 L278 150 A128 128 0 0 1 150 278 Z' },
  { kind: 'topping', x: 50, y: 50 },
];
/** Protein und Sauce in einem (Bolognese): die rechte Hälfte */
const HALF = 'M150 22 A128 128 0 0 1 150 278 Z';
/** Platz, an dem sich ein Schild ausrichtet (Breite in %): reicht bis 4 % vor die Mittellinie (Julia: mehr Abstand) –
 *  ist der Name breiter, wächst das Schild nur nach außen */
const SLOT = 30;
const BRUSH = 'M7.5 8.6C13.5 6.6 21 6 28.5 5.7c6.6-.3 11.4-.8 15 .4 2.2.7 2 2.3.2 2.9 2.4.8 2.5 2.6.3 3.3 2.4.9 2.1 2.9-.8 3.6-5.8 1.4-13.6 2.1-21.4 2.9-6 .6-11.2 1.5-15 1-1.9-.2-2-1.5-.6-2.2-2.4-.6-2.4-2.4-.3-3-2.4-.8-2.2-2.8 0-3.3-1.4-.9-.7-2.2 1.6-2.7z';

/**
 * Der Teller (Julia: „ich finde A am besten“, ausgearbeitet als 5d „auf dem Tischset“): jede Stufe ist ein Feld, was
 * gewählt ist, liegt als Schild darauf; das Feld, das dran ist, trägt den Pinselstrich aus der Navigation. Die Reihenfolge
 * ist frei – jedes Schild antippen öffnet seine Stufe. Deckt eine Wahl Protein und Sauce ab (Bolognese), werden die beiden
 * Viertel zu einer Hälfte, das Schild bleibt in der Ecke (Julia). Darunter dieselbe Auswahl wie im Stepper.
 */
export function CravingPlate({ state, set, own, small = false }: { state: CravingState; set: (s: CravingState) => void; own: readonly Choice[]; small?: boolean }) {
  // angetippt: diese Stufe – sonst die nächste offene; ist die angetippte erledigt, geht es dort weiter
  const [focus, setFocus] = useState<SideKind | undefined>();
  const step = focus && !state.closed.includes(focus) ? focus : currentStep(state);
  const picked = (k: SideKind) => (state.picks[k] ?? []).flatMap((id) => choiceOf(id, own) ?? []);
  // zur Hälfte nur, wenn die Wahl allein für beide steht – liegt schon Hackfleisch da, bleiben es zwei Felder
  const ps = [...picked('protein'), ...picked('sauce')];
  const cand = ps.find((c) => coversOf(c).includes('protein') && coversOf(c).includes('sauce'));
  const both = cand && ps.every((c) => c.id === cand.id) ? cand : undefined;
  const open = (k: SideKind) => {
    if (state.closed.includes(k)) set(reopen(state, k));
    setFocus(k);
  };

  return (
    <div className="craving-plate">
      <div className="plate-mat">
        <svg className="plate-mat__fork" width="22" height="150" viewBox="0 0 22 170" aria-hidden="true"><path d="M5 4v30M11 4v30M17 4v30M5 34c0 8 12 8 12 0M11 42v120" /></svg>
        <svg className="plate-mat__knife" width="22" height="150" viewBox="0 0 22 170" aria-hidden="true"><path d="M11 4c6 8 6 40 0 52v106" /></svg>
        <div className={`plate${small ? ' plate--small' : ''}`}>
          <svg className="plate__svg" viewBox="0 0 300 300" aria-hidden="true">
            <circle className="plate__rim" cx="150" cy="150" r="146" />
            {FIELDS.filter((f) => f.d && !(both && (f.kind === 'protein' || f.kind === 'sauce'))).map((f) => (
              <path key={f.kind} d={f.d} className={`plate__f plate__f--${f.kind}${picked(f.kind).length || coveredBy(state, f.kind, own) ? '' : ' is-empty'}`} />
            ))}
            {both && <path d={HALF} className="plate__f plate__f--protein" />}
            <circle cx="150" cy="150" r="44" className={`plate__f plate__f--topping${picked('topping').length ? '' : ' is-empty'}`} />
          </svg>
          {FIELDS.filter((f) => !(both && f.kind === 'sauce')).map((f) => {
            const merged = !!both && f.kind === 'protein';
            const kind = merged ? both.kind : f.kind;
            const names = merged ? [both.name] : picked(f.kind).map((c) => c.name);
            const inside = merged ? undefined : coveredBy(state, f.kind, own);
            const now = step === f.kind || (merged && (step === 'protein' || step === 'sauce'));
            const ready = merged ? both.ready : picked(f.kind).some((c) => c.ready);
            const label = merged ? 'Protein & Sauce' : labelOf(f.kind);
            return (
              <div key={f.kind} className={`plate__slot plate__slot--${f.kind}${names.length ? '' : ' plate__slot--open'}`} style={{ left: `${f.x - SLOT / 2}%`, width: `${SLOT}%`, top: `${f.y}%` }}>
              <button type="button"
                className={`plate__sign plate__sign--${f.kind}${now ? ' is-now' : names.length || inside ? '' : ' is-empty'}`}
                aria-label={`${label}: ${names.join(', ') || (inside ? `steckt in ${inside.name}` : 'noch leer')}`} onClick={() => open(kind)}>
                {now && <svg className="plate__brush" viewBox="0 0 48 26" preserveAspectRatio="none" aria-hidden="true"><path d={BRUSH} /></svg>}
                {names.length
                  ? <span className="plate__name">{ready && <Icon name="fridge" size={12} />} {names.join(', ')}</span>
                  : <><small>{label}</small><span className="plate__name">{inside ? `in ${inside.name}` : now ? '' : '+'}</span></>}
              </button>
              </div>
            );
          })}
        </div>
      </div>
      {step && (
        <section className="plate-sheet" aria-label={labelOf(step)}>
          <h2 className="plate-sheet__title">{labelOf(step)}</h2>
          <StageOptions key={step} state={state} step={step} own={own} set={set} />
        </section>
      )}
    </div>
  );
}
