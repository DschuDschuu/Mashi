import { normalizeName } from '../../domain/nutrition/localFoods';
import { setFavoriteVariant, setNoNutrition, useNoNutrition } from '../../data/store';
import { Icon } from './Icon';
import { toast } from '../toast';
import type { MatchStatus, NutritionResult } from '../../domain/nutrition/types';
import { gram } from '../format';
import { noticeableRange } from '../../domain/nutrition/variants';

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
    return <p className="muted small">Für dieses Rezept kann Mashi keine verlässlichen Nährwerte berechnen.</p>;
  }
  const ca = n.accuracy === 'geschaetzt' ? 'ca. ' : '';
  const p = n.perServing;
  return (
    <div className="tiles">
      <div className="tile"><strong>{ca}{Math.round(p.kcal)}</strong><span>kcal</span></div>
      <div className="tile"><strong>{gram(p.carbs)}</strong><span>KH</span></div>
      <div className="tile"><strong>{gram(p.protein)}</strong><span>Eiweiß</span></div>
      <div className="tile"><strong>{gram(p.fat)}</strong><span>Fett</span></div>
      <VariantRange n={n} />
    </div>
  );
}

/**
 * Mehrere eigene Sorten (z. B. zwei Pestos): gerechnet wird mit dem Durchschnitt – verändern die
 * Sorten das Gericht spürbar, steht hier die Spanne. Beim Planen/Kochen zählt dann die echte Sorte.
 */
function VariantRange({ n }: { n: NutritionResult }) {
  const r = noticeableRange(n);
  if (!r) return null;
  const names = [...new Set(n.items.filter((i) => i.food?.variants?.length).map((i) => i.name))];
  return (
    <p className="variant-range small muted">
      Je nach Sorte ({names.join(', ')}): {Math.round(r.kcal[0])}–{Math.round(r.kcal[1])} kcal · {gram(r.protein[0])}–{gram(r.protein[1])} Eiweiß pro Portion
    </p>
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
    ['Kalorien', 'kcal'], ['Kohlenhydrate', 'carbs'], ['Eiweiß', 'protein'], ['Fett', 'fat'],
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
        <p className="muted">Zu viele Zutaten konnten nicht zugeordnet werden. Mashi zeigt lieber keine Werte als erfundene.</p>
      )}

      <PerIngredient n={n} />

      <p className="hint small">Nährwerte sind abhängig von den verwendeten Produkten und können abweichen.</p>
    </div>
  );
}

/**
 * „Nicht mitzählen“ / „wieder mitzählen“ – schreibt in die Liste „Ohne Nährwerte“ (gilt für alle Rezepte).
 * Nicht bei Salz & Co., die zählen ohnehin nie.
 */
function ZeroToggle({ item }: { item: NutritionResult['items'][number] }) {
  const list = useNoNutrition();
  // Salz & Co. und optionale Zutaten zählen ohnehin nicht – da gibt es nichts umzuschalten
  if (item.status === 'ignored' && !item.food?.userZero) return null;
  const label = item.food && item.status !== 'unmatched' ? item.food.name : item.name;
  if (item.food?.userZero) {
    const hit = (n: string) => normalizeName(n) === normalizeName(item.name) || normalizeName(n) === normalizeName(item.food!.name);
    return <button type="button" className="link matchlist__toggle" onClick={() => setNoNutrition(list.filter((n) => !hit(n)))}>wieder mitzählen</button>;
  }
  return <button type="button" className="link link--muted matchlist__toggle" onClick={() => setNoNutrition([...list, label])}>nicht mitzählen</button>;
}

