/**
 * Packungen im Vorrat: „4 × 500 g“ statt „2000 g“, Anbrechen, „ganze Packung?“ beim Kochen,
 * Packungsgröße aus „Meine Produkte“ nachtragen, gleiche Packungen zusammenlegen.
 */
import type { FoodEntry, FoodTable } from './nutrition/types';
import type { Ingredient, Unit } from './types';
import type { Pack } from './pantryLabel';
import { needIn, resolveIngredient } from './mealplan';
import { defaultId, isCount, isPrepared, itemAsIngredient, sameName, samePack, type Pantry, type PantryItem, type PantryUnit } from './pantry';

/**
 * Passende Einheit beim Eintragen: Pesto im Glas, Eier und Paprika als Stück, Milch in ml, sonst g.
 * Ein Produkt mit Packung „Stück“ (10er-Eier) geht vor.
 */
export function suggestPantryUnit(
  food: FoodEntry | undefined, product?: { packageUnit?: 'g' | 'ml' | 'Stück'; packageAmount?: number },
  /** der Eintrag der allgemeinen Tabelle (ohne deine Produkte) – kennt er „Glas“, ist es ein echtes Glas (Pesto) */
  base?: FoodEntry,
): PantryUnit {
  if (product?.packageUnit === 'Stück') return 'Stück';
  // Produkt mit Packungsgröße: in Packungen zählen – „3 Stück“, die Größe hängt Mashi selbst an
  if (product?.packageAmount) return base?.portions?.Glas ? 'Glas' : 'Stück';
  // ohne Packungsgröße (Julia): g – außer Gläsern (Pesto), Eiern (zählt man) und Flüssigem (ml).
  // Ein Stückgewicht in der Tabelle (Karotte ~80 g) heißt nicht, dass man Karotten zählt.
  if (!food) return 'g';
  if (food.portions?.Glas) return 'Glas';
  if (food.kind === 'egg') return 'Stück';
  if (food.density !== undefined) return 'ml';
  return 'g';
}

/**
 * Von Hand angebrochen (Joghurt zum Frühstück): eine Packung wird zum offenen Rest.
 * @param take so viel nimmst du gleich heraus (g/ml der Packung, sonst in der Einheit des Vorrats) –
 *   leer = nur geöffnet. Alles herausgenommen → einfach eine Packung weniger.
 * Ohne Packungsgröße wird der Eintrag selbst „offen“ (und um take kleiner).
 */
export function openItem(items: PantryItem[], id: string, now: string, newId = defaultId, take = 0): PantryItem[] {
  const item = items.find((x) => x.id === id);
  if (!item || item.openedAt || item.frozenAt) return items;
  const t = Math.max(0, take);
  if (item.pack && isCount(item.unit) && (item.amount ?? 0) >= 1) {
    const { id: _id, check: _c, pack, amount: _a, unit: _u, ...keep } = item;
    const rest = Math.round(pack.amount - t);
    const opened: PantryItem = { ...keep, id: newId(), amount: rest, unit: pack.unit, addedAt: now, boughtAt: item.boughtAt ?? item.addedAt, openedAt: now };
    const closed = Math.round((item.amount! - 1) * 10) / 10;
    return [...items.flatMap((x) => (x.id !== id ? [x] : closed > 0 ? [{ ...x, amount: closed }] : [])), ...(rest > 0 ? [opened] : [])];
  }
  if (item.amount === undefined) return items.map((x) => (x.id === id ? { ...x, openedAt: now } : x));
  if (isCount(item.unit)) {
    // „3 Stück Joghurt“ ohne Packungsgröße: EIN Becher wird offen, die anderen bleiben zu – ohne Mengenfrage
    if (item.amount <= 1) return items.map((x) => (x.id === id ? { ...x, openedAt: now } : x));
    const { id: _id, check: _c, ...keep } = item;
    const opened: PantryItem = { ...keep, id: newId(), amount: 1, addedAt: now, boughtAt: item.boughtAt ?? item.addedAt, openedAt: now };
    return [...items.map((x) => (x.id === id ? { ...x, amount: Math.round((item.amount! - 1) * 10) / 10 } : x)), opened];
  }
  const left = Math.round((item.amount - t) * 10) / 10;
  return left > 0 ? items.map((x) => (x.id === id ? { ...x, amount: left, openedAt: now } : x)) : items.filter((x) => x.id !== id);
}

/**
 * Menge von Hand geändert (Julia): weniger heißt meistens „etwas herausgenommen“ – dann ist es angebrochen
 * und hält kürzer. Außer es fehlen ganze Packungen oder Stücke (3 Dosen → 2, 6 Eier → 4): die übrigen
 * sind weiter zu. Mehr oder gleich viel: nur die Menge. Vertippt? „Angebrochen“ lässt sich wieder ausschalten.
 * Packungen mit Bruchteil („2,5“ von 3 × 400 ml): 2 bleiben zu, eine wird zum offenen Rest (wie openItem).
 */
