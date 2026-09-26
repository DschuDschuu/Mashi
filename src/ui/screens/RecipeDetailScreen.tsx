import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSheet } from '../useSheet';
import { useRecipeStock } from '../useRecipeStock';
import { StockLine } from '../components/StockLine';
import type { Stock } from '../../domain/pantry';
import { categoryInfo, deviceInfo, DIFFICULTY_LABEL, SOURCE_INFO, STATUS_INFO } from '../../domain/catalog';
import { currentContent, currentVersion, originalVersion } from '../../domain/recipe';
import { formatQuantity, scaleIngredients } from '../../domain/scaling';
import { orderByUse } from '../../domain/stepIngredients';
import type { Recipe, RecipeContent } from '../../domain/types';
import { describeChange, diffContent } from '../../domain/versions';
import {
  addToPlan, adoptToCookbook, archiveRecipe, deleteRecipe, markCooked, regenerateImage, setStatus, toggleFavorite, togglePlanCooked, updateNotes, usePlan, useRecipe,
} from '../../data/store';
import { cookedToast } from '../cookedToast';
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
import { useSwipe } from '../useSwipe';
import { useVariantPrompt } from '../components/VariantSheet';

// Vier kurze Tabs passen auch aufs schmale Handy (375 px) – die Infos stehen unter „Notizen“
const TABS = ['Zutaten', 'Schritte', 'Nährwerte', 'Notizen'] as const;
type Tab = (typeof TABS)[number];
const TABLET_TABS: readonly Tab[] = ['Nährwerte', 'Notizen'];

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
  const planned = usePlan().items.find((i) => i.recipeId === recipe.id);
  // Im Wochenplan mit 6 Portionen → hier auch 6 (für Mengen, Kochmodus und das Abziehen beim Kochen).
  // null = nicht angefasst → folgt dem Plan; der kann beim Start erst nach dem ersten Zeichnen ankommen.
  const [own, setServings] = useState<number | null>(null);
  const servings = own ?? planned?.servings ?? c.servings;
  const [tab, setTab] = useState<Tab>('Zutaten');
  const [menu, setMenu] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const n = useNutrition(c);
  const variantPrompt = useVariantPrompt();
  const isTablet = useIsTablet();
  const tabBar = useRef<HTMLDivElement>(null);
  // Der gewählte Tab soll in der (seitlich scrollbaren) Tab-Leiste sichtbar sein – auch nach dem Wischen
  // Nur seitlich verschieben – scrollIntoView würde sonst auch die ganze Seite nach oben ziehen
  useEffect(() => {
    const bar = tabBar.current;
    const on = bar?.querySelector<HTMLElement>('.tab.is-on');
    if (!bar || !on) return;
    const b = bar.getBoundingClientRect();
    const t = on.getBoundingClientRect();
    if (t.left < b.left || t.right > b.right) bar.scrollLeft += t.left - b.left - 16;
  }, [tab]);

  // Neue Version mit anderer Portionszahl → eigene Wahl vergessen, wieder dem Plan bzw. Rezept folgen
  useEffect(() => {
    setServings(null);
  }, [c.servings]);

  // Reihenfolge wie beim Kochen: was im ersten Schritt gebraucht wird, zuerst
  const ingredients = orderByUse(scaleIngredients(c, servings), c.steps);
  const { stock, soon } = useRecipeStock(recipe, servings);
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
        <MenuPanel onClose={() => setMenu(false)}>
          <button role="menuitem" onClick={() => navigate(`/rezept/${recipe.id}/bearbeiten`)}><Icon name="pencil" size={18} /> Bearbeiten</button>
          <button role="menuitem" onClick={onRegenerate}><Icon name="refresh" size={18} /> Bild neu generieren</button>
          <button role="menuitem" onClick={() => { archiveRecipe(recipe.id); toast('Archiviert – unter Einstellungen → Archiv wiederherstellbar'); goBack('/kochbuch'); }}>
            <Icon name="archive" size={18} /> Archivieren
          </button>
        </MenuPanel>
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
      {(c.tags ?? []).length > 0 && <p className="detail__tags">{c.tags.join(' · ')}</p>}
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

      {!recipe.archivedAt && recipe.status !== 'ki_entwurf' && (
        <div className="plan-chips">
          <PlanButton recipe={recipe} servings={servings} />
          <CookedButton recipe={recipe} servings={servings} />
        </div>
      )}
      <StatusAction recipe={recipe} />
    </>
  );

  const ingredientsPanel = (
    <>
      <div className="row-between">
        {isTablet ? <h2 className="h3">Zutaten</h2> : <span className="muted">Portionen</span>}
        <Stepper value={servings} onChange={setServings} label="Portionen" />
      </div>
      {stock && <p className="ingredients__stock"><StockLine content={c} stock={stock} max={4} /></p>}
      <ul className={`ingredients${stock ? ' has-stock' : ''}`}>
        {ingredients.map((i) => (
          <li key={i.id} className={i.optional ? 'is-optional' : ''}>
            <span className="ingredients__qty">{formatQuantity(i)}</span>
            <span className="ingredients__name">{i.name}{i.optional && <em> (optional)</em>}{i.note && <span className="muted">, {i.note}</span>}</span>
            {stock && <IngredientStock status={stock.get(i.id)} soon={soon.has(i.id)} />}
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
  // Nach links wischen = nächster Tab, nach rechts = vorheriger
  const step = (dir: 1 | -1) => {
    const next = tabs[tabs.indexOf(activeTab) + dir];
    if (next) setTab(next);
  };
  const swipe = useSwipe(() => step(1), () => step(-1));
  const tabArea = (
    <>
      <div className="tabs" role="tablist" ref={tabBar}>
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={activeTab === t} className={`tab${activeTab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" {...swipe}>
        {activeTab === 'Zutaten' && ingredientsPanel}
        {activeTab === 'Schritte' && stepsPanel}
        {activeTab === 'Nährwerte' && <><NutritionDetails n={n} servings={servings} /><UnknownIngredients n={n} /></>}
        {activeTab === 'Notizen' && <><Notes recipe={recipe} /><h3 className="h3">Über das Rezept</h3><Infos recipe={recipe} /></>}
      </div>
    </>
  );

  // Mehrere Sorten im Vorrat (z. B. zwei Pestos)? Erst fragen, welche – geplant: die Wahl vom Plan
  const startCooking = () => {
    if (planned) return navigate(`/rezept/${recipe.id}/kochen?p=${servings}`);
    variantPrompt.ask(c, undefined, (pick) => navigate(`/rezept/${recipe.id}/kochen?p=${servings}${Object.keys(pick).length ? `&s=${encodeURIComponent(JSON.stringify(pick))}` : ''}`));
  };
  const cookButton = (
    <>
      <button className="btn btn--primary btn--block btn--lg" onClick={startCooking}>
        <Icon name="play" size={18} filled /> Kochmodus starten
      </button>
      {variantPrompt.sheet}
    </>
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

/**
 * „Gekocht“ auch ohne Kochmodus: zieht die Zutaten aus dem Vorrat ab (mit „Rückgängig“) und merkt das Datum.
 * Steht das Rezept im Plan, ist es derselbe Haken wie dort (auch zurücknehmbar).
 * Sonst: nach dem Kochen „Heute gekocht“ – ein zweites Antippen zöge die Zutaten doppelt ab.
 */
function CookedButton({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const plan = usePlan();
  const prompt = useVariantPrompt();
  const planned = plan.items.some((i) => i.recipeId === recipe.id);
  if (planned) {
    const done = plan.cooked.includes(recipe.id);
    return (
      <button className={`plan-chip${done ? ' is-on' : ''}`} aria-pressed={done}
        aria-label={done ? 'Gekocht – antippen, um es zurückzunehmen' : 'Als gekocht markieren'}
        onClick={() => cookedToast(togglePlanCooked(recipe.id))}>
        <Icon name={done ? 'check' : 'pot'} size={16} /> Gekocht
      </button>
    );
  }
  const today = !!recipe.lastCookedAt && new Date(recipe.lastCookedAt).toDateString() === new Date().toDateString();
  if (today) return <span className="plan-chip is-on"><Icon name="check" size={16} /> Heute gekocht</span>;
  return (
    <>
      <button className="plan-chip" aria-label="Als gekocht markieren"
        onClick={() => prompt.ask(currentContent(recipe), undefined, (pick) => cookedToast(markCooked(recipe.id, servings, {}, pick)))}>
        <Icon name="pot" size={16} /> Gekocht
      </button>
      {prompt.sheet}
    </>
  );
}

/** Für Meal Prep: mit der eingestellten Portionszahl in „Diese Woche“ aufnehmen. */
function PlanButton({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const inPlan = usePlan().items.find((i) => i.recipeId === recipe.id);
  const prompt = useVariantPrompt();
  if (inPlan) {
    return (
      <button className="plan-chip is-on" onClick={() => navigate('/plan')}>
        <Icon name="check" size={16} /> Im Wochenplan · {portionCount(inPlan.servings)} <Icon name="chevron" size={14} />
      </button>
    );
  }
  return (
    <>
      <button className="plan-chip" onClick={() => prompt.ask(currentContent(recipe), undefined, (pick) => {
        addToPlan(recipe.id, servings, pick);
        toast(`Eingeplant: ${portionCount(servings)}`);
      })}>
        <Icon name="calendar" size={16} /> Zum Wochenplan ({portionCount(servings)})
      </button>
      {prompt.sheet}
    </>
  );
}

/** Der nächste sinnvolle Schritt im Lebenszyklus – der Nutzer entscheidet, nichts passiert automatisch. */
function StatusAction({ recipe }: { recipe: Recipe }) {
  switch (recipe.status) {
    case 'ki_entwurf':
      return (
        <div className="status-card tint-sky">
          <p className="status-card__title"><Icon name="sparkles" size={18} />Das ist eine KI-Idee</p>
          <p>Sie ist noch nicht in deinem Kochbuch. Möchtest du sie ausprobieren?</p>
          <div className="row-gap">
            <button className="btn btn--primary" onClick={() => { setStatus(recipe.id, 'zum_testen'); toast('Zum Testen vorgemerkt'); }}>Zum Testen vormerken</button>
            <button className="btn btn--ghost" onClick={() => { const undo = deleteRecipe(recipe.id); toast('Idee verworfen', { label: 'Rückgängig', run: undo }); goBack('/kochbuch'); }}>Verwerfen</button>
          </div>
        </div>
      );
    case 'zum_testen':
      return (
        <div className="status-card tint-peach">
          <p className="status-card__title"><Icon name="flask" size={18} />Zum Testen</p>
          <p>Koch es und sag danach, wie es war – Anpassungen inklusive.</p>
          <button className="btn btn--primary" onClick={() => navigate(`/rezept/${recipe.id}/test`)}>Rezept testen</button>
        </div>
      );
    case 'bewaehrt':
      return (
        <div className="status-card tint-rose">
          <p className="status-card__title"><Icon name="heart" size={18} />Bewährt!</p>
          <p>Wenn alles passt, wird diese Fassung deine persönliche Kochbuch-Version.</p>
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
        <dt>Kategorien</dt><dd>{(c.categories ?? []).map((x) => categoryInfo(x).label).join(', ') || '–'}</dd>
        <dt>Geräte</dt><dd className="chips">{c.devices?.length ? c.devices.map((d) => <span key={d} className="chip chip--xs"><Icon name={deviceIcon(d)} size={13} />{deviceInfo(d).label}</span>) : "–"}</dd>
        <dt>Tags</dt><dd className="chips">{c.tags?.length ? c.tags.map((t) => <span key={t} className="chip chip--xs">{t}</span>) : "–"}</dd>
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

/** Aktionsmenü oben rechts – Escape schließt, der Fokus springt hinein und zurück. */
function MenuPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useSheet(onClose);
  return <div className="menu" role="menu" ref={ref}>{children}</div>;
}

/** Rechts an der Zutat: ✓ da · „reicht nicht“ · „fehlt“ – und die Uhr, wenn sie bald weg muss. Grundvorrat: nichts. */
function IngredientStock({ status, soon }: { status?: Stock; soon: boolean }) {
  if (!status || status === 'basis') return <span />;
  return (
    <span className={`ing-stock ing-stock--${status}`}>
      {soon && <span className="ing-stock__soon" role="img" aria-label="muss bald weg" title="muss bald weg"><Icon name="clock" size={13} /></span>}
      {status === 'da' ? <span role="img" aria-label="da"><Icon name="check" size={14} /></span> : status === 'knapp' ? 'reicht nicht' : 'fehlt'}
    </span>
  );
}
