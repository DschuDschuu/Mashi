import { useMemo } from 'react';
import { discountOf, paidOf, rowFromLine, type Purchase } from '../../domain/bons';
import type { PriceEntry } from '../../domain/cost';
import { keyOfName } from '../../domain/mealplan';
import { sortTags } from '../../domain/nutrition/myProducts';
import { priceOf } from '../../domain/pantry';
import { displayPrice, displayUnit, priceTrends } from '../../domain/priceHistory';
import { useFoodTable, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PriceChart } from '../components/PriceChart';
import { TopBar } from '../components/TopBar';
import { euro } from '../format';
import { lineAmount, linePrice, usePurchases } from '../usePurchases';
import { bonTitle } from './BonScreen';

/**
 * Preise nur für ein Lebensmittel (Julia, aus der Kachel „Zuletzt gekauft“): wie oft gekauft, was gespart,
 * günstigster bezahlter Preis, der Verlauf des Regalpreises – und jeder Einkauf mit Weg zum Bon.
 */
export function FoodPriceScreen({ name, title }: { name: string; title: string }) {
  const table = useFoodTable();
  const products = useProducts();
  // alle Sorten dieses Lebensmittels (Rinderhack leicht und normal)
  const ids = useMemo(() => {
    const key = keyOfName(name, table);
    return products.filter((p) => key && keyOfName(p.name, table) === key).map((p) => p.id);
  }, [name, table, products]);
  const { purchases, history } = usePurchases(name, ids);
  const trends = useMemo(() => priceTrends(history, 1), [history]);
  const saved = purchases.reduce((s, p) => s + discountOf(p.line), 0);
  // günstigster bezahlter Preis je kg bzw. Stück (nach Rabatt) – in der Einheit des Verlaufs
  const unit = trends[0]?.unit;
  const paidEntry = (p: Purchase) => {
    const row = rowFromLine(p.line);
    return priceOf({ ...row, line: { ...row.line, price: paidOf(p.line) } }, p.date);
  };
  const cheapest = purchases
    .map(paidEntry)
    .filter((e): e is PriceEntry => !!e && e.unit === unit)
    .sort((a, b) => a.perUnit - b.perUnit)[0];
  const sortOf = (id?: string) => (id && ids.length > 1 ? products.find((p) => p.id === id) : undefined);

  return (
    <main className="screen">
      <TopBar title={title} backTo="/preise" />
      {!purchases.length && !history.length ? (
        <Empty icon="cart"><span>Noch kein Einkauf per Kassenbon.</span></Empty>
      ) : (
        <>
          <div className="savings__tiles">
            <div className="stat tint-sky">
              <span className="stat__label">Einkäufe</span>
              <strong className="stat__value">{Math.max(purchases.length, trends.reduce((n, t) => Math.max(n, t.points.length), 0))}</strong>
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

          {trends.filter((t) => t.points.length > 1).map((t) => (
            <Section key={t.unit} title={`Regalpreis je ${displayUnit(t.unit)}`}>
              <div className="price-card">
                <p className="small muted">
                  zuletzt <strong className="price-card__now">{euro(displayPrice(t.latest, t.unit))}/{displayUnit(t.unit)}</strong> · {t.points.length} Einkäufe
                </p>
                <PriceChart points={t.points} unit={t.unit} label={title} />
              </div>
            </Section>
          ))}

          {purchases.length > 0 && (
            <Section title="Alle Einkäufe">
              <ul className="bonview">
                {purchases.map((p) => {
                  const sort = sortOf(p.line.productId);
                  return (
                    <li key={`${p.bonId}-${p.index}`} className="bonview__line">
                      <button type="button" className="bonview__open" onClick={() => navigate(`/preise/bon/${p.bonId}`)} aria-label={`Bon vom ${bonTitle(p)} ansehen`}>
                        <span className="bonview__name">{bonTitle(p)}{sort && sortTags(sort).map((t) => <span key={t} className="brand">{t}</span>)}</span>
                        <span className="bonview__price">{linePrice(p.line)}</span>
                        <span className="small muted bonview__sub">{[p.line.bon, lineAmount(p.line)].filter(Boolean).join(' · ')}</span>
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
