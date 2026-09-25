import { useEffect, useRef, useState } from 'react';
import { currentContent, totalMinutes } from '../../domain/recipe';
import { recipeOfTheDay } from '../../domain/recipeOfTheDay';
import type { Recipe } from '../../domain/types';
import { addToPlan, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { Empty } from '../components/Controls';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { formatMinutes, kcalLabel, portionCount } from '../format';
import { toast } from '../toast';
import { recipeNutrition } from '../useNutrition';
import { expiryLabel } from '../../domain/shelfLife';
import { openRecipeIdea, useUseUp } from '../useUseUp';

/**
 * Startseite: nur das, was heute ansteht. Geplantes als große Karten zum Wischen –
 * ist nichts (mehr) geplant, ein „Rezept des Tages“. Suche und Filter gibt es im Kochbuch.
 */
export function StartScreen() {
  const recipes = useRecipes().filter((r) => !r.archivedAt);
  const plan = usePlan();

  const planned = plan.items
    .filter((i) => !plan.cooked.includes(i.recipeId)) // schon Gekochtes ist erledigt
    .map((i) => ({ recipe: recipes.find((r) => r.id === i.recipeId), servings: i.servings }))
    .filter((i): i is { recipe: Recipe; servings: number } => !!i.recipe);
  const { expiring: all, usingUp, idea } = useUseUp();
  // Jeder Name nur einmal – die Liste ist nach Dringlichkeit sortiert, der dringendste Eintrag bleibt
  const expiring = all.filter((e, i) => all.findIndex((o) => o.item.name === e.item.name) === i);
  const daily = recipeOfTheDay(recipes, new Date(), new Set(usingUp.keys()));

  return (
    <main className="screen screen--tabbed">
      <header className="home-head">
        <h1 className="logo">Mashi</h1>
        <Icon name="heart" size={18} className="logo-heart" />
        <Icon name="sparkles" size={20} className="home-head__spark home-head__spark--a" />
        <Icon name="sparkles" size={14} className="home-head__spark home-head__spark--b" />
      </header>
      {expiring.length > 0 && (
        <button className="useup-banner" onClick={() => navigate('/speisekammer')}>
          <Icon name="clock" size={18} />
          <span>
            <strong>Bald verbrauchen:</strong>{' '}
            {expiring.slice(0, 3).map((e) => `${e.item.name} (${expiryLabel(e)})`).join(', ')}
            {expiring.length > 3 ? ` und ${expiring.length - 3} mehr` : ''}
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}
      {idea.length > 0 && (
        <button className="link useup-idea" onClick={() => openRecipeIdea(idea)}>
          <Icon name="sparkles" size={14} /> Kein Rezept braucht alles auf – passendes Rezept generieren
        </button>
      )}
      {planned.length > 0 ? (
        <section className="today" aria-labelledby="today-title">
          <div className="row-between">
            <h2 className="today__title" id="today-title"><Icon name="calendar" size={18} /> Bereit zum Kochen</h2>
            <button className="link" onClick={() => navigate('/plan')}>Plan</button>
          </div>
          <Swiper items={planned} />
        </section>
      ) : daily ? (
        <section className="today" aria-labelledby="today-title">
          {/* Die Frage passt nur, wenn noch nichts geplant ist – beim Plan steht die Antwort ja schon da */}
          <p className="home-q">Was möchtest du heute kochen?</p>
          <h2 className="today__title" id="today-title"><Icon name="sparkles" size={18} /> Rezept des Tages</h2>
          <BigCard recipe={daily} servings={currentContent(daily).servings} daily hint={usingUp.get(daily.id)} />
        </section>
      ) : (
        <Empty icon="book">
          Noch keine Rezepte im Kochbuch. Leg über ＋ eins an oder spiel eine Sicherung ein (Mehr → Sicherung).
        </Empty>
      )}
    </main>
  );
}

/** Geplante Gerichte nebeneinander – wischen, oder über die Punkte springen. */
function Swiper({ items }: { items: { recipe: Recipe; servings: number }[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  /** Abstand von einer Karte zur nächsten: Kartenbreite + Lücke (gap: 14px im CSS) */
  const step = () => ((track.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + 14;

  // Welche Karte ist gerade (überwiegend) zu sehen? Das meldet der Browser selbst –
  // zuverlässiger als Scroll-Ereignisse mitzurechnen.
  useEffect(() => {
    const el = track.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      // Nicht „isIntersecting“ – das gilt schon für einen schmalen Rand der Nachbarkarte
      for (const e of entries) if (e.intersectionRatio >= 0.6) setActive([...el.children].indexOf(e.target));
    }, { root: el, threshold: 0.6 });
    [...el.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [items.length]);
  // Direkt springen: „smooth“ bleibt mit dem Einrasten (scroll-snap) auf halbem Weg hängen
  const goTo = (i: number) => {
    track.current?.scrollTo({ left: i * step() });
    setActive(i); // nicht auf das Scroll-Ereignis verlassen – das meldet nicht jeder Browser beim Springen
  };

  return (
    <>
      <ul className={`swiper${items.length === 1 ? ' swiper--single' : ''}`} ref={track} aria-label="Geplante Gerichte">
        {items.map(({ recipe, servings }) => (
          <li key={recipe.id} className="swiper__slide">
            <BigCard recipe={recipe} servings={servings} />
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div className="swiper__dots" role="tablist" aria-label="Gericht wählen">
          {items.map(({ recipe }, i) => (
            <button key={recipe.id} role="tab" aria-selected={i === active} aria-label={currentContent(recipe).title}
              className={`swiper__dot${i === active ? ' is-on' : ''}`} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </>
  );
}

/** Großes Bild, darunter Titel, Eckdaten und „Kochen“. Tippen aufs Bild öffnet das Rezept. */
function BigCard({ recipe, servings, daily = false, hint }: { recipe: Recipe; servings: number; daily?: boolean; hint?: string[] }) {
  const c = currentContent(recipe);
  const kcal = kcalLabel(recipeNutrition(recipe));
  return (
    <article className="bigcard">
      <button className="bigcard__media" onClick={() => navigate(`/rezept/${recipe.id}`)} aria-label={`${c.title} öffnen`}>
        <RecipeImage image={recipe.image} size="lg" />
      </button>
      <div className="bigcard__body">
        <h3 className="bigcard__title">{c.title}</h3>
        {hint && hint.length > 0 && <p className="useup-hint">Braucht auf: {hint.join(', ')}</p>}
        <p className="small muted">
          {[portionCount(servings), formatMinutes(totalMinutes(c)), kcal && `${kcal} pro Portion`].filter(Boolean).join(' · ')}
        </p>
        <div className="row-gap">
          <button className="btn btn--primary btn--sm" onClick={() => navigate(`/rezept/${recipe.id}/kochen?p=${servings}`)}>
            <Icon name="play" size={16} filled /> Kochen
          </button>
          {daily && (
            <button className="btn btn--soft btn--sm" onClick={() => { addToPlan(recipe.id); toast('Eingeplant'); }}>
              <Icon name="calendar" size={16} /> Einplanen
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
