import { normalizeName } from './localFoods';
import { averageNutrients } from './variants';
import type { FoodEntry, FoodTable, Nutrients } from './types';

/**
 * „Meine Produkte“: Lebensmittel, die du immer in einer bestimmten Sorte kaufst.
 * Ein Produkt ERSETZT beim Rechnen allgemeine Einträge der Lebensmitteltabelle –
 * z. B. rechnet jede Milch (Vollmilch, fettarm, Magermilch) mit deiner 0,1-%-Milch.
 *
 * Die Rezepte bleiben dabei unverändert: Wechselst du die Marke, änderst du nur
 * das Produkt, und alle Rezepte rechnen neu.
 *
 * Die Liste ist persönlich und liegt deshalb in deiner Datenbank, nicht im Code.
 */
export interface MyProduct {
  id: string;
  /** wie auf der Packung, z. B. „Milch 0,1 % (Hausmarke)“ */
  name: string;
  /** IDs aus der allgemeinen Tabelle, die dieses Produkt ersetzt, z. B. ['milch', 'magermilch'] */
  replaces: string[];
  /**
   * Zutatennamen, für die dieses Produkt gilt – für Lebensmittel, die die allgemeine Tabelle
   * gar nicht kennt (z. B. „kimchi“). Normalisiert gespeichert (siehe normalizeName).
   */
  names?: string[];
  /** Werte vom Etikett, pro 100 g bzw. 100 ml */
  per100g: Nutrients;
  /** Packungsgröße, z. B. 125 g – füllt beim Kassenbon die Menge je Stück aus */
  packageAmount?: number;
  packageUnit?: 'g' | 'ml' | 'Stück';
  /** Preis je Packung in Euro (von Hand; Preise vom Kassenbon kommen automatisch) */
  packagePrice?: number;
  /** Barcode (EAN), falls per Scan angelegt – erkennt das Produkt beim nächsten Scan wieder */
  ean?: string;
  /** hält ab Kauf so viele Tage (von dir) – leer = Mashi schätzt */
  shelfDays?: number;
  /**
   * „Eigene Nährwerte“ statt „Mein Produkt“: nur Werte für einen Zutatennamen, keine bestimmte
   * Packung. Rechnet genauso; steht auf der Produkte-Seite in einer eigenen Gruppe. Bekommt es
   * Barcode oder Packungsgröße, wird es zum richtigen Produkt.
   */
  generic?: boolean;
  /**
   * Favorit unter mehreren Sorten derselben Zutat (★): Rezepte rechnen dann mit dieser Sorte statt
   * mit dem Durchschnitt, und liegt sie im Vorrat, nimmt Mashi sie beim Planen ohne Nachfrage.
   */
  favorite?: boolean;
  updatedAt: string;
}

export const MY_PRODUCTS_PROVIDER = 'mashi-meine-produkte';

/** 1 Glas = Packungsgröße des Produkts (in g; ml über die Dichte des ersetzten Eintrags) */
function glassOf(p: MyProduct, replaced?: FoodEntry): number | undefined {
  if (!p.packageAmount) return undefined;
  if (p.packageUnit === 'g' || p.packageUnit === undefined) return p.packageAmount;
  if (p.packageUnit === 'ml') return p.packageAmount * (replaced?.density ?? 1);
  return undefined;
}

/** Ein Produkt als Tabelleneintrag. Umrechnungen (Dichte, Stückgewicht) erbt es vom ersetzten Eintrag. */
function asEntry(p: MyProduct, replaced?: FoodEntry): FoodEntry {
  return {
    ref: { provider: MY_PRODUCTS_PROVIDER, foodId: p.id },
    name: p.name,
    per100g: p.per100g,
    ...(replaced?.density !== undefined ? { density: replaced.density } : {}),
    ...(replaced?.portions || glassOf(p, replaced) ? { portions: { ...replaced?.portions, ...(glassOf(p, replaced) ? { Glas: glassOf(p, replaced) } : {}) } } : {}),
    ...(replaced?.kind ? { kind: replaced.kind } : {}),
    ...(replaced ? { baseId: replaced.ref.foodId } : {}),
    ...(p.shelfDays ? { shelfDays: p.shelfDays } : {}),
  };
}

/**
 * Mehrere Produkte für dieselbe Zutat: Durchschnitt als Wert, die einzelnen als Sorten.
 * Die ID hängt an der Zutat (nicht an den Produkten), damit Vorrat und Rezept denselben
 * Schlüssel bekommen – auch wenn später eine dritte Sorte dazukommt.
 */
