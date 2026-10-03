import { navigate } from '../../router';
import { useShoppingCount } from '../useShoppingCount';
import { Icon } from './Icon';

/** Wagen oben rechts im Wochenplan – die Einkaufsliste kommt aus dem Plan. Zahl = noch einzukaufen. */
export function CartButton() {
  const toBuy = useShoppingCount();
  return (
    <button className="iconbtn iconbtn--box cart-btn" onClick={() => navigate('/einkauf')}
      aria-label={toBuy ? `Einkaufsliste – noch ${toBuy} Artikel` : 'Einkaufsliste'}>
      <Icon name="cart" size={22} />
      {toBuy > 0 && <span className="iconbtn__count">{toBuy}</span>}
    </button>
  );
}
