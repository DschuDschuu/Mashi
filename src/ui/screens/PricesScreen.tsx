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
import { LineSample, PriceLines, SORT_COLORS } from '../components/PriceLines';
import { euro, sizeLabel } from '../format';
import { purchasesOf } from '../../domain/bons';
import { mainSizeOf, overviewEntries, SIZE_DASHES } from '../../domain/foodPrices';
import { PRICE_MODES, usePriceMode } from '../usePriceMode';
import { FoodsButton } from '../components/FoodsButton';
import { groupByCategory } from '../../domain/categories';
import { useCategoryOf } from '../useCategory';
import { foodPricePath } from '../components/LastPurchase';

/** Änderung in Prozent – unter 0,5 % (Rundung auf dem Bon) „±0 %“, wie die Gruppe „gleich geblieben“ */
const percent = (n: number) => (Math.abs(n) < 0.005 ? '±0 %'
  : `${n > 0 ? '+' : '−'}${Math.abs(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const arrowOf = (d: PriceTrend['direction']) => (d === 'teurer' ? '▲' : d === 'guenstiger' ? '▼' : '■');

/** eingeklappte Gruppen (teurer / günstiger / gleich bzw. Kategorien) – nur auf diesem Gerät */
const FOLD_KEY = 'mashi-prices-folded';
const VIEW_KEY = 'mashi-prices-view';

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
  const products = useProducts();
  const [mode, setMode] = usePriceMode();
  const { trends, ranks, marks } = useMemo(() => {
    const keyOf = (n: string) => keyOfName(n, table) ?? receiptKey(n);
    // dieselben Punkte wie auf der Preis-Seite eines Lebensmittels (Julia): Einkäufe vom Bon und ältere Preise,
    // je Sorte und Packungsgröße eine Linie – eine entfernte Sorte zählt als „ohne Sorte“
    const o = overviewEntries(pantry.history ?? pantry.prices ?? [], purchasesOf(pantry.bons, () => true), keyOf, mode,
      new Set(products.map((p) => p.id)), mainSizeOf(products));
    return { trends: foodTrends(o.entries, keyOf, (e) => e.productId), ranks: o.ranks, marks: o.marks };
  }, [pantry, table, products, mode]);
  // Umschalter (Julia): nach Preisänderung (teurer/günstiger/gleich) oder nach Kategorie – gemerkt auf diesem Gerät
  const [view, setView] = useState<'aenderung' | 'kategorie'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'kategorie' ? 'kategorie' : 'aenderung'; } catch { return 'aenderung'; } });
  const pickView = (v: 'aenderung' | 'kategorie') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* egal */ } };
  const categoryOf = useCategoryOf();
  const groups: { key: string; title: string; list: FoodTrend[] }[] = view === 'kategorie'
    ? groupByCategory(trends, (t) => categoryOf(t.name)).map((g) => ({ key: g.id, title: g.title, list: g.items }))
    : GROUPS.map((g) => ({ key: g.key, title: g.title, list: trends.filter((t) => t.direction === g.key) }));
  const [folded, setFolded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[]; } catch { return []; } });
  const toggleFold = (key: string) => {
    const next = folded.includes(key) ? folded.filter((k) => k !== key) : [...folded, key];
    setFolded(next);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* privater Modus – dann eben nicht gemerkt */ }
  };

  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Preise</h1><FoodsButton /></header>
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
              {/* Julia: derselbe Umschalter wie auf der Preis-Seite eines Lebensmittels – gemerkt für beide */}
              <div className="segments price-view" role="tablist" aria-label="Welcher Preis">
                {PRICE_MODES.map(([v, label]) => (
                  <button key={v} role="tab" aria-selected={mode === v} className={`segment${mode === v ? ' is-on' : ''}`} onClick={() => setMode(v)}>{label}</button>
                ))}
              </div>
              <div className="segments price-view" role="tablist" aria-label="Preise sortieren">
                {([['aenderung', 'nach Preisänderung'], ['kategorie', 'nach Kategorie']] as const).map(([v, label]) => (
                  <button key={v} role="tab" aria-selected={view === v} className={`segment${view === v ? ' is-on' : ''}`} onClick={() => pickView(v)}>{label}</button>
                ))}
              </div>
              {groups.map(({ key, title, list }) => {
                if (!list.length) return null;
                const g = { key, title };
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
                        {list.map((t) => <FoodCard key={`${t.key}|${t.unit}`} trend={t} ranks={ranks.get(t.key)} marks={marks} />)}
                      </ul>
                    )}
                  </section>
                );
              })}
              <p className="muted small center">{mode === 'bezahlt'
                ? 'Bezahlte Preise vom Kassenbon – mit Angeboten, Lidl Plus und MHD-Ware (Ring = Rabatt, Raute = MHD).'
                : 'Regalpreise vom Kassenbon – Rabatte und Coupons zählen nicht mit, damit du echte Preiserhöhungen siehst.'}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Ein Lebensmittel: je Sorte eine Farbe, je Packungsgröße eine Linienart (wie auf seiner Preis-Seite) – letzter Preis
 * und ▲/▼ je Linie, darunter alle Linien in einem Diagramm. Linien-ID = „Sorte|Größe“ (siehe overviewEntries).
 */
function FoodCard({ trend: t, ranks, marks }: { trend: FoodTrend; ranks?: Map<string, number>; marks: Map<string, 'rabatt' | 'mhd'> }) {
  const products = useProducts();
  const parse = (id: string) => { const [sortId, size] = id.split('|'); return { sortId, size: size || undefined }; };
  const sortIds = [...new Set(t.sorts.map((s) => parse(s.id).sortId))];
  const several = t.sorts.length > 1;
  const sortName = (id: string) => {
    const p = id ? products.find((x) => x.id === id) : undefined;
    if (p) return sortTags(p).join(' · ') || (sortIds.length > 1 ? 'ohne Zusatz' : t.name);
    return sortIds.length > 1 ? 'ohne Sorte' : t.name;
  };
  const series = t.sorts.map((s) => {
    const { sortId, size } = parse(s.id);
    const rank = ranks?.get(s.id) ?? 0;
    return {
      id: s.id, sortId, rank,
      // nur eine Sorte: die Größe allein reicht („400 g“) – sonst „leicht · 400 g“
      label: size ? (sortIds.length > 1 ? `${sortName(sortId)} · ${sizeLabel(size)}` : sizeLabel(size)) : sortName(sortId),
      color: SORT_COLORS[sortIds.indexOf(sortId) % SORT_COLORS.length],
      dash: SIZE_DASHES[rank % SIZE_DASHES.length],
      points: s.points.map((p) => { const mark = marks.get(`${t.key}|${s.id}|${p.date.slice(0, 10)}`); return mark ? { ...p, mark } : p; }),
      trend: s,
    };
  });
  // Legende: Sorten zusammen, je Sorte die Hauptgröße zuerst
  const rows = [...series].sort((a, b) => sortIds.indexOf(a.sortId) - sortIds.indexOf(b.sortId) || a.rank - b.rank);
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
        // je Linie eine Zeile: Linienmuster, Name, letzter Preis, ▲/▼
        <ul className="price-sorts-legend">
          {rows.map((s) => (
            <li key={s.id}>
              <LineSample color={s.color} dash={s.dash} />
              <span className="price-sorts-legend__name">{s.label}</span>
              <span className="small">{euro(displayPrice(s.trend.latest, t.unit))}/{displayUnit(t.unit)}</span>
              <span className={`price-card__change is-${s.trend.direction}`}>
                <span aria-hidden="true">{arrowOf(s.trend.direction)}</span> {percent(s.trend.change)}
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
