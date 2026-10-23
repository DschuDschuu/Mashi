import { currentContent } from '../../domain/recipe';
import { DAY_LONG, mealPortions, mealTitle, weekdayOf, weekView } from '../../domain/week';
import { sideGrams, sideOf } from '../../domain/sides';
import { formatAmount } from '../../domain/scaling';
import type { Week } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { specialDays } from '../../domain/shelfLife';
import { currentPlan, eatLunchBox, eatMeal, eatOutToday, householdOf, thawPantryItem, usePantry, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { toast } from '../toast';
import { Icon } from './Icon';
import { RecipeImage } from './RecipeImage';

const title = (r?: Recipe) => (r ? currentContent(r).title : 'Gelöschtes Rezept');

/**
 * Unter der Woche (Julia): was heute mittags und abends dran ist – aus dem Vorgekochten. Abends „Kochen“ (die
 * Grundlage steht fertig da) oder „Heute auswärts – auf morgen schieben“; dazu „morgen auftauen“ und
 * „für morgen Mittag abfüllen“, damit nichts vergessen wird.
 */
export function WeekToday({ week }: { week: Week }) {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const hh = householdOf(plan);
  const view = weekView(week, recipes, hh, specialDays('prepared', pantry.shelfDays));
  const today = weekdayOf(new Date());
  const i = view.order.indexOf(today);
  const d = view.days[i];
  const tomorrow = view.days[i + 1];
  const cookToday = view.bases.filter((b) => b.base.day === today && !b.base.cooked);
  const meal = d?.meal;
  const side = sideOf(meal?.meal.side);
  const lunch = d?.lunch;
  // nächster Kochtag mit noch Ungekochtem – auch über das Wochenende hinweg (die Woche hat keine Daten, nur Tage)
  const uncooked = view.bases.filter((b) => !b.base.cooked).map((b) => b.base.day);
  const nextCook = [...view.order.slice(i + 1), ...view.order.slice(0, i + 1)].find((x) => uncooked.includes(x) && x !== today);

  // morgen ein Gericht aus dem Gefrierfach → heute auftauen
  const thaw = tomorrow?.meal && !tomorrow.meal.meal.done && tomorrow.meal.frost
    ? pantry.items.find((x) => x.recipeId === tomorrow.meal!.meal.baseId && x.frozenAt && !x.part && (x.amount ?? 0) > 0)
    : undefined;
  const fillForLunch = meal && !meal.meal.done && tomorrow?.lunch?.kind === 'rest' && tomorrow.lunch.recipe.id === meal.meal.recipeId;

  return (
    <section className="week-today" aria-label="Heute aus der Woche">
      {cookToday.length > 0 && (
        <button type="button" className="week-today__cook" onClick={() => navigate(`/rezept/${cookToday[0].base.recipeId}/kochen?p=${cookToday[0].portions}&vorkochen=1`)}>
          <Icon name="play" size={18} />
          <span><strong>Heute ist Kochtag</strong>{cookToday.map((b) => `${title(b.recipe)}, ${b.portions} ${b.portions === 1 ? 'Portion' : 'Portionen'}`).join(' · ')}</span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      {lunch && lunch.kind !== 'none' && (
        <div className="week-today__lunch">
          <RecipeImage image={lunch.recipe.image} size="sm" />
          <span className="week-today__text">
            <small>Heute Mittag</small>
            <strong>{lunch.kind === 'rest' ? mealTitle(lunch, lunch.recipe) : title(lunch.recipe)}</strong>
            <small>{lunch.kind === 'rest' ? 'Rest von gestern Abend' : lunch.frost ? 'aus dem Gefrierfach' : 'Box aus dem Kühlschrank'}</small>
          </span>
          {lunch.kind === 'box' && !(week.doneLunch ?? []).includes(today) && (
            <button type="button" className="btn btn--soft btn--sm" onClick={() => {
              const r = eatLunchBox(today);
              if (r) toast('Mittagessen gegessen', { label: 'Rückgängig', run: r.undo });
            }}>Gegessen</button>
          )}
        </div>
      )}

      {meal && !meal.meal.done ? (
        <div className="week-today__dinner">
          <h2 className="today__title"><Icon name="cloche" size={18} /> Heute Abend</h2>
          <article className="bigcard">
            <button type="button" className="bigcard__media" onClick={() => navigate(`/rezept/${meal.meal.recipeId}`)} aria-label={mealTitle(meal.meal, meal.recipe)}>
              <RecipeImage image={meal.recipe?.image} size="lg" />
              <span className={`week-today__badge tag ${meal.frost ? 'tag--frost' : 'tag--eat'}`}>
                {meal.age === 0 ? 'frisch vom Kochtag' : meal.frost ? 'aufgetaut' : `${title(recipes.find((r) => r.id === meal.meal.baseId))} ist fertig`}
              </span>
            </button>
            <div className="bigcard__body">
              <h3 className="bigcard__title">{mealTitle(meal.meal, meal.recipe)}</h3>
              <p className="small muted">
                {meal.meal.recipeId !== meal.meal.baseId ? `${title(recipes.find((r) => r.id === meal.meal.baseId))} aus dem ${meal.frost ? 'Gefrierfach' : 'Kühlschrank'} + frisch dazu`
                  : side ? `Aufwärmen · ${formatAmount(sideGrams(side.id, hh) * mealPortions(view, today, hh))} g ${side.name} dazu`
                    : 'Nur aufwärmen'}
              </p>
              <div className="week-today__actions">
                {meal.meal.recipeId === meal.meal.baseId
                  ? (
                    <button type="button" className="btn btn--primary" onClick={() => {
                      const r = eatMeal(meal.meal.id);
                      if (r) toast('Guten Appetit!', { label: 'Rückgängig', run: r.undo });
                    }}><Icon name="check" size={18} /> Gegessen</button>
                  )
                  : (
                    <button type="button" className="btn btn--primary" onClick={() => navigate(`/rezept/${meal.meal.recipeId}/kochen?p=${mealPortions(view, today, hh)}&meal=${meal.meal.id}`)}>
                      <Icon name="play" size={18} /> Kochen
                    </button>
                  )}
                <button type="button" className="btn btn--ghost" onClick={() => {
                  const r = eatOutToday(today);
                  if (!r) return toast('Kein freier Abend mehr in dieser Woche – tausch es im Plan.');
                  // nach dem Verschieben: wird es dadurch zu alt, gleich sagen
                  const moved = currentPlan().week;
                  const frost = moved && weekView(moved, recipes, hh).days.find((x) => x.day === r.to)?.meal?.frost;
                  toast(`Heute auswärts – ${mealTitle(meal.meal, meal.recipe)} auf ${DAY_LONG[r.to]} geschoben${frost ? ', bis dahin einfrieren' : ''}`, { label: 'Rückgängig', run: r.undo });
                }}>Heute auswärts</button>
              </div>
            </div>
          </article>
          {fillForLunch && <p className="week-today__hint"><Icon name="bag" size={16} /> Eine Portion gleich für morgen Mittag abfüllen.</p>}
        </div>
      ) : meal?.meal.done ? (
        <p className="week-today__done"><Icon name="check" size={16} /> Heute Abend: {mealTitle(meal.meal, meal.recipe)} – gegessen</p>
      ) : (
        <p className="small muted">Heute Abend ist nichts aus der Woche geplant{nextCook !== undefined ? ` – nächster Kochtag: ${DAY_LONG[nextCook]}` : ''}.</p>
      )}

      {thaw && (
        <div className="week-today__hint">
          <Icon name="snow" size={16} />
          <span>Für morgen ({mealTitle(tomorrow!.meal!.meal, tomorrow!.meal!.recipe)}): eine Portion {title(recipes.find((r) => r.id === tomorrow!.meal!.meal.baseId))} aus dem Gefrierfach nehmen.</span>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => toast('Zum Auftauen in den Kühlschrank', { label: 'Rückgängig', run: thawPantryItem(thaw.id, mealPortions(view, tomorrow!.day, hh)) })}>Auftauen</button>
        </div>
      )}
    </section>
  );
}
