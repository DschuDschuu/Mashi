import { useState } from 'react';
import { DRESSINGS, activeSalad, makeSalad, saladText, saladToppings, saladVeg } from '../../domain/sideSalad';
import type { Household } from '../../domain/mealplan';
import type { Recipe } from '../../domain/types';
import { householdOf, setSalad, usePlan } from '../../data/store';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Switch } from './Controls';
import { Icon } from './Icon';

/**
 * Beilagensalat am Rezept (Julia: „immer einen Salat zu einem Rezept dazu machen, wo man seine Zutaten wählt“) – unter
 * den Tauschplätzen: „+ Beilagensalat“, gewählt eine Zeile mit „ändern“. Nicht bei Grundlagen der Vorkoch-Woche: deren
 * Abende stellst du im Baukasten zusammen, Gemüse inklusive.
 */
export function SaladPanel({ recipe }: { recipe: Recipe }) {
  const plan = usePlan();
  const hh = householdOf(plan);
  const [open, setOpen] = useState(false);
  if (plan.week?.bases.some((b) => b.recipeId === recipe.id)) return null;
  const active = activeSalad(recipe);
  return (
    <>
      {active
        ? (
          <div className="salad-line">
            <Icon name="leaf" size={16} />
            <span className="salad-line__text">
              <b>Beilagensalat</b> {saladText(active)} <span className="small muted">· {active.keep ? 'immer dazu' : 'nur fürs nächste Kochen'}</span>
            </span>
            <button type="button" className="link small" onClick={() => setOpen(true)}>ändern</button>
          </div>
        )
        : <button type="button" className="link small salad-add" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Beilagensalat</button>}
      {open && <SaladSheet recipe={recipe} household={hh} onClose={() => setOpen(false)} />}
    </>
  );
}

function SaladSheet({ recipe, household, onClose }: { recipe: Recipe; household: Household; onClose: () => void }) {
  const ref = useSheet(onClose);
  const active = activeSalad(recipe);
  // vorbelegt wie zuletzt – auch wenn der Salat vom letzten Mal schon gegessen ist (Julia: „wie letztes Mal“)
  const last = recipe.salad;
  const [items, setItems] = useState<string[]>(() => last?.items.map((i) => i.side) ?? []);
  const [dressing, setDressing] = useState<string | undefined>(() => (last ? last.dressing : DRESSINGS[0].id));
  const [topping, setTopping] = useState<string | undefined>(() => last?.topping?.side);
  const [keep, setKeep] = useState(!!last?.keep);
  const veg = saladVeg(household.customSides);
  const toppings = saladToppings(household.customSides);
  const toggle = (id: string) => setItems(items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);

  const save = () => {
    const salad = makeSalad(items, { dressing, topping, keep, household, now: new Date().toISOString() });
    if (!salad) return;
    toast(active ? 'Beilagensalat geändert' : 'Beilagensalat dazu', { label: 'Rückgängig', run: setSalad(recipe.id, salad) });
    onClose();
  };
  const remove = () => {
    toast('Beilagensalat weg', { label: 'Rückgängig', run: setSalad(recipe.id, undefined) });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet salad-sheet" role="dialog" aria-modal="true" aria-label="Beilagensalat" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Beilagensalat</h2>
        <p className="small muted">Kommt mit auf die Einkaufsliste, in die Nährwerte und als letzter Schritt in den Kochmodus.</p>
        <div className="salad-sheet__group">
          <span className="small muted">Gemüse</span>
          <div className="chips" role="group" aria-label="Gemüse">
            {veg.map((s) => (
              <button key={s.id} type="button" className={`chip chip--sm${items.includes(s.id) ? ' is-on' : ''}`} aria-pressed={items.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</button>
            ))}
          </div>
        </div>
        <div className="salad-sheet__group">
          <span className="small muted">Dressing</span>
          <div className="chips" role="group" aria-label="Dressing">
            {[...DRESSINGS.map((d) => ({ id: d.id as string | undefined, name: d.name })), { id: undefined, name: 'ohne' }].map((d) => (
              <button key={d.id ?? '-'} type="button" className={`chip chip--sm${dressing === d.id ? ' is-on' : ''}`} aria-pressed={dressing === d.id} onClick={() => setDressing(d.id)}>{d.name}</button>
            ))}
          </div>
        </div>
        <div className="salad-sheet__group">
          <span className="small muted">Topping</span>
          <div className="chips" role="group" aria-label="Topping">
            {[...toppings.map((t) => ({ id: t.id as string | undefined, name: t.name })), { id: undefined, name: 'ohne' }].map((t) => (
              <button key={t.id ?? '-'} type="button" className={`chip chip--sm${topping === t.id ? ' is-on' : ''}`} aria-pressed={topping === t.id} onClick={() => setTopping(t.id)}>{t.name}</button>
            ))}
          </div>
        </div>
        <Switch checked={keep} onChange={setKeep} label="Immer dazu" hint={keep ? 'Bleibt bei diesem Rezept, bis du ihn wegnimmst.' : 'Nur fürs nächste Kochen – danach ist er wieder weg.'} />
        <div className="variants__actions">
          {active ? <button type="button" className="btn btn--ghost" onClick={remove}>Weglassen</button> : <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>}
          <button type="button" className="btn btn--primary" onClick={save} disabled={!items.length}>{active ? 'Übernehmen' : 'Dazu'}</button>
        </div>
      </div>
    </div>
  );
}
