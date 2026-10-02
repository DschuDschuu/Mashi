import { useMemo, useState } from 'react';
import { displayPrice, displayUnit, foodTrends, type FoodTrend, type PriceTrend } from '../../domain/priceHistory';
import { monthSavings, type ReceiptSavings } from '../../domain/savings';
import { keyOfName } from '../../domain/mealplan';
import { sortTags } from '../../domain/nutrition/myProducts';
import { receiptKey } from '../../domain/pantry';
import { useFoodTable, usePantry, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Empty } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PantryTabs, usePantrySwipe } from '../components/PlanTabs';
import { PriceLines, SORT_COLORS } from '../components/PriceLines';
import { euro } from '../format';
import { CartButton } from '../components/CartButton';
import { foodPricePath } from '../components/LastPurchase';

const percent = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
const arrowOf = (d: PriceTrend['direction']) => (d === 'teurer' ? '▲' : d === 'guenstiger' ? '▼' : '■');

/** eingeklappte Gruppen (teurer / günstiger / gleich) – nur auf diesem Gerät */
const FOLD_KEY = 'mashi-prices-folded';

const GROUPS: { key: PriceTrend['direction']; title: string }[] = [
  { key: 'teurer', title: 'Teurer geworden' },
  { key: 'guenstiger', title: 'Günstiger geworden' },
  { key: 'gleich', title: 'Gleich geblieben' },
];

/**
 * Preise der Lebensmittel, die du regelmäßig kaufst (mindestens zweimal per Kassenbon) – eine Karte je Lebensmittel,
 * darin je Sorte eine Linie (Julia). Einsortiert nach der zuletzt gekauften Sorte; die Bons stehen im Tab „Einkäufe“.
 */
export function PricesScreen() {
  const swipe = usePantrySwipe('prices');
  const pantry = usePantry();
  const table = useFoodTable();
  const trends = useMemo(() => {
    // ältere Preise ohne Sorte: über den Bon desselben Tages zuordnen (wie auf der Preis-Seite eines Lebensmittels)
    const lines = (pantry.bons ?? []).flatMap((b) => b.lines.filter((l) => !l.skip).map((l) => ({ day: b.date.slice(0, 10), l })));
    const sortOf = (h: { name: string; date: string; productId?: string }) => h.productId
      ?? lines.find((x) => x.day === h.date.slice(0, 10) && receiptKey(x.l.name) === receiptKey(h.name))?.l.productId;
    return foodTrends(pantry.history ?? pantry.prices ?? [], (n) => keyOfName(n, table) ?? receiptKey(n), sortOf);
  }, [pantry, table]);
  const [folded, setFolded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[]; } catch { return []; } });
  const toggleFold = (key: string) => {
    const next = folded.includes(key) ? folded.filter((k) => k !== key) : [...folded, key];
    setFolded(next);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* privater Modus – dann eben nicht gemerkt */ }
  };

  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Preise</h1><CartButton /></header>
      <PantryTabs active="prices" />
      <div className="split split--prices">
        <div className="split__main">
          <SavingsTiles savings={pantry.savings ?? []} />
        </div>
        <div className="split__side">
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
                const open = !folded.includes(g.key);
                return (
                  // einklappbar (Julia) – gemerkt auf diesem Gerät
                  <section key={g.key} className="section price-group">
                    <button type="button" className="price-group__head" aria-expanded={open} onClick={() => toggleFold(g.key)}>
                      <h2>{g.title} ({list.length})</h2>
                      <span className={`pantry__chev${open ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={18} /></span>
                    </button>
                    {open && (
                      <ul className="prices">
                        {list.map((t) => <FoodCard key={`${t.key}|${t.unit}`} trend={t} />)}
                      </ul>
                    )}
                  </section>
                );
              })}
              <p className="muted small center">Regalpreise vom Kassenbon – Rabatte und Coupons zählen nicht mit, damit du echte Preiserhöhungen siehst.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/** Ein Lebensmittel: je Sorte Farbe, letzter Preis und ▲/▼ – darunter alle Sorten in einem Diagramm */
function FoodCard({ trend: t }: { trend: FoodTrend }) {
  const products = useProducts();
  const several = t.sorts.length > 1;
  const label = (id: string) => {
    const p = id ? products.find((x) => x.id === id) : undefined;
    if (p) return sortTags(p).join(' · ') || (several ? 'ohne Zusatz' : t.name);
    return several ? 'ohne Sorte' : t.name;
  };
  const series = t.sorts.map((s, n) => ({ id: s.id, label: label(s.id), color: SORT_COLORS[n % SORT_COLORS.length], points: s.points }));
  const points = t.sorts.reduce((n, s) => n + s.points.length, 0);
  return (
    <li className="price-card">
      <div className="price-card__head">
        <button type="button" className="price-card__name link" onClick={() => navigate(foodPricePath(t.name))}>{t.name}</button>
        {!several && (
          <span className={`price-card__change is-${t.direction}`}>
            <span aria-hidden="true">{arrowOf(t.direction)}</span> {percent(t.change)}
            <span className="visually-hidden"> zum vorigen Einkauf</span>
          </span>
        )}
      </div>
      {several ? (
        // je Sorte eine Zeile: Farbpunkt, Name, letzter Preis, ▲/▼
        <ul className="price-sorts-legend">
          {t.sorts.map((s, n) => (
            <li key={s.id}>
              <span className="price-sorts__dot" style={{ background: series[n].color }} aria-hidden="true" />
              <span className="price-sorts-legend__name">{series[n].label}</span>
              <span className="small">{euro(displayPrice(s.latest, t.unit))}/{displayUnit(t.unit)}</span>
              <span className={`price-card__change is-${s.direction}`}>
                <span aria-hidden="true">{arrowOf(s.direction)}</span> {percent(s.change)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">
          <strong className="price-card__now">{euro(displayPrice(t.sorts[0].latest, t.unit))}/{displayUnit(t.unit)}</strong> · {t.sorts[0].points.length} Einkäufe
        </p>
      )}
      {points > 1 && <PriceLines series={series} unit={t.unit} label={t.name} />}
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
