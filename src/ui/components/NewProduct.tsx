import { useMemo, useState } from 'react';
import { basicsOf } from '../../domain/mealplan';
import { buildFoodList, extraWords, findExisting, tabOf, type ExistingFood, type FoodRow } from '../../domain/nutrition/foodList';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { brandOf, fillOrAdd, productLabel, sharedOf, sortTags, withShared, type MyProduct, type SharedMatch } from '../../domain/nutrition/myProducts';
import { spiceName, zeroOf } from '../../domain/nutrition/noNutrition';
import { addProduct, currentProducts, productUndo, saveProducts, useFoodTable, usePantry, useProducts } from '../../data/store';
import { foodTable } from '../../services';
import type { NutritionResult } from '../../domain/nutrition/types';
import { toast } from '../toast';
import { ExistsNote, TAB_NAMES, titleOf } from './ExistsNote';
import { Icon } from './Icon';
import { ProductForm } from './MyProductsPanel';

/** Was beim Anlegen herauskam – neu, weitere Sorte, eine vorhandene Sorte ohne Werte aufgefüllt, eine vorhandene gewählt */
export type Added = 'neu' | 'sorte' | 'ergänzt' | 'vorhanden';

/** Ehrlicher Text dazu – hier und dort, wo der Aufrufer selbst Bescheid gibt (Bon) */
export function addedText(p: MyProduct, how: Added): string {
  const label = productLabel(p);
  return how === 'neu' ? `„${label}“ angelegt` : how === 'sorte' ? `Weitere Sorte „${label}“ angelegt` : how === 'ergänzt' ? `„${label}“ ergänzt` : `„${label}“ gewählt`;
}

/** den Namen merken – Rezepte und Vorrat mit dieser Schreibweise finden das Lebensmittel dann */
const remembering = (s: SharedMatch, n: string): SharedMatch => {
  const k = normalizeName(n);
  return !k || s.names.includes(k) ? s : { ...s, names: [...s.names, k] };
};

/**
 * Neues Produkt – aus einer Bon-Zeile (Bon-Prüfung, gespeicherter Bon), einer unbekannten Rezept-Zutat oder dem Vorrat mit Marke –
 * wie unter „Meine Lebensmittel“ (Julia: überall dasselbe Formular, dieselbe Prüfung): gibt es das Lebensmittel schon,
 * steht das gleich unter dem Namen und Speichern ist gesperrt, bis du wählst. Statt „Zu …“ (das würfe dich aus Bon oder
 * Vorrat) gibt es hier die vorhandenen Sorten zum Antippen – „ist dieselbe“ legt nichts an – oder eine weitere Sorte.
 * Nur ähnlich („Rinderhack leicht“): weitere Sorte oder wirklich ein eigenes Lebensmittel.
 * @param onDone fertig – mit dem Produkt und was passiert ist (how), undo für den eigenen Hinweis (quiet)
 */
