import { useMemo, useState } from 'react';
import { currentContent, newId, totalMinutes } from '../../domain/recipe';
import { DAY_SHORT, choicesOf, keepsOf, sortCookDays, suggestWeek, transformsOf, weekStarted } from '../../domain/week';
import type { Weekday } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { setWeek, usePantry, usePlan, useRecipes } from '../../data/store';
import { specialDays } from '../../domain/shelfLife';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { formatMinutesShort } from '../format';
import { toast } from '../toast';
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
  const [step, setStep] = useState<'basis' | 'daraus'>('basis');

  const candidates = useMemo(() => recipes.filter(baseCandidate)
    .map((r) => ({ r, made: transformsOf(r.id, recipes), title: currentContent(r).title }))
    // was sich verwandeln lässt zuerst, dann Favoriten, dann nach Name
    .sort((a, b) => Number(b.made.length > 0) - Number(a.made.length > 0) || Number(b.r.favorite) - Number(a.r.favorite) || a.title.localeCompare(b.title, 'de')), [recipes]);

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

  if (step === 'basis') {
    return (
      <main className="screen screen--cta">
        <TopBar title="Woche planen" backTo="/plan" />
        <h1 className="week-setup__title">Was kochst du vor?</h1>
        <p className="muted">Such dir eine oder zwei Grundlagen aus. Daraus werden unter der Woche verschiedene Abendessen.</p>
        <div className="grid week-setup__grid">
          {candidates.map(({ r, made, title }) => {
            const on = bases.includes(r.id);
            return (
              <button key={r.id} type="button" className={`card pick-card${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleBase(r.id)}>
                <div className="card__media">
                  <RecipeImage image={r.image} size="md" />
                  <span className="pick-card__check" aria-hidden="true"><Icon name="check" size={16} /></span>
                </div>
                <div className="card__body">
                  <h3 className="card__title">{title}</h3>
                  <p className="card__meta">
                    {made.length ? `${made.length} ${made.length === 1 ? 'Abendessen' : 'Abendessen'} daraus` : 'direkt essen'} · hält {keepsOf(r, fallback)} Tage
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="bottom-cta">
          <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!bases.length} onClick={() => setStep('daraus')}>
            Was machst du daraus? <Icon name="chevron" size={18} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen screen--cta">
      <TopBar title="Woche planen" onBack={() => setStep('basis')} />
      <h1 className="week-setup__title">Was machst du daraus?</h1>
      <p className="muted">Jedes Antippen ist ein Abend. Zweimal antippen = zweimal in der Woche.</p>
      {chosen.map(({ id, meals }) => {
        const base = recipes.find((r) => r.id === id)!;
        const title = currentContent(base).title;
        // die Grundlage selbst („so essen“) und ihre Verwandlungen
        const options = [base, ...transformsOf(id, recipes)];
        return (
          <section key={id} className="week-setup__base">
            <div className="week-setup__head">
              <RecipeImage image={base.image} size="sm" />
              <div className="week-setup__headtext">
                <h2 className="h3">Aus {title}</h2>
                <span className="small muted">{meals.length ? `${meals.length} ${meals.length === 1 ? 'Abend' : 'Abende'}` : 'Tipp an, was du daraus machst'}</span>
              </div>
            </div>
            <div className="grid">
              {options.map((r) => {
                const n = meals.filter((x) => x === r.id).length;
                const c = currentContent(r);
                return (
                  <button key={r.id} type="button" className={`card pick-card${n ? ' is-on' : ''}`} aria-pressed={n > 0} onClick={() => tapMeal(id, r.id)}
                    aria-label={`${c.title}${n ? `, ${n}× gewählt` : ''}`}>
                    <div className="card__media">
                      <RecipeImage image={r.image} size="md" />
                      <span className="pick-card__check" aria-hidden="true">{n > 1 ? <b>{n}×</b> : <Icon name="check" size={16} />}</span>
                    </div>
                    <div className="card__body">
                      <h3 className="card__title">{r.id === id ? `${c.title} – so essen` : c.title}</h3>
                      <p className="card__meta">{formatMinutesShort(totalMinutes(c))}{r.togo ? ' · zum Mitnehmen' : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <button type="button" className="link small" onClick={() => navigate(`/neu?aus=${id}`)}>
              <Icon name="plus" size={14} /> Verwandlung anlegen
            </button>
          </section>
        );
      })}

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
