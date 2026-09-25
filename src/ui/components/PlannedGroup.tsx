import type { DishReservation } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { quantityLabel } from '../format';
import { Icon } from './Icon';
import { TileSummary } from './TileSummary';

/**
 * Im Wochenplan unter den Gerichten: je Gericht, was es aus der Speisekammer reserviert.
 * Standardmäßig zu (außer man kommt aus der Speisekammer). Braucht ein Gericht etwas auf,
 * das bald weg muss: Uhr auf der Kachel und rot im Kopf der Gruppe.
 */
export function PlannedGroup({ dishes, urgent, open = false }: { dishes: DishReservation[]; urgent: Map<string, string[]>; open?: boolean }) {
  const recipes = useRecipes();
  const anyUrgent = dishes.some((d) => urgent.has(d.recipeId));
  return (
    <details className="panel fold planned" open={open}>
      <TileSummary icon="archive" title={`Aus der Speisekammer (${dishes.length})`} text="Schon reserviert – wird beim Kochen abgezogen"
        alert={anyUrgent ? 'Enthält etwas, das bald weg muss' : undefined} />
      <ul className="planned__list">
        {dishes.map((d) => {
          const r = recipes.find((x) => x.id === d.recipeId);
          if (!r) return null;
          const soon = urgent.get(d.recipeId);
          return (
            <li key={d.recipeId}>
              <button className="planned__dish" onClick={() => navigate(`/rezept/${d.recipeId}`)}>
                <span className="planned__head">
                  <strong>{currentContent(r).title}</strong>
                  {soon && (
                    <span className="planned__soon" title={`Braucht auf: ${soon.join(', ')}`}>
                      <Icon name="clock" size={13} /> Bald verbrauchen
                    </span>
                  )}
                </span>
                <span className="small muted">
                  {d.taken.map((t) => (t.amount !== undefined ? `${quantityLabel({ amount: t.amount, unit: t.item.unit })} ${t.item.name}` : t.item.name)).join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
