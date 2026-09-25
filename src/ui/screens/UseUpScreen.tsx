import { useMemo } from 'react';
import { resolveIngredient } from '../../domain/mealplan';
import { recipesFromPantry } from '../../domain/pantry';
import { expiryLabel } from '../../domain/shelfLife';
import { usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { PantryMatchList, RecipeIdeaPanel } from '../components/PantryMatches';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { useUseUp } from '../useUseUp';
import { quantityLabel } from './PantryScreen';

/**
 * „Reste verwerten“ – Ziel des Bald-verbrauchen-Banners auf der Startseite: was weg muss,
 * welche Rezepte das aufbrauchen, und sonst ein passendes Rezept generieren.
 * Nur Rezepte, die wirklich etwas davon aufbrauchen – alles andere steht in der Speisekammer.
 */
export function UseUpScreen() {
  const recipes = useRecipes();
  const plan = usePlan();
  const { expiring: all, keys, rest, table, idea } = useUseUp();
  // Jeder Name nur einmal – der dringendste Eintrag bleibt
  const expiring = all.filter((e, i) => all.findIndex((o) => o.item.name === e.item.name) === i);

  const matches = useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.recipeId));
    return recipesFromPantry(rest, recipes.filter((r) => !planned.has(r.id)), table, 8, keys).filter((m) => m.useUp.length > 0);
  }, [rest, keys, plan, recipes, table]);

  // Nicht mehr im Rest nach dem Wochenplan = ein geplantes Gericht braucht es schon auf
  const inPlan = (name: string, id: string) => {
    const key = resolveIngredient({ id, name }, 1, table)?.key;
    return !!key && !keys.has(key);
  };

  return (
    <main className="screen">
      <TopBar title="Reste verwerten" backTo="/" />
      {expiring.length === 0 ? (
        <Empty icon="check">Gerade muss nichts dringend weg.</Empty>
      ) : (
        <>
          <Section icon="clock" title="Bald verbrauchen">
            <ul className="pantry">
              {expiring.map((e) => (
                <li key={e.item.id} className="pantry__item">
                  <span className="pantry__hit">
                    {/* wie in der Speisekammer: links der Name, rechts Menge mit Datum darunter */}
                    <span className="pantry__name">
                      {e.item.name}
                      {e.daysLeft <= 1 && !e.item.frozenAt && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={14} /></span>}
                      {e.item.reduced && !e.item.frozenAt && <span className="badge tint-peach pantry__mhd">MHD</span>}
                    </span>
                    <span className="pantry__qty pantry__qty--stack">
                      {quantityLabel(e.item)}
                      <span className="pantry__shelf is-urgent">{expiryLabel(e)}{inPlan(e.item.name, e.item.id) ? ' · eingeplant' : ''}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <button className="link" onClick={() => navigate('/speisekammer')}>In der Speisekammer bearbeiten</button>
          </Section>

          {matches.length > 0 && (
            <Section icon="sparkles" title="Das braucht es auf">
              <PantryMatchList matches={matches} />
            </Section>
          )}
          {keys.size === 0 ? (
            <p className="muted small">Alles davon ist schon im Wochenplan verplant.</p>
          ) : matches.length === 0 && (
            <p className="muted small">Kein Rezept aus deinem Kochbuch braucht davon etwas auf.</p>
          )}
          <RecipeIdeaPanel idea={idea} />
        </>
      )}
    </main>
  );
}
