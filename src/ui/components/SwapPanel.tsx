import { useMemo, useState } from 'react';
import { activeChoice, forChoice } from '../../domain/choices';
import { guessKind, recipeChoices } from '../../domain/craving';
import { partOf, partsOf, REST } from '../../domain/parts';
import type { PartSwap } from '../../domain/partSwaps';
import { currentContent } from '../../domain/recipe';
import { sidesOfKind } from '../../domain/sides';
import { swapChecks, swapSlots, swapTargetOf, type SwapSlot } from '../../domain/swaps';
import type { Recipe } from '../../domain/types';
import { householdOf, setPartSwap, setSwap, usePlan, useRecipes } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/** eine Sauce zum Tauschen – `label` nur, wenn der Name allein nicht reicht („Sauce aus Testbowl“) */
type SauceOption = { swap: PartSwap; label: string };

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
  const recipes = useRecipes();
  const [open, setOpen] = useState<string | null>(null);
  // die Fassung ohne Tausch – sonst wäre der Tofu sein eigener Tauschplatz
  const base = forChoice(currentContent(recipe), activeChoice(recipe));
  const parted = recipe.partSwaps ?? {};
  // Zutaten eines getauschten Teils gibt es im Gericht nicht mehr – nichts davon zum Tauschen anbieten
  const slots = swapSlots(base, recipe.swaps, hh.customSides).filter((sl) => !parted[partOf(sl.ingredient)]);
  // die Ampel (Julia: „das Rezept checkt das“): Schritte, deren Garart der neue Baustein nicht kann
  const checks = swapChecks(base, recipe.swaps, hh.customSides);
  // ganze Teile tauschen (Julia: „Sauce als Teil tauschen“): Teile, die eine Sauce sind – markiert oder am Namen erkannt
  const sauceParts = partsOf(base).filter((p) => p !== REST && (recipe.blocks?.some((b) => b.part === p && (b.kind === 'sauce' || b.also?.includes('sauce'))) || guessKind(p) === 'sauce'));
  // wogegen: deine Saucen (ganze Rezepte und Teile, nicht aus diesem Rezept) und Mashis Sauce-Bausteine
  const sauces = useMemo((): SauceOption[] => {
    const own = recipeChoices(recipes).filter((c) => c.recipeId && c.recipeId !== recipe.id && (c.kind === 'sauce' || c.also?.includes('sauce')));
    const twice = (name: string) => own.filter((c) => c.name === name).length > 1;
    return [
      ...own.map((c) => ({ swap: { recipeId: c.recipeId!, ...(c.from ? { part: c.name } : {}), name: c.name }, label: c.from && twice(c.name) ? `${c.name} aus ${c.from}` : c.name })),
      ...sidesOfKind('sauce').map((x) => ({ swap: { side: x.id, name: x.name }, label: x.name })),
    ];
  }, [recipes, recipe.id]);
  if (!slots.length && !(sauceParts.length && sauces.length)) return null;
  const done = slots.filter((sl) => sl.current);
  const idle = slots.filter((sl) => !sl.current);
  const openIdle = idle.find((sl) => sl.ingredient.id === open);

  const toggle = (id: string) => setOpen(open === id ? null : id);
  const swap = (sl: SwapSlot, sideId?: string) => {
    const to = sideId ? swapTargetOf(sideId)?.name : undefined;
    toast(to ? `${to} statt ${sl.ingredient.name}` : `Wieder ${sl.ingredient.name}`, { label: 'Rückgängig', run: setSwap(recipe.id, sl.ingredient.id, sideId) });
    setOpen(null);
  };
  const swapPart = (part: string, to?: PartSwap) => {
    toast(to ? `${to.name} statt ${part}` : `Wieder ${part}`, { label: 'Rückgängig', run: setPartSwap(recipe.id, part, to) });
    setOpen(null);
  };
  const same = (a?: PartSwap, b?: PartSwap) => !!a && !!b && a.side === b.side && a.recipeId === b.recipeId && a.part === b.part;
  // deine Saucen und Mashis – beim getauschten Teil vorn „Original“
  const partOptions = (part: string) => {
    const now = parted[part];
    return (
      <div className="swap__opts" role="group" aria-label={`Statt ${part}`}>
        <span className="small muted swap__for">Statt {part}:</span>
        {now && <button type="button" className="chip chip--sm" onClick={() => swapPart(part)}>{part} (Original)</button>}
        {sauces.map(({ swap, label }) => (
          <button key={swap.side ?? `${swap.recipeId}:${swap.part ?? ''}`} type="button" className={`chip chip--sm${same(now, swap) ? ' is-on' : ''}`} aria-pressed={same(now, swap)}
            onClick={() => !same(now, swap) && swapPart(part, swap)}>{label}</button>
        ))}
      </div>
    );
  };
  const idleParts = sauces.length ? sauceParts.filter((p) => !parted[p]) : [];
  const openPart = open?.startsWith('teil:') ? open.slice(5) : undefined;

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
      {Object.entries(parted).filter(([p]) => sauceParts.includes(p)).map(([p, sw]) => (
        <div key={`teil:${p}`} className="swap">
          <div className="swap__row">
            <span className="swap__name"><span className="swap__dot" aria-hidden="true" /><b>{sw.name}</b> statt {p}</span>
            <button type="button" className="link small" aria-expanded={open === `teil:${p}`} onClick={() => toggle(`teil:${p}`)}>
              <Icon name="shuffle" size={14} /> ändern
            </button>
          </div>
          {open === `teil:${p}` && partOptions(p)}
        </div>
      ))}
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
      {(idle.length > 0 || idleParts.length > 0) && (
        <div className="swaps__idle">
          <span className="small muted swaps__label"><Icon name="shuffle" size={14} /> Tauschen</span>
          {/* ganze Sauce-Teile zuerst – sie ersetzen Zutaten und Schritte auf einmal */}
          {idleParts.map((p) => (
            <button key={`teil:${p}`} type="button" className={`chip chip--sm${open === `teil:${p}` ? ' is-on' : ''}`}
              aria-expanded={open === `teil:${p}`} onClick={() => toggle(`teil:${p}`)}>{p}</button>
          ))}
          {idle.map((sl) => (
            <button key={sl.ingredient.id} type="button" className={`chip chip--sm${open === sl.ingredient.id ? ' is-on' : ''}`}
              aria-expanded={open === sl.ingredient.id} onClick={() => toggle(sl.ingredient.id)}>{short(sl.ingredient.name)}</button>
          ))}
        </div>
      )}
      {openPart && !parted[openPart] && partOptions(openPart)}
      {openIdle && options(openIdle)}
    </div>
  );
}
