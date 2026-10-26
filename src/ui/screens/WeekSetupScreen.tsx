import { useMemo, useState } from 'react';
import { currentContent } from '../../domain/recipe';
import { keepsOf, potOf, potWeek, transformCounts, weekStarted, type PotItem } from '../../domain/week';
import type { Recipe } from '../../domain/types';
import { householdOf, setWeek, usePantry, usePlan, useRecipes } from '../../data/store';
import { specialDays } from '../../domain/shelfLife';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { toast } from '../toast';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';

/** Als Grundlage taugt alles, was im Kochbuch steht – außer Verwandlungen (die hängen an ihrer Grundlage) */
const baseCandidate = (r: Recipe) => !r.archivedAt && !r.fromBase && !r.trial && r.status !== 'ki_entwurf';
const EVENINGS = 7;
const portionText = (n: number) => `${n} ${n === 1 ? 'Portion' : 'Portionen'}`;

/**
 * Woche planen als Topf (Julia: „ich koche X Portionen und verteile sie“): Rezepte in den Topf tippen, Portionen
 * anpassen, sehen, ob es für die Woche reicht. Verteilt wird danach im Wochenplan aus dem Kühlschrank (week.ts: potWeek).
 * Der Kochtag wird hier nicht gewählt – Standard ist einer (Sonntag oder der bisherige), ändern geht im Kühlschrank.
 */
