import { useMemo, useState } from 'react';
import { variantTargets } from '../../domain/craving';
import { currentContent } from '../../domain/recipe';
import type { Rating, Recipe } from '../../domain/types';
import { deleteRecipe, keepTrial, trialAsChoice, useRecipes } from '../../data/store';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

/**
 * „Wie war's?“ für ein gekochtes Probiergericht (Julia: „ich brauch Zeit zwischen dem Kochen zum Essen für die
 * Bewertung“) – steht oben auf der Startseite, bis sie antwortet. Speichern = ins Kochbuch (ab 4 Sternen „Bewährt“),
 * als Variante in ein bestehendes Rezept oder nicht speichern.
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
  const [asChoice, setAsChoice] = useState(false);
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
        <button type="button" className="btn btn--soft btn--sm" onClick={() => setAsChoice(true)}>Als Variante …</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => toast(`„${title}“ nicht gespeichert`, { label: 'Rückgängig', run: deleteRecipe(recipe.id) })}>
          Nicht speichern
        </button>
      </div>
      {asChoice && <ChoiceSheet trial={recipe} rating={rating} onClose={() => setAsChoice(false)} />}
    </section>
  );
}

const norm = (t: string) => t.toLowerCase().trim();

/**
 * Als Variante eines Rezepts speichern (Julia: „Pasta Bolognese – Original | mit Spätzle & Joghurt-Dip“): oben die
 * passenden Rezepte, darunter suchen; der Name ist vorgeschlagen und änderbar. Antippen eines Rezepts speichert.
 */
function ChoiceSheet({ trial, rating, onClose }: { trial: Recipe; rating?: Rating; onClose: () => void }) {
  const ref = useSheet(onClose);
  const recipes = useRecipes();
  const [name, setName] = useState(() => currentContent(trial).title);
  const [q, setQ] = useState('');
  const suggested = useMemo(() => variantTargets(trial, recipes), [trial, recipes]);
  const found = useMemo(() => (q.trim()
    ? recipes.filter((r) => r.id !== trial.id && !r.trial && !r.archivedAt && norm(currentContent(r).title).includes(norm(q))).slice(0, 30)
    : suggested), [q, recipes, suggested, trial.id]);
  const save = (target: Recipe) => {
    const to = currentContent(target).title;
    const undo = trialAsChoice(trial.id, target.id, name, rating);
    onClose();
    toast(`Als Variante in „${to}“ gespeichert`, { label: 'Rückgängig', run: undo });
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Als Variante speichern" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Als Variante speichern</h2>
        <div className="stack">
          <label className="field">
            Name der Variante
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} enterKeyHint="done" />
          </label>
          <label className="field">
            Zu welchem Rezept?
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rezept suchen" enterKeyHint="search" />
          </label>
          {!q.trim() && suggested.length > 0 && <p className="small muted">Passt vielleicht:</p>}
          {found.length
            ? (
              <ul className="prep__list">
                {found.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="prep__item" onClick={() => save(r)}>
                      <RecipeImage image={r.image} size="sm" />
                      <span className="prep__text"><strong>{currentContent(r).title}</strong></span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )
            : <p className="small muted">{q.trim() ? 'Kein Rezept gefunden.' : 'Tipp den Namen des Rezepts ein.'}</p>}
        </div>
      </div>
    </div>
  );
}
