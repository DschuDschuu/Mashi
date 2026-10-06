import { fatLevel } from '../../domain/nutrition/fatLevels';
import { FOOD_CHOICES } from '../../domain/nutrition/localFoods';
import { currentContent } from '../../domain/recipe';
import { useProducts, useRecipes } from '../../data/store';
import { nameOf } from '../../domain/nutrition/myProducts';

/**
 * Vorschlagsliste (Autocomplete) für Zutatennamen: alle Lebensmittel der Tabelle, deine eigenen Lebensmittel
 * („Meine Lebensmittel“, Julia: auch beim Eintragen in die Speisekammer) plus alle Zutaten aus deinen Rezepten.
 * Wer „Hähnchenbrust“ wählt statt „Hähnchen-Mini-Steaks“, dessen Vorrat findet Mashi in den Rezepten wieder.
 * Milch, Joghurt, Quark nur in der einheitlichen Schreibweise („Milch“, „Milch 3,5 %“ – nicht „Vollmilch“).
 */
export function IngredientNames() {
  const recipes = useRecipes();
  const products = useProducts();
  const names = new Set(FOOD_CHOICES.map((f) => f.name));
  // ohne Marke („Skyr“, nicht „Skyr · Milbona“) – die Marke wählst du danach am Chip
  for (const p of products) names.add(nameOf(p));
  for (const r of recipes) for (const i of currentContent(r).ingredients) names.add(i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  const unified = [...names].map((n) => fatLevel(n)?.label ?? n);
  unified.push('Milch', 'Joghurt', 'Quark');
  return (
    <datalist id="ingredient-names">
      {[...new Set(unified)].sort((a, b) => a.localeCompare(b, 'de')).map((n) => <option key={n} value={n} />)}
    </datalist>
  );
}
