import { useMemo } from 'react';
import { withMyProducts } from '../domain/nutrition/myProducts';
import type { FoodTable } from '../domain/nutrition/types';
import { pantryAfterPlan, plannedByDish, plannedUse, recipesFromPantry, type DishReservation, type Pantry, type PlannedUse, type Stock } from '../domain/pantry';
import { expiringSoon, useUpKeys, type Expiring } from '../domain/shelfLife';
import { usePantry, usePlan, useProducts, useRecipes } from '../data/store';
import { navigate } from '../router';
import { foodTable } from '../services';

/**
 * Was bald weg sollte – einmal berechnet für Startseite, Speisekammer und Wochenplan.
 * - expiring: alle bald ablaufenden Vorräte (für die Erinnerung)
 * - keys: nur was NACH dem Wochenplan übrig bleibt (für Vorschläge – Verplantes muss niemand vorschlagen)
 * - idea: braucht kein Rezept alles davon auf → diese Zutaten für „Passendes Rezept generieren“
 * - plannedUseUp: geplante, noch nicht gekochte Gerichte, die bald Ablaufendes enthalten (für das Badge)
 * - planned: je Vorrat, wie viel davon schon verplant ist (oben steht nur der freie Rest)
 * - dishes: je geplantem Gericht, was es reserviert (Gruppe „Für den Wochenplan“)
 * - dishStock: je geplantem Gericht, ob alles da ist (leer, wenn die Speisekammer leer ist)
 */
export function useUseUp(): {
  expiring: Expiring[]; keys: Map<string, number>; rest: Pantry; table: FoodTable; usingUp: Map<string, string[]>; idea: string[];
  plannedUseUp: Map<string, string[]>;
  planned: PlannedUse;
  dishes: DishReservation[];
  dishStock: Map<string, Map<string, Stock>>;
} {
  const pantry = usePantry();
  const plan = usePlan();
  const recipes = useRecipes();
  const products = useProducts();
  return useMemo(() => {
    const table = withMyProducts(foodTable, products);
    const now = new Date();
    const rest = pantryAfterPlan(pantry, plan, recipes, table);
    const keys = useUpKeys(rest, table, now);
    // Welche Rezepte brauchen etwas davon auf? (für „Rezept des Tages“)
    const usingUp = new Map(
      keys.size ? recipesFromPantry(rest, recipes, table, recipes.length, keys).filter((m) => m.useUp.length).map((m) => [m.recipe.id, m.useUp]) : [],
    );
    const best = Math.max(0, ...[...usingUp.values()].map((u) => u.length));
    const idea = best < keys.size ? [...new Set(expiringSoon(rest, table, now).map((e) => e.item.name))].slice(0, 5) : [];
    // Für Geplantes zählt die ganze Speisekammer – genau diese Gerichte verbrauchen ja die Reste
    const open = new Set(plan.items.filter((i) => !plan.cooked.includes(i.recipeId)).map((i) => i.recipeId));
    const allKeys = open.size ? useUpKeys(pantry, table, now) : new Map<string, number>();
    const plannedUseUp = new Map(
      allKeys.size ? recipesFromPantry(pantry, recipes.filter((r) => open.has(r.id)), table, open.size, allKeys).filter((m) => m.useUp.length).map((m) => [m.recipe.id, m.useUp]) : [],
    );
    const dishes = plannedByDish(pantry, plan, recipes, table);
    const planned = plannedUse(pantry, plan, recipes, table, dishes);
    // Leere Speisekammer: Mashi weiß nichts – dann lieber gar kein „Fehlt: …“ anzeigen
    const dishStock = new Map(pantry.items.length ? dishes.map((d) => [d.recipeId, d.stock]) : []);
    return { expiring: expiringSoon(pantry, table, now), keys, rest, table, usingUp, idea, plannedUseUp, planned, dishes, dishStock };
  }, [pantry, plan, recipes, products]);
}

/** Zum KI-Formular – der Text ist vorausgefüllt, erzeugt wird erst auf Tipp. */
export function openRecipeIdea(names: string[]) {
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0];
  const text = `Ich habe noch ${list}, die bald weg müssen. Bitte ein Rezept, das möglichst alles davon verwendet.`;
  navigate(`/neu/ki?text=${encodeURIComponent(text)}`);
}
