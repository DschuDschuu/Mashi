import type { ReactNode } from 'react';
import { tabOf, type ExistingFood, type FoodFilter, type FoodRow } from '../../domain/nutrition/foodList';
import { sharedOf } from '../../domain/nutrition/myProducts';

/** Tab-Namen wie auf der Seite „Meine Lebensmittel“ */
export const TAB_NAMES: Record<FoodFilter, string> = { produkte: 'Produkte', haus: 'Im Haus', ohne: 'Gewürze' };

/** Name einer Zeile, wie ihn die Kachel oben zeigt – bei Sorten der gemeinsame */
export const titleOf = (r: FoodRow): string => (r.products.length ? sharedOf(r.products).name : r.name);

/**
 * „… gibt es schon“ beim Anlegen – überall derselbe Hinweis (Liste, Bon, Rezept, Vorrat; Julia: Doppelte vermeiden).
 * Darunter, was man tun kann (children). Steht das Lebensmittel in einem anderen Tab, sagt der Hinweis, in welchem –
 * sonst sucht man es unter „Produkte“ vergeblich.
 * @param ask die Frage dahinter, z. B. „Ist das eine weitere Sorte …?“
 * @param here der Tab, in dem man gerade ist (ohne: Produkte)
 */
export function ExistsNote({ hit, ask, here = 'produkte', children }: { hit: ExistingFood; ask: string; here?: FoodFilter; children?: ReactNode }) {
  const { row } = hit;
  const tab = tabOf(row);
  const n = row.products.length;
  return (
    <div className="scan-note add-food__exists" role="status">
      <p>
        <strong>„{titleOf(row)}“</strong> gibt es schon{n > 1 ? ` (${n} Sorten)` : ''}{tab !== here ? ` – unter „${TAB_NAMES[tab]}“` : ''}. {ask}
      </p>
      {children && <div className="row-gap">{children}</div>}
    </div>
  );
}
