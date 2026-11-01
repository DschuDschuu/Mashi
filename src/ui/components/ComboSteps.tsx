import { useState } from 'react';
import { weekCookSteps } from '../../domain/weekCraving';
import { NO_SPICE, SPICES, defaultSpice, type OwnStep } from '../../domain/cookStyle';
import { foodOf, ownOf, prepOf, sideOf, styleOf, type SideStyle } from '../../domain/sides';
import type { Household } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { currentContent } from '../../domain/recipe';
import { DAY_LONG, type CarbCarry } from '../../domain/week';
import { setSideFood, setSidePrep, usePantry, useRecipes } from '../../data/store';
import { navigate } from '../../router';
import { useSheet } from '../useSheet';
import { toast } from '../toast';
import { Stepper } from './Controls';
import { Icon } from './Icon';
import { IngredientNames } from './IngredientNames';

/**
 * „So geht's“ für einen Baukasten-Abend (Julia: „woher weiß ich, wie ich das zubereite?“) – mit Kochstil (craving.ts:
 * weekCookSteps): das Längste zuerst, Würze und Zubereitung umschaltbar (gespeichert am Abend über `onStyle`), feste
 * Bausteine mit Stift zum Ändern: als Standard oder nur bei dieser Grundlage.
 */
export function ComboSteps({ side, base, household, carry, portions = 1, onStyle }: {
  side: string; base: Recipe; household: Household; carry?: CarbCarry; portions?: number;
  /** Würze oder Zubereitung am Abend ändern – ohne: nur anzeigen */ onStyle?: (style: Partial<SideStyle>) => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const recipes = useRecipes();
  const pantry = usePantry();
  // zweimal Nudeln (auch deine Gnocchi): am ersten Abend mitkochen, am zweiten nur aufwärmen – das macht weekCookSteps
  // vor dem Zusammenführen (auch „Pasta mit Brokkoli“ sagt es dann); hier nur nach Dauer ordnen
  const more = carry?.with !== undefined ? { entry: carry.side, portions: carry.portions ?? 0 } : undefined;
  const steps = weekCookSteps(side, base, {
    household, recipes, items: pantry.items, portions,
    ...(carry ? { carry: {
      entry: carry.side, ...(more ? { portions: more.portions } : {}),
      ...(carry.with !== undefined ? { with: DAY_LONG[carry.with] } : {}), ...(carry.from !== undefined ? { from: DAY_LONG[carry.from] } : {}),
    } } : {}),
  }).sort((a, b) => b.minutes - a.minutes);
  const style = styleOf(side);
  const spice = style.spice ?? defaultSpice(style.direction) ?? NO_SPICE;
  return (
    <>
      {/* Würze für diesen Abend – die der Richtung ist vorgewählt (cookStyle.ts) */}
      {onStyle && (
        <div className="craving-spice combo-steps__spice" role="group" aria-label="Würze">
          <span className="small muted">Würze</span>
          {[...SPICES, { id: NO_SPICE, name: 'ohne' }].map((x) => (
            <button key={x.id} type="button" className={`chip chip--xs${spice === x.id ? ' is-on' : ''}`} aria-pressed={spice === x.id}
              onClick={() => onStyle({ spice: x.id })}>{x.name}</button>
          ))}
        </div>
      )}
      <ol className="combo-steps">
        {steps.map((s) => {
          // dein Rezept: der Name führt hin. Zu kochen → gleich in den Kochmodus, mit der Menge für heute und fürs
          // Mitkochen (den Rest trägst du bei „Was ist übrig?“ ein – dann steht er morgen vorgekocht da); vorgekocht → zum Rezept
          const mine = s.source === 'rezept' ? ownOf(s.ids[0]) : undefined;
          const cookFor = portions + (more && more.entry === s.ids[0] ? more.portions : 0);
          const to = mine && (s.ready ? `/rezept/${mine.recipeId}` : `/rezept/${mine.recipeId}/kochen?p=${cookFor}`);
          return (
            <li key={s.ids.join('+')}>
              <span>{mine && to
                ? <button type="button" className="combo-steps__recipe" onClick={() => navigate(to)}>{s.name}</button>
                : <b>{s.name}</b>} {s.text ?? (s.steps ? null : <span className="muted">– noch keine Zubereitung</span>)}{s.minutes > 0 ? <span className="muted"> · {s.minutes} Min.</span> : null}
                {s.from && <span className="muted"> · aus „{s.from}“</span>}
                {s.source === 'grundlage' && <span className="tag">nur hier</span>}
                {/* Stift direkt am Text – unter den Chips stand er sonst allein in einer Zeile */}
                {s.fixed && s.ids.length === 1 && <button type="button" className="iconbtn iconbtn--sm" aria-label={`Zubereitung ${s.name} ändern`} onClick={() => setEdit(s.ids[0])}><Icon name="pencil" size={14} /></button>}
                {/* anders zubereiten – auch in der gemeinsamen Pfanne je Baustein */}
                {onStyle && s.options?.map((o) => (
                  <span key={o.id} className="craving-ways" role="group" aria-label={`Zubereitung ${o.name}`}>
                    {s.options!.length > 1 && <span className="small muted">{o.name}</span>}
                    {o.ways.map((w) => (
                      <button key={w.id} type="button" className={`chip chip--xs${o.chosen === w.id ? ' is-on' : ''}`} aria-pressed={o.chosen === w.id}
                        onClick={() => onStyle({ ways: { [o.id]: w.id } })}>{w.label}</button>
                    ))}
                  </span>
                ))}</span>
              {s.steps && <OwnSteps steps={s.steps} />}
            </li>
          );
        })}
      </ol>
      {edit && <PrepSheet sideId={edit} base={base} household={household} onClose={() => setEdit(null)} />}
    </>
  );
}

/**
 * Deine Schritte unter deinem Rezept als Baustein (Julia: „die Kochschritte bleiben“ – Weg B) – statt „nach deinem
 * Rezept“, eingerückt unter seinem Namen. Dieselbe Liste in „So geht's“ auf der Lust-Seite und im Wochenplan.
 */
export function OwnSteps({ steps }: { steps: readonly OwnStep[] }) {
  return (
    <ol className="own-steps">
      {steps.map((st, i) => (
        <li key={i}>{st.text}{st.timerMinutes ? <span className="muted"> · {st.timerMinutes}&nbsp;Min.</span> : null}</li>
      ))}
    </ol>
  );
}

/** Zubereitung eines Bausteins ändern – ohne `base` nur als Standard (Einstellungen) */
export function PrepSheet({ sideId, base, household, onClose }: { sideId: string; base?: Recipe; household: Household; onClose: () => void }) {
  const ref = useSheet(onClose);
  const side = sideOf(sideId);
  const here = base?.blockPrep?.[sideId];
  const now = prepOf(sideId, household, base);
  const [text, setText] = useState(now?.text ?? '');
  const [minutes, setMinutes] = useState(now?.minutes ?? 5);
  const [onlyBase, setOnlyBase] = useState(!!here);
  // was du dafür kaufst (Julia: „Guacamole kaufe ich fertig“) – leer: Mashis Standard (Guacamole → Avocado)
  const standard = side ? foodOf(side) : '';
  const [food, setFood] = useState(household.sideFood?.[sideId] ?? '');
  const baseTitle = base ? currentContent(base).title : '';
  const own = onlyBase ? !!here : !!household.sidePrep?.[sideId];

  const save = () => {
    const prep = text.trim() ? { text: text.trim(), minutes } : undefined;
    // nur, was sich geändert hat – sonst machte schon „Kaufst du als“ die unveränderte Zubereitung zu deiner eigenen
    const prepChanged = text.trim() !== (now?.text ?? '') || minutes !== (now?.minutes ?? 5) || onlyBase !== !!here;
    const foodNow = food.trim() === standard ? '' : food.trim();
    const foodChanged = foodNow !== (household.sideFood?.[sideId] ?? '');
    const undos: (() => void)[] = [];
    if (prepChanged) {
      undos.push(setSidePrep(sideId, prep, onlyBase && base ? base.id : undefined));
      // von „nur hier“ auf Standard gewechselt: die Abweichung bei der Grundlage fällt weg
      if (!onlyBase && base && here) undos.push(setSidePrep(sideId, undefined, base.id));
    }
    if (foodChanged) undos.push(setSideFood(sideId, foodNow || undefined));
    const said = [prepChanged && `${onlyBase ? `nur bei ${baseTitle}` : 'Standard'} gespeichert`, foodChanged && `kaufst du als ${foodNow || standard}`].filter(Boolean);
    if (undos.length) toast(`${side?.name ?? 'Baustein'}: ${said.join(', ')}`, { label: 'Rückgängig', run: () => undos.reverse().forEach((u) => u()) });
    onClose();
  };
  const reset = () => {
    const undo = setSidePrep(sideId, undefined, onlyBase && base ? base.id : undefined);
    toast(`${side?.name ?? 'Baustein'}: wieder ${onlyBase ? 'wie überall' : 'Mashis Standard'}`, { label: 'Rückgängig', run: undo });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Zubereitung ${side?.name ?? ''}`} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{side?.name}: so bereitest du es zu</h2>
        <label className="field">Zubereitung<input value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. halbieren und kurz mitbraten" maxLength={120} /></label>
        <div className="row-between">
          <span>Minuten <small className="muted">0 = nur dazu/drüber</small></span>
          <Stepper small min={0} max={90} value={minutes} onChange={setMinutes} label="Minuten" />
        </div>
        {base && (
          <label className="row-gap small">
            <input type="checkbox" checked={onlyBase} onChange={(e) => setOnlyBase(e.target.checked)} /> Nur bei {baseTitle} so
          </label>
        )}
        {/* gilt überall, nicht nur bei dieser Grundlage – darum unter dem Haken */}
        <label className="field">Kaufst du als
          <input value={food} onChange={(e) => setFood(e.target.value)} placeholder={standard} list="ingredient-names" maxLength={60} />
          <small className="muted">Für Einkauf, Vorrat und Nährwerte, überall – leer: {standard}</small>
        </label>
        <IngredientNames />
        <div className="variants__actions">
          {own && <button type="button" className="btn btn--ghost" onClick={reset}>Zurücksetzen</button>}
          <button type="button" className="btn btn--primary" onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
