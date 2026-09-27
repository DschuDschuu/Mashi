import { brandOf } from '../../domain/nutrition/myProducts';
import { useProducts } from '../../data/store';

/** Übliche Marken und Händler – frei ergänzbar, eigene Marken kommen automatisch dazu */
const COMMON = ['Lidl', 'Milbona', 'Baresa', 'Kaufland', 'K-Classic', 'Aldi', 'REWE', 'ja!', 'Edeka', 'gut & günstig', 'Penny', 'Netto', 'dm', 'dmBio', 'Alnatura'];

/** Vorschlagsliste für das Feld „Marke“ (`list="brand-names"`) */
export function BrandNames() {
  const own = useProducts().map(brandOf).filter((b): b is string => !!b);
  const all = [...new Set([...own, ...COMMON])].sort((a, b) => a.localeCompare(b, 'de'));
  return <datalist id="brand-names">{all.map((b) => <option key={b} value={b} />)}</datalist>;
}
