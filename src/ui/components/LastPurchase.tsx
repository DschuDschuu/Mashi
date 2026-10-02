import { productLabel } from '../../domain/nutrition/myProducts';
import { useProducts } from '../../data/store';
import { navigate } from '../../router';
import { linePrice, lineAmount, usePurchases } from '../usePurchases';
import { Icon } from './Icon';
import { displayPrice, displayUnit } from '../../domain/priceHistory';
import { euro } from '../format';

/** Link zur Preis-Seite eines Lebensmittels */
export const foodPricePath = (name: string, title = name) => `/preise/lebensmittel/${encodeURIComponent(name)}?t=${encodeURIComponent(title)}`;

/**
 * „Zuletzt gekauft“ in der Kachel (Julia: statt des Preisfelds) – Datum, Menge, bezahlt und Normalpreis,
 * darunter der Weg zur Preis-Seite nur für dieses Lebensmittel. Ohne Bon nichts.
 */
export function LastPurchase({ name, title, productIds }: { name: string; title: string; productIds: readonly string[] }) {
  const { purchases, history } = usePurchases(name, productIds);
  const products = useProducts();
  const last = purchases[0];
  const latest = [...history].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!last && !history.length) return null;
  const sort = last?.line.productId && productIds.length > 1 ? products.find((p) => p.id === last.line.productId) : undefined;
  return (
    <div className="last-buy">
      {last ? (
        <p className="small">
          <strong>Zuletzt gekauft</strong> am {new Date(last.date).toLocaleDateString('de-DE')}
          {sort && <> · {productLabel(sort)}</>}
          {lineAmount(last.line) && <> · {lineAmount(last.line)}</>}
          <br />
          <span className="last-buy__price">{linePrice(last.line)}</span>
        </p>
      ) : (
        // ältere Bons (vor dem Speichern der Bons): nur der Regalpreis aus dem Verlauf
        <p className="small"><strong>Zuletzt gekauft</strong> am {new Date(latest!.date).toLocaleDateString('de-DE')} · {euro(displayPrice(latest!.perUnit, latest!.unit))}/{displayUnit(latest!.unit)}</p>
      )}
      <button type="button" className="link small" onClick={() => navigate(foodPricePath(name, title))}>
        Preise &amp; Verlauf <Icon name="chevron" size={14} />
      </button>
    </div>
  );
}
