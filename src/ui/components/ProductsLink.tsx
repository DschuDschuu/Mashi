import { DEFAULT_BASICS } from '../../domain/mealplan';
import { DEFAULT_NO_NUTRITION } from '../../domain/nutrition/noNutrition';
import { usePantry, useProducts } from '../../data/store';
import { navigate } from '../../router';
import { Icon } from './Icon';

/** Zeile „Meine Lebensmittel“ – eigene Nährwerte, Produkte, Immer im Haus, Ohne Nährwerte. */
export function ProductsLink() {
  const n = useProducts().length;
  const pantry = usePantry();
  const basics = (pantry.basics ?? DEFAULT_BASICS).length;
  const zero = (pantry.noNutrition ?? DEFAULT_NO_NUTRITION).length;
  return (
    <button className="panel link-row" onClick={() => navigate('/produkte')}>
      <Icon name="bookmark" size={20} />
      <span className="link-row__text">
        <strong>Meine Lebensmittel</strong>
        <small className="muted">{n} eigene · {basics} immer im Haus · {zero} ohne Nährwerte</small>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}