export function WeekSetupScreen() {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const fallback = specialDays('prepared', pantry.shelfDays);
  const hh = householdOf(plan);
  const old = plan.week;
  // neu planen: mit der alten Woche vorbelegen – sonst mit dem, was schon im Plan steht (Julia: Woche ersetzt die Liste)
  const [pot, setPot] = useState<PotItem[]>(() => old ? potOf(old, hh)
    : [...new Set(plan.items.filter((i) => !i.fromWeek).map((i) => i.recipeId))].flatMap((id) => {
      const r = recipes.find((x) => x.id === id && baseCandidate(x));
      return r ? [{ recipeId: id, portions: Math.max(1, currentContent(r).servings || hh.portions) }] : [];
    }).slice(0, 3));

  const counts = useMemo(() => transformCounts(recipes), [recipes]);
  const candidates = useMemo(() => recipes.filter(baseCandidate)
    .map((r) => ({ r, made: counts.get(r.id) ?? 0, title: currentContent(r).title }))
    // je Bereich: Favoriten zuerst, dann nach Name
    .sort((a, b) => Number(b.r.favorite) - Number(a.r.favorite) || a.title.localeCompare(b.title, 'de')), [recipes, counts]);
  const groups = [['Grundlagen', candidates.filter((c) => c.made)], ['Rezepte', candidates.filter((c) => !c.made)]] as const;
  // mit Grundlagen starten – gibt es keine, gleich bei den Rezepten
  const [tab, setTab] = useState<'Grundlagen' | 'Rezepte'>(() => (groups[0][1].length ? 'Grundlagen' : 'Rezepte'));

  const items = pot.filter((x) => recipes.some((r) => r.id === x.recipeId));
  const total = items.reduce((n, x) => n + x.portions, 0);
  const inPot = (id: string) => items.some((x) => x.recipeId === id);
  // Antippen legt das Rezept mit seinen Portionen in den Topf, noch einmal = wieder raus
  const tapRecipe = (r: Recipe) => setPot((p) => (p.some((x) => x.recipeId === r.id) ? p.filter((x) => x.recipeId !== r.id)
    : [...p, { recipeId: r.id, portions: Math.max(1, currentContent(r).servings || hh.portions) }]));
  const step = (id: string, by: number) => setPot((p) => p.map((x) => (x.recipeId === id ? { ...x, portions: Math.max(1, x.portions + by) } : x)));

  // „Reicht für die Woche?“ – ein Abend = die Portionen des Haushalts
  const covered = Math.floor(total / Math.max(1, hh.portions));
  const over = covered - EVENINGS;
  const coverHint = over < 0 ? `Noch ${-over} ${over === -1 ? 'Abend' : 'Abende'} ohne Essen – oder bewusst frei lassen.`
    : over > 0 ? `${over} ${over === 1 ? 'Abend' : 'Abende'} mehr als die Woche – zum Einfrieren.` : 'Genau ein Essen für jeden Abend.';

  const save = async () => {
    if (old && weekStarted(old) && !(await ask({ title: 'Neue Woche?', text: 'In der jetzigen Woche ist schon etwas gekocht. Die neue ersetzt sie – Vorgekochtes bleibt in der Speisekammer.', confirm: 'Neue Woche' }))) return;
    toast(`Im Kühlschrank: ${portionText(total)} – jetzt verteilen`, { label: 'Rückgängig', run: setWeek(potWeek(items, hh, old)) });
    navigate('/plan', { replace: true });
  };

  return (
    <main className="screen screen--cta">
      <TopBar title="Woche planen" backTo="/plan" intro="woche" />
      <h1 className="week-setup__title">Was kochst du vor?</h1>
      <p className="muted">Rezepte in den Topf tippen – verteilt wird danach im Wochenplan.</p>

      <section className="pot" aria-label="Diese Woche kochen">
        <div className="pot__head">
          <Icon name="pot" size={20} />
          <h2 className="h3">Diese Woche kochen</h2>
          <span className="small muted">{total ? portionText(total) : 'noch leer'}</span>
        </div>
        {!items.length && <p className="small muted">Tippe unten ein Rezept an – es kommt mit seinen Portionen in den Topf.</p>}
        {items.map((x, i) => {
          const r = recipes.find((y) => y.id === x.recipeId)!;
          const t = currentContent(r).title;
          return (
            <div key={x.recipeId} className={`pot__item tone-${i % 6}`}>
              <span className="tone-dot" aria-hidden="true" />
              <span className="pot__name">{t}</span>
              <span className="portions" role="group" aria-label={`Portionen ${t}`}>
                <button type="button" aria-label="eine Portion weniger" disabled={x.portions <= 1} onClick={() => step(x.recipeId, -1)}><Icon name="minus" size={14} /></button>
                <b>{x.portions}</b>
                <button type="button" aria-label="eine Portion mehr" onClick={() => step(x.recipeId, 1)}><Icon name="plus" size={14} /></button>
              </span>
              <button type="button" className="pot__x" aria-label={`${t} aus dem Topf nehmen`} onClick={() => tapRecipe(r)}><Icon name="close" size={14} /></button>
            </div>
          );
        })}
      </section>

      <section className="cover" aria-label="Reicht für die Woche?">
        <div className="row-between">
          <strong className="small">Reicht für die Woche?</strong>
          <span className={`small cover__count${over < 0 ? ' is-short' : ''}`}>{Math.min(covered, 99)} / {EVENINGS} Abende</span>
        </div>
        <div className="cover__bar"><span className={over < 0 ? 'is-short' : ''} style={{ width: `${Math.min(100, Math.round((covered / EVENINGS) * 100))}%` }} /></div>
        <span className="small muted">{coverHint}</span>
      </section>

      {/* Julia: Grundrezepte und Rezepte als Tabs – die Zahl zeigt, was davon im Topf ist */}
      <div className="segments week-setup__tabs" role="tablist">
        {groups.map(([label, list]) => {
          const n = list.filter((c) => inPot(c.r.id)).length;
          return <button key={label} type="button" role="tab" aria-selected={tab === label} className={`segment${tab === label ? ' is-on' : ''}`} onClick={() => setTab(label)}>{label}{n ? ` · ${n}` : ''}</button>;
        })}
      </div>
      {groups.filter(([label]) => label === tab).map(([label, list]) => (
        <section key={label} className="week-setup__group" role="tabpanel" aria-label={label}>
          {!list.length && <p className="small muted">{label === 'Grundlagen' ? 'Noch keine Grundlage – ein Rezept wird zur Grundlage, sobald ein Gericht daraus entsteht.' : 'Keine Rezepte.'}</p>}
          <div className="pot-tiles">
            {list.map(({ r, made, title }) => {
              const on = inPot(r.id);
              const y = currentContent(r).servings;
              const keeps = keepsOf(r, fallback);
              // Julia: gleich sehen, was das Rezept ergibt, wie lange es hält und was daraus wird
              const meta = `${y ? `ergibt ${y} · ` : ''}hält ${keeps} ${keeps === 1 ? 'Tag' : 'Tage'}${made ? ` · ${made} ${made === 1 ? 'Gericht' : 'Gerichte'} daraus` : ''}`;
              return (
                <button key={r.id} type="button" className={`pot-tile${on ? ` is-on tone-${items.findIndex((x) => x.recipeId === r.id) % 6}` : ''}`} aria-pressed={on}
                  aria-label={`${title}, ${meta}${r.freezable ? ', einfrierbar' : ''}${on ? ', im Topf' : ''}`} onClick={() => tapRecipe(r)}>
                  <span className="pot-tile__img">
                    <RecipeImage image={r.image} size="sm" />
                    {r.freezable && <span className="pot-tile__snow" title="einfrierbar"><Icon name="snow" size={14} /></span>}
                  </span>
                  <strong>{title}</strong>
                  <span className="small muted">{meta}</span>
                  <span className="small pot-tile__cta">{on ? <><Icon name="check" size={13} /> im Topf</> : <><Icon name="plus" size={13} /> in den Topf</>}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="bottom-cta">
        <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!total} onClick={() => void save()}>
          {total ? `In den Kühlschrank · ${portionText(total)}` : 'Erst etwas in den Topf'}
        </button>
      </div>
    </main>
  );
}
