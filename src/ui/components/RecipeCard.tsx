import { categoryInfo } from '../../domain/catalog';
import { currentContent, totalMinutes } from '../../domain/recipe';
import type { Recipe } from '../../domain/types';
import { toggleFavorite, usePlan } from '../../data/store';
import { useRef, useState } from 'react';
import { RecipeQuickSheet } from './RecipeQuickSheet';
import { navigate } from '../../router';
import { euro, formatMinutesShort, kcalLabel } from '../format';
import { useRecipeCost } from '../useCosts';
import { recipeNutrition } from '../useNutrition';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';
import { StatusBadge } from './StatusBadge';

/** Bildorientierte Rezeptkarte: Bild, Titel, zwei kompakte Infozeilen, wenige Chips. */
export function RecipeCard({ recipe, wide = false }: { recipe: Recipe; wide?: boolean }) {
  const c = currentContent(recipe);
  const planned = usePlan().items.some((i) => i.recipeId === recipe.id);
  // lange drücken → kleines Menü (Julia: am Handy schnell einplanen); rechte Maustaste / Android-Langdruck ebenso
  const [menu, setMenu] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longDone = useRef(false);
  const cancel = () => { window.clearTimeout(timer.current); start.current = null; };
  const open = () => { cancel(); longDone.current = true; setMenu(true); navigator.vibrate?.(10); };
  const n = recipeNutrition(recipe);
  const kcal = kcalLabel(n);
  // Preis pro Portion statt Portionen (Julia: die stellt man im Rezept ohnehin ein) – nur, wenn alle Preise bekannt sind
  const known = useRecipeCost(c, c.servings);
  const cost = known && !known.missing.length ? known : null;
  // Auf der Karte zählt, was für eine Mahlzeit es ist – genau eine. Geräte und Tags stehen im Rezept.
  const category = c.categories[0] ? categoryInfo(c.categories[0]) : undefined;

  return (
    <article className={`card${wide ? ' card--wide' : ''}`}>
      <button className="card__hit" aria-label={c.title} aria-haspopup="dialog"
        onClick={(e) => { if (longDone.current) { e.preventDefault(); longDone.current = false; return; } navigate(`/rezept/${recipe.id}`); }}
        onContextMenu={(e) => { e.preventDefault(); open(); }}
        onPointerDown={(e) => { longDone.current = false; start.current = { x: e.clientX, y: e.clientY }; timer.current = window.setTimeout(open, 500); }}
        // beim Scrollen (Finger bewegt sich) kein Menü
        onPointerMove={(e) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel(); }}
        onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} />
      {menu && <RecipeQuickSheet recipe={recipe} onClose={() => setMenu(false)} />}
      <div className="card__media">
        <RecipeImage image={recipe.image} size="md" />
        {/* schon eingeplant (Julia) – oben links, der Status steht unten */}
        {planned && <span className="card__planned"><Icon name="calendar" size={12} /> Im Wochenplan</span>}
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
          {/* links Zeit / kcal, rechts Preis pro Portion / Eiweiß – so stehen die Werte in einer Reihe untereinander */}
          <p className="card__meta card__meta--split">
            <span><Icon name="clock" size={13} /> {formatMinutesShort(totalMinutes(c))}</span>
            <span aria-label={cost ? `ungefähr ${euro(cost.perServing)} pro Portion` : undefined}>
              {cost ? <>ca. {euro(cost.perServing)}</> : ' '}
            </span>
          </p>
          <p className="card__meta card__meta--split">
            {n.perServing ? <><span>{kcal}</span><span>{Math.round(n.perServing.protein)} g Eiweiß</span></> : ' '}
          </p>
          <div className="card__chips">
            {category && <span className="chip chip--xs">{category.label}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
