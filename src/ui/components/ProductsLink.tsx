import { useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Icon } from './Icon';

/** Zeile „Meine Produkte (n)“ – feste Sorten, Packungsgrößen, Barcodes. */
export function ProductsLink() {
  const n = useProducts().length;
  return (
    <button className="panel link-row" onClick={() => navigate('/produkte')}>
      <Icon name="bookmark" size={20} />
      <span className="link-row__text">
        <strong>Meine Produkte{n ? ` (${n})` : ''}</strong>
        <small className="muted">Feste Sorten, Packungsgrößen, Preise und Barcodes</small>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}
