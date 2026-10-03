import { useMemo, useState } from 'react';
import { discountOf } from '../../domain/bons';
import { foodPricePoints, seriesKeyOf, type FoodPricePoint } from '../../domain/foodPrices';
import { keyOfName } from '../../domain/mealplan';
import { sortTags } from '../../domain/nutrition/myProducts';
import { displayPrice, displayUnit } from '../../domain/priceHistory';
import { useFoodTable, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PriceLines, SORT_COLORS, type ChartPoint, type PriceSeries } from '../components/PriceLines';
import { TopBar } from '../components/TopBar';
import { euro } from '../format';
import { lineAmount, linePrice, linePriceParts, productIdsOfName, usePurchases } from '../usePurchases';
import { bonTitle } from './BonScreen';

type Mode = 'regal' | 'bezahlt';
const MODE_KEY = 'mashi-price-mode';
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'bezahlt' ? 'bezahlt' : 'regal'; } catch { return 'regal'; } };

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
/** „500 g“, „1 kg“, „1,5 l“ */
const sizeLabel = (size: string) => {
  if (size === '?') return 'Größe unbekannt';
  const [n, u] = size.split(' ');
  const v = Number(n);
  return v >= 1000 ? `${fmt(v / 1000)} ${u === 'ml' ? 'l' : 'kg'}` : `${fmt(v)} ${u}`;
};

/**
 * Preise nur für ein Lebensmittel (Julia, aus der Kachel „Zuletzt gekauft“): wie oft gekauft, was gespart,
 * günstigster bezahlter Preis, der Verlauf – je Sorte eine Linie, und je Packungsgröße, wenn eine Sorte in mehreren
 * Größen gekauft wurde (größere Packungen sind oft günstiger). Umschalter „Regalpreis / Bezahlt“: bezahlt zeigt
 * Rabatte (Ring) und MHD-Ware (Raute). Die Legende im Diagramm blendet Linien aus – auch bei den Einkäufen.
 */
