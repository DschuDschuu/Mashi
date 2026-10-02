import { useMemo, useState } from 'react';
import { discountOf, paidOf, rowFromLine, type Purchase } from '../../domain/bons';
import type { PriceEntry } from '../../domain/cost';
import { keyOfName } from '../../domain/mealplan';
import { sortTags } from '../../domain/nutrition/myProducts';
import { priceOf, receiptKey } from '../../domain/pantry';
import { displayPrice, displayUnit, type PricePoint } from '../../domain/priceHistory';
import { useFoodTable, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PriceLines } from '../components/PriceLines';
import { TopBar } from '../components/TopBar';
import { euro } from '../format';
import { lineAmount, linePrice, perKg, productIdsOfName, usePurchases } from '../usePurchases';
import { bonTitle } from './BonScreen';

/** je Sorte eine Farbe – gut unterscheidbar, passend zu den Farben der App */
const COLORS = ['#3f8f88', '#c0703f', '#6a74c9', '#b4527b', '#5f8f3e', '#8a6d3b'];

/**
 * Preise nur für ein Lebensmittel (Julia, aus der Kachel „Zuletzt gekauft“): wie oft gekauft, was gespart,
 * günstigster bezahlter Preis, der Verlauf des Regalpreises – je Sorte eine Linie, per Chip ein- und ausblendbar
 * (fair vergleichen: leicht und normal nicht vermischt) – und jeder Einkauf mit Weg zum Bon.
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
  const unitCount = (u: 'g' | 'Stück') => history.filter((h) => h.unit === u).length;
  const unit: 'g' | 'Stück' = unitCount('g') >= unitCount('Stück') ? 'g' : 'Stück';
  /**
   * Je Sorte und Einheit ein Verlauf – je kg und je Stück lassen sich nicht fair vergleichen, darum je Einheit
   * ein eigenes Diagramm. Jede Sorte behält über beide dieselbe Farbe.
   */
  const { sorts, byUnit } = useMemo(() => {
    // ältere Preise ohne Sorte: über den Bon desselben Tages zuordnen
    const sortOfEntry = (h: PriceEntry) => h.productId
      ?? purchases.find((p) => p.date.slice(0, 10) === h.date.slice(0, 10) && receiptKey(p.line.name) === receiptKey(h.name))?.line.productId;
    const days = new Map<string, Map<string, PricePoint>>();
    const order: string[] = [];
    for (const h of history) {
      const id = sortOfEntry(h) ?? '';
      if (!order.includes(id)) order.push(id);
      const k = `${h.unit}|${id}`;
      const d = days.get(k) ?? new Map<string, PricePoint>();
      d.set(h.date.slice(0, 10), { date: h.date, perUnit: h.perUnit });
      days.set(k, d);
    }
    const sortList = order.map((id, n) => {
      const p = id ? products.find((x) => x.id === id) : undefined;
      const label = p ? (sortTags(p).join(' · ') || (order.length > 1 ? 'ohne Zusatz' : title)) : 'ohne Sorte';
      return { id, label, color: COLORS[n % COLORS.length] };
    });
    const of = (u: 'g' | 'Stück') => sortList
      .map((x) => ({ ...x, points: [...(days.get(`${u}|${x.id}`)?.values() ?? [])].sort((a, b) => a.date.localeCompare(b.date)) }))
      .filter((x) => x.points.length);
    return { sorts: sortList, byUnit: { g: of('g'), Stück: of('Stück') } };
  }, [history, purchases, products, title]);
  // per Chip ausgeblendete Sorten – gilt für Kacheln, Verlauf und Einkäufe
  const [hidden, setHidden] = useState<string[]>([]);
  const shownOf = (u: 'g' | 'Stück') => byUnit[u].filter((x) => !hidden.includes(x.id));
  const shownPurchases = purchases.filter((p) => !hidden.includes(p.line.productId ?? ''));
  const saved = shownPurchases.reduce((n, p) => n + discountOf(p.line), 0);
  // günstigster bezahlter Preis (nach Rabatt) – in der Einheit des Verlaufs
  const paidEntry = (p: Purchase) => {
    const row = rowFromLine(p.line);
    return priceOf({ ...row, line: { ...row.line, price: paidOf(p.line) } }, p.date);
  };
  const cheapest = shownPurchases
    .map(paidEntry)
    .filter((e): e is PriceEntry => !!e && e.unit === unit)
    .sort((a, b) => a.perUnit - b.perUnit)[0];
  const sortOf = (id?: string) => (id && ids.length > 1 ? products.find((p) => p.id === id) : undefined);
  const pointsOf = (u: 'g' | 'Stück') => shownOf(u).reduce((n, x) => n + x.points.length, 0);
  const points = pointsOf('g') + pointsOf('Stück');

  return (
    <main className="screen">
      <TopBar title={title} backTo="/preise" />
      {!purchases.length && !history.length ? (
        <Empty icon="cart"><span>Noch kein Einkauf per Kassenbon.</span></Empty>
      ) : (
        <>
          {sorts.length > 1 && (
            <div className="chips price-sorts" role="group" aria-label="Sorten zeigen">
              {sorts.map((x) => {
                const on = !hidden.includes(x.id);
                return (
                  <button key={x.id} type="button" className={`chip chip--sm${on ? ' is-on' : ''}`} aria-pressed={on}
                    onClick={() => setHidden(on ? [...hidden, x.id] : hidden.filter((h) => h !== x.id))}>
                    <span className="price-sorts__dot" style={{ background: x.color }} aria-hidden="true" /> {x.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="savings__tiles">
            <div className="stat tint-sky">
              <span className="stat__label">Einkäufe</span>
              <strong className="stat__value">{Math.max(shownPurchases.length, points)}</strong>
            </div>
            <div className="stat tint-mint">
              <span className="stat__label">Gespart</span>
              <strong className="stat__value">{euro(saved)}</strong>
            </div>
            <div className="stat tint-butter">
              <span className="stat__label">Günstigster</span>
              <strong className="stat__value">{cheapest ? `${euro(displayPrice(cheapest.perUnit, cheapest.unit))}` : '–'}</strong>
              {cheapest && <span className="small muted">je {displayUnit(cheapest.unit)}</span>}
            </div>
          </div>

          {(['g', 'Stück'] as const).filter((u) => pointsOf(u) > 0 && points > 1).map((u) => (
            <Section key={u} title={`Regalpreis je ${displayUnit(u)}`}>
              <div className="price-card">
                <PriceLines series={shownOf(u)} unit={u} label={title} />
                {/* je Stück neben je kg: mit Packungsgröße an der Sorte wird es vergleichbar */}
                {u === 'Stück' && byUnit.g.length > 0 && (
                  <p className="small muted">Je Stück, weil Mashi die Packungsgröße nicht kennt – trag sie bei der Sorte ein, dann ist der Preis je kg vergleichbar.</p>
                )}
              </div>
            </Section>
          ))}

          {shownPurchases.length > 0 && (
            <Section title="Alle Einkäufe">
              <ul className="bonview">
                {shownPurchases.map((p) => {
                  const sort = sortOf(p.line.productId);
                  return (
                    <li key={`${p.bonId}-${p.index}`} className="bonview__line">
                      <button type="button" className="bonview__open" onClick={() => navigate(`/preise/bon/${p.bonId}`)} aria-label={`Bon vom ${bonTitle(p)} ansehen`}>
                        <span className="bonview__name">{bonTitle(p)}{sort && sortTags(sort).map((t) => <span key={t} className="brand">{t}</span>)}</span>
                        <span className="bonview__price">{linePrice(p.line)}</span>
                        <span className="small muted bonview__sub">{[p.line.bon, lineAmount(p.line), perKg(p.line)].filter(Boolean).join(' · ')}</span>
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
