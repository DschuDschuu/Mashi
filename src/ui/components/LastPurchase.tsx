import { useMemo } from 'react';
import { discountOf, paidOf } from '../../domain/bons';
import { foodPricePoints, lastBySize } from '../../domain/foodPrices';
import { navigate } from '../../router';
import { lineAmount, usePurchases } from '../usePurchases';
import { Icon } from './Icon';
import { displayPrice, displayUnit } from '../../domain/priceHistory';
import { euro, sizeLabel } from '../format';

/** Link zur Preis-Seite eines Lebensmittels */
export const foodPricePath = (name: string, title = name) => `/preise/lebensmittel/${encodeURIComponent(name)}?t=${encodeURIComponent(title)}`;

/** „15.9.“ – aus einem anderen Jahr „15.9.25“ */
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) });
};

/**
 * „Zuletzt gekauft“ in der Kachel (Julia: statt des Preisfelds) – je Packungsgröße eine Zeile, klein nach groß:
 * Größe | Datum | bezahlt (bei Rabatt dahinter der alte Preis durchgestrichen) | rechts der Preis je kg zum Vergleichen.
 * Als Spalten, Datum vor dem Preis – sonst rutscht bei einem Angebotspreis alles dahinter (Julia).
 * Ohne Sorte darunter der Weg zur Preis-Seite. Ohne Bon nur der letzte gemerkte Preis.
 */
export function LastPurchase({ name, title, productIds, sort }: {
  name: string; title: string; productIds: readonly string[];
  /** in der Karte einer Sorte (Julia: Preis je Sorte) – nur deren Einkäufe, ohne eigenen Kasten */
  sort?: boolean;
}) {
  const { purchases, history } = usePurchases(name, productIds, { byName: !sort });
  const rows = useMemo(() => lastBySize(foodPricePoints(history, purchases)), [history, purchases]);
  if (!rows.length) return null;
  return (
    <div className={sort ? 'last-buy last-buy--sort' : 'last-buy'}>
      <strong className="small last-buy__title">Zuletzt gekauft</strong>
      <ul className="last-buy__rows">
        {rows.map((p) => {
          const l = p.purchase?.line;
          const paid = l ? paidOf(l) : undefined;
          const was = l && l.price !== undefined && discountOf(l) > 0 ? l.price : undefined;
          // gewogene Ware: die Menge vom Bon („982 g“); sonst die Packungsgröße
          const amount = p.size !== undefined ? sizeLabel(`${p.size} ${p.sizeUnit}`) : l ? lineAmount(l) : '';
          return (
            <li key={`${p.size ?? (l?.weightKg !== undefined ? 'lose' : '')}|${p.date}`}>
              <span className="small">{amount}</span>
              <span className="small muted">{shortDate(p.date)}</span>
              {/* bezahlt vorne, der alte Preis dahinter – so stehen die bezahlten Preise untereinander, ohne Lücke (Julia) */}
              <span className="small muted">{paid !== undefined && euro(paid)}{was !== undefined && <> <s>{euro(was)}</s></>}</span>
              <strong className="small last-buy__price">{euro(displayPrice(p.paid, p.unit))}/{displayUnit(p.unit)}</strong>
            </li>
          );
        })}
      </ul>
      {!sort && <PriceLink name={name} title={title} />}
    </div>
  );
}

/** „Preise & Verlauf“ – einmal je Lebensmittel */
export function PriceLink({ name, title }: { name: string; title: string }) {
  return (
    <button type="button" className="link small last-buy__link" onClick={() => navigate(foodPricePath(name, title))}>
      Preise &amp; Verlauf <Icon name="chevron" size={14} />
    </button>
  );
}

/** Der Knopf allein (unter den Sorten-Karten) – nur, wenn es überhaupt Preise gibt */
export function FoodPriceLink({ name, title, productIds }: { name: string; title: string; productIds: readonly string[] }) {
  const { purchases, history } = usePurchases(name, productIds);
  if (!purchases.length && !history.length) return null;
  return <div className="last-buy__alone"><PriceLink name={name} title={title} /></div>;
}
