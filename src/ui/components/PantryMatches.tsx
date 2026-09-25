import type { PantryMatch } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { addToPlan, usePlan } from '../../data/store';
import { navigate } from '../../router';
import { toast } from '../toast';
import { openRecipeIdea } from '../useUseUp';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

/** Rezepte zur Speisekammer – „Braucht auf: …“, was da ist und was fehlt, mit „Plan“-Knopf. */
export function PantryMatchList({ matches }: { matches: PantryMatch[] }) {
  const plan = usePlan();
  return (
    <ul className="list">
      {matches.map((m) => {
        const inPlan = plan.items.some((i) => i.recipeId === m.recipe.id);
        return (
          <li key={m.recipe.id} className="list__item suggestion">
            <button className="plan-list__hit" onClick={() => navigate(`/rezept/${m.recipe.id}`)}>
              <RecipeImage image={m.recipe.image} size="sm" />
              <span className="suggestion__text">
                <span className="list__title">{currentContent(m.recipe).title}</span>
                <span className="small muted">
                  {m.useUp.length > 0 && <span className="useup-hint">Braucht auf: {m.useUp.join(', ')} · </span>}
                  {m.missing.length === 0 ? 'Alles da' : `${m.have.length} von ${m.have.length + m.missing.length} da · fehlt: ${m.missing.slice(0, 3).join(', ')}${m.missing.length > 3 ? ' …' : ''}`}
                </span>
              </span>
            </button>
            {!inPlan && (
              <button className="btn btn--soft btn--sm" onClick={() => { addToPlan(m.recipe.id); toast('Eingeplant'); }} aria-label={`${currentContent(m.recipe).title} einplanen`}>
                <Icon name="plus" size={16} /> Plan
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Braucht kein Rezept alle Reste zusammen auf → KI-Formular vorausgefüllt öffnen (erzeugt erst auf Tipp). */
export function RecipeIdeaPanel({ idea }: { idea: string[] }) {
  if (!idea.length) return null;
  return (
    <div className="panel useup-idea-panel">
      <p className="small">Kein Rezept braucht <strong>{idea.join(', ')}</strong> zusammen auf.</p>
      <button className="btn btn--soft btn--sm" onClick={() => openRecipeIdea(idea)}><Icon name="sparkles" size={16} /> Passendes Rezept generieren</button>
    </div>
  );
}
