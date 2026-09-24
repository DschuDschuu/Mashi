import { normalizeName } from './localFoods';
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
  updatedAt: string;
}

export const MY_PRODUCTS_PROVIDER = 'mashi-meine-produkte';

/** Ein Produkt als Tabelleneintrag. Umrechnungen (Dichte, Stückgewicht) erbt es vom ersetzten Eintrag. */
function asEntry(p: MyProduct, replaced?: FoodEntry): FoodEntry {
  return {
    ref: { provider: MY_PRODUCTS_PROVIDER, foodId: p.id },
    name: p.name,
    per100g: p.per100g,
    ...(replaced?.density !== undefined ? { density: replaced.density } : {}),
    ...(replaced?.portions ? { portions: replaced.portions } : {}),
    ...(replaced?.kind ? { kind: replaced.kind } : {}),
  };
}

/**
 * Legt „Meine Produkte“ über eine Lebensmitteltabelle. Die Zuordnung „Name → Lebensmittel“
 * bleibt die der allgemeinen Tabelle – nur die Werte kommen dann von deinem Produkt.
 * So bleibt die Genauigkeit (berechnet/geschätzt) dieselbe wie vorher.
 */
export function withMyProducts(base: FoodTable, products: MyProduct[]): FoodTable {
  if (!products.length) return base;
  const byReplaced = new Map<string, MyProduct>();
  for (const p of products) for (const r of p.replaces) byReplaced.set(r, p);
  const byName = new Map<string, MyProduct>();
  for (const p of products) for (const n of p.names ?? []) byName.set(normalizeName(n), p);
  const swap = (food: FoodEntry): FoodEntry => {
    const p = byReplaced.get(food.ref.foodId);
    return p ? asEntry(p, food) : food;
  };
  return {
    byRef(ref) {
      if (ref.provider === MY_PRODUCTS_PROVIDER) {
        const p = products.find((x) => x.id === ref.foodId);
        return p ? asEntry(p) : undefined;
      }
      const food = base.byRef(ref);
      return food && swap(food);
    },
    matchName(name) {
      // Eigene Namen zuerst: Du hast das Produkt ausdrücklich für diese Zutat angelegt.
      const own = byName.get(normalizeName(name));
      if (own) return { food: asEntry(own), quality: 'exact' };
      const m = base.matchName(name);
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
    && !!n && isNum(n.kcal) && isNum(n.protein) && isNum(n.carbs) && isNum(n.fat);
}
