import { fromOpenFoodFacts, type ScannedProduct } from '../../domain/nutrition/openFoodFacts';

/** Produkt zu einem Barcode nachschlagen. */
export interface BarcodeLookup {
  /** null = unbekannt oder ohne Nährwerte; wirft bei Netzproblemen */
  find(ean: string): Promise<ScannedProduct | null>;
}

/**
 * Open Food Facts – frei, ohne Anmeldung. Gesendet wird nur die Barcode-Nummer.
 * Nur die Felder, die Mashi braucht (spart Datenvolumen unterwegs).
 */
const FIELDS = 'product_name,product_name_de,brands,quantity,product_quantity,product_quantity_unit,nutriments';

export const openFoodFacts: BarcodeLookup = {
  async find(ean) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${FIELDS}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts antwortet nicht (${res.status})`);
    return fromOpenFoodFacts(ean, await res.json());
  },
};
