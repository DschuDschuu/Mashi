import { categoryInfo } from '../../domain/catalog';
import { currentContent, totalMinutes } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import { toggleFavorite } from '../../data/store';
import { navigate } from '../../router';
import { formatMinutesShort, kcalLabel } from '../format';
import { recipeNutrition } from '../useNutrition';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';
import { StatusBadge } from './StatusBadge';

/** Bildorientierte Rezeptkarte: Bild, Titel, zwei kompakte Infozeilen, wenige Chips. */
export function RecipeCard({ recipe, wide = false }: { recipe: Recipe; wide?: boolean }) {
  const c = currentContent(recipe);
  const n = recipeNutrition(recipe);
  const kcal = kcalLabel(n);
  // Auf der Karte zählt, was für eine Mahlzeit es ist – genau eine. Geräte und Tags stehen im Rezept.
  const category = c.categories[0] ? categoryInfo(c.categories[0]) : undefined;

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
        {/* Unten verankert – auch leere Zeilen behalten ihre Höhe, damit nebeneinander nichts springt */}
        <div className="card__bottom">
          {/* links Zeit / kcal, rechts Portionen / Protein – so stehen die Werte in einer Reihe untereinander */}
          <p className="card__meta card__meta--split">
            <span><Icon name="clock" size={13} /> {formatMinutesShort(totalMinutes(c))}</span>
            <span><Icon name="users" size={13} /> {c.servings} Port.</span>
          </p>
          <p className="card__meta card__meta--split">
            {n.perServing ? <><span>{kcal}</span><span>{Math.round(n.perServing.protein)} g Protein</span></> : ' '}
          </p>
          <div className="card__chips">
            {category && <span className="chip chip--xs">{category.label}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
