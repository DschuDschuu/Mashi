import { useState } from 'react';
import type { RecipeContent } from '../../domain/types';
import { assignPantrySorts, setPlanVariants } from '../../data/store';
import { gram } from '../format';
import { useVariants } from '../useNutrition';
import { Icon } from './Icon';
import { VariantSheet } from './VariantSheet';

/**
 * Nährwerte eines konkreten Gerichts (Plan-Karte, Kochmodus) – mit der Sorte, die du nimmst:
 * „620 kcal · 32 g Eiweiß pro Portion · mit Pesto (K-Classic)“.
 * Liegen mehrere Sorten im Vorrat und steht das Gericht im Plan, lässt sich die Sorte antippen und umwählen.
 */
export function DishNutrition({ content, own, recipeId, full = false, sorts = true, className = '' }: {
  content: RecipeContent;
  own: Record<string, string> | undefined;
  /** nur im Plan: dann ist die Sorte umwählbar und wird am Plan-Eintrag gemerkt */
  recipeId?: string;
  /** alle vier Werte (kcal · KH · Eiweiß · Fett) – wo Platz ist; der Plan bleibt einzeilig bei kcal und Eiweiß */
  full?: boolean;
  /** „mit Hähnchenhack · Bio“ zeigen – bei Vorgekochtem nicht (Julia: Platz; die Werte rechnen trotzdem damit) */
  sorts?: boolean;
  className?: string;
}) {
  const { choices, pick, n } = useVariants(content, own);
  const [choosing, setChoosing] = useState(false);
  if (!n.perServing) return null;
  const chosen = choices
    .map((c) => ({ c, name: c.options.find((o) => o.id === pick[c.ingredientId])?.name }))
    .filter((x): x is { c: typeof x.c; name: string } => !!x.name);
  const canChoose = !!recipeId && choices.some((c) => c.options.length > 1);
  const ca = n.accuracy === 'geschaetzt' ? 'ca. ' : '';
  return (
    <span className={`dishnut small ${className}`.trim()}>
      <span className={`dishnut__values${full ? ' dishnut__values--full' : ''}`} title="pro Portion">{full ? (
        // kcal links, die drei Makros rechtsbündig – eine Zeile, direkt unter „3 Portionen“ ist „pro Portion“ klar
        <><span>{ca}{Math.round(n.perServing.kcal)} kcal</span>
          <span className="dishnut__macros">{gram(n.perServing.carbs)} KH · {gram(n.perServing.protein)} Eiweiß · {gram(n.perServing.fat)} Fett</span></>
      ) : (
        <>{ca}{Math.round(n.perServing.kcal)} kcal · {gram(n.perServing.protein)} Eiweiß<span className="dishnut__per"> pro Portion</span></>
      )}</span>
      {sorts && chosen.length > 0 && (canChoose ? (
        <button type="button" className="dishnut__variant" onClick={() => setChoosing(true)} aria-label="Sorte wählen">
          <span className="dishnut__label">mit {chosen.map((x) => x.name).join(', ')}</span> <Icon name="chevron" size={12} />
        </button>
      ) : (
        <span className="muted dishnut__label">mit {chosen.map((x) => x.name).join(', ')}</span>
      ))}
      {choosing && recipeId && (
        <VariantSheet choices={choices} pick={pick} onClose={() => setChoosing(false)}
          onDone={(p) => { assignPantrySorts(choices.filter((c) => c.unsortedItemIds.length && p[c.ingredientId]).map((c) => ({ itemIds: c.unsortedItemIds, productId: p[c.ingredientId] }))); setPlanVariants(recipeId, p); setChoosing(false); }} />
      )}
    </span>
  );
}
