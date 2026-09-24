import { currentContent, totalMinutes } from './recipe';
import { isInCookbook } from './status';
import type { NutritionResult } from './nutrition/types';
import type { Recipe, RecipeStatus } from './types';

export interface RecipeFilter {
  query?: string;
  statuses?: RecipeStatus[];
  categories?: string[];
  devices?: string[];
  tags?: string[];
  maxMinutes?: number;
  maxKcal?: number;
  minProtein?: number;
  favoritesOnly?: boolean;
}

/** Ab so viel Protein pro Portion gilt ein Rezept als „proteinreich“ (Schnellfilter). */
export const HIGH_PROTEIN_G = 25;

const norm = (s: string) => s.toLocaleLowerCase('de-DE');

/**
 * Filtert die Bibliothek. Mehrere Werte innerhalb eines Filters = ODER
 * (Airfryer oder Backofen), verschiedene Filter = UND (Airfryer und < 30 Min.).
 * Nährwertfilter schließen Rezepte ohne verfügbare Nährwerte aus – wir raten nicht.
 */
export function filterRecipes(
  recipes: Recipe[],
  f: RecipeFilter,
  nutritionOf: (r: Recipe) => NutritionResult,
): Recipe[] {
  const q = f.query?.trim() ? norm(f.query.trim()) : '';

  return recipes.filter((r) => {
    if (r.archivedAt) return false;
    if (f.statuses?.length ? !f.statuses.includes(r.status) : !isInCookbook(r.status)) return false;
    if (f.favoritesOnly && !r.favorite) return false;

    const c = currentContent(r);
    if (f.categories?.length && !c.categories.some((x) => f.categories!.includes(x))) return false;
    if (f.devices?.length && !c.devices.some((x) => f.devices!.includes(x))) return false;
    if (f.tags?.length && !c.tags.some((x) => f.tags!.includes(x))) return false;
    if (f.maxMinutes !== undefined && totalMinutes(c) > f.maxMinutes) return false;

    if (f.maxKcal !== undefined || f.minProtein !== undefined) {
      const n = nutritionOf(r).perServing;
      if (!n) return false;
      if (f.maxKcal !== undefined && n.kcal > f.maxKcal) return false;
      if (f.minProtein !== undefined && n.protein < f.minProtein) return false;
    }

    if (q) {
      const haystack = [c.title, c.description, ...c.tags, ...c.ingredients.map((i) => i.name)].map(norm).join(' ');
      if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: RecipeFilter): number {
  return [
    f.categories?.length, f.devices?.length, f.tags?.length,
    f.maxMinutes !== undefined, f.maxKcal !== undefined, f.minProtein !== undefined, f.favoritesOnly,
  ].filter(Boolean).length;
}
