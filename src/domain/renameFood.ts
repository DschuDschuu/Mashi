import { basicsOf } from './mealplan';
import { zeroOf } from './nutrition/noNutrition';
import { nameOf, type MyProduct } from './nutrition/myProducts';
import { receiptKey, sameName, type ImportRow, type Pantry } from './pantry';

/**
 * Ein Lebensmittel umbenennen (Julia: in „Meine Lebensmittel“ umbenannt, in der Speisekammer stand noch der alte Name).
 * Mit wandern: Vorräte dieser Sorten oder mit genau dem alten Namen, gelernte Bon-Artikel (der nächste Bon nimmt den
 * neuen Namen), gespeicherte Bons, Preisverlauf, Nachkaufen, Immer im Haus und Gewürze.
 * undo stellt genau die geänderten Einträge zurück – was schon vorher so hieß, bleibt.
 */
export function renameFood(pantry: Pantry, from: string, to: string, productIds: readonly string[]): { pantry: Pantry; undo: (p: Pantry) => Pantry } {
  const ids = new Set(productIds);
  const hit = (name: string | undefined, productId?: string) => (!!productId && ids.has(productId)) || (!!name && sameName(name, from));
  if (!to.trim() || sameName(from, to)) return { pantry, undo: (p) => p };

  const items = new Set<string>();
  const rules = new Set<string>();
  const lines = new Set<string>();
  const was = new Map<string, string>(); // geänderter Eintrag → alter Name

  /** Einträge, die nur am Namen hängen: umbenennen und den alten Namen merken */
  function mark<T extends { name: string }>(key: string, x: T): T {
    if (!sameName(x.name, from) || x.name === to) return x;
    was.set(key, x.name);
    return { ...x, name: to };
  }
  const back = <T extends { name: string }>(key: string, x: T): T => (x.name === to && was.has(key) ? { ...x, name: was.get(key)! } : x);

  const next: Pantry = {
    ...pantry,
    items: pantry.items.map((i) => {
      if (i.recipeId || !hit(i.name, i.productId) || i.name === to) return i;
      items.add(i.id);
      was.set(`i:${i.id}`, i.name);
      return { ...i, name: to };
    }),
    rules: pantry.rules.map((r) => {
      if (r.skip || !hit(r.name, r.productId) || r.name === to) return r;
      rules.add(r.key);
      was.set(`r:${r.key}`, r.name!);
      return { ...r, name: to };
    }),
    ...(pantry.bons ? {
      bons: pantry.bons.map((b) => ({
        ...b,
        lines: b.lines.map((l, n) => {
          if (l.skip || !hit(l.name, l.productId) || l.name === to) return l;
          lines.add(`${b.id}|${n}`);
          was.set(`l:${b.id}|${n}`, l.name);
          return { ...l, name: to };
        }),
      })),
    } : {}),
    // Preise kennen nur den Namen
    ...(pantry.history ? { history: pantry.history.map((h) => mark(`h:${h.date}`, h)) } : {}),
    prices: (pantry.prices ?? []).map((h) => mark(`p:${h.date}`, h)),
    ...(pantry.restock ? { restock: pantry.restock.map((r) => mark(`s:${r.below}${r.unit}`, r)) } : {}),
    ...(basicsOf(pantry).some((b) => sameName(b, from)) ? { basics: basicsOf(pantry).map((b, n) => mark(`b:${n}`, { name: b }).name) } : {}),
    ...(zeroOf(pantry).some((b) => sameName(b, from)) ? { noNutrition: zeroOf(pantry).map((b, n) => mark(`z:${n}`, { name: b }).name) } : {}),
  };

  const undo = (p: Pantry): Pantry => ({
    ...p,
    items: p.items.map((i) => (items.has(i.id) && i.name === to ? { ...i, name: was.get(`i:${i.id}`)! } : i)),
    rules: p.rules.map((r) => (rules.has(r.key) && r.name === to ? { ...r, name: was.get(`r:${r.key}`)! } : r)),
    ...(p.bons ? {
      bons: p.bons.map((b) => ({ ...b, lines: b.lines.map((l, n) => (lines.has(`${b.id}|${n}`) && l.name === to ? { ...l, name: was.get(`l:${b.id}|${n}`)! } : l)) })),
    } : {}),
    ...(p.history ? { history: p.history.map((h) => back(`h:${h.date}`, h)) } : {}),
    prices: (p.prices ?? []).map((h) => back(`p:${h.date}`, h)),
    ...(p.restock ? { restock: p.restock.map((r) => back(`s:${r.below}${r.unit}`, r)) } : {}),
    ...(p.basics && next.basics !== pantry.basics ? { basics: p.basics.map((b, n) => back(`b:${n}`, { name: b }).name) } : {}),
    ...(p.noNutrition && next.noNutrition !== pantry.noNutrition ? { noNutrition: p.noNutrition.map((b, n) => back(`z:${n}`, { name: b }).name) } : {}),
  });
  return { pantry: next, undo };
}

