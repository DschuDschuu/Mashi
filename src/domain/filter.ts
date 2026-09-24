import { categoryInfo, deviceInfo } from './catalog';
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

/** Zahl am Filter-Knopf – gleich der Anzahl Badges, damit beides zusammenpasst. */
export function activeFilterCount(f: RecipeFilter): number {
  return activeFilters(f).length;
}

/** Ein aktiver Filter als Badge: was draufsteht und was genau er bedeutet. */
export type ActiveFilter =
  | { kind: 'device' | 'category' | 'tag'; value: string; label: string }
  | { kind: 'maxMinutes' | 'maxKcal' | 'minProtein' | 'favorites'; label: string };

/**
 * Alle gesetzten Filter als Liste für die Badges – in der Reihenfolge des Filtermenüs.
 * Suche und Status-Reiter zählen nicht dazu: beides ist ohnehin sichtbar.
 */
export function activeFilters(f: RecipeFilter): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const d of f.devices ?? []) out.push({ kind: 'device', value: d, label: deviceInfo(d).label });
  for (const c of f.categories ?? []) out.push({ kind: 'category', value: c, label: categoryInfo(c).label });
  if (f.maxMinutes !== undefined) out.push({ kind: 'maxMinutes', label: `≤ ${f.maxMinutes} Min.` });
  if (f.maxKcal !== undefined) out.push({ kind: 'maxKcal', label: `≤ ${f.maxKcal} kcal` });
  if (f.minProtein !== undefined) out.push({ kind: 'minProtein', label: `≥ ${f.minProtein} g Protein` });
  for (const t of f.tags ?? []) out.push({ kind: 'tag', value: t, label: t });
  if (f.favoritesOnly) out.push({ kind: 'favorites', label: 'Favoriten' });
  return out;
}

/** Genau diesen einen Filter entfernen, alle anderen bleiben. */
export function removeFilter(f: RecipeFilter, a: ActiveFilter): RecipeFilter {
  switch (a.kind) {
    case 'device': return { ...f, devices: (f.devices ?? []).filter((x) => x !== a.value) };
    case 'category': return { ...f, categories: (f.categories ?? []).filter((x) => x !== a.value) };
    case 'tag': return { ...f, tags: (f.tags ?? []).filter((x) => x !== a.value) };
    case 'maxMinutes': return { ...f, maxMinutes: undefined };
    case 'maxKcal': return { ...f, maxKcal: undefined };
    case 'minProtein': return { ...f, minProtein: undefined };
    case 'favorites': return { ...f, favoritesOnly: false };
  }
}
