import { fromOpenFoodFacts, fromOpenFoodFactsSearch, type ScannedProduct } from '../../domain/nutrition/openFoodFacts';

/** Produkt zu einem Barcode nachschlagen. */
export interface BarcodeLookup {
  /** null = unbekannt oder ohne Nährwerte; wirft bei Netzproblemen */
  find(ean: string): Promise<ScannedProduct | null>;
  /** nach Namen suchen (z. B. „Kimchi“) – Treffer mit allen vier Werten; wirft bei Netzproblemen */
  search(query: string): Promise<ScannedProduct[]>;
}

/**
 * Open Food Facts – frei, ohne Anmeldung. Gesendet wird nur die Barcode-Nummer bzw. das Suchwort.
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
  async search(query) {
    // deutsche Seite: bevorzugt Produkte, die es hier zu kaufen gibt. Die Suche ist gedrosselt
    // (etwa 10 Anfragen pro Minute) – deshalb nur auf Knopfdruck, nicht bei jedem Tastendruck.
    const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: `code,${FIELDS}` });
    const res = await fetch(`https://de.openfoodfacts.org/cgi/search.pl?${params}`);
    if (!res.ok) throw new Error(`Open Food Facts antwortet nicht (${res.status})`);
    return fromOpenFoodFactsSearch(await res.json()).slice(0, 10);
  },
};
