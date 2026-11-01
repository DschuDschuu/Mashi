import { useState } from 'react';
import { activeChoice, forChoice } from '../../domain/choices';
import { currentContent } from '../../domain/recipe';
import { sideOf } from '../../domain/sides';
import { swapSlots } from '../../domain/swaps';
import type { Recipe } from '../../domain/types';
import { householdOf, setSwap, usePlan } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * Zutaten tauschen (Julia: „im Rezept Dinge austauschen, aber die Kochschritte bleiben“, swaps.ts): jede Zutat, die ein
 * Baustein ist, bekommt „tauschen“ – die Bausteine derselben Stufe zur Wahl, „Original“ zurück. Gilt fürs Rezept, bis du
 * zurücktauschst; Zutaten, Schritte, Nährwerte, Einkauf und Kochmodus rechnen mit. Mit Rückgängig wie die Variante.
 */
export function SwapPanel({ recipe }: { recipe: Recipe }) {
  const hh = householdOf(usePlan());
  const [open, setOpen] = useState<string | null>(null);
  // die Fassung ohne Tausch – sonst wäre der Tofu sein eigener Tauschplatz
  const slots = swapSlots(forChoice(currentContent(recipe), activeChoice(recipe)), recipe.swaps, hh.customSides);
  if (!slots.length) return null;
  return (
    <div className="swaps" role="group" aria-label="Zutaten tauschen">
      {slots.map((sl) => {
        const id = sl.ingredient.id;
        const now = sl.current ? sideOf(sl.current.side) : undefined;
        const isOpen = open === id;
        const swap = (sideId?: string) => {
          const to = sideId ? sideOf(sideId)?.name : undefined;
          toast(to ? `${to} statt ${sl.ingredient.name}` : `Wieder ${sl.ingredient.name}`, { label: 'Rückgängig', run: setSwap(recipe.id, id, sideId) });
          setOpen(null);
        };
        return (
          <div key={id} className="swap">
            <div className="swap__row">
              <span className="swap__name">{now ? <><b>{now.name}</b> statt {sl.ingredient.name}</> : sl.ingredient.name}</span>
              <button type="button" className="link small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
                <Icon name="shuffle" size={14} /> {now ? 'ändern' : 'tauschen'}
              </button>
            </div>
            {isOpen && (
              <div className="swap__opts" role="group" aria-label={`Statt ${sl.ingredient.name}`}>
                {now && <button type="button" className="chip chip--sm" onClick={() => swap(undefined)}>{sl.ingredient.name} (Original)</button>}
                {sl.options.map((o) => (
                  <button key={o.id} type="button" className={`chip chip--sm${now?.id === o.id ? ' is-on' : ''}`} aria-pressed={now?.id === o.id}
                    onClick={() => now?.id !== o.id && swap(o.id)}>{o.name}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