export function changeAmount(items: PantryItem[], id: string, amount: number, now: string, newId = defaultId): PantryItem[] {
  const item = items.find((x) => x.id === id);
  if (!item) return items;
  // 0 = alle – der Eintrag geht (die Oberfläche bietet „Rückgängig“)
  if (amount <= 0) return items.filter((x) => x.id !== id);
  const set = (a: number, extra: Partial<PantryItem> = {}) => items.map((x) => (x.id === id ? { ...x, amount: a, check: false, ...extra } : x));
  const old = item.amount;
  // mehr, gleich, ohne alte Menge, eingefroren, Vorgekochtes, schon offen: einfach übernehmen
  if (old === undefined || amount >= old || item.frozenAt || item.recipeId || item.openedAt) return set(amount);
  if (item.pack && isCount(item.unit)) {
    const whole = Math.floor(amount + 1e-9);
    if (Math.abs(amount - whole) < 1e-9) return set(amount);
    // die angefangene Packung: „whole + 1“ Packungen, eine davon wird geöffnet, herausgenommen ist der Rest
    const take = Math.round((1 - (amount - whole)) * item.pack.amount);
    return openItem(set(whole + 1), id, now, newId, take);
  }
  if (isCount(item.unit)) return set(amount);
  return set(amount, { openedAt: now });
}

/** „Ganze Packung verwenden?“ – für dieses Mal, das Rezept bleibt. */
export interface PackSuggestion {
  ingredientId: string;
  name: string;
  /** in der Einheit der Zutat, schon für diese Portionen */
  amount: number;
  planned: number;
  unit?: Unit;
  /** so viele Packungen */
  packs: number;
  /** „500 g“ */
  pack: Pack;
  /** so viel bliebe mit der Rezeptmenge offen (in g/ml der Packung) */
  wouldOpen: number;
}

/**
 * Das Rezept will 600 g Hack, eine Packung hat 500 g → „nur 500 g?“ (sonst bleiben 400 g offen).
 * Oder 450 g → „die ganze Packung?“. Nur bis 25 % Abweichung, nur mit geschlossenen Packungen
 * und wenn nichts Angebrochenes da ist (das wird ohnehin zuerst verbraucht).
 * @param ingredients schon auf die Portionen umgerechnet
 */
export function packSuggestions(pantry: Pantry, ingredients: Ingredient[], table: FoodTable): PackSuggestion[] {
  const resolved = ingredients.map((ing) => ({ ing, need: resolveIngredient(ing, 1, table) }));
  const keyOf = (it: PantryItem) => itemAsIngredient(it, table)?.key;
  const out: PackSuggestion[] = [];
  for (const { ing, need } of resolved) {
    if (!need || need.pantry || need.food?.negligible || ing.amount === undefined) continue;
    if (resolved.filter((r) => r.need?.key === need.key).length > 1) continue;
    const mine = pantry.items.filter((it) => !isPrepared(it) && (it.amount ?? 0) > 0 && keyOf(it) === need.key);
    if (mine.some((it) => it.openedAt)) continue;
    const item = mine.find((it) => it.pack && isCount(it.unit) && !it.frozenAt);
    if (!item?.pack) continue;
    const packs = needIn(item, need);
    if (packs === undefined || packs <= 0) continue;
    const frac = packs - Math.floor(packs);
    if (frac < 0.02 || frac > 0.98) continue; // geht schon auf
    const down = Math.floor(packs);
    const up = Math.ceil(packs);
    const k = down >= 1 && down <= item.amount! && (packs - down) / packs <= 0.25 ? down : up <= item.amount! && (up - packs) / packs <= 0.25 ? up : undefined;
    if (k === undefined) continue;
    out.push({
      ingredientId: ing.id, name: ing.name, amount: ing.amount * (k / packs), planned: ing.amount, unit: ing.unit,
      packs: k, pack: item.pack, wouldOpen: Math.round((up - packs) * item.pack.amount),
    });
  }
  return out;
}

/**
 * Vorräte, die vor den Packungen eingetragen wurden (oder bevor das Produkt eine Packungsgröße hatte):
 * „2⅔ Stück Joghurt“ → „2 × 500 g“ + „333 g offen“. Nur mit Produkt samt Packungsgröße – sonst weiß
 * Mashi es nicht. undefined = nichts zu tun.
 */
