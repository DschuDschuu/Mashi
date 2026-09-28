import { basicsOf } from '../../domain/mealplan';
import { zeroOf } from '../../domain/nutrition/noNutrition';
import { usePantry, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Icon } from './Icon';

/** Zeile „Meine Lebensmittel“ – eigene Nährwerte, Produkte, Immer im Haus, Gewürze. */
export function ProductsLink() {
  const n = useProducts().length;
  const pantry = usePantry();
  const basics = basicsOf(pantry).length;
  const zero = zeroOf(pantry).length;
  return (
    <button className="panel link-row" onClick={() => navigate('/produkte')}>
      <Icon name="bookmark" size={20} />
      <span className="link-row__text">
        <strong>Meine Lebensmittel</strong>
        <small className="muted">{n} eigene · {basics} immer im Haus · {zero} Gewürze</small>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}
