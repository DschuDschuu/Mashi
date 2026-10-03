import { useMemo, useState } from 'react';
import { leftoverSuggestions, pantryAfterPlan, type Leftover } from '../../domain/pantry';
import { packLabel } from '../../domain/pantryLabel';
import { formatUnitAmount, scaleIngredients } from '../../domain/scaling';
import { currentContent } from '../../domain/recipe';
import type { Ingredient, Recipe, RecipeContent } from '../../domain/types';
import { useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { useSheet } from '../useSheet';
import { Stepper } from './Controls';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** „läuft heute / morgen / übermorgen ab“ */
export function untilLabel(iso: string, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day(new Date(iso)) - day(now)) / 86400000);
  return n <= 0 ? 'läuft heute ab' : n === 1 ? 'läuft morgen ab' : 'läuft übermorgen ab';
}

/** Vorrats-Menge lesbar: „4 Stück“, „2 × 400 ml“, „800 g“ */
export function stockText(n: number, e: Pick<Leftover, 'itemUnit' | 'pack'>): string {
  return e.pack ? `${fmt(n)} × ${packLabel(e.pack)}` : `${fmt(n)} ${e.itemUnit}`;
}

/** Schrittweite des Zählers: Stück/Packungen ganz, Gramm in 10er- bzw. 50er-Schritten */
export const stepOf = (e: Pick<Leftover, 'itemUnit' | 'pack' | 'have'>) =>
  e.pack || e.itemUnit === 'Stück' || e.itemUnit === 'Glas' ? 1 : e.have >= 200 ? 50 : 10;

/**
 * „Paprika läuft morgen ab – wie viele verwendest du?“ (Julia) – und ebenso „2 Tomaten im Rezept, 3 da“.
 * Vorgeschlagen: alles; der Zähler geht von „wie im Rezept“ bis alles. Nur dieses Mal, das Rezept bleibt.
 * @param initial schon gewählte Mengen (im Wochenplan / Kochmodus ändern) – je Zutat-ID in der Einheit des Rezepts.
 *   Mengen anderer Zutaten (im Kochmodus von Hand geändert) bleiben beim Übernehmen und „Wie im Rezept“ erhalten.
 */
export function UseMoreSheet({ uses, initial = {}, onDone, onClose }: {
  uses: Leftover[]; initial?: Record<string, number>; onDone: (amounts: Record<string, number>) => void; onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const [count, setCount] = useState<Record<string, number>>(() => Object.fromEntries(uses.map((u) => [u.ingredientId,
    u.ingredientId in initial ? Math.min(u.have, Math.max(u.need, Math.round((initial[u.ingredientId] / u.perItem) * 10) / 10)) : u.have])));
  const others = Object.fromEntries(Object.entries(initial).filter(([id]) => !uses.some((u) => u.ingredientId === id)));
  const apply = () => onDone({ ...others, ...Object.fromEntries(uses
    .filter((u) => count[u.ingredientId] > u.need + 1e-6)
    .map((u) => [u.ingredientId, Math.round(count[u.ingredientId] * u.perItem * 100) / 100])) });
  const adjusting = uses.some((u) => u.ingredientId in initial);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet use-more" role="dialog" aria-modal="true" aria-label="Mehr davon verwenden" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{adjusting ? 'Wie viel verwendest du?' : uses.every((u) => u.until) ? 'Läuft bald ab – mehr davon verwenden?' : 'Reste mitverbrauchen?'}</h2>
        <p className="small muted">Nur für dieses Mal – das Rezept bleibt, wie es ist.</p>
        {uses.map((u) => {
          const step = stepOf(u);
          const min = Math.ceil(u.need / step - 1e-6) * step;
          const value = count[u.ingredientId];
          return (
            <div key={u.ingredientId} className="use-more__item">
              <div className="use-more__head">
                <strong>{u.name}</strong>
                {u.until && <span className="small use-more__until">{untilLabel(u.until)}</span>}
              </div>
              <p className="small muted">Im Rezept {formatUnitAmount(u.planned, u.unit)} · da {stockText(u.have, u)}</p>
              <div className="use-more__pick">
                <span className="small">Verwenden:</span>
                <Stepper small value={value} step={step} min={Math.min(min, u.have)} max={u.have} label={`${u.name}: wie viel verwenden`}
                  onChange={(v) => setCount({ ...count, [u.ingredientId]: Math.round(v * 10) / 10 })} />
                <span className="small">{u.pack ? `× ${packLabel(u.pack)}` : u.itemUnit}</span>
              </div>
            </div>
          );
        })}
        <div className="variants__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onDone(others)}>Wie im Rezept</button>
          <button type="button" className="btn btn--primary" onClick={apply}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Was ein geplantes Gericht mehr verwenden könnte – gegen die Speisekammer ohne das, was die ANDEREN geplanten
 * Gerichte brauchen (dieses selbst zählt nicht: seine Paprika sind ja die, um die es geht).
 */
export function usePlannedMore(recipe: Recipe | undefined, servings: number | undefined): { uses: Leftover[]; base: Ingredient[] } {
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const table = useFoodTable();
  return useMemo(() => {
    if (!recipe) return { uses: [], base: [] };
    const c = currentContent(recipe);
    const base = scaleIngredients(c, servings ?? c.servings);
    const others = { ...plan, items: plan.items.filter((i) => i.recipeId !== recipe.id) };
    return { uses: leftoverSuggestions(pantryAfterPlan(pantry, others, recipes, table), base, table), base };
  }, [recipe, servings, pantry, plan, recipes, table]);
}

/** „3 Paprika statt 1“ – die geänderten Mengen in einem Satz */
export function amountsText(amounts: Record<string, number>, base: Ingredient[]): string {
  return base.filter((i) => i.id in amounts && i.amount !== undefined)
    .map((i) => `${formatUnitAmount(amounts[i.id], i.unit)} ${i.name} statt ${formatUnitAmount(i.amount!, i.unit)}`).join(' · ');
}

/**
 * Vor „Zum Wochenplan“: läuft etwas aus dem Rezept bald ab, erst fragen – sonst gleich weiter.
 * (Gewöhnliche Reste fragt erst der Kochmodus.) Was andere geplante Gerichte schon brauchen, zählt nicht mit.
 */
export function useMorePrompt() {
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const table = useFoodTable();
  const [open, setOpen] = useState<{ uses: Leftover[]; then: (amounts: Record<string, number>) => void } | null>(null);
  const ask = (content: RecipeContent, servings: number, then: (amounts: Record<string, number>) => void) => {
    const rest = pantryAfterPlan(pantry, plan, recipes, table);
    const uses = leftoverSuggestions(rest, scaleIngredients(content, servings), table).filter((u) => u.until);
    if (!uses.length) return then({});
    setOpen({ uses, then });
  };
  const sheet = open && (
    <UseMoreSheet uses={open.uses} onClose={() => setOpen(null)} onDone={(amounts) => { setOpen(null); open.then(amounts); }} />
  );
  return { ask, sheet };
}
