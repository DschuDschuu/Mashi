import { emptyPlan, type MealPlan } from '../domain/mealplan';
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
const PLAN_KEY = 'mashi-plan-v1';

export class LocalRecipeRepository implements RecipeRepository {
  private read(): Recipe[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Recipe[];
    } catch {
      /* kaputte oder gesperrte Daten → Beispieldaten */
    }
    const seed = createMockRecipes();
    try {
      this.write(seed);
    } catch (e) {
      console.warn('Mashi: Beispieldaten nicht gespeichert', e);
    }
    return seed;
  }

  /** Fehler (z. B. Speicher voll) gehen bewusst nach oben – der Store zeigt sie an. */
  private write(recipes: Recipe[]) {
    localStorage.setItem(KEY, JSON.stringify(recipes));
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
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  }

  async loadPlan(): Promise<MealPlan> {
    try {
      return { ...emptyPlan(), ...(JSON.parse(localStorage.getItem(PLAN_KEY) ?? '{}') as Partial<MealPlan>) };
    } catch {
      return emptyPlan();
    }
  }

  async savePlan(plan: MealPlan) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }

  /** Nur für den Prototyp: Beispieldaten wiederherstellen. */
  async reset() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PLAN_KEY);
    return this.read();
  }
}
