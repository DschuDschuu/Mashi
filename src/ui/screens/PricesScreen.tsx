import { useMemo, useState } from 'react';
import { displayPrice, displayUnit, priceTrends, type PriceTrend } from '../../domain/priceHistory';
import { monthSavings, type ReceiptSavings } from '../../domain/savings';
import { usePantry } from '../../data/store';
import { navigate } from '../../router';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PlanTabs } from '../components/PlanTabs';
import { PriceChart } from '../components/PriceChart';
import { euro } from '../format';

const percent = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

const GROUPS: { key: PriceTrend['direction']; title: string }[] = [
  { key: 'teurer', title: 'Teurer geworden' },
  { key: 'guenstiger', title: 'Günstiger geworden' },
  { key: 'gleich', title: 'Gleich geblieben' },
];

/**
 * Preise der Artikel, die du regelmäßig kaufst (mindestens zweimal per Kassenbon).
 * Verglichen wird mit dem vorigen Einkauf; das Diagramm zeigt den ganzen Verlauf.
 */
export function PricesScreen() {
  const pantry = usePantry();
  const trends = useMemo(() => priceTrends(pantry.history ?? pantry.prices ?? []), [pantry]);

  return (
    <main className="screen screen--tabbed">
      <header className="page-head"><h1>Preise</h1></header>
      <PlanTabs active="prices" />
      <SavingsTiles savings={pantry.savings ?? []} />

      {trends.length === 0 ? (
        <Empty icon="cart">
          <span>
            Noch kein Verlauf. Sobald du einen Artikel zum zweiten Mal per Kassenbon importierst, siehst du hier,
            wie sich sein Preis entwickelt.{' '}
            <button className="link" onClick={() => navigate('/speisekammer/bon')}>Kassenbon importieren</button>
          </span>
        </Empty>
      ) : (
        <>
          {GROUPS.map((g) => {
            const list = trends.filter((t) => t.direction === g.key);
            if (!list.length) return null;
            return (
              <Section key={g.key} title={`${g.title} (${list.length})`}>
                <ul className="prices">
                  {list.map((t) => <PriceCard key={`${t.name}|${t.unit}`} trend={t} />)}
                </ul>
              </Section>
            );
          })}
          <p className="muted small center">Regalpreise vom Kassenbon – Rabatte und Coupons zählen nicht mit, damit du echte Preiserhöhungen siehst.</p>
        </>
      )}
    </main>
  );
}

function PriceCard({ trend: t }: { trend: PriceTrend }) {
  const first = t.points[0].perUnit;
  const sinceFirst = first ? (t.latest - first) / first : 0;
  const arrow = t.direction === 'teurer' ? '▲' : t.direction === 'guenstiger' ? '▼' : '■';
  return (
    <li className="price-card">
      <div className="price-card__head">
        <span className="price-card__name">{t.name}</span>
        <span className={`price-card__change is-${t.direction}`}>
          <span aria-hidden="true">{arrow}</span> {percent(t.change)}
          <span className="visually-hidden"> zum vorigen Einkauf</span>
        </span>
      </div>
      <p className="small muted">
        <strong className="price-card__now">{euro(displayPrice(t.latest, t.unit))}/{displayUnit(t.unit)}</strong>
        {' · '}{t.points.length} Einkäufe{t.points.length > 2 && <> · seit dem ersten {percent(sinceFirst)}</>}
      </p>
      <PriceChart points={t.points} unit={t.unit} label={t.name} />
      <details className="price-card__table">
        <summary>Alle Einkäufe</summary>
        <table>
          <tbody>
            {[...t.points].reverse().map((p) => (
              <tr key={p.date}>
                <th scope="row">{new Date(p.date).toLocaleDateString('de-DE')}</th>
                <td>{euro(displayPrice(p.perUnit, t.unit))}/{displayUnit(t.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </li>
  );
}

/**
 * Was du in einem Monat gespart hast – Lidl Plus, Angebote und MHD-Ware nebeneinander.
 * Drei Zahlen, kein Diagramm: Es geht um die Summe, nicht um einen Verlauf.
 */
function SavingsTiles({ savings }: { savings: ReceiptSavings[] }) {
  const today = new Date();
  const [offset, setOffset] = useState(0); // 0 = dieser Monat, 1 = Vormonat …
  const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const m = monthSavings(savings, d.getFullYear(), d.getMonth());
  const label = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <section className="savings" aria-label={`Gespart im ${label}`}>
      <div className="savings__month">
        <button className="iconbtn iconbtn--sm" onClick={() => setOffset(offset + 1)} aria-label="Vormonat">
          <Icon name="back" size={18} />
        </button>
        <span>Gespart im <strong>{label}</strong></span>
        <button className="iconbtn iconbtn--sm" onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label="Nächster Monat">
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <div className="savings__tiles">
        <div className="stat tint-mint">
          <span className="stat__label">Lidl Plus</span>
          <strong className="stat__value">{euro(m.lidlPlus)}</strong>
        </div>
        <div className="stat tint-butter">
          <span className="stat__label">Angebote</span>
          <strong className="stat__value">{euro(m.offers)}</strong>
        </div>
        <div className="stat tint-peach">
          <span className="stat__label">MHD-Ware</span>
          <strong className="stat__value">{euro(m.mhd)}</strong>
        </div>
      </div>
      <p className="small muted center">
        {m.receipts
          ? `aus ${m.receipts} ${m.receipts === 1 ? 'Kassenbon' : 'Kassenbons'} · zusammen ${euro(m.lidlPlus + m.offers + m.mhd)}`
          : savings.length ? 'In diesem Monat kein Bon mit Rabatten.' : 'Zählt ab dem nächsten Kassenbon, den du importierst.'}
      </p>
    </section>
  );
}
