import { useState } from 'react';
import { currentContent } from '../../domain/recipe';
import type { Rating, Recipe } from '../../domain/types';
import { deleteRecipe, keepTrial, useRecipes } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * „Wie war's?“ für ein gekochtes Probiergericht (Julia: „ich brauch Zeit zwischen dem Kochen zum Essen für die
 * Bewertung“) – steht oben auf der Startseite, bis sie antwortet. Speichern = ins Kochbuch (ab 4 Sternen „Bewährt“).
 */
export function TrialAsk() {
  const recipes = useRecipes();
  const trial = recipes
    .filter((r) => r.trial && r.lastCookedAt && !r.archivedAt)
    .sort((a, b) => b.lastCookedAt!.localeCompare(a.lastCookedAt!))[0];
  return trial ? <TrialCard key={trial.id} recipe={trial} /> : null;
}

function TrialCard({ recipe }: { recipe: Recipe }) {
  const [rating, setRating] = useState<Rating | undefined>();
  const title = currentContent(recipe).title;
  return (
    <section className="trial-ask" aria-labelledby="trial-ask-title">
      <h2 className="trial-ask__title" id="trial-ask-title">Wie war „{title}“?</h2>
      <div className="trial-ask__stars" role="group" aria-label="Bewertung">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button key={n} type="button" className="iconbtn" aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`} aria-pressed={rating === n} onClick={() => setRating(n)}>
            <Icon name="star" size={26} filled={!!rating && n <= rating} />
          </button>
        ))}
      </div>
      <div className="trial-ask__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => toast(`„${title}“ im Kochbuch`, { label: 'Rückgängig', run: keepTrial(recipe.id, rating) })}>
          Als Rezept speichern
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => toast(`„${title}“ nicht gespeichert`, { label: 'Rückgängig', run: deleteRecipe(recipe.id) })}>
          Nicht speichern
        </button>
      </div>
    </section>
  );
}
