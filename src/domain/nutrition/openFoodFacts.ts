import type { Nutrients } from './types';

/**
 * Open Food Facts (freie, offene Produktdatenbank): Antwort auf eine Barcode-Abfrage in das
 * Format von „Meine Produkte“ übersetzen. Die Werte stammen von der Community – Mashi zeigt sie
 * deshalb IMMER zur Prüfung an, bevor gespeichert wird.
 */
export interface ScannedProduct {
  ean: string;
  name: string;
  per100g: Nutrients;
  packageAmount?: number;
  packageUnit?: 'g' | 'ml';
}

type OffNutriments = Record<string, number | string | undefined>;
interface OffResponse {
  status?: number;
  product?: OffProduct;
}
interface OffProduct {
    product_name?: string;
    product_name_de?: string;
    brands?: string;
    quantity?: string;
    product_quantity?: number | string;
    product_quantity_unit?: string;
    nutriments?: OffNutriments;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** „125 g“, „0,5 l“, „250ml“ → Menge + Einheit (l → ml, kg → g) */
export function parseQuantity(text: string | undefined): { amount: number; unit: 'g' | 'ml' } | undefined {
  const m = text?.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  if (unit === 'kg') return { amount: n * 1000, unit: 'g' };
  if (unit === 'l') return { amount: n * 1000, unit: 'ml' };
  if (unit === 'cl') return { amount: n * 10, unit: 'ml' };
  return { amount: n, unit: unit as 'g' | 'ml' };
}

/** null = Barcode unbekannt oder ohne die vier Hauptwerte (dann lieber vom Etikett abtippen). */
export function fromOpenFoodFacts(ean: string, res: OffResponse): ScannedProduct | null {
  const p = res.product;
  if (res.status !== 1 || !p) return null;
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== undefined ? Math.round(num(n['energy_100g'])! / 4.184) : undefined);
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return null;

  const optional: Partial<Nutrients> = {};
  const sugar = num(n.sugars_100g);
  const fiber = num(n.fiber_100g);
  const salt = num(n.salt_100g);
  const satFat = num(n['saturated-fat_100g']);
  if (sugar !== undefined) optional.sugar = sugar;
  if (fiber !== undefined) optional.fiber = fiber;
  if (salt !== undefined) optional.salt = salt;
  if (satFat !== undefined) optional.satFat = satFat;

  const unit = p.product_quantity_unit?.toLowerCase();
  const pack = num(p.product_quantity) && (unit === 'g' || unit === 'ml')
    ? { amount: num(p.product_quantity)!, unit: unit as 'g' | 'ml' }
    : parseQuantity(p.quantity);

  const title = (p.product_name_de || p.product_name || '').trim();
  const brand = p.brands?.split(',')[0]?.trim();
  return {
    ean,
    name: [title, brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `(${brand})` : ''].filter(Boolean).join(' ') || `Produkt ${ean}`,
    per100g: { kcal, protein, carbs, fat, ...optional },
    ...(pack ? { packageAmount: pack.amount, packageUnit: pack.unit } : {}),
  };
}

/** Prüfziffer von EAN-13/EAN-8 – so fällt ein falsch gelesener oder vertippter Code sofort auf. */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Antwort der Namenssuche → Treffer zum Auswählen. Treffer ohne die vier Hauptwerte fallen weg
 * (damit kann man nicht rechnen), doppelte Barcodes auch.
 */
export function fromOpenFoodFactsSearch(res: { products?: (OffProduct & { code?: string })[] }): ScannedProduct[] {
  const seen = new Set<string>();
  const out: ScannedProduct[] = [];
  for (const p of res.products ?? []) {
    if (!p.code || seen.has(p.code)) continue;
    seen.add(p.code);
    const hit = fromOpenFoodFacts(p.code, { status: 1, product: p });
    if (hit) out.push(hit);
  }
  return out;
}
