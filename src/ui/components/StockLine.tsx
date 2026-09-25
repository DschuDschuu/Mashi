import { stockSummary, type Stock } from '../../domain/pantry';
import type { RecipeContent } from '../../domain/types';
import { Icon } from './Icon';

/**
 * „Alles da“ oder „Fehlt: Pasta, Hokkaido · reicht nicht: Paprika“ – nach der Speisekammer.
 * Ohne stock (z. B. leere Speisekammer) zeigt sie nichts: dann weiß Mashi es schlicht nicht.
 */
export function StockLine({ content, stock, max = 3 }: { content: RecipeContent; stock?: Map<string, Stock>; max?: number }) {
  if (!stock?.size) return null;
  const { missing, short } = stockSummary(content, stock);
  if (!missing.length && !short.length) {
    return <span className="stock-line is-ok"><Icon name="check" size={13} /> Alles da</span>;
  }
  // „Paprika (rot oder bunt)“ → „Paprika“: die Zusätze stehen im Rezept, hier geht es nur ums Einkaufen
  const clean = (names: string[]) => [...new Set(names.map((n) => n.replace(/\s*\(.*?\)/g, '').trim()))];
  const list = (names: string[]) => {
    const c = clean(names);
    return c.slice(0, max).join(', ') + (c.length > max ? ` und ${c.length - max} weitere` : '');
  };
  return (
    // „Fehlt“ und „reicht nicht“ je in eigener Zeile – nebeneinander wird es auf den Kacheln zu lang
    <span className="stock-line stock-line--list">
      {missing.length > 0 && <span>Fehlt: {list(missing)}</span>}
      {short.length > 0 && <span>Reicht nicht: {list(short)}</span>}
    </span>
  );
}