/**
 * „Meine Lebensmittel“ gibt den Namen vor (Julia): Vorrat, gelernte Bon-Artikel und Bon-Zeilen, die einer Sorte
 * zugeordnet sind, heißen wie sie – auch rückwirkend. Preise kennen nur Namen: sie ziehen mit dem alten Namen mit.
 * undefined = schon alles einheitlich.
 */
export function syncProductNames(pantry: Pantry, products: readonly MyProduct[]): Pantry | undefined {
  const nameById = new Map(products.map((p) => [p.id, nameOf(p)]));
  const renamed = new Map<string, string>(); // alter Name (vereinheitlicht) → neuer
  const fix = <T extends { name?: string; productId?: string }>(x: T): T => {
    const n = x.productId ? nameById.get(x.productId) : undefined;
    if (!n || !x.name || x.name === n) return x;
    renamed.set(receiptKey(x.name), n);
    return { ...x, name: n };
  };
  const items = pantry.items.map((i) => (i.recipeId ? i : fix(i)));
  const rules = pantry.rules.map((r) => (r.skip ? r : fix(r)));
  const bons = pantry.bons?.map((b) => {
    const lines = b.lines.map((l) => (l.skip ? l : fix(l)));
    return lines.some((l, n) => l !== b.lines[n]) ? { ...b, lines } : b;
  });
  if (!renamed.size) return undefined;
  const price = <T extends { name: string }>(h: T): T => (renamed.has(receiptKey(h.name)) ? { ...h, name: renamed.get(receiptKey(h.name))! } : h);
  return {
    ...pantry, items, rules, ...(bons ? { bons } : {}),
    ...(pantry.history ? { history: pantry.history.map(price) } : {}),
    prices: (pantry.prices ?? []).map(price),
  };
}

/**
 * Alten Import ersetzen: Die Vorräte vom ersten Einlesen tragen den Namen und die Sorte von damals (im Gelernten
 * gemerkt). Weicht die neue Zuordnung ab, wandern sie dorthin – Mengen bleiben. Vor applyImport aufrufen
 * (das überschreibt das Gelernte).
 */
export function relinkOldImport(pantry: Pantry, rows: readonly ImportRow[]): Pantry {
  let items = pantry.items;
  for (const row of rows) {
    if (row.skip) continue;
    const old = pantry.rules.find((r) => r.key === row.key);
    if (old?.skip) continue; // damals übersprungen – nichts im Vorrat
    const oldName = old?.name ?? row.line.name;
    const name = row.name.trim();
    if (sameName(oldName, name) && old?.productId === row.productId) continue;
    items = items.map((i) => {
      if (i.recipeId || !sameName(i.name, oldName) || i.productId !== old?.productId) return i;
      const { productId: _old, ...rest } = i;
      return { ...rest, name, ...(row.productId ? { productId: row.productId } : {}) };
    });
  }
  return items === pantry.items ? pantry : { ...pantry, items };
}