export function FoodPriceScreen({ name, title }: { name: string; title: string }) {
  const table = useFoodTable();
  const products = useProducts();
  // alle Sorten dieses Lebensmittels (Rinderhack leicht und normal)
  const ids = useMemo(() => {
    const key = keyOfName(name, table);
    return [...new Set([...productIdsOfName(name, table), ...products.filter((p) => key && keyOfName(p.name, table) === key).map((p) => p.id)])];
  }, [name, table, products]);
  const { purchases, history } = usePurchases(name, ids);
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* nur Komfort */ } };
  // per Legende ausgeblendete Linien – gilt für Kacheln, Verlauf und Einkäufe
  const [hidden, setHidden] = useState<string[]>([]);

  const { points, seriesOf, all } = useMemo(() => {
    const points = foodPricePoints(history, purchases);
    const key = seriesKeyOf(points);
    const sortOrder = [...new Set(points.map((p) => p.sortId))];
    const order = [...new Set(points.map((p) => key(p).id))];
    const labelOf = (id: string) => {
      const p0 = points.find((p) => key(p).id === id)!;
      const k = key(p0);
      const p = k.sortId ? products.find((x) => x.id === k.sortId) : undefined;
      const sort = p ? (sortTags(p).join(' · ') || (sortOrder.length > 1 ? 'ohne Zusatz' : title)) : sortOrder.length > 1 ? 'ohne Sorte' : title;
      // nur eine Sorte: die Größe allein reicht („400 g“, „1 kg“) – sonst „leicht · 400 g“
      return k.size ? (sortOrder.length > 1 ? `${sort} · ${sizeLabel(k.size)}` : sizeLabel(k.size)) : sort;
    };
    const all = order.map((id, n) => ({ id, label: labelOf(id), color: SORT_COLORS[n % SORT_COLORS.length] }));
    return { points, seriesOf: (p: FoodPricePoint) => key(p).id, all };
  }, [history, purchases, products, title]);

  const shownPoints = points.filter((p) => !hidden.includes(seriesOf(p)));
  /** je Einheit ein Diagramm (je kg und je Stück lassen sich nicht fair vergleichen); jede Linie behält ihre Farbe */
  const seriesFor = (u: 'g' | 'Stück', onlyShown: boolean): PriceSeries[] => all
    .filter((s) => !onlyShown || !hidden.includes(s.id))
    .map((s) => {
      // je Tag ein Punkt (der letzte Einkauf des Tages)
      const days = new Map<string, ChartPoint>();
      for (const p of points) {
        if (p.unit !== u || seriesOf(p) !== s.id) continue;
        const mark = mode === 'bezahlt' ? (p.mhd ? 'mhd' : p.discount ? 'rabatt' : undefined) : undefined;
        // die Art des Rabatts im Tooltip – derselbe Text wie bei „Alle Einkäufe“
        const why = mark && p.purchase ? linePriceParts(p.purchase.line).why : undefined;
        days.set(p.date.slice(0, 10), { date: p.date, perUnit: mode === 'bezahlt' ? p.paid : p.shelf, ...(mark ? { mark } : {}), ...(why ? { why } : {}) });
      }
      return { ...s, points: [...days.values()] };
    })
    .filter((s) => s.points.length);
  const unitCount = (u: 'g' | 'Stück') => points.filter((p) => p.unit === u).length;
  const unit: 'g' | 'Stück' = unitCount('g') >= unitCount('Stück') ? 'g' : 'Stück';
  const shownPurchases = shownPoints.filter((p) => p.purchase);
  const saved = shownPurchases.reduce((n, p) => n + discountOf(p.purchase!.line), 0);
  // günstigster bezahlter Preis (nach Rabatt) – in der Einheit des Verlaufs
  const cheapest = shownPurchases.filter((p) => p.unit === unit).sort((a, b) => a.paid - b.paid)[0];
  const sortOf = (id?: string) => (id && ids.length > 1 ? products.find((p) => p.id === id) : undefined);
  const marks = mode === 'bezahlt' && shownPoints.some((p) => p.discount || p.mhd);

  return (
    <main className="screen">
      <TopBar title={title} backTo="/preise" />
      {!points.length ? (
        <Empty icon="cart"><span>Noch kein Einkauf per Kassenbon.</span></Empty>
      ) : (
        <>
          <div className="savings__tiles">
            <div className="stat tint-sky">
              <span className="stat__label">Einkäufe</span>
              <strong className="stat__value">{shownPoints.length}</strong>
            </div>
            <div className="stat tint-mint">
              <span className="stat__label">Gespart</span>
              <strong className="stat__value">{euro(saved)}</strong>
            </div>
            <div className="stat tint-butter">
              <span className="stat__label">Günstigster</span>
              <strong className="stat__value">{cheapest ? euro(displayPrice(cheapest.paid, cheapest.unit)) : '–'}</strong>
              {cheapest && <span className="small muted">je {displayUnit(cheapest.unit)}</span>}
            </div>
          </div>

          {/* Julia: Rabatte und MHD im Diagramm sehen – „Bezahlt“ zeigt, was es dich wirklich gekostet hat */}
          {purchases.length > 0 && points.length > 1 && (
            <div className="segments price-view" role="tablist" aria-label="Welcher Preis">
              {([['regal', 'Regalpreis'], ['bezahlt', 'Bezahlt']] as const).map(([v, label]) => (
                <button key={v} role="tab" aria-selected={mode === v} className={`segment${mode === v ? ' is-on' : ''}`} onClick={() => setMode(v)}>{label}</button>
              ))}
            </div>
          )}

          {(['g', 'Stück'] as const).filter((u) => unitCount(u) > 0 && points.length > 1).map((u) => {
            const lines = seriesFor(u, false);
            return (
              <Section key={u} title={`${mode === 'bezahlt' ? 'Bezahlt' : 'Regalpreis'} je ${displayUnit(u)}`}>
                <div className="price-card">
                  <PriceLines series={seriesFor(u, true)} unit={u} label={title} />
                  {/* statt der Chips (Julia: nehmen zu viel Platz): schmale Legende, antippen blendet aus */}
                  {lines.length > 1 && (
                    <div className="price-legend" role="group" aria-label="Linien zeigen">
                      {lines.map((s) => {
                        const on = !hidden.includes(s.id);
                        return (
                          <button key={s.id} type="button" className={`price-legend__item${on ? '' : ' is-off'}`} aria-pressed={on}
                            onClick={() => setHidden(on ? [...hidden, s.id] : hidden.filter((h) => h !== s.id))}>
                            <span className="price-sorts__dot" style={{ background: s.color }} aria-hidden="true" />{s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {marks && (
                    <p className="small muted price-legend__marks">
                      <span className="price-legend__ring" aria-hidden="true" /> mit Rabatt · <span className="price-legend__diamond" aria-hidden="true" /> MHD-Ware
                    </p>
                  )}
                  {/* je Stück neben je kg: mit Packungsgröße an der Sorte wird es vergleichbar */}
                  {u === 'Stück' && unitCount('g') > 0 && (
                    <p className="small muted">Je Stück, weil Mashi die Packungsgröße nicht kennt – trag sie bei der Sorte ein, dann ist der Preis je kg vergleichbar.</p>
                  )}
                </div>
              </Section>
            );
          })}

          {shownPurchases.length > 0 && (
            <Section title="Alle Einkäufe">
              <ul className="bonview">
                {[...shownPurchases].reverse().map(({ purchase: p, paid, unit: u }) => {
                  const sort = sortOf(p!.line.productId);
                  return (
                    <li key={`${p!.bonId}-${p!.index}`} className="bonview__line">
                      <button type="button" className="bonview__open" onClick={() => navigate(`/preise/bon/${p!.bonId}`)} aria-label={`Bon vom ${bonTitle(p!)} ansehen`}>
                        <span className="bonview__name">{bonTitle(p!)}{sort && sortTags(sort).map((t) => <span key={t} className="brand">{t}</span>)}</span>
                        {/* Julia: groß der bezahlte Preis je kg (bzw. je Stück) – so sind Einkäufe vergleichbar */}
                        <span className="bonview__price bonview__price--big">{euro(displayPrice(paid, u))}/{displayUnit(u)}</span>
                        <span className="small muted bonview__sub">{[linePrice(p!.line), p!.line.bon, lineAmount(p!.line)].filter(Boolean).join(' · ')}</span>
                        <Icon name="chevron" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
          {/* ältere Einkäufe (vor dem Speichern der Bons) gibt es nur als Regalpreis */}
          {!purchases.length && (
            <p className="small muted">Ältere Einkäufe kennt Mashi nur mit dem Regalpreis – ab dem nächsten Bon steht hier jeder Einkauf mit Rabatt.</p>
          )}
        </>
      )}
    </main>
  );
}
