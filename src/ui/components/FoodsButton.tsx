import { navigate } from '../../router';
import { Icon } from './Icon';

/** „Meine Lebensmittel“ oben rechts in der Speisekammer (Julia: nicht mehr ganz nach unten scrollen) */
export function FoodsButton() {
  return (
    <button className="iconbtn iconbtn--box" onClick={() => navigate('/produkte')} aria-label="Meine Lebensmittel" title="Meine Lebensmittel">
      <Icon name="apple" size={22} />
    </button>
  );
}
