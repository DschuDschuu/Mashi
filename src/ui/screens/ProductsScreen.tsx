import { FoodList } from '../components/FoodList';
import { IngredientNames } from '../components/IngredientNames';
import { TopBar } from '../components/TopBar';

/**
 * „Meine Lebensmittel“: eigene Nährwerte und Produkte, Sorten mit Favorit, „Immer im Haus“ und
 * „Ohne Nährwerte“ – eine Liste, eine Zeile je Zutat. Erreichbar aus der Speisekammer (Verwalten).
 */
export function ProductsScreen() {
  return (
    <main className="screen">
      <TopBar title="Meine Lebensmittel" backTo="/speisekammer" />
      <FoodList />
      <IngredientNames />
    </main>
  );
}
