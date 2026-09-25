import { normalizeName } from './localFoods';
import type { FoodEntry, FoodTable } from './types';

/**
 * „Ohne Nährwerte“: Gewürze & Co., die du nicht mitzählen willst – ein TL Paprikapulver ist
 * nicht der Rede wert. Einstellbar in der Speisekammer (Pantry.noNutrition); fehlt die Liste,
 * gilt diese Vorbelegung.
 */
export const DEFAULT_NO_NUTRITION = ['Paprikapulver', 'Currypulver', 'Kreuzkümmel', 'Zimt', 'Chiliflocken', 'Kurkuma', 'Oregano', 'Muskat'];

const PROVIDER = 'mashi-ohne-naehrwerte';

/**
 * Tabelle, in der diese Zutaten „nicht mitgerechnet“ werden (wie Salz). Kennt die Tabelle eine
 * Zutat gar nicht, gilt sie trotzdem als erledigt statt als „nicht gefunden“.
 */
export function withoutNutrition(base: FoodTable, names: string[]): FoodTable {
  if (!names.length) return base;
  const norm = new Set(names.map(normalizeName));
  const ids = new Set(names.map((n) => base.matchName(n)?.food.ref.foodId).filter((x): x is string => !!x));
  const zero = (food: FoodEntry): FoodEntry => ({ ...food, negligible: true, userZero: true });
  return {
    byRef(ref) {
      const f = base.byRef(ref);
      return f && ids.has(f.ref.foodId) ? zero(f) : f;
    },
    matchName(name) {
      const m = base.matchName(name);
      const listed = norm.has(normalizeName(name));
      if (m && (listed || ids.has(m.food.ref.foodId))) return { ...m, food: zero(m.food) };
      if (!m && listed) {
        return {
          food: { ref: { provider: PROVIDER, foodId: normalizeName(name) }, name, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, negligible: true, userZero: true },
          quality: 'exact',
        };
      }
      return m;
    },
  };
}
