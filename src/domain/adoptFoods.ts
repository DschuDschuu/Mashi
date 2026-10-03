import type { SavedBon } from './bons';
import { keyOfName } from './mealplan';
import { guessMatch } from './nutrition/localFoods';
import { MY_PRODUCTS_PROVIDER, type MyProduct } from './nutrition/myProducts';
import type { FoodTable } from './nutrition/types';
import { isPrepared, type PantryItem } from './pantry';

const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * „Aus Vorrat & Bons übernehmen“ (Julia: „Meine Lebensmittel“ als zentrale Stelle): alles, was im Vorrat liegt
 * oder auf einem Bon stand und noch keine Kachel hat – je Lebensmittel ein Produkt ohne eigene Nährwerte
 * (es rechnet weiter mit der Tabelle). Danach lassen sich Haltbarkeit, Packung und Sorten dort einstellen.
 *
 * Nicht übernommen: was schon ein eigenes Produkt hat, „Immer im Haus“ und Gewürze (haben ihre eigenen Tabs),
 * Vorgekochtes und übersprungene Bon-Zeilen. Gleiches Lebensmittel nur einmal – der Name aus dem Vorrat gewinnt
 * (die Lebensmittel geben die Namen vor).
 * @param table mit den eigenen Produkten (useFoodTable) – daran erkennt Mashi, was schon eine Kachel hat
 * @param skip Namen aus „Immer im Haus“ und „Gewürze“
 */
export function adoptCandidates(
  items: readonly PantryItem[], bons: readonly SavedBon[] | undefined, table: FoodTable, skip: readonly string[], now = new Date().toISOString(),
  newId: () => string = () => `p-${Math.random().toString(36).slice(2, 10)}`,
): MyProduct[] {
  const names = [
    ...items.filter((it) => !isPrepared(it) && !it.productId).map((it) => it.name),
    ...(bons ?? []).flatMap((b) => b.lines).filter((l) => !l.skip && !l.productId && l.name.trim()).map((l) => l.name),
  ];
  const skipKeys = new Set(skip.map((n) => keyOfName(n, table)));
  const seen = new Set<string>();
  const out: MyProduct[] = [];
  for (const name of names) {
    const n = name.trim();
    const key = keyOfName(n, table);
    if (!key || seen.has(key) || skipKeys.has(key)) continue;
    seen.add(key);
    // hat schon eine Kachel (ein eigenes Produkt rechnet dafür)
    if (table.matchName(n)?.food.ref.provider === MY_PRODUCTS_PROVIDER) continue;
    const match = guessMatch(n);
    out.push({
      id: newId(), name: n, replaces: match.replaces, ...(match.names.length ? { names: match.names } : {}),
      // keine Packungsgröße: die stellt vorhandenen Vorrat auf Packungen um (normalizePacks) – lieber bewusst in der Kachel
      per100g: ZERO, noValues: true, updatedAt: now,
    });
  }
  return out;
}
