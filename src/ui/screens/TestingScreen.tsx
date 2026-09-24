import { useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';
import { TopBar } from '../components/TopBar';

/**
 * Die „Werkbank“: alles, was noch nicht (endgültig) im Kochbuch ist.
 * Reihenfolge = Lebenszyklus: Idee → Testen → Bewährt.
 */
export function TestingScreen() {
  const recipes = useRecipes().filter((r) => !r.archivedAt);
  const ideas = recipes.filter((r) => r.status === 'ki_entwurf');
  const testing = recipes.filter((r) => r.status === 'zum_testen');
  const proven = recipes.filter((r) => r.status === 'bewaehrt');

  return (
    <main className="screen">
      <TopBar title="Zum Testen" backTo="/" />
      <p className="muted lead">Eine Idee ist noch kein Rezept. Erst wenn du es gekocht hast und es dir schmeckt, kommt es ins Kochbuch.</p>

      <button className="cta-card tint-mint" onClick={() => navigate('/neu/ki')}>
        <Icon name="sparkles" size={26} />
        <span>
          <strong>Neue Idee mit KI</strong>
          <small>Zutaten rein, Rezeptidee raus.</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>

      <Section icon="flask" title={`Bereit zum Testen (${testing.length})`}>
        {testing.length ? <div className="grid">{testing.map((r) => <RecipeCard key={r.id} recipe={r} />)}</div> : <Empty icon="flask">Nichts vorgemerkt.</Empty>}
      </Section>

      {ideas.length > 0 && (
        <Section icon="sparkles" title={`Neue KI-Ideen (${ideas.length})`}>
          <p className="muted small">Noch nicht vorgemerkt – schau sie dir an und entscheide selbst.</p>
          <div className="grid">{ideas.map((r) => <RecipeCard key={r.id} recipe={r} />)}</div>
        </Section>
      )}

      {proven.length > 0 && (
        <Section icon="heart" title={`Bewährt – fast im Kochbuch (${proven.length})`}>
          <div className="grid">{proven.map((r) => <RecipeCard key={r.id} recipe={r} />)}</div>
        </Section>
      )}
    </main>
  );
}
