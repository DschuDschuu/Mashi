import { currentContent, totalMinutes } from '../../domain/recipe';
import { keepsOf, transformsOf } from '../../domain/week';
import type { Recipe } from '../../domain/types';
import { setPrepInfo, usePantry } from '../../data/store';
import { specialDays } from '../../domain/shelfLife';
import { navigate } from '../../router';
import { formatMinutesShort } from '../format';
import { toast } from '../toast';
import { Stepper } from './Controls';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

/**
 * Vorkochen am Rezept (Julia: am Wochenende eine Grundlage kochen, unter der Woche daraus verschiedene Abendessen):
 * wie lange es gekocht hält, ob es sich einfrieren und mitnehmen lässt – und was man daraus macht.
 * Eine Verwandlung (Bolo-Wraps) zeigt nur „zum Mitnehmen“ – Haltbarkeit und Einfrieren hängen an der Grundlage.
 */
export function PrepPanel({ recipe, recipes }: { recipe: Recipe; recipes: readonly Recipe[] }) {
  const pantry = usePantry();
  const transform = !!recipe.fromBase;
  const fallback = specialDays('prepared', pantry.shelfDays);
  const keeps = keepsOf(recipe, fallback);
  const made = transform ? [] : transformsOf(recipe.id, recipes);
  const flip = (key: 'freezable' | 'togo', label: string) => {
    const on = !recipe[key];
    toast(on ? label : `Nicht mehr ${label.toLowerCase()}`, { label: 'Rückgängig', run: setPrepInfo(recipe.id, { [key]: on }) });
  };

  return (
    <section className="prep" aria-label="Vorkochen">
      <div className="prep__row">
        {!transform && (
          <span className="prep__keeps">
            <span className="small muted">Hält gekocht</span>
            <Stepper small value={keeps} min={1} max={14} label="Tage haltbar"
              onChange={(v) => toast(`Hält ${v} ${v === 1 ? 'Tag' : 'Tage'}`, { label: 'Rückgängig', run: setPrepInfo(recipe.id, { keepsDays: v === fallback ? undefined : v }) })} />
            <span className="small muted">Tage</span>
          </span>
        )}
        <span className="chips">
          {!transform && (
            <button type="button" className={`chip chip--sm${recipe.freezable ? ' is-on' : ''}`} aria-pressed={!!recipe.freezable} onClick={() => flip('freezable', 'Einfrierbar')}>
              <Icon name="snow" size={14} /> einfrierbar
            </button>
          )}
          <button type="button" className={`chip chip--sm${recipe.togo ? ' is-on' : ''}`} aria-pressed={!!recipe.togo} onClick={() => flip('togo', 'Zum Mitnehmen')}>
            <Icon name="bag" size={14} /> zum Mitnehmen
          </button>
        </span>
      </div>

      {!transform && (
        <div className="prep__made">
          <h2 className="h3">Daraus machen</h2>
          {made.length > 0
            ? (
              <ul className="prep__list">
                {made.map((r) => {
                  const c = currentContent(r);
                  return (
                    <li key={r.id}>
                      <button type="button" className="prep__item" onClick={() => navigate(`/rezept/${r.id}`)}>
                        <RecipeImage image={r.image} size="sm" />
                        <span className="prep__text">
                          <strong>{c.title}</strong>
                          <span className="small muted">
                            {formatMinutesShort(totalMinutes(c))}{r.togo ? ' · zum Mitnehmen' : ''}
                          </span>
                        </span>
                        <Icon name="chevron" size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
            : <p className="small muted">Was machst du daraus? Spaghetti, Wraps, Ofenkartoffel … – leg die Abendessen hier an, dann plant Mashi sie in der Woche.</p>}
          <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate(`/neu?aus=${recipe.id}`)}>
            <Icon name="plus" size={16} /> Verwandlung anlegen
          </button>
        </div>
      )}
    </section>
  );
}

/** Kopfzeile einer Verwandlung: „aus Bolognese“ – führt zur Grundlage */
export function FromBaseLink({ recipe, recipes }: { recipe: Recipe; recipes: readonly Recipe[] }) {
  const base = recipe.fromBase ? recipes.find((r) => r.id === recipe.fromBase) : undefined;
  if (!base) return null;
  return (
    <button type="button" className="link small from-base" onClick={() => navigate(`/rezept/${base.id}`)}>
      aus {currentContent(base).title}
    </button>
  );
}
