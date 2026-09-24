import { useState } from 'react';
import { currentContent } from '../../domain/recipe';
import { isInCookbook } from '../../domain/status';
import { DEVICES } from '../../domain/catalog';
import { useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { RecipeCard } from '../components/RecipeCard';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { deviceIcon } from '../catalogIcons';
import { recipeCount } from '../format';

const QUICK_DEVICES = ['herd', 'airfryer', 'backofen', 'monsieur-cuisine'];

export function StartScreen() {
  const recipes = useRecipes().filter((r) => !r.archivedAt);
  const [q, setQ] = useState('');

  const recent = recipes
    .filter((r) => r.lastCookedAt && r.status !== 'ki_entwurf')
    .sort((a, b) => b.lastCookedAt!.localeCompare(a.lastCookedAt!))
    .slice(0, 8);
  const testing = recipes.filter((r) => r.status === 'zum_testen');
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
