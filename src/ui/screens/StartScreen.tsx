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
  const daily = recipeOfTheDay(recipes);

  return (
    <main className="screen screen--tabbed">
      <header className="home-head">
        <h1 className="logo">Mashi</h1>
        <Icon name="heart" size={18} className="logo-heart" />
        <Icon name="sparkles" size={20} className="home-head__spark home-head__spark--a" />
        <Icon name="sparkles" size={14} className="home-head__spark home-head__spark--b" />
      </header>
      <p className="home-q">Was möchtest du heute kochen?</p>

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
          <h2 className="today__title" id="today-title"><Icon name="sparkles" size={18} /> Rezept des Tages</h2>
          <BigCard recipe={daily} servings={currentContent(daily).servings} daily />
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
function BigCard({ recipe, servings, daily = false }: { recipe: Recipe; servings: number; daily?: boolean }) {
  const c = currentContent(recipe);
  const kcal = kcalLabel(recipeNutrition(recipe));
  return (
    <article className="bigcard">
      <button className="bigcard__media" onClick={() => navigate(`/rezept/${recipe.id}`)} aria-label={`${c.title} öffnen`}>
        <RecipeImage image={recipe.image} size="lg" />
      </button>
      <div className="bigcard__body">
        <h3 className="bigcard__title">{c.title}</h3>
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
