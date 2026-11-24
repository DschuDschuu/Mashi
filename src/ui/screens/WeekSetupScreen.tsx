import { Fragment, useMemo, useState } from 'react';
import { currentContent } from '../../domain/recipe';
import { DAY_SHORT, keepsOf, potOf, potWeek, transformCounts, weekStarted, type PotItem } from '../../domain/week';
import type { Household, KcalRange } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { activeOffers, offerRecipes } from '../../domain/offers';
import { localDay } from '../../domain/dates';
import { mealFactor, mealsNeeded, mealsOf, mealStep, suggestPot } from '../../domain/weekSuggest';
import { householdOf, setHousehold, setWeek, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { specialDays } from '../../domain/shelfLife';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { toast } from '../toast';
import { deNum, portionCount } from '../format';
import { recipeNutrition } from '../useNutrition';
import { useUseUp } from '../useUseUp';
import { Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';

/** Als Grundlage taugt alles, was im Kochbuch steht – außer Verwandlungen (die hängen an ihrer Grundlage) */
const baseCandidate = (r: Recipe) => !r.archivedAt && !r.fromBase && !r.trial && r.status !== 'ki_entwurf';
/** kcal je Rezept-Portion – undefined, wenn Mashi es nicht weiß */
const kcalOf = (r: Recipe): number | undefined => recipeNutrition(r).perServing?.kcal || undefined;
const DAYS = DAY_SHORT.map((d, i) => ({ d, i }));

/**
 * Wie viele Portionen kommen in den Topf, wenn du ein Rezept antippst? Wie im Rezept – mit kcal-Bereich (Julia: „2
 * Portionen sind dann 1“) so viele ganze Essen, wie das Rezept ungefähr ergibt, bei 1,5 je Essen eine gerade Zahl.
 */
function potItemFor(r: Recipe, hh: Household): PotItem {
  const servings = currentContent(r).servings || hh.portions;
  const per = hh.kcal ? mealFactor(kcalOf(r), hh.kcal) ?? 1 : 1;
  if (per === 1) return { recipeId: r.id, portions: Math.max(1, servings) };
  const step = mealStep(per, hh);
  const meals = Math.max(step, Math.floor(servings / (per * hh.portions) / step) * step);
  return { recipeId: r.id, portions: meals * per * hh.portions, per };
}

/** „Mo–Fr“, „Mo, Mi, Fr“ */
function daysText(days: readonly number[]): string {
  const s = [...days].sort((a, b) => a - b);
  const run = s.length > 2 && s.every((d, i) => !i || d === s[i - 1] + 1);
  return run ? `${DAY_SHORT[s[0]]}–${DAY_SHORT[s[s.length - 1]]}` : s.map((d) => DAY_SHORT[d]).join(', ');
}

/**
 * Woche planen als Topf (Julia: „ich koche X Portionen und verteile sie“): Rezepte in den Topf tippen, Portionen
 * anpassen, sehen, ob es für die Woche reicht. Verteilt wird danach im Wochenplan aus dem Kühlschrank (week.ts: potWeek).
 * Der Kochtag wird hier nicht gewählt – Standard ist einer (Sonntag oder der bisherige), ändern geht im Kühlschrank.
 * Oben „Deine Woche“ (Julia: Abende, Mittage, kcal pro Essen) und „Aus den Angeboten vorschlagen“ (weekSuggest.ts).
 */
export function WeekSetupScreen() {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const table = useFoodTable();
  const { keys } = useUseUp();
  const fallback = specialDays('prepared', pantry.shelfDays);
  const hh = householdOf(plan);
  const old = plan.week;
  // neu planen: mit der alten Woche vorbelegen – sonst mit dem, was schon im Plan steht (Julia: Woche ersetzt die Liste)
  const [pot, setPot] = useState<PotItem[]>(() => old ? potOf(old, hh)
    : [...new Set(plan.items.filter((i) => !i.fromWeek).map((i) => i.recipeId))].flatMap((id) => {
      const r = recipes.find((x) => x.id === id && baseCandidate(x));
      return r ? [potItemFor(r, hh)] : [];
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
  const tapRecipe = (r: Recipe) => setPot((p) => (p.some((x) => x.recipeId === r.id) ? p.filter((x) => x.recipeId !== r.id) : [...p, potItemFor(r, hh)]));
  // ein Schritt = so viele Portionen, dass ganze Essen und ganze Portionen herauskommen (bei 1,5 je Essen: 3)
  const stepOf = (x: PotItem) => (x.per && x.per !== 1 ? mealStep(x.per, hh) * x.per * hh.portions : 1);
  const step = (id: string, up: boolean) => setPot((p) => p.map((x) => (x.recipeId === id ? { ...x, portions: Math.max(stepOf(x), x.portions + (up ? stepOf(x) : -stepOf(x))) } : x)));

  // „Reicht für die Woche?“ – in Essen: deine Abende plus die Mittage (Julia: „5 Abende und 3 Mittage“)
  const needed = mealsNeeded(hh);
  const covered = items.reduce((n, x) => n + mealsOf(x, hh), 0);
  const over = covered - needed;
  const lunch = hh.lunchDays.length > 0;
  const unit = (n: number) => (lunch ? 'Essen' : n === 1 ? 'Abend' : 'Abende');
  const coverHint = over < 0 ? `Noch ${-over} ${unit(-over)} ohne Rezept.`
    : over > 0 ? `${over} ${unit(over)} mehr als die Woche.` : 'Genau ein Essen für jeden Platz.';

  // Woche aus den Angeboten (Julia: „Mashi schlägt vor“) – füllt nur auf, was noch fehlt; deine Auswahl bleibt
  const offers = activeOffers(pantry.offers, localDay());
  const suggest = () => {
    const matches = offerRecipes(recipes, offers, table, { today: localDay(), pantry, useUp: keys, limit: 60 }).filter((m) => baseCandidate(m.recipe));
    const cands = matches.map((m) => ({ recipeId: m.recipe.id, kcal: kcalOf(m.recipe), keeps: keepsOf(m.recipe, fallback), freezable: !!m.recipe.freezable }));
    const { pot: add, missing } = suggestPot(cands, hh, covered, items.map((x) => x.recipeId));
    if (!add.length) {
      toast(over >= 0 ? 'Der Topf reicht schon für die Woche.' : hh.kcal ? 'Kein Rezept mit Angebot passt in deinen kcal-Bereich.' : 'Kein Rezept nutzt diese Angebote.');
      return;
    }
    const before = pot;
    setPot([...items, ...add]);
    toast(`${add.length === 1 ? '1 Rezept' : `${add.length} Rezepte`} aus den Angeboten${missing ? ` – für ${missing} ${unit(missing)} fand Mashi nichts` : ''}`, { label: 'Rückgängig', run: () => setPot(before) });
  };

  const save = async () => {
    if (old && weekStarted(old) && !(await ask({ title: 'Neue Woche?', text: 'In der jetzigen Woche ist schon etwas gekocht. Die neue ersetzt sie – Vorgekochtes bleibt in der Speisekammer.', confirm: 'Neue Woche' }))) return;
    toast(`Im Kühlschrank: ${portionCount(total)} – jetzt verteilen`, { label: 'Rückgängig', run: setWeek(potWeek(items, hh, old)) });
    navigate('/plan', { replace: true });
  };

  return (
    <main className="screen screen--cta">
      <TopBar title="Woche planen" backTo="/plan" intro="woche" />
      <h1 className="week-setup__title">Was kochst du vor?</h1>

      <WeekGoal hh={hh} />

      {offers.length > 0 ? (
        <button type="button" className="btn btn--soft btn--block week-suggest" onClick={suggest}>
          <Icon name="sparkles" size={18} /> Aus den Angeboten vorschlagen
        </button>
      ) : (
        <p className="small muted week-suggest__none">
          <Icon name="bag" size={14} /> Mit den Angeboten der Woche schlägt Mashi vor. <button type="button" className="link small" onClick={() => navigate('/angebote')}>Angebote holen</button>
        </p>
      )}

      <section className="pot" aria-label="Diese Woche kochen">
        <div className="pot__head">
          <Icon name="pot" size={20} />
          <h2 className="h3">Diese Woche kochen</h2>
          <span className="small muted">{total ? portionCount(total) : 'noch leer'}</span>
        </div>
        {!items.length && <p className="small muted">Tippe unten ein Rezept an.</p>}
        {items.map((x, i) => {
          const r = recipes.find((y) => y.id === x.recipeId)!;
          const t = currentContent(r).title;
          const per = x.per ?? 1;
          const meals = mealsOf(x, hh);
          const rest = x.portions - meals * per * hh.portions;
          const kcal = kcalOf(r);
          // kcal pro Essen (je Person) – außerhalb deines Bereichs fällt es auf
          const mealKcal = kcal ? Math.round(kcal * per) : undefined;
          const off = !!hh.kcal && mealKcal !== undefined && (mealKcal < hh.kcal.min || mealKcal > hh.kcal.max);
          const s = stepOf(x);
          return (
            <div key={x.recipeId} className={`pot__item tone-${i % 6}`}>
              <span className="tone-dot" aria-hidden="true" />
              <span className="pot__text">
                <span className="pot__name">{t}</span>
                <span className="small muted pot__meta">
                  {meals} Essen{per !== 1 ? ` à ${deNum(per)} Portionen` : ''}
                  {mealKcal !== undefined && <> · <span className={off ? 'pot__off' : undefined}>{mealKcal} kcal</span></>}
                  {rest > 0 ? ` · ${portionCount(rest)} übrig` : ''}
                </span>
              </span>
              <span className="portions" role="group" aria-label={`Portionen ${t}`}>
                <button type="button" aria-label={s === 1 ? 'eine Portion weniger' : `${deNum(s)} Portionen weniger`} disabled={x.portions <= s} onClick={() => step(x.recipeId, false)}><Icon name="minus" size={14} /></button>
                <b>{deNum(x.portions)}</b>
                <button type="button" aria-label={s === 1 ? 'eine Portion mehr' : `${deNum(s)} Portionen mehr`} onClick={() => step(x.recipeId, true)}><Icon name="plus" size={14} /></button>
              </span>
              <button type="button" className="pot__x" aria-label={`${t} aus dem Topf nehmen`} onClick={() => tapRecipe(r)}><Icon name="close" size={14} /></button>
            </div>
          );
        })}
      </section>

      <section className="cover" aria-label="Reicht für die Woche?">
        <div className="row-between">
          <strong className="small">Reicht für die Woche?</strong>
          <span className={`small cover__count${over < 0 ? ' is-short' : ''}`}>{Math.min(covered, 99)} / {needed} {lunch ? 'Essen' : 'Abende'}</span>
        </div>
        <div className="cover__bar"><span className={over < 0 ? 'is-short' : ''} style={{ width: `${needed ? Math.min(100, Math.round((covered / needed) * 100)) : 100}%` }} /></div>
        <span className="small muted">{coverHint}</span>
      </section>

      {/* Julia: Grundrezepte und Rezepte als Tabs – die Zahl zeigt, was davon im Topf ist */}
      <div className="tabs tabs--page week-setup__tabs" role="tablist">
        {groups.map(([label, list]) => {
          const n = list.filter((c) => inPot(c.r.id)).length;
          return <button key={label} type="button" role="tab" aria-selected={tab === label} className={`tab${tab === label ? ' is-on' : ''}`} onClick={() => setTab(label)}>{label}{n ? ` · ${n}` : ''}</button>;
        })}
      </div>
      {groups.filter(([label]) => label === tab).map(([label, list]) => (
        <section key={label} className="week-setup__group" role="tabpanel" aria-label={label}>
          {!list.length && <p className="small muted">{label === 'Grundlagen' ? 'Noch keine Grundlage.' : 'Keine Rezepte.'}</p>}
          <div className="pot-tiles">
            {list.map(({ r, made, title }) => {
              const on = inPot(r.id);
              const y = currentContent(r).servings;
              const keeps = keepsOf(r, fallback);
              const kcal = kcalOf(r);
              // Julia: gleich sehen, was das Rezept ergibt, wie lange es hält, was daraus wird – und wie viel kcal eine Portion hat
              const meta = `${y ? `ergibt ${y} · ` : ''}hält ${keeps} ${keeps === 1 ? 'Tag' : 'Tage'}${made ? ` · ${made} ${made === 1 ? 'Gericht' : 'Gerichte'} daraus` : ''}${kcal ? ` · ${Math.round(kcal)} kcal` : ''}`;
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
          {total ? `In den Kühlschrank · ${portionCount(total)}` : 'Erst etwas in den Topf'}
        </button>
      </div>
    </main>
  );
}

/**
 * „Deine Woche“ (Julia: „Einstellungen, wie viele Portionen ich brauche und wie viel kcal so ein Essen hat“): Abende,
 * Mittage und kcal pro Essen – gehören zum Haushalt, gelten also auf allen Geräten. Zugeklappt nur eine Zeile.
 */
function WeekGoal({ hh }: { hh: Household }) {
  const [open, setOpen] = useState(false);
  const evenings = hh.evenings ?? 7;
  const set = (patch: Partial<Household>, text: string) => toast(text, { label: 'Rückgängig', run: setHousehold({ ...hh, ...patch }) });
  const toggleDay = (d: number) => {
    const days = hh.lunchDays.includes(d) ? hh.lunchDays.filter((x) => x !== d) : [...hh.lunchDays, d].sort((a, b) => a - b);
    set({ lunchDays: days }, days.length ? `Mittags an ${daysText(days)}` : 'Mittagessen nicht mehr mitgeplant');
  };
  // je Teil am Stück – sonst bricht „1000–1200 kcal“ am Strich um
  const summary = [
    `${evenings} ${evenings === 1 ? 'Abend' : 'Abende'}`,
    hh.lunchDays.length ? `mittags ${daysText(hh.lunchDays)}` : '',
    hh.kcal ? `${hh.kcal.min}–${hh.kcal.max} kcal` : '',
  ].filter(Boolean).map((x, i) => <Fragment key={x}>{i ? ' · ' : ''}<span className="nowrap">{x}</span></Fragment>);
  return (
    <section className="week-goal" aria-label="Deine Woche">
      <button type="button" className="week-goal__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="sliders" size={18} />
        <span className="week-goal__sum"><strong>Deine Woche</strong><span className="small muted">{summary}</span></span>
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div className="week-goal__body">
          <div className="row-between">
            <span>Abende</span>
            <Stepper small value={evenings} min={0} max={7} label="Abende pro Woche"
              onChange={(n) => set({ evenings: n === 7 ? undefined : n }, `${n} ${n === 1 ? 'Abend' : 'Abende'} pro Woche`)} />
          </div>
          <div className="week-goal__col">
            <span>Mittags</span>
            <div className="daypick daypick--small" role="group" aria-label="Mittagessen an diesen Tagen">
              {DAYS.map(({ d, i }) => (
                <button key={d} type="button" className={`daypick__day${hh.lunchDays.includes(i) ? ' is-on' : ''}`} aria-pressed={hh.lunchDays.includes(i)} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
          <KcalField range={hh.kcal} onChange={(kcal) => set({ kcal }, kcal ? `${kcal.min}–${kcal.max} kcal pro Essen` : 'Kein kcal-Ziel mehr')} />
        </div>
      )}
    </section>
  );
}

/** kcal pro Essen, von–bis – übernommen, wenn beide Zahlen passen (beim Verlassen des Felds); beide leer = kein Ziel */
function KcalField({ range, onChange }: { range?: KcalRange; onChange: (r: KcalRange | undefined) => void }) {
  const [min, setMin] = useState(range ? String(range.min) : '');
  const [max, setMax] = useState(range ? String(range.max) : '');
  const commit = () => {
    const a = parseInt(min, 10);
    const b = parseInt(max, 10);
    if (!min.trim() && !max.trim()) { if (range) onChange(undefined); return; }
    if (!(a > 0) || !(b >= a)) return;
    if (range?.min !== a || range?.max !== b) onChange({ min: a, max: b });
  };
  const field = (value: string, setValue: (v: string) => void, label: string) => (
    <input className="week-goal__num" inputMode="numeric" value={value} aria-label={label} placeholder={label === 'kcal von' ? 'von' : 'bis'}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
  return (
    <div className="week-goal__col">
      <div className="row-between">
        <span>kcal pro Essen</span>
        <span className="week-goal__kcal">{field(min, setMin, 'kcal von')}<span aria-hidden="true">–</span>{field(max, setMax, 'kcal bis')}</span>
      </div>
      <span className="small muted">Ein Essen darf auch 1,5 oder 2 Rezept-Portionen sein. Leer = kein Ziel.</span>
    </div>
  );
}
