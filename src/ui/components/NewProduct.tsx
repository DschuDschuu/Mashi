import { useMemo, useState } from 'react';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, findFoodRow, type FoodRow } from '../../domain/nutrition/foodList';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { sharedOf, withShared, type MyProduct } from '../../domain/nutrition/myProducts';
import { zeroOf } from '../../domain/nutrition/noNutrition';
import { saveProducts, usePantry, useProducts } from '../../data/store';
import { foodTable } from '../../services';
import { toast } from '../toast';
import { ProductForm } from './MyProductsPanel';

/**
 * Neues Produkt aus einer Bon-Zeile – in der Bon-Prüfung und am gespeicherten Bon – wie unter „Meine Lebensmittel“ (Julia): gibt es das Lebensmittel schon,
 * fragt Mashi gleich unter dem Namen „weitere Sorte?“; dann nur Zusatz, Marke, Werte, Packung.
 */
export function NewProduct({ name, bonName, pack = {}, onDone }: {
  /** vorbelegt: der Name in der Speisekammer (sonst der Bon-Name) */
  name: string;
  /** so steht es auf dem Bon – wird als Zutatenname gemerkt */
  bonName: string;
  /** Packungsgröße aus der Bon-Zeile */
  pack?: Partial<MyProduct>;
  onDone: (p?: MyProduct) => void;
}) {
  const products = useProducts();
  const pantry = usePantry();
  const rows = useMemo(() => buildFoodList(products, basicsOf(pantry), zeroOf(pantry), foodTable), [products, pantry]);
  const [sortOf, setSortOf] = useState<FoodRow | null>(null);
  const [notSort, setNotSort] = useState('');
  const existing = (n: string) => findFoodRow(rows, n, foodTable, notSort);
  if (sortOf) {
    const shared = sharedOf(sortOf.products);
    return (
      <div className="stack stack--tight">
        <strong>Weitere Sorte von „{shared.name}“</strong>
        <ProductForm shared={shared} initial={pack} onCancel={() => onDone()} onSave={(p) => {
          // wie „Weitere Sorte“ in der Kachel: alle Sorten bekommen dasselbe Gemeinsame
          const group = new Set(sortOf.products.map((x) => x.id));
          const sort = withShared(p, shared);
          saveProducts([...products.map((x) => (group.has(x.id) ? withShared(x, shared) : x)), sort]);
          toast(`Weitere Sorte von „${shared.name}“ angelegt`);
          onDone(sort);
        }} />
      </div>
    );
  }
  return (
    <ProductForm
      initial={{ name, names: [normalizeName(bonName)], replaces: [], ...pack }}
      onSave={(p) => { saveProducts([...products, p]); toast(`„${p.name}“ angelegt`); onDone(p); }}
      onCancel={() => onDone()}
      afterName={(n) => {
        const hit = existing(n);
        return hit && (
          <div className="scan-note add-food__exists" role="status">
            <p><strong>„{sharedOf(hit.products).name}“</strong> gibt es schon{hit.products.length > 1 ? ` (${hit.products.length} Sorten)` : ''}. Ist das eine weitere Sorte, z. B. leicht oder eine andere Marke?</p>
            <div className="row-gap">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setSortOf(hit)}>Ja, weitere Sorte</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNotSort(normalizeName(n))}>Nein, neu anlegen</button>
            </div>
          </div>
        );
      }}
    />
  );
}
