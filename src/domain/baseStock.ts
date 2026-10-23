import { chosenContent } from './choices';
import { isBaseLink } from './homemade';
import type { MealPlan } from './mealplan';
import type { PantryItem } from './pantry';
import type { Recipe } from './types';

/**
 * Vorgekochtes im normalen Wochenplan (Julia: „die Bolognese steht schon im Kühlschrank“): Eine Grundlage, die als
 * Vorgekocht in der Speisekammer steht oder selbst eingeplant ist, deckt die Zutat „Portion Bolognese“ eines Gerichts –
 * ihre Zutaten kommen dann nicht noch einmal auf die Einkaufsliste. Reicht es nicht, sagt Mashi Bescheid
 * („nur 2 von 4 Portionen“, Julia), der Rest wird frisch gemacht. Die Vorkoch-Woche regelt ihre Grundlagen selbst.
 */
export interface BaseSupply {
  baseId: string;
  /** Name der Zutat im Gericht („Bolognese“) */
  name: string;
  /** Portionen der Grundlage, die das Gericht mit seinen geplanten Portionen braucht */
  need: number;
  /** davon gedeckt */
  have: number;
  /** woher: Vorgekochtes aus der Speisekammer oder die Grundlage steht selbst im Plan */
  source: 'vorrat' | 'plan';
}

/** Portionen Vorgekochtes je Grundlage – ganze Gerichte, keine Teile; Gefrorenes zählt mit (lässt sich auftauen) */
export function preparedPortions(items: readonly Pick<PantryItem, 'recipeId' | 'part' | 'amount'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) if (it.recipeId && !it.part && (it.amount ?? 0) > 0) out.set(it.recipeId, (out.get(it.recipeId) ?? 0) + it.amount!);
  return out;
}

/**
 * Je ungekochtem Gericht im Plan: welche seiner Grundlagen schon da sind. Das Vorgekochte wird in Plan-Reihenfolge
 * verteilt – zwei Gerichte teilen sich die 4 Portionen Bolognese, statt beide damit zu rechnen.
 * @param skip Grundlagen der Vorkoch-Woche (weekBaseIds) – die kommen dort ohnehin aus dem Vorgekochten
 */
export function baseSupply(
  plan: Pick<MealPlan, 'items' | 'cooked'>, recipes: readonly Recipe[], items: readonly Pick<PantryItem, 'recipeId' | 'part' | 'amount'>[], skip: readonly string[] = [],
): Map<string, BaseSupply[]> {
  const open = plan.items.filter((i) => !plan.cooked.includes(i.recipeId));
  const planned = new Set(open.map((i) => i.recipeId));
  const stock = preparedPortions(items);
  const out = new Map<string, BaseSupply[]>();
  for (const item of open) {
    const r = recipes.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const c = chosenContent(r);
    const list: BaseSupply[] = [];
    for (const link of c.ingredients) {
      if (!isBaseLink(link) || link.recipeId === r.id || skip.includes(link.recipeId!)) continue;
      const baseId = link.recipeId!;
      const need = ((link.amount ?? c.servings) * item.servings) / c.servings;
      if (planned.has(baseId)) {
        list.push({ baseId, name: link.name, need, have: need, source: 'plan' });
        continue;
      }
      const left = stock.get(baseId) ?? 0;
      const have = Math.min(need, left);
      if (have <= 0) continue; // nichts da – ganz normal frisch machen, ohne Meldung
      stock.set(baseId, left - have);
      list.push({ baseId, name: link.name, need, have, source: 'vorrat' });
    }
    if (list.length) out.set(r.id, list);
  }
  return out;
}

/** Anteil je Grundlage, der schon da ist (1 = ganz) – für cookingContent */
export function coveredShare(supply: readonly BaseSupply[] | undefined): Map<string, number> {
  return new Map((supply ?? []).map((s) => [s.baseId, s.need > 0 ? s.have / s.need : 1]));
}
