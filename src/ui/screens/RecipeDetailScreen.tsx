import { useEffect, useState } from 'react';
import { categoryInfo, deviceInfo, DIFFICULTY_LABEL, SOURCE_INFO, STATUS_INFO } from '../../domain/catalog';
import { currentContent, currentVersion, originalVersion } from '../../domain/recipe';
import { formatQuantity, scaleIngredients } from '../../domain/scaling';
import type { Recipe, RecipeContent } from '../../domain/types';
import { describeChange, diffContent } from '../../domain/versions';
import {
  addToPlan, adoptToCookbook, archiveRecipe, deleteRecipe, regenerateImage, setStatus, toggleFavorite, updateNotes, usePlan, useRecipe,
} from '../../data/store';
import { goBack, navigate } from '../../router';
import { Empty, Stars, Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { deviceIcon } from '../catalogIcons';
import { NutritionDetails, NutritionTiles } from '../components/Nutrition';
import { UnknownIngredients } from '../components/MyProductsPanel';
import { RecipeImage } from '../components/RecipeImage';
import { StepIngredients } from '../components/StepIngredients';
import { StatusBadge } from '../components/StatusBadge';
import { euro, formatMinutes, portionCount, relativeDay } from '../format';
import { useRecipeCost } from '../useCosts';
import { toast } from '../toast';
import { useIsTablet } from '../useMediaQuery';
import { useNutrition } from '../useNutrition';

const TABS = ['Zutaten', 'Zubereitung', 'Nährwerte', 'Notizen', 'Infos'] as const;
type Tab = (typeof TABS)[number];
const TABLET_TABS: readonly Tab[] = ['Nährwerte', 'Notizen', 'Infos'];

export function RecipeDetailScreen({ id }: { id: string }) {
  const recipe = useRecipe(id);
  if (!recipe) {
    return (
      <main className="screen">
        <Empty icon="search">Dieses Rezept gibt es nicht (mehr).</Empty>
        <button className="btn" onClick={() => navigate('/')}>Zur Startseite</button>
      </main>
    );
  }
  return <Detail recipe={recipe} />;
}

function Detail({ recipe }: { recipe: Recipe }) {
  const c = currentContent(recipe);
  const [servings, setServings] = useState(c.servings);
  const [tab, setTab] = useState<Tab>('Zutaten');
  const [menu, setMenu] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const n = useNutrition(c);
  const isTablet = useIsTablet();

  // Neue Version mit anderer Portionszahl → Regler nachziehen
  useEffect(() => {
    setServings(c.servings);
  }, [c.servings]);

  const ingredients = scaleIngredients(c, servings);
  const rating = recipe.feedback.length
    ? { avg: recipe.feedback.reduce((s, f) => s + f.rating, 0) / recipe.feedback.length, count: recipe.feedback.length }
    : null;

  const onRegenerate = async () => {
    setMenu(false);
    setImgBusy(true);
    await regenerateImage(recipe.id);
    setImgBusy(false);
    toast('Neues Bild erzeugt');
  };

  const hero = (
    <div className="hero">
      <RecipeImage image={recipe.image} size="lg" className={imgBusy ? 'is-busy' : ''} />
      <div className="hero__bar">
        <button className="iconbtn iconbtn--glass" onClick={() => goBack('/kochbuch')} aria-label="Zurück"><Icon name="back" /></button>
        <div className="hero__right">
          <button className={`iconbtn iconbtn--glass${recipe.favorite ? ' is-fav' : ''}`} onClick={() => toggleFavorite(recipe.id)} aria-pressed={recipe.favorite} aria-label="Favorit">
            <Icon name="heart" filled={recipe.favorite} />
          </button>
          <button className="iconbtn iconbtn--glass" onClick={() => setMenu(!menu)} aria-label="Weitere Aktionen" aria-expanded={menu}><Icon name="dots" /></button>
        </div>
      </div>
      {menu && <button className="menu-backdrop" onClick={() => setMenu(false)} aria-label="Menü schließen" />}
      {menu && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => navigate(`/rezept/${recipe.id}/bearbeiten`)}><Icon name="pencil" size={18} /> Bearbeiten</button>
          <button role="menuitem" onClick={onRegenerate}><Icon name="refresh" size={18} /> Bild neu generieren</button>
          <button role="menuitem" onClick={() => { archiveRecipe(recipe.id); toast('Archiviert – unter „Mehr“ wiederherstellbar'); goBack('/kochbuch'); }}>
            <Icon name="archive" size={18} /> Archivieren
          </button>
        </div>
      )}
    </div>
);

