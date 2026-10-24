import { useMemo, useState } from 'react';
import { currentContent, newId, totalMinutes } from '../../domain/recipe';
import { DAY_SHORT, byEffort, choicesOf, extrasOf, keepsOf, mealKey, splitMealKey, sortCookDays, suggestWeek, transformsOf, weekStarted } from '../../domain/week';
import { comboText } from '../../domain/sides';
import { ComboBuilder } from '../components/ComboBuilder';
import type { Weekday } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { setWeek, usePantry, usePlan, useRecipes } from '../../data/store';
import { specialDays } from '../../domain/shelfLife';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { formatMinutesShort } from '../format';
import { toast } from '../toast';
import { Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';

/** Als Grundlage taugt alles, was im Kochbuch steht – außer Verwandlungen (die hängen an ihrer Grundlage) */
const baseCandidate = (r: Recipe) => !r.archivedAt && !r.fromBase && r.status !== 'ki_entwurf';

/**
 * Woche planen (Julia: „nicht 5 unterschiedliche Gerichte kochen – eine Bolo machen und daraus Nudeln, Wraps …“):
 * 1. eine oder zwei Grundlagen nach Bild wählen, 2. was du daraus machst (jedes Antippen = ein Abend) und die
 * Kochtage. Mashi verteilt danach die Abende (week.ts: suggestWeek).
 */
export function WeekSetupScreen() {
  const recipes = useRecipes();
  const plan = usePlan();
  const pantry = usePantry();
  const fallback = specialDays('prepared', pantry.shelfDays);
  const old = plan.week;
  // neu planen: mit der alten Woche vorbelegen – sonst mit dem, was schon im Plan steht (Julia: Woche ersetzt die Liste)
  const [bases, setBases] = useState<string[]>(() => old ? old.bases.map((b) => b.recipeId)
    : plan.items.filter((i) => !i.fromWeek).map((i) => i.recipeId).filter((id) => recipes.some((r) => r.id === id && baseCandidate(r))).slice(0, 3));
  const [picks, setPicks] = useState<Record<string, string[]>>(() => old ? Object.fromEntries(choicesOf(old).map((c) => [c.baseId, c.meals])) : {});
  const [cook, setCook] = useState<Weekday[]>(() => old?.cookDays ?? [6, 2]);

  const candidates = useMemo(() => recipes.filter(baseCandidate)
    .map((r) => ({ r, made: transformsOf(r.id, recipes), title: currentContent(r).title }))
    // je Bereich (Grundlagen / Gerichte): Favoriten zuerst, dann nach Name
    .sort((a, b) => Number(b.r.favorite) - Number(a.r.favorite) || a.title.localeCompare(b.title, 'de')), [recipes]);

  const toggleBase = (id: string) => setBases((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  // Antippen = ein Abend mehr; beim dritten Mal wieder weg (zweimal in der Woche geht)
  const tapMeal = (baseId: string, id: string) => setPicks((p) => {
    const list = p[baseId] ?? [];
    const n = list.filter((x) => x === id).length;
    return { ...p, [baseId]: n >= 2 ? list.filter((x) => x !== id) : [...list, id] };
  });
  const toggleDay = (d: Weekday) => setCook((days) => (days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]));

  const chosen = bases.map((id) => ({ id, meals: (picks[id] ?? []) })).filter((c) => recipes.some((r) => r.id === c.id));
  const evenings = chosen.reduce((n, c) => n + c.meals.length, 0);

  const save = async () => {
    if (old && weekStarted(old) && !(await ask({ title: 'Neue Woche?', text: 'In der jetzigen Woche ist schon etwas gekocht. Die neue ersetzt sie – Vorgekochtes bleibt in der Speisekammer.', confirm: 'Neue Woche' }))) return;
    const week = suggestWeek(cook, chosen.filter((c) => c.meals.length).map((c) => ({ baseId: c.id, meals: c.meals })), () => newId('w'));
    // Extra-Portionen der alten Woche behalten, wenn dieselbe Grundlage wieder dabei ist
    const next = old ? { ...week, bases: week.bases.map((b) => ({ ...b, ...(old.bases.find((o) => o.recipeId === b.recipeId && !weekStarted(old))?.extra ? { extra: old.bases.find((o) => o.recipeId === b.recipeId)!.extra } : {}) })) } : week;
    toast(`Woche geplant – ${evenings} ${evenings === 1 ? 'Abend' : 'Abende'}`, { label: 'Rückgängig', run: setWeek(next) });
    navigate('/plan', { replace: true });
  };

  const groups = [['Grundlagen', candidates.filter((c) => c.made.length)], ['Rezepte', candidates.filter((c) => !c.made.length)]] as const;
  // mit Grundlagen starten – gibt es keine, gleich bei den Rezepten
  const [tab, setTab] = useState<'Grundlagen' | 'Rezepte'>(() => (groups[0][1].length ? 'Grundlagen' : 'Rezepte'));
  // Julia: kein Zwischenschritt – Grundlage antippen klappt auf, was du daraus machst; Kochtage unten auf derselben Seite
  const count = (baseId: string, key: string) => (picks[baseId] ?? []).filter((x) => x === key).length;
  const setEvenings = (id: string, n: number) => setPicks((p) => ({ ...p, [id]: Array.from({ length: Math.max(0, n) }, () => id) }));
  const tapHead = (id: string, isBase: boolean) => {
    const on = bases.includes(id);
    toggleBase(id);
    // ein Gericht gleich mit einem Abend vorbelegen – sonst müsste man nach dem Antippen noch einmal tippen
    if (!on && !isBase && !count(id, id)) setEvenings(id, 1);
  };

  return (
    <main className="screen screen--cta">
      <TopBar title="Woche planen" backTo="/plan" intro="woche" />
      <h1 className="week-setup__title">Was kochst du vor?</h1>
      <p className="muted">Grundlage antippen und wählen, was du daraus machst – jedes Antippen ist ein Abend, zweimal = zweimal in der Woche.</p>
      {/* Julia: Grundrezepte und Rezepte als Tabs – schön getrennt; die Zahl zeigt, was dort gewählt ist */}
      <div className="segments week-setup__tabs" role="tablist">
        {groups.map(([label, list]) => {
          const n = list.filter((c) => bases.includes(c.r.id)).length;
          return <button key={label} type="button" role="tab" aria-selected={tab === label} className={`segment${tab === label ? ' is-on' : ''}`} onClick={() => setTab(label)}>{label}{n ? ` · ${n}` : ''}</button>;
        })}
      </div>
      {groups.filter(([label]) => label === tab).map(([label, list]) => (
        <section key={label} className="week-setup__group" role="tabpanel" aria-label={label}>
          {!list.length && <p className="small muted">{label === 'Grundlagen' ? 'Noch keine Grundlage – ein Rezept wird zur Grundlage, sobald ein Gericht daraus entsteht.' : 'Keine Rezepte.'}</p>}
          <div className="week-setup__list">
            {list.map(({ r, made, title }) => {
              const on = bases.includes(r.id);
              const n = (picks[r.id] ?? []).length;
              const meta = on && n ? `${n} ${n === 1 ? 'Abend' : 'Abende'}` : `${made.length ? `${made.length} ${made.length === 1 ? 'Gericht' : 'Gerichte'} daraus · ` : ''}hält ${keepsOf(r, fallback)} Tage`;
              return (
                <div key={r.id} className={`week-setup__item${on ? ' is-on' : ''}`}>
                  <button type="button" className="week-setup__row" aria-expanded={on} onClick={() => tapHead(r.id, made.length > 0)}>
                    <RecipeImage image={r.image} size="sm" />
                    <span className="week-setup__headtext"><strong>{title}</strong><span className="small muted">{meta}</span></span>
                    <span className="week-setup__check" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
                  </button>
                  {on && (made.length ? <BasePanel id={r.id} title={title} made={made} keys={picks[r.id] ?? []} count={(k) => count(r.id, k)} tap={(k) => tapMeal(r.id, k)} /> : (
                    <div className="week-setup__panel row-between">
                      <span className="small">An wie vielen Abenden?</span>
                      <Stepper small min={0} value={count(r.id, r.id)} onChange={(v) => setEvenings(r.id, v)} label={`Abende ${title}`} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="week-setup__days">
        <h2 className="h3">Wann kochst du?</h2>
        <div className="daypick" role="group" aria-label="Kochtage">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" className={`daypick__day${cook.includes(i) ? ' is-on' : ''}`} aria-pressed={cook.includes(i)} onClick={() => toggleDay(i)}>
              {d}<small>{cook.includes(i) ? 'kochen' : '·'}</small>
            </button>
          ))}
        </div>
        <p className="small muted">Erste Grundlage am ersten Kochtag ({sortCookDays(cook).map((d) => DAY_SHORT[d]).join(', ')}) – Tauschen geht danach in der Woche.</p>
      </section>

      <div className="bottom-cta">
        <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!evenings} onClick={() => void save()}>
          {evenings ? `Woche planen · ${evenings} ${evenings === 1 ? 'Abend' : 'Abende'}` : 'Mindestens ein Abend'}
        </button>
      </div>
    </main>
  );
}

/**
 * Aufgeklappte Grundlage: Beilagen oben (Julia: am einfachsten), darunter das Akkordeon „Gerichte daraus“ – jedes mit dem,
 * was dazukommt („+ Cocktailtomaten, Hähnchen, Pasta“), damit klar ist, warum es keine Beilage mehr braucht.
 */
function BasePanel({ id, title, made, keys, count, tap }: { id: string; title: string; made: Recipe[]; keys: string[]; count: (key: string) => number; tap: (key: string) => void }) {
  const chip = (key: string, label: string, aria: string, plain = false) => {
    const n = count(key);
    return (
      <button key={key} type="button" className={`chip${plain ? ' week-setup__plain' : ''}${n ? ' is-on' : ''}`} aria-pressed={n > 0} onClick={() => tap(key)}
        aria-label={`${aria}${n ? `, ${n}× gewählt` : ''}`}>
        {n > 1 ? `${n}× ` : ''}{label}
      </button>
    );
  };
  // Verwandlungen – wenig Aufwand am Abend zuerst (Julia)
  const dishes = byEffort(made);
  const combos = [...new Set(keys.filter((k) => splitMealKey(k).recipeId === id))];
  const picked = dishes.reduce((n, r) => n + count(r.id), 0);
  return (
    <div className="week-setup__panel">
      {/* zusammengestellte Abende (Julia: Baukasten) – antippen = noch ein Abend, beim dritten Mal wieder weg */}
      {combos.length > 0 && (
        <div className="chips week-setup__sides" role="group" aria-label={`${title} – zusammengestellt`}>
          {combos.map((k) => { const side = splitMealKey(k).side; return chip(k, side ? comboText(side) : 'pur', `${title} ${side ? `mit ${comboText(side)}` : 'pur'}`); })}
        </div>
      )}
      <ComboBuilder onAdd={(side) => tap(mealKey(id, side))} />
      <details className="week-setup__dishes" open={picked > 0}>
        <summary>Gerichte daraus ({dishes.length}){picked ? ` · ${picked} gewählt` : ''}</summary>
        <ul className="week-setup__dishlist">
          {dishes.map((r) => {
            const n = count(r.id);
            const c = currentContent(r);
            const extras = extrasOf(r, id);
            return (
              <li key={r.id}>
                <button type="button" className={`week-setup__dish${n ? ' is-on' : ''}`} aria-pressed={n > 0} onClick={() => tap(r.id)} aria-label={`${c.title}${n ? `, ${n}× gewählt` : ''}`}>
                  <span className="week-setup__headtext">
                    <strong>{n > 1 ? `${n}× ` : ''}{c.title}</strong>
                    <span className="small muted">{extras.length ? `+ ${extras.join(', ')}` : 'nichts dazu'} · {formatMinutesShort(totalMinutes(c))}</span>
                  </span>
                  {n > 0 && <Icon name="check" size={16} />}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="link small" onClick={() => navigate(`/neu?aus=${id}`)}><Icon name="plus" size={14} /> Gericht daraus anlegen</button>
      </details>
    </div>
  );
}
