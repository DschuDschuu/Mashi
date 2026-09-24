import { formatQuantity } from '../../domain/scaling';
import { stepIngredients } from '../../domain/stepIngredients';
import type { Ingredient, Step } from '../../domain/types';
import { useSettings } from '../settings';

/**
 * Die Zutaten eines Schritts, direkt über dem Schritttext.
 * `ingredients` sind die bereits auf die Portionszahl umgerechneten Zutaten.
 */
export function StepIngredients({ step, ingredients, large = false }: { step: Step; ingredients: Ingredient[]; large?: boolean }) {
  const { showStepIngredients } = useSettings();
  if (!showStepIngredients) return null;
  const list = stepIngredients(step, ingredients);
  if (!list.length) return null;
  return (
    <ul className={`step-ings${large ? ' step-ings--large' : ''}`} aria-label="Zutaten für diesen Schritt">
      {list.map((i) => (
        <li key={i.id}>
          {formatQuantity(i) && <strong>{formatQuantity(i)}</strong>} {i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()}
        </li>
      ))}
    </ul>
  );
}
