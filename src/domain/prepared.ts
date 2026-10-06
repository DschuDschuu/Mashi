/** Vorgekocht: übrige Portionen eines Gerichts im Vorrat – essen, einfrieren, zählen. */
import { defaultId, type Pantry, type PantryItem } from './pantry';

/** Übrige Portionen nach dem Kochen als Vorgekochtes eintragen (hält im Kühlschrank kurz, einfrierbar). */
export function addPrepared(
  items: PantryItem[], recipe: { id: string; title: string }, portions: number, now: string, newId = defaultId,
  /** wie gekocht (Mengen, Sorten) – nur, wenn es vom Rezept abweicht */
  cooked?: PantryItem['cooked'],
  /** nur ein Teil des Rezepts („Sauce“) – dann ist title schon „Sauce für …“ */
  part?: string,
): { items: PantryItem[]; item?: PantryItem } {
  if (!(portions > 0)) return { items };
  const differs = !!cooked && (Object.keys(cooked.amounts ?? {}).length > 0 || Object.keys(cooked.variants ?? {}).length > 0);
  const item: PantryItem = {
    id: newId(), name: recipe.title, amount: portions, unit: 'Stück', addedAt: now, boughtAt: now, recipeId: recipe.id, ...(part ? { part } : {}),
    ...(differs ? { cooked: {
      servings: cooked!.servings,
      ...(Object.keys(cooked!.amounts ?? {}).length ? { amounts: cooked!.amounts } : {}),
      ...(Object.keys(cooked!.variants ?? {}).length ? { variants: cooked!.variants } : {}),
    } } : {}),
  };
  return { items: [...items, item], item };
}

/** Portionen gegessen – bei 0 ist das Vorgekochte weg. */
export function eatPrepared(items: PantryItem[], id: string, portions = 1): PantryItem[] {
  return items.flatMap((x) => {
    if (x.id !== id) return [x];
    const left = Math.round(((x.amount ?? 0) - portions) * 10) / 10;
    return left > 0 ? [{ ...x, amount: left }] : [];
  });
}

/** Wie viel ist von einem Rezept vorgekocht? (frisch und gefroren getrennt) – fertige Teile („Sauce für …“) zählen nicht als Portionen */
export function preparedOf(pantry: Pantry, recipeId: string): { fresh: number; frozen: number; items: PantryItem[] } {
  const items = pantry.items.filter((it) => it.recipeId === recipeId && !it.part && (it.amount ?? 0) > 0);
  const sum = (xs: PantryItem[]) => xs.reduce((n, x) => n + (x.amount ?? 0), 0);
  return { fresh: sum(items.filter((x) => !x.frozenAt)), frozen: sum(items.filter((x) => x.frozenAt)), items };
}
