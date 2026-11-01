import { useState } from 'react';
import { activeChoice, forChoice } from '../../domain/choices';
import { currentContent } from '../../domain/recipe';
import { swapChecks, swapSlots, swapTargetOf, type SwapSlot } from '../../domain/swaps';
import type { Recipe } from '../../domain/types';
import { householdOf, setSwap, usePlan } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/** „Paprika (rot oder bunt)“ → „Paprika“ – als Chip reicht der Name */
const short = (name: string) => name.replace(/\s*\(.*?\)/g, '').trim() || name;

/**
 * Zutaten tauschen (Julia: „im Rezept Dinge austauschen, aber die Kochschritte bleiben“, swaps.ts): jede Zutat, die ein
 * Baustein ist, lässt sich gegen einen derselben Stufe tauschen, „Original“ holt sie zurück. Gilt fürs Rezept, bis du
 * zurücktauschst; Zutaten, Schritte, Nährwerte, Einkauf und Kochmodus rechnen mit. Mit Rückgängig wie die Variante.
 * Seit jede Stufe tauscht, wären es bis zu fünf Zeilen über den Zutaten – darum stehen die noch nicht getauschten
 * kompakt als Chips in einer Zeile; getauschte bekommen ihre Zeile mit Ampel (grün passt, gelb: kurz anschauen).
 */
export function SwapPanel({ recipe }: { recipe: Recipe }) {
  const hh = householdOf(usePlan());
  const [open, setOpen] = useState<string | null>(null);
  // die Fassung ohne Tausch – sonst wäre der Tofu sein eigener Tauschplatz
  const base = forChoice(currentContent(recipe), activeChoice(recipe));
  const slots = swapSlots(base, recipe.swaps, hh.customSides);
  // die Ampel (Julia: „das Rezept checkt das“): Schritte, deren Garart der neue Baustein nicht kann
  const checks = swapChecks(base, recipe.swaps, hh.customSides);
  if (!slots.length) return null;
  const done = slots.filter((sl) => sl.current);
  const idle = slots.filter((sl) => !sl.current);
  const openIdle = idle.find((sl) => sl.ingredient.id === open);

  const toggle = (id: string) => setOpen(open === id ? null : id);
  const swap = (sl: SwapSlot, sideId?: string) => {
    const to = sideId ? swapTargetOf(sideId)?.name : undefined;
    toast(to ? `${to} statt ${sl.ingredient.name}` : `Wieder ${sl.ingredient.name}`, { label: 'Rückgängig', run: setSwap(recipe.id, sl.ingredient.id, sideId) });
    setOpen(null);
  };
  // die Bausteine derselben Stufe – bei einer getauschten Zutat vorn „Original“
  const options = (sl: SwapSlot) => {
    const now = sl.current?.side;
    return (
      <div className="swap__opts" role="group" aria-label={`Statt ${sl.ingredient.name}`}>
        <span className="small muted swap__for">Statt {short(sl.ingredient.name)}:</span>
        {now && <button type="button" className="chip chip--sm" onClick={() => swap(sl, undefined)}>{short(sl.ingredient.name)} (Original)</button>}
        {sl.options.map((o) => (
          <button key={o.id} type="button" className={`chip chip--sm${now === o.id ? ' is-on' : ''}`} aria-pressed={now === o.id}
            onClick={() => now !== o.id && swap(sl, o.id)}>{o.name}</button>
        ))}
      </div>
    );
  };

  return (
    <div className="swaps" role="group" aria-label="Zutaten tauschen">
      {done.map((sl) => {
        const id = sl.ingredient.id;
        const now = swapTargetOf(sl.current!.side);
        const look = checks[id] ?? [];
        return (
          <div key={id} className="swap">
            <div className="swap__row">
              <span className="swap__name">
                <span className={`swap__dot${look.length ? ' swap__dot--look' : ''}`} aria-hidden="true" />
                <b>{now?.name ?? sl.current!.name}</b> statt {short(sl.ingredient.name)}
                <span className="visually-hidden">{look.length ? ' – kurz anschauen' : ' – passt'}</span>
              </span>
              <button type="button" className="link small" aria-expanded={open === id} onClick={() => toggle(id)}>
                <Icon name="shuffle" size={14} /> ändern
              </button>
            </div>
            {/* gelb: der Schritt gart anders, als der neue Baustein es kann – einmal ansehen, ggf. im Rezept anpassen */}
            {look.map((t) => (
              <p key={t} className="small swap__look">Kurz anschauen: „{t.length > 48 ? `${t.slice(0, 46).trimEnd()} …` : t}“ – {now?.name} gart sonst anders.</p>
            ))}
            {open === id && options(sl)}
          </div>
        );
      })}
      {idle.length > 0 && (
        <div className="swaps__idle">
          <span className="small muted swaps__label"><Icon name="shuffle" size={14} /> Tauschen</span>
          {idle.map((sl) => (
            <button key={sl.ingredient.id} type="button" className={`chip chip--sm${open === sl.ingredient.id ? ' is-on' : ''}`}
              aria-expanded={open === sl.ingredient.id} onClick={() => toggle(sl.ingredient.id)}>{short(sl.ingredient.name)}</button>
          ))}
        </div>
      )}
      {openIdle && options(openIdle)}
    </div>
  );
}
