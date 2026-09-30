import { useState } from 'react';
import { FoodList } from '../components/FoodList';
import { Icon } from '../components/Icon';
import { IngredientNames } from '../components/IngredientNames';
import { TopBar } from '../components/TopBar';

/**
 * „Meine Lebensmittel“: eigene Nährwerte und Produkte, Sorten mit Favorit, „Immer im Haus“ und
 * „Ohne Nährwerte“ – eine Liste, eine Zeile je Zutat. Erreichbar aus der Speisekammer (Verwalten).
 * Das ＋ sitzt in der Kopfleiste: die klebt oben, so ist „hinzufügen“ immer da – auch in langen Listen.
 */
export function ProductsScreen() {
  const [adding, setAdding] = useState(false);
  const toggle = () => {
    // das Formular öffnet sich oben unter den Tabs – dorthin, falls du weit unten warst
    if (!adding) window.scrollTo({ top: 0, behavior: 'smooth' });
    setAdding(!adding);
  };
  return (
    <main className="screen">
      <TopBar title="Meine Lebensmittel" backTo="/speisekammer"
        right={
          <button type="button" className={`iconbtn${adding ? ' is-on' : ''}`} onClick={toggle} aria-expanded={adding}
            aria-label={adding ? 'Hinzufügen schließen' : 'Lebensmittel hinzufügen'}>
            <Icon name={adding ? 'close' : 'plus'} />
          </button>
        } />
      <FoodList adding={adding} onAdding={setAdding} />
      <IngredientNames />
    </main>
  );
}
