import { useMemo, useState } from 'react';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, findFoodRow, type FoodRow } from '../../domain/nutrition/foodList';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { fillOrAdd, sharedOf, withShared, type MyProduct } from '../../domain/nutrition/myProducts';
import { spiceName, zeroOf } from '../../domain/nutrition/noNutrition';
import { addProduct, saveProducts, useFoodTable, usePantry, useProducts } from '../../data/store';
import { foodTable } from '../../services';
import type { NutritionResult } from '../../domain/nutrition/types';
import { toast } from '../toast';
import { Icon } from './Icon';
import { ProductForm } from './MyProductsPanel';

/**
 * Neues Produkt – aus einer Bon-Zeile (Bon-Prüfung, gespeicherter Bon), einer unbekannten Rezept-Zutat oder dem Vorrat mit Marke –
 * wie unter „Meine Lebensmittel“ (Julia: überall dasselbe Formular): gibt es das Lebensmittel schon,
 * fragt Mashi gleich unter dem Namen „weitere Sorte?“; dann nur Zusatz, Marke, Werte, Packung.
 */
export function NewProduct({ name, bonName = name, pack = {}, onDone }: {
  /** vorbelegt: der Name in der Speisekammer (sonst der Bon-Name) bzw. die Zutat im Rezept */
  name: string;
  /** so steht es auf dem Bon – wird als Zutatenname gemerkt */
  bonName?: string;
  /** Vorbelegtes: Packungsgröße aus der Bon-Zeile, Marke aus dem Vorrat */
  pack?: Partial<MyProduct>;
  onDone: (p?: MyProduct) => void;
}) {
  const products = useProducts();
  const pantry = usePantry();
  const table = useFoodTable();
  const rows = useMemo(() => buildFoodList(products, basicsOf(pantry), zeroOf(pantry), foodTable, [], [], (z) => spiceName(z, table)), [products, pantry, table]);
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
          // die einzige Sorte hat noch keine Werte? Dann füllt sich die (siehe fillOrAdd)
          const { products: next, saved } = fillOrAdd(products.map((x) => (group.has(x.id) ? withShared(x, shared) : x)), withShared(p, shared), sortOf.products);
          saveProducts(next);
          toast(saved.id === p.id ? `Weitere Sorte von „${shared.name}“ angelegt` : `„${shared.name}“ ergänzt`);
          onDone(saved);
        }} />
      </div>
    );
  }
  return (
    <ProductForm
      initial={{ name, names: [normalizeName(bonName)], replaces: [], ...pack }}
      onSave={(p) => { const saved = addProduct(p); toast(saved.id === p.id ? `„${p.name}“ angelegt` : `„${saved.name}“ ergänzt`); onDone(saved); }}
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

/**
 * Zutaten, die Mashi in diesem Rezept nicht kennt – direkt unter „Meine Lebensmittel“ anlegen,
 * mit demselben Formular wie überall (Julia: nicht mehr das alte mit Etikett-Foto). Danach rechnen alle Rezepte damit.
 */
export function UnknownIngredients({ n }: { n: NutritionResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const unknown = [...new Set(n.items.filter((i) => i.status === 'unmatched').map((i) => i.name))];
  if (!unknown.length) return null;

  return (
    <div className="panel stack unknown-ings">
      <p className="small">
        <strong>{unknown.length === 1 ? '1 Zutat kennt' : `${unknown.length} Zutaten kennt`} Mashi noch nicht.</strong>{' '}
        Leg sie unter „Meine Lebensmittel“ an – dann rechnet jedes Rezept damit.
      </p>
      {unknown.map((name) =>
        open === name ? (
          <NewProduct key={name} name={name} onDone={() => setOpen(null)} />
        ) : (
          <div key={name} className="row-between">
            <span>{name}</span>
            <button className="btn btn--soft btn--sm" onClick={() => setOpen(name)}><Icon name="plus" size={16} /> Hinzufügen</button>
          </div>
        ),
      )}
    </div>
  );
}

