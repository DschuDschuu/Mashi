import { currentContent } from '../../domain/recipe';
import { DAY_LONG, carbCarry, mealTitle, servingsOf, weekdayOf, weekView, type MealView } from '../../domain/week';
import { cookStart } from '../../domain/cookDay';
import { sideGrams, sidesOf } from '../../domain/sides';
import { ComboSteps } from './ComboSteps';
import { formatAmount } from '../../domain/scaling';
import type { Week } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { specialDays } from '../../domain/shelfLife';
import { currentPlan, eatMeal, eatOutToday, householdOf, thawPantryItem, usePantry, usePlan, useRecipes } from '../../data/store';
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
  // Kochtag verpasst (nicht als vorgekocht markiert): ein Gericht mit frischen Zutaten trotzdem kochen – wie bisher.
  // Schon mitgekocht: nur noch „Gegessen“
  const go = meal && (cookStart(view, meal, hh)
    ?? (meal.meal.recipeId !== meal.meal.baseId && !meal.meal.freshCooked ? { prep: false as const, recipeId: meal.meal.recipeId, mealId: meal.meal.id, portions: servingsOf(meal.meal, hh) } : undefined));
  const sides = sidesOf(meal?.meal.side);
  const carry = carbCarry(view, hh).get(today);
  const lunch = d?.lunch;
  // nächster Kochtag mit noch Ungekochtem – auch über das Wochenende hinweg (die Woche hat keine Daten, nur Tage)
  const uncooked = view.bases.filter((b) => !b.base.cooked).map((b) => b.base.day);
  const nextCook = [...view.order.slice(i + 1), ...view.order.slice(0, i + 1)].find((x) => uncooked.includes(x) && x !== today);

  // morgen etwas aus dem Gefrierfach (mittags oder abends) → heute auftauen
  const frozenTomorrow: MealView | undefined = [tomorrow?.lunch, tomorrow?.meal].find((m) => m && !m.meal.done && m.frost);
  const thaw = frozenTomorrow
    ? pantry.items.find((x) => x.recipeId === frozenTomorrow.meal.baseId && x.frozenAt && !x.part && (x.amount ?? 0) > 0)
    : undefined;
  // morgen mittags dasselbe wie heute Abend → gleich abfüllen
  const fillForLunch = meal && !meal.meal.done && tomorrow?.lunch && !tomorrow.lunch.meal.done && tomorrow.lunch.meal.recipeId === meal.meal.recipeId;

  return (
    <section className="week-today" aria-label="Heute aus der Woche">
      {cookToday.length > 0 && (
        <button type="button" className="week-today__cook" onClick={() => navigate(`/rezept/${cookToday[0].base.recipeId}/kochen?p=${cookToday[0].portions}&vorkochen=1`)}>
          <Icon name="play" size={18} />
          <span><strong>Heute ist Kochtag</strong>{cookToday.map((b) => `${title(b.recipe)}, ${b.portions} ${b.portions === 1 ? 'Portion' : 'Portionen'}`).join(' · ')}</span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      {/* der Mittag ist ein Essen wie der Abend (Julia) – „Gegessen“ zieht wie abends aus dem Vorgekochten ab */}
      {lunch && !lunch.meal.done && (
        <div className="week-today__lunch">
          <RecipeImage image={lunch.recipe?.image} size="sm" />
          <span className="week-today__text">
            <small>Heute Mittag</small>
            <strong>{mealTitle(lunch.meal, lunch.recipe)}</strong>
            <small>{lunch.meal.freshCooked ? 'schon mitgekocht' : lunch.frost ? 'aus dem Gefrierfach' : lunch.meal.recipeId === lunch.meal.baseId ? 'aufwärmen' : `${title(recipes.find((r) => r.id === lunch.meal.baseId))} aus dem Kühlschrank`}</small>
          </span>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => {
            const r = eatMeal(lunch.meal.id);
            if (r) toast('Mittagessen gegessen', { label: 'Rückgängig', run: r.undo });
          }}>Gegessen</button>
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
                {meal.meal.freshCooked ? 'Schon mitgekocht – nur aufwärmen'
                  : meal.meal.recipeId !== meal.meal.baseId ? `${title(recipes.find((r) => r.id === meal.meal.baseId))} aus dem ${meal.frost ? 'Gefrierfach' : 'Kühlschrank'} + frisch dazu`
                  : sides.length ? `Aufwärmen · ${sides.map((x) => {
                    // zweimal Nudeln: heute gleich mitkochen bzw. von gestern aufwärmen (week.ts: carbCarry)
                    if (carry?.side === x.id && carry.from !== undefined) return `${x.name} von ${DAY_LONG[carry.from]}`;
                    const n = servingsOf(meal.meal, hh) + (carry?.side === x.id ? carry.portions ?? 0 : 0);
                    return `${formatAmount(sideGrams(x.id, hh) * n)} ${x.unit === 'Stück' ? '×' : 'g'} ${x.name}${carry?.side === x.id && carry.with !== undefined ? ` (mit für ${DAY_LONG[carry.with]})` : ''}`;
                  }).join(', ')} dazu`
                    : 'Nur aufwärmen'}
              </p>
              {/* Baukasten-Abend: so geht's (Julia) – das Längste zuerst */}
              {meal.meal.recipeId === meal.meal.baseId && sides.length > 0 && meal.recipe && <ComboSteps side={meal.meal.side!} base={meal.recipe} household={hh} carry={carry} />}
              <div className="week-today__actions">
                {/* am Kochtag, noch nicht vorgekocht: Vorkochen und das Essen in einem Durchgang (Julia) */}
                {go
                  ? (
                    <button type="button" className="btn btn--primary" onClick={() => navigate(go.prep ? `/rezept/${go.baseId}/kochen?p=${go.portions}&vorkochen=1` : `/rezept/${go.recipeId}/kochen?p=${go.portions}&meal=${go.mealId}`)}>
                      <Icon name="play" size={18} /> Kochen
                    </button>
                  )
                  : (
                    <button type="button" className="btn btn--primary" onClick={() => {
                      const r = eatMeal(meal.meal.id);
                      if (r) toast('Guten Appetit!', { label: 'Rückgängig', run: r.undo });
                    }}><Icon name="check" size={18} /> Gegessen</button>
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
      ) : meal?.meal.done ? null /* gegessen = erledigt, nicht mehr auf der Startseite (Julia) */ : (
        <p className="small muted">Heute Abend ist nichts aus der Woche geplant{nextCook !== undefined ? ` – nächster Kochtag: ${DAY_LONG[nextCook]}` : ''}.</p>
      )}

      {thaw && (
        <div className="week-today__hint">
          <Icon name="snow" size={16} />
          <span>Für morgen {frozenTomorrow!.meal.lunch ? 'Mittag' : 'Abend'} ({mealTitle(frozenTomorrow!.meal, frozenTomorrow!.recipe)}): eine Portion {title(recipes.find((r) => r.id === frozenTomorrow!.meal.baseId))} aus dem Gefrierfach nehmen.</span>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => toast('Zum Auftauen in den Kühlschrank', { label: 'Rückgängig', run: thawPantryItem(thaw.id, servingsOf(frozenTomorrow!.meal, hh)) })}>Auftauen</button>
        </div>
      )}
    </section>
  );
}
