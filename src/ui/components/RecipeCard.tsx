import { deviceInfo } from '../../domain/catalog';
import { currentContent, totalMinutes } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import { toggleFavorite } from '../../data/store';
import { navigate } from '../../router';
import { formatMinutes, kcalLabel } from '../format';
import { recipeNutrition } from '../useNutrition';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';
import { StatusBadge } from './StatusBadge';

/** Bildorientierte Rezeptkarte: Bild, Titel, zwei kompakte Infozeilen, wenige Chips. */
export function RecipeCard({ recipe, wide = false }: { recipe: Recipe; wide?: boolean }) {
  const c = currentContent(recipe);
  const n = recipeNutrition(recipe);
  const kcal = kcalLabel(n);
  // Set: Tag „Airfryer“ und Gerät „Airfryer“ sollen nicht doppelt erscheinen
  const chips = [...new Set([...c.devices.map((d) => deviceInfo(d).label), ...c.tags])].slice(0, 2);

  return (
    <article className={`card${wide ? ' card--wide' : ''}`}>
      <button className="card__hit" onClick={() => navigate(`/rezept/${recipe.id}`)} aria-label={c.title} />
      <div className="card__media">
        <RecipeImage image={recipe.image} size="md" />
        {recipe.status !== 'kochbuch' && (
          <span className="card__status"><StatusBadge status={recipe.status} /></span>
        )}
        <button
          className={`card__fav${recipe.favorite ? ' is-on' : ''}`}
          onClick={() => toggleFavorite(recipe.id)}
          aria-label={recipe.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
          aria-pressed={recipe.favorite}
        >
          <Icon name="heart" size={16} filled={recipe.favorite} />
        </button>
      </div>
      <div className="card__body">
        <h3 className="card__title">{c.title}</h3>
        <p className="card__meta">
          <Icon name="clock" size={13} /> {formatMinutes(totalMinutes(c))}
          <span className="card__meta-sep" />
          <Icon name="users" size={13} /> {c.servings} Port.
        </p>
        {n.perServing && (
          <p className="card__meta">
            {kcal} · {Math.round(n.perServing.protein)} g Protein
          </p>
        )}
        {chips.length > 0 && (
          <div className="card__chips">
            {chips.map((t) => <span key={t} className="chip chip--xs">{t}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}
