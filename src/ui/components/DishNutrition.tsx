import { useState } from 'react';
import type { RecipeContent } from '../../domain/types';
import { setPlanVariants } from '../../data/store';
import { gram } from '../format';
import { useVariants } from '../useNutrition';
import { Icon } from './Icon';
import { VariantSheet } from './VariantSheet';

/**
 * Nährwerte eines konkreten Gerichts (Plan-Karte, Kochmodus) – mit der Sorte, die du nimmst:
 * „620 kcal · 32 g Eiweiß pro Portion · mit Pesto (K-Classic)“.
 * Liegen mehrere Sorten im Vorrat und steht das Gericht im Plan, lässt sich die Sorte antippen und umwählen.
 */
export function DishNutrition({ content, own, recipeId, className = '' }: {
  content: RecipeContent;
  own: Record<string, string> | undefined;
  /** nur im Plan: dann ist die Sorte umwählbar und wird am Plan-Eintrag gemerkt */
  recipeId?: string;
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
      <span>{ca}{Math.round(n.perServing.kcal)} kcal · {gram(n.perServing.protein)} Eiweiß pro Portion</span>
      {chosen.length > 0 && (canChoose ? (
        <button type="button" className="dishnut__variant" onClick={() => setChoosing(true)} aria-label="Sorte wählen">
          mit {chosen.map((x) => x.name).join(', ')} <Icon name="chevron" size={12} />
        </button>
      ) : (
        <span className="muted">mit {chosen.map((x) => x.name).join(', ')}</span>
      ))}
      {choosing && recipeId && (
        <VariantSheet choices={choices} pick={pick} onClose={() => setChoosing(false)}
          onDone={(p) => { setPlanVariants(recipeId, p); setChoosing(false); }} />
      )}
    </span>
  );
}