/** Sorten einer Zutat mit Stern: antippen = Favorit (gilt für alle Rezepte), nochmal = zurücknehmen */
function FavoriteChips({ item }: { item: NutritionResult['items'][number] }) {
  const all = item.food!.variants!;
  return (
    <span className="matchlist__favs">
      {all.map((v) => {
        const on = item.food!.favoriteId === v.id;
        return (
          <button key={v.id} type="button" className={`favchip${on ? ' is-on' : ''}`} aria-pressed={on}
            aria-label={on ? `${v.name}: Favorit zurücknehmen` : `${v.name} als Favorit`}
            onClick={() => {
              setFavoriteVariant(all, on ? null : v.id);
              toast(on ? 'Favorit zurückgenommen – Rezepte rechnen wieder mit dem Durchschnitt' : `★ „${v.name}“ ist dein Favorit – gilt für alle Rezepte`);
            }}>
            <Icon name="star" size={13} filled={on} /> {v.name} · {Math.round(v.per100g.kcal)} kcal
          </button>
        );
      })}
    </span>
  );
}

/**
 * „Je Zutat · pro Portion“ – immer offen: was jede Zutat beiträgt, größte zuerst, mit Anteil an den kcal.
 * Darunter, womit gerechnet wurde (Tabelle, dein Produkt, Sorten) und die Schalter (nicht mitzählen, Favorit).
 * Was nicht mitzählt (Salz, nicht gefunden …), steht am Ende.
 */
function PerIngredient({ n }: { n: NutritionResult }) {
  const counted = n.items.filter((i) => i.perServing).sort((a, b) => b.perServing!.kcal - a.perServing!.kcal);
  const rest = n.items.filter((i) => !i.perServing);
  const total = counted.reduce((s, i) => s + i.perServing!.kcal, 0);
  return (
    <section className="perz" aria-labelledby="perz-title">
      <h3 className="perz__title" id="perz-title">Je Zutat <span className="muted small">· pro Portion</span></h3>
      <ul>
        {counted.map((i) => {
          const share = total > 0 ? Math.round((i.perServing!.kcal / total) * 100) : 0;
          return (
            <li key={i.ingredientId} className="perz__item">
              <div className="perz__head">
                <span className="perz__name">{i.name}{i.gramsPerServing !== undefined && <span className="muted"> · {Math.round(i.gramsPerServing)} g</span>}</span>
                <span className="perz__kcal">{Math.round(i.perServing!.kcal)} kcal</span>
              </div>
              <div className="perz__barrow" aria-label={`${share} % der Kalorien`}>
                <span className="perz__bar"><span style={{ width: `${share}%` }} /></span>
                <span className="perz__share">{share} %</span>
              </div>
              <span className="small">KH {gram(i.perServing!.carbs)} · Eiweiß {gram(i.perServing!.protein)} · Fett {gram(i.perServing!.fat)}</span>
              {sourceOf(i) && <span className="small muted">{sourceOf(i)}</span>}
              <ZeroToggle item={i} />
              {i.food?.variants && i.food.variants.length > 1 && <FavoriteChips item={i} />}
            </li>
          );
        })}
        {rest.map((i) => (
          <li key={i.ingredientId} className="perz__item is-rest">
            <div className="perz__head">
              <span className="perz__name">{i.name}</span>
              <span className="perz__kcal muted small">{i.food?.userZero ? 'ohne Nährwerte (von dir)' : MATCH_LABEL[i.status]}</span>
            </div>
            <ZeroToggle item={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Womit gerechnet wurde: Sorten, Favorit, dein Produkt oder die Tabelle – „ungefähr“, wenn nur ähnlich */
function sourceOf(i: NutritionResult['items'][number]): string {
  const f = i.food;
  if (!f) return '';
  const what = f.variants?.length
    ? (f.favoriteId ? `★ ${f.variants.find((v) => v.id === f.favoriteId)?.name} (Favorit)` : `Ø ${f.variants.length} Sorten`)
    : f.name;
  // nur zeigen, wenn es etwas Neues sagt – nicht „Hähnchenhack“ unter „Hähnchenhack“
  if (i.status !== 'approx' && normalizeName(what) === normalizeName(i.name)) return '';
  return i.status === 'approx' ? `${what} · ungefähr` : what;
}