const header = (
    <>
      <div className="row-gap">
        <StatusBadge status={recipe.status} withIcon />
        {recipe.source === 'ki' && recipe.status === 'kochbuch' && <span className="muted small">Ursprünglich mit KI erstellt</span>}
      </div>
      <h1 className="detail__title">{c.title}</h1>
      {c.tags.length > 0 && <p className="detail__tags">{c.tags.join(' · ')}</p>}
      {c.description && <p className="detail__desc">{c.description}</p>}

      <div className="facts">
        <span><Icon name="clock" size={16} /> {formatMinutes(c.prepMinutes + c.cookMinutes)}</span>
        <span><Icon name="users" size={16} /> {portionCount(c.servings)}</span>
        <span>{DIFFICULTY_LABEL[c.difficulty]}</span>
        {rating && (
          <span className="facts__star"><Icon name="star" size={16} filled /> {rating.avg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ({rating.count})</span>
        )}
      </div>

      <NutritionTiles n={n} />
      <CostLine content={c} servings={servings} />

      {!recipe.archivedAt && recipe.status !== 'ki_entwurf' && <PlanButton recipe={recipe} servings={servings} />}
      <StatusAction recipe={recipe} />
    </>
  );

  const ingredientsPanel = (
    <>
      <div className="row-between">
        {isTablet ? <h2 className="h3">Zutaten</h2> : <span className="muted">Portionen</span>}
        <Stepper value={servings} onChange={setServings} label="Portionen" />
      </div>
      <ul className="ingredients">
        {ingredients.map((i) => (
          <li key={i.id} className={i.optional ? 'is-optional' : ''}>
            <span className="ingredients__qty">{formatQuantity(i)}</span>
            <span>{i.name}{i.optional && <em> (optional)</em>}{i.note && <span className="muted">, {i.note}</span>}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const stepsPanel = (
    <ol className="steps">
      {c.steps.map((s, i) => (
        <li key={s.id}>
          <span className="steps__num">{i + 1}</span>
          <div>
            <StepIngredients step={s} ingredients={ingredients} />
            <p>{s.text}</p>
            {s.timerMinutes && <span className="chip chip--xs"><Icon name="timer" size={13} /> {s.timerMinutes} Min.</span>}
          </div>
        </li>
      ))}
    </ol>
  );

  // Auf dem Tablet stehen Zutaten und Zubereitung dauerhaft da – dann braucht es dafür keine Tabs.
  const tabs = isTablet ? TABLET_TABS : TABS;
  const activeTab: Tab = tabs.includes(tab) ? tab : tabs[0];
  const tabArea = (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={activeTab === t} className={`tab${activeTab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel">
        {activeTab === 'Zutaten' && ingredientsPanel}
        {activeTab === 'Zubereitung' && stepsPanel}
        {activeTab === 'Nährwerte' && <><NutritionDetails n={n} servings={servings} /><UnknownIngredients n={n} /></>}
        {activeTab === 'Notizen' && <Notes recipe={recipe} />}
        {activeTab === 'Infos' && <Infos recipe={recipe} />}
      </div>
    </>
  );

  const cookButton = (
    <button className="btn btn--primary btn--block btn--lg" onClick={() => navigate(`/rezept/${recipe.id}/kochen?p=${servings}`)}>
      <Icon name="play" size={18} filled /> Kochmodus starten
    </button>
  );

  if (isTablet) {
    // Tablet: links Bild + Zutaten (bleiben beim Scrollen stehen), rechts alles andere.
    return (
      <main className="screen screen--detail detail-tablet">
        <aside className="detail-tablet__aside">
          {hero}
          <section className="panel">{ingredientsPanel}</section>
        </aside>
        <div className="detail-tablet__main">
          {header}
          <section className="stack">
            <h2 className="h3">Zubereitung</h2>
            {stepsPanel}
          </section>
          {cookButton}
          {tabArea}
        </div>
      </main>
    );
  }

  return (
    <main className="screen screen--detail">
      {hero}
      <div className="detail">
        {header}
        {tabArea}
      </div>
      <div className="bottom-cta">{cookButton}</div>
    </main>
  );
}

/** Was das Gericht kostet – aus Kassenbon-Preisen und „Meine Produkte“. Nichts bekannt → nichts anzeigen. */
function CostLine({ content, servings }: { content: RecipeContent; servings: number }) {
  const cost = useRecipeCost(content, servings);
  if (!cost) return null;
  return (
    <p className="cost-line">
      <span>ca. <strong>{euro(cost.total)}</strong> · {euro(cost.perServing)} pro Portion</span>
      {cost.missing.length > 0 && <span className="small muted">ohne {cost.missing.slice(0, 3).join(', ')}{cost.missing.length > 3 ? ' …' : ''} (Preis unbekannt)</span>}
    </p>
  );
}

/** Für Meal Prep: mit der eingestellten Portionszahl in „Diese Woche“ aufnehmen. */
function PlanButton({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const inPlan = usePlan().items.find((i) => i.recipeId === recipe.id);
  if (inPlan) {
    return (
      <button className="plan-chip is-on" onClick={() => navigate('/plan')}>
        <Icon name="check" size={16} /> Im Wochenplan · {portionCount(inPlan.servings)} <Icon name="chevron" size={14} />
      </button>
    );
  }
  return (
    <button className="plan-chip" onClick={() => { addToPlan(recipe.id, servings); toast(`Eingeplant: ${portionCount(servings)}`); }}>
      <Icon name="calendar" size={16} /> Zum Wochenplan ({portionCount(servings)})
    </button>
  );
}

/** Der nächste sinnvolle Schritt im Lebenszyklus – der Nutzer entscheidet, nichts passiert automatisch. */
function StatusAction({ recipe }: { recipe: Recipe }) {
  switch (recipe.status) {
    case 'ki_entwurf':
      return (
        <div className="status-card tint-sky">
          <p><strong><Icon name="sparkles" size={18} />Das ist eine KI-Idee.</strong> Sie ist noch nicht in deinem Kochbuch. Möchtest du sie ausprobieren?</p>
          <div className="row-gap">
            <button className="btn btn--primary" onClick={() => { setStatus(recipe.id, 'zum_testen'); toast('Zum Testen vorgemerkt'); }}>Zum Testen vormerken</button>
            <button className="btn btn--ghost" onClick={() => { deleteRecipe(recipe.id); toast('Idee verworfen'); goBack('/testen'); }}>Verwerfen</button>
          </div>
        </div>
      );
    case 'zum_testen':
      return (
        <div className="status-card tint-peach">
          <p><strong><Icon name="flask" size={18} />Zum Testen.</strong> Koch es und sag danach, wie es war – Anpassungen inklusive.</p>
          <button className="btn btn--primary" onClick={() => navigate(`/rezept/${recipe.id}/test`)}>Rezept testen</button>
        </div>
      );
    case 'bewaehrt':
      return (
        <div className="status-card tint-rose">
          <p><strong><Icon name="heart" size={18} />Bewährt!</strong> Wenn alles passt, wird diese Fassung deine persönliche Kochbuch-Version.</p>
          <div className="row-gap">
            <button className="btn btn--primary" onClick={() => { adoptToCookbook(recipe.id); toast('Ins Kochbuch übernommen'); }}>Ins Kochbuch übernehmen</button>
            <button className="btn btn--ghost" onClick={() => navigate(`/rezept/${recipe.id}/test`)}>Nochmal testen</button>
          </div>
        </div>
      );
    case 'kochbuch':
      return null;
  }
}

function Notes({ recipe }: { recipe: Recipe }) {
  const [text, setText] = useState(recipe.notes);
  const versionNo = (vid: string) => recipe.versions.find((v) => v.id === vid)?.number;
  return (
    <div className="stack">
      <label className="field">
        <span>Persönliche Notizen</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => updateNotes(recipe.id, text)} placeholder="z. B. Passt gut zu … / Beim nächsten Mal …" />
      </label>
      <h3 className="h3">Testnotizen</h3>
      {recipe.feedback.length === 0 && <p className="muted small">Noch nicht getestet.</p>}
      {[...recipe.feedback].reverse().map((f) => (
        <div key={f.id} className="feedback">
          <div className="row-between">
            <Stars value={f.rating} size={16} />
            <span className="muted small">{relativeDay(f.createdAt)} · Version {versionNo(f.versionId)}</span>
          </div>
          {f.note && <p>{f.note}</p>}
        </div>
      ))}
    </div>
  );
}

function Infos({ recipe }: { recipe: Recipe }) {
  const c = currentContent(recipe);
  const orig = originalVersion(recipe);
  const cur = currentVersion(recipe);
  const changes = orig.id !== cur.id ? diffContent(orig.content, cur.content) : [];
  return (
    <div className="stack">
      <dl className="info">
        <dt>Kategorien</dt><dd>{c.categories.map((x) => categoryInfo(x).label).join(', ') || '–'}</dd>
        <dt>Geräte</dt><dd className="chips">{c.devices.length ? c.devices.map((d) => <span key={d} className="chip chip--xs"><Icon name={deviceIcon(d)} size={13} />{deviceInfo(d).label}</span>) : "–"}</dd>
        <dt>Tags</dt><dd className="chips">{c.tags.length ? c.tags.map((t) => <span key={t} className="chip chip--xs">{t}</span>) : "–"}</dd>
        <dt>Quelle</dt><dd>{SOURCE_INFO[recipe.source].label}</dd>
        <dt>Status</dt><dd>{STATUS_INFO[recipe.status].label}</dd>
      </dl>

      {changes.length > 0 && (
        <div className="changes">
          <h3 className="h3">Deine Änderungen gegenüber Version 1</h3>
          <ul>{changes.map((ch, i) => <li key={i}>{describeChange(ch)}</li>)}</ul>
        </div>
      )}

      <details className="versions">
        <summary>Versionen ({recipe.versions.length})</summary>
        <ol>
          {[...recipe.versions].reverse().map((v) => (
            <li key={v.id} className={v.id === cur.id ? 'is-current' : ''}>
              <strong>Version {v.number}</strong> · {v.label ?? (v.author === 'ki' ? 'KI' : 'Du')}
              <span className="muted small"> · {relativeDay(v.createdAt)}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
