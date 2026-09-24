import type { MatchStatus, NutritionResult } from '../../domain/nutrition/types';
import { gram } from '../format';

const ACCURACY = {
  berechnet: { dot: 'green', label: 'Berechnet' },
  geschaetzt: { dot: 'yellow', label: 'Geschätzt' },
  nicht_verfuegbar: { dot: 'grey', label: 'Nicht verfügbar' },
} as const;

export function AccuracyBadge({ n }: { n: NutritionResult }) {
  const a = ACCURACY[n.accuracy];
  return <span className="accuracy"><span className={`dot dot--${a.dot}`} />{a.label}</span>;
}

/** Die vier Kacheln unter dem Titel. „ca.“ bei Schätzung, nichts bei „nicht verfügbar“. */
export function NutritionTiles({ n }: { n: NutritionResult }) {
  if (!n.perServing) {
    return <p className="muted small">Für dieses Rezept können wir keine verlässlichen Nährwerte berechnen.</p>;
  }
  const ca = n.accuracy === 'geschaetzt' ? 'ca. ' : '';
  const p = n.perServing;
  return (
    <div className="tiles">
      <div className="tile"><strong>{ca}{Math.round(p.kcal)}</strong><span>kcal</span></div>
      <div className="tile"><strong>{gram(p.protein)}</strong><span>Protein</span></div>
      <div className="tile"><strong>{gram(p.carbs)}</strong><span>Kohlenhydr.</span></div>
      <div className="tile"><strong>{gram(p.fat)}</strong><span>Fett</span></div>
    </div>
  );
}

const MATCH_LABEL: Record<MatchStatus, string> = {
  exact: 'zugeordnet',
  approx: 'ungefähr',
  'no-weight': 'Menge nicht umrechenbar',
  'no-amount': 'ohne Menge',
  unmatched: 'nicht gefunden',
  ignored: 'nicht mitgerechnet',
};

export function NutritionDetails({ n, servings }: { n: NutritionResult; servings: number }) {
  const rows: [string, keyof NonNullable<NutritionResult['total']>][] = [
    ['Kalorien', 'kcal'], ['Protein', 'protein'], ['Kohlenhydrate', 'carbs'], ['Fett', 'fat'],
    ['Ballaststoffe', 'fiber'], ['Zucker', 'sugar'], ['Ges. Fettsäuren', 'satFat'], ['Salz', 'salt'],
  ];
  return (
    <div className="stack">
      <div className="row-between">
        <AccuracyBadge n={n} />
        <span className="muted small">pro Portion · gesamt ({servings})</span>
      </div>

      {n.perServing && n.total ? (
        <table className="ntable">
          <tbody>
            {rows.filter(([, k]) => n.perServing![k] !== undefined).map(([label, k]) => (
              <tr key={k}>
                <th>{label}</th>
                <td>{k === 'kcal' ? Math.round(n.perServing![k]!) + ' kcal' : gram(n.perServing![k]!)}</td>
                <td className="muted">{k === 'kcal' ? Math.round((n.perServing![k]! * servings)) + ' kcal' : gram(n.perServing![k]! * servings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Zu viele Zutaten konnten nicht zugeordnet werden. Wir zeigen lieber keine Werte als erfundene.</p>
      )}

      <details className="matchlist">
        <summary>Wie wurde gerechnet?</summary>
        <ul>
          {n.items.map((i) => (
            <li key={i.ingredientId}>
              <span className={`dot dot--${i.status === 'exact' ? 'green' : i.status === 'ignored' ? 'grey' : 'yellow'}`} />
              <span className="matchlist__name">{i.name}</span>
              <span className="muted small">
                {i.food && i.status !== 'unmatched' ? `${i.food.name}${i.grams !== undefined ? ` · ${Math.round(i.grams)} g` : ''} · ` : ''}
                {MATCH_LABEL[i.status]}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <p className="hint small">Nährwerte sind abhängig von den verwendeten Produkten und können abweichen.</p>
    </div>
  );
}
