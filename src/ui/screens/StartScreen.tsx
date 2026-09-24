import { useState } from 'react';
import { currentContent, totalMinutes } from '../../domain/recipe';
import { recipeOfTheDay } from '../../domain/recipeOfTheDay';
import { isInCookbook } from '../../domain/status';
import { DEVICES } from '../../domain/catalog';
import type { Recipe } from '../../domain/types';
import { addToPlan, usePlan, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeImage } from '../components/RecipeImage';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { deviceIcon } from '../catalogIcons';
import { formatMinutes, kcalLabel, portionCount, recipeCount } from '../format';
import { toast } from '../toast';
import { recipeNutrition } from '../useNutrition';

const QUICK_DEVICES = ['herd', 'airfryer', 'backofen', 'monsieur-cuisine'];

export function StartScreen() {
  const recipes = useRecipes().filter((r) => !r.archivedAt);
  const plan = usePlan();
  const [q, setQ] = useState('');

  const recent = recipes
    .filter((r) => r.lastCookedAt && r.status !== 'ki_entwurf')
    .sort((a, b) => b.lastCookedAt!.localeCompare(a.lastCookedAt!))
    .slice(0, 8);
  const testing = recipes.filter((r) => r.status === 'zum_testen');
  // Etwas geplant? → „Bereit zum Kochen“. Sonst ein „Rezept des Tages“ als Anstoß.
  const planned = plan.items
    .filter((i) => !plan.cooked.includes(i.recipeId)) // schon Gekochtes ist erledigt
    .map((i) => ({ recipe: recipes.find((r) => r.id === i.recipeId), servings: i.servings }))
    .filter((i): i is { recipe: Recipe; servings: number } => !!i.recipe);
  const daily = recipeOfTheDay(recipes);
  const countFor = (device: string) =>
    recipes.filter((r) => isInCookbook(r.status) && currentContent(r).devices.includes(device)).length;

  return (
    <main className="screen screen--tabbed">
      <header className="home-head">
        <h1 className="logo">Mashi</h1>
        <Icon name="heart" size={18} className="logo-heart" />
        <Icon name="sparkles" size={20} className="home-head__spark home-head__spark--a" />
        <Icon name="sparkles" size={14} className="home-head__spark home-head__spark--b" />
      </header>

      <p className="home-q">Was möchtest du heute kochen?</p>
      {planned.length > 0 ? <ReadyToCook items={planned} /> : daily && <DailyRecipe recipe={daily} />}
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/kochbuch?q=${encodeURIComponent(q)}`); }}>
        <Icon name="search" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rezepte, Zutaten, Tags …" aria-label="Rezepte suchen" enterKeyHint="search" />
      </form>

      <div className="quick-grid">
        {QUICK_DEVICES.map((id) => {
          const d = DEVICES.find((x) => x.id === id)!;
          return (
            <button key={id} className={`quick tint-${d.tint}`} onClick={() => navigate(`/kochbuch?device=${id}`)}>
              <Icon name={deviceIcon(id)} size={30} />
              <span>{d.label}</span>
              <small>{recipeCount(countFor(id))}</small>
            </button>
          );
        })}
      </div>
      <div className="chips chips--scroll">
        <button className="chip chip--lg" onClick={() => navigate('/kochbuch?maxMin=30')}><Icon name="clock" size={18} /> Unter 30 Min.</button>
        <button className="chip chip--lg" onClick={() => navigate('/kochbuch?protein=1')}><Icon name="drumstick" size={18} /> Proteinreich</button>
        <button className="chip chip--lg" onClick={() => navigate('/kochbuch?fav=1')}><Icon name="heart" size={18} /> Favoriten</button>
      </div>

      <Section title="Zuletzt gekocht" action={<button className="link" onClick={() => navigate('/kochbuch')}>Alle</button>}>
        {recent.length ? (
          <div className="carousel">{recent.map((r) => <RecipeCard key={r.id} recipe={r} wide />)}</div>
        ) : (
          <Empty icon="stove">Sobald du etwas kochst, findest du es hier wieder.</Empty>
        )}
      </Section>

      <Section title="Zum Testen" action={<button className="link" onClick={() => navigate('/testen')}>Alle</button>}>
        {testing.length ? (
          <div className="carousel">{testing.map((r) => <RecipeCard key={r.id} recipe={r} wide />)}</div>
        ) : (
          <Empty icon="flask">Nichts vorgemerkt. Lust auf eine neue Idee?</Empty>
        )}
      </Section>
    </main>
  );
}

/** Was im Wochenplan steht – Tippen öffnet das Rezept, ▶ startet gleich den Kochmodus mit den geplanten Portionen. */
function ReadyToCook({ items }: { items: { recipe: Recipe; servings: number }[] }) {
  return (
    <section className="today" aria-labelledby="today-title">
      <div className="row-between">
        <h2 className="today__title" id="today-title"><Icon name="calendar" size={18} /> Bereit zum Kochen</h2>
        <button className="link" onClick={() => navigate('/plan')}>Plan</button>
      </div>
      <ul className="list">
        {items.map(({ recipe, servings }) => {
          const c = currentContent(recipe);
          return (
            <li key={recipe.id} className="list__item">
              <button className="plan-list__hit" onClick={() => navigate(`/rezept/${recipe.id}`)}>
                <RecipeImage image={recipe.image} size="sm" />
                <span className="suggestion__text">
                  <span className="list__title">{c.title}</span>
                  <span className="small muted">{portionCount(servings)} · {formatMinutes(totalMinutes(c))}</span>
                </span>
              </button>
              <button className="today__cook" onClick={() => navigate(`/rezept/${recipe.id}/kochen?p=${servings}`)} aria-label={`${c.title} kochen`}>
                <Icon name="play" size={18} filled />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nichts geplant: ein Rezept aus dem Kochbuch als Anstoß – den ganzen Tag dasselbe. */
function DailyRecipe({ recipe }: { recipe: Recipe }) {
  const c = currentContent(recipe);
  const kcal = kcalLabel(recipeNutrition(recipe));
  return (
    <section className="today" aria-labelledby="daily-title">
      <h2 className="today__title" id="daily-title"><Icon name="sparkles" size={18} /> Rezept des Tages</h2>
      <div className="daily">
        <button className="daily__hit" onClick={() => navigate(`/rezept/${recipe.id}`)}>
          <RecipeImage image={recipe.image} size="sm" />
          <span className="suggestion__text">
            <span className="list__title">{c.title}</span>
            <span className="small muted">{[formatMinutes(totalMinutes(c)), kcal && `${kcal} pro Portion`].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        <div className="row-gap">
          <button className="btn btn--primary btn--sm" onClick={() => navigate(`/rezept/${recipe.id}/kochen?p=${c.servings}`)}>
            <Icon name="play" size={16} filled /> Kochen
          </button>
          <button className="btn btn--soft btn--sm" onClick={() => { addToPlan(recipe.id); toast('Eingeplant – steht jetzt unter „Bereit zum Kochen“'); }}>
            <Icon name="calendar" size={16} /> Einplanen
          </button>
        </div>
      </div>
    </section>
  );
}
