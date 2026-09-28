import { MY_PRODUCTS_PROVIDER, productLabel } from '../../domain/nutrition/myProducts';
import type { FoodVariant } from '../../domain/nutrition/types';
import { useFoodTable, useProducts } from '../../data/store';
import { Icon } from './Icon';

/**
 * Deine Produkte („Marken“) für eine Zutat – eins oder mehrere. Leer, wenn es für den Namen keins gibt.
 */
export function useSortOptions(name: string): FoodVariant[] {
  const products = useProducts();
  const table = useFoodTable();
  if (!name.trim()) return [];
  const food = table.matchName(name)?.food;
  if (!food) return [];
  if (food.variants?.length) return food.variants;
  if (food.ref.provider !== MY_PRODUCTS_PROVIDER) return [];
  const p = products.find((x) => x.id === food.ref.foodId);
  return p ? [{ id: p.id, name: productLabel(p), per100g: p.per100g }] : [];
}

/**
 * Welche Marke liegt da? Deine Produkte für die Zutat zum Antippen – bei nur einem ist es gleich gewählt.
 * „Andere Marke“ (optional): für eine Marke, die noch nicht unter „Meine Lebensmittel“ steht.
 */
export function SortPicker({ options, value, onChange, onOther }: {
  options: FoodVariant[];
  value?: string;
  onChange: (productId: string | undefined) => void;
  onOther?: () => void;
}) {
  if (!options.length) return null;
  return (
    <div className="sortpick">
      <span className="small muted">Welche Marke?</span>
      <div className="chips">
        {options.map((v) => (
          <button key={v.id} type="button" className={`chip chip--sm${value === v.id ? ' is-on' : ''}`} aria-pressed={value === v.id}
            onClick={() => onChange(value === v.id ? undefined : v.id)}>
            {v.name}
          </button>
        ))}
        {onOther && (
          <button type="button" className="chip chip--sm" onClick={onOther}>
            <Icon name="plus" size={14} /> Andere Marke
          </button>
        )}
      </div>
    </div>
  );
}