export function NewProduct({ name, bonName = name, pack = {}, ingredient = false, quiet = false, onDone }: {
  /** vorbelegt: der Name in der Speisekammer (sonst der Bon-Name) bzw. die Zutat im Rezept */
  name: string;
  /** so steht es auf dem Bon – wird als Zutatenname gemerkt */
  bonName?: string;
  /** Vorbelegtes: Packungsgröße aus der Bon-Zeile, Marke aus dem Vorrat */
  pack?: Partial<MyProduct>;
  /** der Name ist eine Zutat im Rezept – die soll danach gefunden werden, auch als weitere Sorte („Kimchi scharf“) */
  ingredient?: boolean;
  /** Bescheid gibt der Aufrufer (Bon: „… mit Speichern hängt die Zeile daran“) – kein eigener Hinweis */
  quiet?: boolean;
  onDone: (p?: MyProduct, done?: { how: Added; undo?: () => void }) => void;
}) {
  const products = useProducts();
  const pantry = usePantry();
  const table = useFoodTable();
  const rows = useMemo(() => buildFoodList(products, basicsOf(pantry), zeroOf(pantry), foodTable, [], [], (z) => spiceName(z, table)), [products, pantry, table]);
  /** „Weitere Sorte“ gewählt: zu dieser Zeile, mit dem getippten Namen; remember = den Namen ins „gilt für“ */
  const [sortOf, setSortOf] = useState<{ row: FoodRow; typed: string; remember: boolean } | null>(null);
  const [notSort, setNotSort] = useState('');
  const existing = (n: string) => findExisting(rows, n, foodTable, notSort);

  /** fertig: Bescheid (außer quiet) – mit „Rückgängig“, wenn sich etwas geändert hat; direkt nach dem Speichern aufrufen */
  const finish = (p: MyProduct, how: Added, before: readonly MyProduct[], text = addedText(p, how)) => {
    const undo = currentProducts() !== before ? productUndo(before) : undefined;
    if (!quiet) toast(text, undo && { label: 'Rückgängig', run: undo });
    onDone(p, { how, undo });
  };
  /** „Ist dieselbe“: nichts anlegen – nur anders geschrieben („Kimchis“)? Dann merkt sich das Lebensmittel den Namen */
  const same = (hit: ExistingFood, p: MyProduct, n: string) => {
    const before = currentProducts();
    if (hit.spelling) {
      const s = remembering(sharedOf(hit.row.products), n);
      const group = new Set(hit.row.products.map((x) => x.id));
      saveProducts(before.map((x) => (group.has(x.id) ? withShared(x, s) : x)));
    }
    const now = currentProducts().find((x) => x.id === p.id) ?? p;
    finish(now, 'vorhanden', before, hit.spelling ? `„${n.trim()}“ zählt jetzt zu „${titleOf(hit.row)}“` : undefined);
  };

  const sort = sortOf && (() => {
    const { row, typed, remember } = sortOf;
    const base = sharedOf(row.products);
    const shared = remember ? remembering(base, typed) : base;
    const detail = extraWords(typed, base.name);
    return (
      <div className="stack stack--tight">
        <strong>Weitere Sorte von „{base.name}“</strong>
        {/* mit Namen, sonst übernimmt das Formular die Marke vom Vorrat nicht */}
        <ProductForm shared={shared} initial={{ name: base.name, ...(detail ? { detail } : {}), ...pack }} onCancel={() => setSortOf(null)} onSave={(p) => {
          const before = currentProducts();
          // wie „Weitere Sorte“ in der Kachel: alle Sorten bekommen dasselbe Gemeinsame
          const group = new Set(row.products.map((x) => x.id));
          // die einzige Sorte hat noch keine Werte? Dann füllt sich die (siehe fillOrAdd)
          const { products: next, saved } = fillOrAdd(before.map((x) => (group.has(x.id) ? withShared(x, shared) : x)), withShared(p, shared), row.products);
          saveProducts(next);
          finish(saved, saved.id === p.id ? 'sorte' : 'ergänzt', before);
        }} />
      </div>
    );
  })();
  return (
    <>
      {sort}
      {/* ausgeblendet statt weg – so bleibt das Getippte nach „Abbrechen“ */}
      <div style={sortOf ? { display: 'none' } : undefined}>
        <ProductForm
          initial={{ name, names: [normalizeName(bonName)], replaces: [], ...pack }}
          onSave={(p) => {
            const before = currentProducts();
            // nur, was bloß „Immer im Haus“ oder Gewürz ist, kommt hier an (sonst wäre Speichern gesperrt) – sagen, wo es steht
            const hit = existing(p.name);
            const tab = hit && tabOf(hit.row);
            const saved = addProduct(p);
            const how = saved.id === p.id ? 'neu' : 'ergänzt';
            finish(saved, how, before, `${addedText(saved, how)}${tab && tab !== 'produkte' ? ` – steht unter „${TAB_NAMES[tab]}“` : ''}`);
          }}
          onCancel={() => onDone()}
          canSave={(n) => {
            const hit = existing(n);
            return !hit || (hit.same && !hit.row.products.length);
          }}
          afterName={(n) => {
            const hit = existing(n);
            if (!hit) return null;
            const sorts = hit.row.products;
            if (!hit.same) {
              return (
                <ExistsNote hit={hit} ask={`Ist „${n}“ eine weitere Sorte davon?`}>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setSortOf({ row: hit.row, typed: n, remember: ingredient })}>Ja, weitere Sorte</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNotSort(normalizeName(n))}>Nein, eigenes Lebensmittel</button>
                </ExistsNote>
              );
            }
            // nur „Immer im Haus“ oder Gewürz, noch ohne Sorte: das Produkt kommt einfach dazu
            if (!sorts.length) return <ExistsNote hit={hit} ask="Das Produkt kommt dazu." />;
            // die Marke vom Vorrat/Bon zuerst – ist sie schon da, ist es wohl genau diese Sorte
            const brand = pack.brand?.trim().toLocaleLowerCase('de-DE');
            const fits = (p: MyProduct) => !!brand && brandOf(p)?.toLocaleLowerCase('de-DE') === brand;
            const ordered = [...sorts].sort((a, b) => Number(fits(b)) - Number(fits(a)));
            return (
              <ExistsNote hit={hit} ask={sorts.length === 1 ? 'Ist es dieselbe – oder eine weitere Sorte?' : 'Ist es eine davon – oder eine weitere Sorte?'}>
                {ordered.map((p) => (
                  <button key={p.id} type="button" className={`btn btn--sm ${fits(p) ? 'btn--primary' : 'btn--soft'}`} onClick={() => same(hit, p, n)}>
                    {sorts.length === 1 ? 'Ja, dieselbe' : sortTags(p).join(' · ') || 'ohne Marke'}
                  </button>
                ))}
                <button type="button" className={`btn btn--sm ${ordered.some(fits) ? 'btn--soft' : 'btn--primary'}`}
                  onClick={() => setSortOf({ row: hit.row, typed: n, remember: !!hit.spelling })}>Weitere Sorte</button>
              </ExistsNote>
            );
          }}
        />
      </div>
    </>
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
        <strong>{unknown.length === 1 ? '1 Zutat kennt' : `${unknown.length} Zutaten kennt`} Mashi noch nicht.</strong>
      </p>
      {unknown.map((name) =>
        open === name ? (
          <NewProduct key={name} name={name} ingredient onDone={() => setOpen(null)} />
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

