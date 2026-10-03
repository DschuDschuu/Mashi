import { addToPlan, setPlanVariants, toggleFavorite, usePlan } from '../../data/store';
import { currentContent } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import { navigate } from '../../router';
import { portionCount } from '../format';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Icon } from './Icon';
import { useMorePrompt } from './UseMoreSheet';
import { useVariantPrompt } from './VariantSheet';

/**
 * Lange auf eine Rezeptkarte drücken (Julia: am Handy schnell einplanen): ein kleines Blatt mit
 * „Zum Wochenplan“, „Favorit“ und „Kochmodus“ – dieselben Wege wie im Rezept (Sortenwahl, wenn nötig).
 */
export function RecipeQuickSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const ref = useSheet(onClose);
  const c = currentContent(recipe);
  const planned = usePlan().items.find((i) => i.recipeId === recipe.id);
  const prompt = useVariantPrompt();

  const more = useMorePrompt();

  const plan = () => prompt.ask(c, undefined, (pick) => more.ask(c, c.servings, (amounts) => {
    addToPlan(recipe.id, c.servings, pick, amounts);
    toast(`„${c.title}“ eingeplant: ${portionCount(c.servings)}`);
    onClose();
  }));
  const cook = () => {
    const servings = planned?.servings ?? c.servings;
    if (planned) {
      return prompt.ask(c, planned.variants, (pick) => {
        if (Object.keys(pick).length) setPlanVariants(recipe.id, pick);
        navigate(`/rezept/${recipe.id}/kochen?p=${servings}`);
      });
    }
    prompt.ask(c, undefined, (pick) => navigate(`/rezept/${recipe.id}/kochen?p=${servings}${Object.keys(pick).length ? `&s=${encodeURIComponent(JSON.stringify(pick))}` : ''}`));
  };

  return (
    <>
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet quick-sheet" role="dialog" aria-modal="true" aria-label={c.title} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{c.title}</h2>
        <div className="quick-sheet__actions">
          {planned ? (
            <button type="button" className="btn btn--soft btn--block" onClick={() => navigate('/plan')}>
              <Icon name="check" size={18} /> Im Wochenplan · {portionCount(planned.servings)} – ansehen
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--block" onClick={plan}>
              <Icon name="calendar" size={18} /> Zum Wochenplan ({portionCount(c.servings)})
            </button>
          )}
          <button type="button" className="btn btn--soft btn--block" onClick={() => { toggleFavorite(recipe.id); toast(recipe.favorite ? 'Aus den Favoriten genommen' : 'Zu den Favoriten'); onClose(); }}>
            <Icon name="heart" size={18} filled={!recipe.favorite} /> {recipe.favorite ? 'Aus den Favoriten' : 'Zu den Favoriten'}
          </button>
          <button type="button" className="btn btn--soft btn--block" onClick={cook}>
            <Icon name="play" size={18} filled /> Kochmodus starten
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
    {/* daneben, nicht darin – sonst schlösse ein Tipp neben die Sortenwahl auch dieses Blatt */}
    {prompt.sheet}
    {more.sheet}
    </>
  );
}
