import { FOOD_CHOICES } from '../../domain/nutrition/localFoods';
import { currentContent } from '../../domain/recipe';
import { useRecipes } from '../../data/store';

/**
 * Vorschlagsliste (Autocomplete) für Zutatennamen: alle Lebensmittel der Tabelle plus
 * alle Zutaten aus deinen Rezepten. Wer „Hähnchenbrust“ wählt statt „Hähnchen-Mini-Steaks“,
 * dessen Vorrat findet Mashi in den Rezepten wieder.
 */
export function IngredientNames() {
  const recipes = useRecipes();
  const names = new Set(FOOD_CHOICES.map((f) => f.name));
  for (const r of recipes) for (const i of currentContent(r).ingredients) names.add(i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  return (
    <datalist id="ingredient-names">
      {[...names].sort((a, b) => a.localeCompare(b, 'de')).map((n) => <option key={n} value={n} />)}
    </datalist>
  );
}
