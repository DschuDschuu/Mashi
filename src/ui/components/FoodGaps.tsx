import { useMemo, useState } from 'react';
import { nutritionGaps, type FoodGap } from '../../domain/nutrition/gaps';
import { householdOf, useFoodTable, usePlan, useRecipes } from '../../data/store';
import { Icon } from './Icon';
import { NewProduct } from './NewProduct';
import { TileSummary } from './TileSummary';

/** „in Testpfanne und Testsuppe“, „in Testpfanne, Testsuppe und 3 weiteren“ – dazu „Baustein“, wenn du ihn einplanst */
function whereText(g: FoodGap): string {
  const titles = g.recipes.map((r) => r.title);
  const list = titles.length > 3 ? `${titles.slice(0, 2).join(', ')} und ${titles.length - 2} weiteren` : titles.length > 1 ? `${titles.slice(0, -1).join(', ')} und ${titles.at(-1)}` : titles[0];
  return [list && `in ${list}`, g.block && 'Baustein'].filter(Boolean).join(' · ');
}

/**
 * Nährwert-Lücken (Julia: „welchen Zutaten fehlen Werte?“ – seit Tauschen und Beilagensalat steht öfter „mind. … kcal“):
 * oben in „Meine Lebensmittel“, zugeklappt, verschwindet, wenn nichts fehlt. Unbekannt → gleich anlegen, mit dem
 * Formular wie überall; ohne Gewicht („1 Stück“) → die Kachel aufklappen, dort „1 Stück wiegt“ – gibt es
 * noch keine, anlegen. Mashi trägt keine Werte selbst ein.
 */
export function FoodGaps({ onOpen }: {
  /** die Kachel dieses Lebensmittels aufklappen – false: es hat noch keine */
  onOpen: (name: string) => boolean;
}) {
  const recipes = useRecipes();
  const table = useFoodTable();
  const plan = usePlan();
  const gaps = useMemo(() => nutritionGaps(recipes, table, { household: householdOf(plan), week: plan.week }), [recipes, table, plan]);
  const [adding, setAdding] = useState<string | null>(null);
  if (!gaps.length) return null;
  const unknown = gaps.filter((g) => g.kind === 'unbekannt').length;
  return (
    <details className="panel fold food-gaps">
      <TileSummary icon="info" title={`Fehlen Werte (${gaps.length})`}
        text={unknown === gaps.length ? 'Mashi kennt sie nicht – dort steht nur „mind. … kcal“' : 'Unbekannt oder ohne Gewicht – dort steht nur „mind. … kcal“'} />
      <ul className="food-gaps__list">
        {gaps.map((g) => (
          <li key={g.name} className="food-gaps__item">
            {adding === g.name ? <NewProduct name={g.name} onDone={() => setAdding(null)} /> : (
              <>
                <span className="food-gaps__text">
                  <strong>{g.name}</strong>
                  <small className="muted">
                    {g.kind === 'unbekannt' ? 'keine Werte' : g.units.join() === 'Stück' ? 'Stückgewicht fehlt' : `„${g.units.join('“, „')}“ ohne Gramm`}{whereText(g) ? ` · ${whereText(g)}` : ''}
                  </small>
                </span>
                {g.kind === 'unbekannt'
                  ? <button type="button" className="btn btn--soft btn--sm" onClick={() => setAdding(g.name)}><Icon name="plus" size={16} /> Werte</button>
                  : <button type="button" className="btn btn--soft btn--sm" onClick={() => { if (!onOpen(g.name)) setAdding(g.name); }}><Icon name="pencil" size={16} /> Gewicht</button>}
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