function asGroup(ps: MyProduct[], key: string, replaced?: FoodEntry): FoodEntry {
  if (ps.length === 1) return asEntry(ps[0], replaced);
  const days = ps.map((p) => p.shelfDays).filter((d): d is number => d !== undefined);
  // Favorit: dessen Werte statt des Durchschnitts (Schlüssel bleibt – Vorrat und Rezept finden sich weiter)
  const fav = ps.find((p) => p.favorite);
  return {
    ...asEntry(ps[0], replaced),
    ref: { provider: MY_PRODUCTS_PROVIDER, foodId: `sorten:${key}` },
    name: replaced?.name ?? key.charAt(0).toLocaleUpperCase('de-DE') + key.slice(1),
    per100g: fav ? fav.per100g : averageNutrients(ps.map((p) => p.per100g)),
    ...(days.length === ps.length ? { shelfDays: Math.min(...days) } : { shelfDays: undefined }),
    variants: ps.map((p) => ({ id: p.id, name: p.name, per100g: p.per100g, ...(p.favorite ? { favorite: true } : {}) })),
    ...(fav ? { favoriteId: fav.id } : {}),
  };
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

/**
 * Legt „Meine Produkte“ über eine Lebensmitteltabelle. Die Zuordnung „Name → Lebensmittel“
 * bleibt die der allgemeinen Tabelle – nur die Werte kommen dann von deinem Produkt.
 * So bleibt die Genauigkeit (berechnet/geschätzt) dieselbe wie vorher.
 */
export function withMyProducts(base: FoodTable, products: MyProduct[]): FoodTable {
  if (!products.length) return base;
  // Mehrere Produkte für dasselbe = Sorten (siehe asGroup)
  const byReplaced = new Map<string, MyProduct[]>();
  for (const p of products) for (const r of p.replaces) push(byReplaced, r, p);
  const byName = new Map<string, MyProduct[]>();
  for (const p of products) for (const n of new Set((p.names ?? []).map(normalizeName))) push(byName, n, p);
  // Ein Produkt passt immer auch auf seinen eigenen Namen („Frischkäse Balance“)
  const byOwnName = new Map(products.map((p) => [normalizeName(p.name), p]));
  const swap = (food: FoodEntry): FoodEntry => {
    const ps = byReplaced.get(food.ref.foodId);
    return ps ? asGroup(ps, food.ref.foodId, food) : food;
  };
  return {
    byRef(ref) {
      if (ref.provider === MY_PRODUCTS_PROVIDER) {
        if (ref.foodId.startsWith('sorten:')) {
          const key = ref.foodId.slice('sorten:'.length);
          const ps = byName.get(key) ?? byReplaced.get(key);
          const exact = base.matchName(key);
          return ps && asGroup(ps, key, byReplaced.has(key) ? base.byRef({ provider: ref.provider, foodId: key }) : exact?.quality === 'exact' ? exact.food : undefined);
        }
        const p = products.find((x) => x.id === ref.foodId);
        return p ? asEntry(p) : undefined;
      }
      const food = base.byRef(ref);
      return food && swap(food);
    },
    matchName(name) {
      // Eigene Namen zuerst: Du hast das Produkt ausdrücklich für diese Zutat angelegt.
      const n = normalizeName(name);
      const own = byName.get(n);
      const m = base.matchName(name);
      // Kennt die Tabelle den Namen genau (Pesto), übernimmt das Produkt deren Umrechnungen
      // (1 Glas, 1 EL, Dichte) – falls du selbst keine Packungsgröße eingetragen hast
      if (own) return { food: asGroup(own, n, m?.quality === 'exact' ? m.food : undefined), quality: 'exact' };
      const self = byOwnName.get(n);
      if (self) {
        // Umrechnungen (Dichte, Stückgewicht) vom ersetzten Eintrag behalten, wenn der Name dorthin führt
        const replaced = m && self.replaces.includes(m.food.ref.foodId) ? m.food : undefined;
        return { food: asEntry(self, replaced), quality: 'exact' };
      }
      return m && { food: swap(m.food), quality: m.quality };
    },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Prüft einen Eintrag (z. B. aus einer Sicherungsdatei). */
export function isValidProduct(v: unknown): v is MyProduct {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  const n = p.per100g as Record<string, unknown> | undefined;
  return typeof p.id === 'string' && !!p.id && typeof p.name === 'string' && !!p.name.trim()
    && Array.isArray(p.replaces) && p.replaces.every((r) => typeof r === 'string')
    && (p.names === undefined || (Array.isArray(p.names) && p.names.every((r) => typeof r === 'string')))
    && typeof p.updatedAt === 'string'
    && (p.packageAmount === undefined || isNum(p.packageAmount))
    && (p.packagePrice === undefined || isNum(p.packagePrice))
    && (p.packageUnit === undefined || ['g', 'ml', 'Stück'].includes(p.packageUnit as string))
    && (p.ean === undefined || typeof p.ean === 'string')
    && (p.shelfDays === undefined || isNum(p.shelfDays))
    && !!n && isNum(n.kcal) && isNum(n.protein) && isNum(n.carbs) && isNum(n.fat);
}