export function attachPacks(items: PantryItem[], table: FoodTable, products: readonly MyProductPack[], now: string): PantryItem[] | undefined {
  let changed = false;
  const out: PantryItem[] = [];
  for (const it of items) {
    const loose = it.unit === 'g' || it.unit === 'ml';
    const product = it.pack || it.openedAt || isPrepared(it) || !(isCount(it.unit) || loose) || it.amount === undefined ? undefined : productFor(it, table, products);
    const pack: Pack | undefined = product && { amount: product.packageAmount!, unit: product.packageUnit === 'ml' ? 'ml' : 'g' };
    // in g/ml: so viele Packungen – Gefrorenes nur, wenn es genau aufgeht (sonst weiß Mashi nicht, was davon offen ist)
    const count = pack && (loose ? it.amount! / pack.amount : it.amount!);
    // Stückware mit eigenem Stückgewicht (Zwiebel ≈ 80 g) ist keine Packung – „6 Zwiebeln“ ≠ „6 × 1-kg-Netz“
    const piece = table.matchName(it.name)?.food.portions?.Stück;
    const ownPiece = !!pack && !!piece && Math.abs(piece - pack.amount) / pack.amount > 0.1;
    if (!product || !pack || count === undefined || ownPiece || (loose && it.frozenAt && Math.abs(count - Math.round(count)) > 0.02)) {
      out.push(it);
      continue;
    }
    changed = true;
    const closed = it.frozenAt ? Math.round(count) : Math.floor(count + 1e-6);
    const rest = it.frozenAt ? 0 : count - closed;
    const openRest = rest > 0.02 ? Math.round(rest * pack.amount) : 0;
    const { check: _c, ...keep } = it;
    // Produkt mitmerken – sonst hielte addItem die nächsten Becher für eine andere Sorte
    const productId = it.productId ?? product.id;
    if (closed > 0) out.push({ ...it, amount: closed, unit: 'Stück', pack, productId });
    if (openRest > 0) {
      // ohne geschlossene Packung behält der offene Rest die ID (Verweise wie „für den Wochenplan“ bleiben);
      // sonst eine aus der alten abgeleitete – stellen zwei Geräte gleichzeitig um, entsteht derselbe Eintrag, nicht zwei
      out.push({ ...keep, productId, id: closed > 0 ? `${it.id}~offen` : it.id, amount: openRest, unit: pack.unit, openedAt: now, boughtAt: it.boughtAt ?? it.addedAt, ...(closed > 0 ? { addedAt: now } : {}) });
    }
  }
  return changed ? out : undefined;
}

/** das, was attachPacks von einem Produkt braucht */
type MyProductPack = { id: string; packageAmount?: number; packageUnit?: 'g' | 'ml' | 'Stück'; favorite?: boolean };

/** Produkt eines Vorrats mit Packungsgröße in g/ml: die Sorte am Vorrat, sonst das (eine) Produkt für den Namen */
function productFor(it: PantryItem, table: FoodTable, products: readonly MyProductPack[]): MyProductPack | undefined {
  const withPack = (p?: MyProductPack) => (p?.packageAmount && p.packageUnit !== 'Stück' ? p : undefined);
  if (it.productId) return withPack(products.find((p) => p.id === it.productId));
  const food = table.matchName(it.name)?.food;
  if (!food) return undefined;
  const ids = food.variants?.length ? food.variants.map((v) => v.id) : [food.ref.foodId];
  const ps = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is MyProductPack => !!withPack(p));
  // mehrere Sorten: nur, wenn alle gleich groß sind (sonst wüsste Mashi nicht, welche es ist)
  return ps.length && ps.every((p) => p.packageAmount === ps[0].packageAmount && p.packageUnit === ps[0].packageUnit) ? ps[0] : undefined;
}

/**
 * Doppelte Zeilen zusammenlegen: gleicher Name, gleiche Einheit und Packung, beide geschlossen und frisch –
 * „2 × 500 g“ + „2 × 500 g“ → „4 × 500 g“. Fehlt einem die Sorte, übernimmt er die des anderen.
 * undefined = nichts zu tun.
 */
export function mergeSamePacks(items: PantryItem[]): PantryItem[] | undefined {
  const out: PantryItem[] = [];
  let changed = false;
  for (const it of items) {
    const i = it.amount === undefined || it.frozenAt || it.openedAt || isPrepared(it) ? -1 : out.findIndex((x) => x.amount !== undefined && !x.frozenAt && !x.openedAt && !isPrepared(x)
      && sameName(x.name, it.name) && x.unit === it.unit && samePack(x.pack, it.pack) && !!x.reduced === !!it.reduced && x.useBy === it.useBy
      && (x.productId === it.productId || !x.productId || !it.productId));
    if (i < 0) {
      out.push(it);
      continue;
    }
    const x = out[i];
    changed = true;
    out[i] = {
      ...x, amount: Math.round((x.amount! + it.amount!) * 10) / 10, check: false,
      ...(x.productId || it.productId ? { productId: x.productId ?? it.productId } : {}),
      // das ältere Kaufdatum zählt (wie beim Eintragen)
      boughtAt: [x.boughtAt ?? x.addedAt, it.boughtAt ?? it.addedAt].sort()[0],
    };
  }
  return changed ? out : undefined;
}
