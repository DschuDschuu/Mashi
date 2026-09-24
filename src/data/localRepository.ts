import type { MyProduct } from '../domain/nutrition/myProducts';
import type { Recipe } from '../domain/types';
import { createMockRecipes } from './mockRecipes';
import type { RecipeRepository } from './repository';

/**
 * Eigenes Präfix, weil Mashi auf GitHub Pages den Origin mit anderen Apps
 * (my-little-joy, betriebskosten-abrechner) teilt.
 */
// v2: Platzhalterbilder haben 'motif' statt 'emoji' – alte v1-Daten werden nicht mehr gelesen.
const KEY = 'mashi-recipes-v2';
const PRODUCTS_KEY = 'mashi-products-v1';

export class LocalRecipeRepository implements RecipeRepository {
  private read(): Recipe[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Recipe[];
    } catch {
      /* kaputte oder gesperrte Daten → Beispieldaten */
    }
    const seed = createMockRecipes();
    this.write(seed);
    return seed;
  }

  private write(recipes: Recipe[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(recipes));
    } catch (e) {
      console.warn('Mashi: Speichern fehlgeschlagen', e);
    }
  }

  async list() {
    return this.read();
  }

  async save(recipe: Recipe) {
    const all = this.read();
    const i = all.findIndex((r) => r.id === recipe.id);
    if (i >= 0) all[i] = recipe;
    else all.unshift(recipe);
    this.write(all);
  }

  async remove(id: string) {
    this.write(this.read().filter((r) => r.id !== id));
  }

  async loadProducts(): Promise<MyProduct[]> {
    try {
      return JSON.parse(localStorage.getItem(PRODUCTS_KEY) ?? '[]') as MyProduct[];
    } catch {
      return [];
    }
  }

  async saveProducts(products: MyProduct[]) {
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    } catch (e) {
      console.warn('Mashi: Speichern fehlgeschlagen', e);
    }
  }

  /** Nur für den Prototyp: Beispieldaten wiederherstellen. */
  async reset() {
    localStorage.removeItem(KEY);
    return this.read();
  }
}
