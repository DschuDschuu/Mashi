import { productLabel } from '../../domain/nutrition/myProducts';
import { useProducts } from '../../data/store';
import { navigate } from '../../router';
import { linePriceParts, lineAmount, perKg, usePurchases } from '../usePurchases';
import { Icon } from './Icon';
import { displayPrice, displayUnit } from '../../domain/priceHistory';
import { euro } from '../format';

/** Link zur Preis-Seite eines Lebensmittels */
export const foodPricePath = (name: string, title = name) => `/preise/lebensmittel/${encodeURIComponent(name)}?t=${encodeURIComponent(title)}`;

/**
 * „Zuletzt gekauft“ in der Kachel (Julia: statt des Preisfelds) – Datum, Menge, bezahlt und Normalpreis,
 * darunter der Weg zur Preis-Seite nur für dieses Lebensmittel. Ohne Bon nichts.
 */
export function LastPurchase({ name, title, productIds, sort }: {
  name: string; title: string; productIds: readonly string[];
  /** in der Karte einer Sorte (Julia: Preis je Sorte) – nur deren Einkäufe, ohne eigenen Kasten */
  sort?: boolean;
}) {
  const { purchases, history } = usePurchases(name, productIds, { byName: !sort });
  const products = useProducts();
  const last = purchases[0];
  const latest = [...history].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!last && !history.length) return null;
  const which = !sort && last?.line.productId && productIds.length > 1 ? products.find((p) => p.id === last.line.productId) : undefined;
  // Zeile 1: was – rechts der Preis; Zeile 2: wann – rechts der Weg zur Preis-Seite (Julia)
  // rechts nur der Preis („2,49 € statt 3,29 €“) – der Grund (Angebot, MHD) steht unten beim Datum, sonst wird es am Handy eng
  const { price, why } = last ? linePriceParts(last.line) : { price: `${euro(displayPrice(latest!.perUnit, latest!.unit))}/${displayUnit(latest!.unit)}`, why: undefined };
  const date = new Date((last ?? latest!).date).toLocaleDateString('de-DE');
  return (
    <div className={sort ? 'last-buy last-buy--sort' : 'last-buy'}>
      <span className="small last-buy__what">
        <strong>Zuletzt gekauft</strong>
        {which && <> · {productLabel(which)}</>}
        {last && lineAmount(last.line) && <> · {lineAmount(last.line)}</>}
      </span>
      <span className="small last-buy__price">{price}</span>
      {/* gewogene Ware: der Kilopreis gleich mit (Julia: Kürbis) */}
      <span className="small muted">am {date}{why && <> · {why}</>}{last && perKg(last.line) && <> · {perKg(last.line)}</>}</span>
      <button type="button" className="link small last-buy__link" onClick={() => navigate(foodPricePath(name, title))}>
        Preise &amp; Verlauf <Icon name="chevron" size={14} />
      </button>
    </div>
  );
}
