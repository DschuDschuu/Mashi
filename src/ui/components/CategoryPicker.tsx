import { useState } from 'react';
import { CATEGORIES, categoryTitle } from '../../domain/categories';
import { setCategory } from '../../data/store';
import { toast } from '../toast';
import { useCategoryOf } from '../useCategory';
import { Icon } from './Icon';

/**
 * Kategorie in der Kachel (Julia): Mashi ordnet selbst zu – ändern ist die Ausnahme, darum nur ein Chip;
 * antippen zeigt die Auswahl. Gilt überall (Meine Lebensmittel, Speisekammer, Einkaufsliste).
 * @param name Schlüssel (Zutat), label so heißt es in der Kachel
 */
export function CategoryPicker({ name, label = name }: { name: string; label?: string }) {
  const categoryOf = useCategoryOf();
  const current = categoryOf(name);
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="category">
      <button type="button" className="chip chip--sm category__now" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}
        aria-label={`Kategorie: ${categoryTitle(current)} – ändern`}>
        <Icon name="grid" size={14} /> {categoryTitle(current)}
      </button>
      {choosing && (
        <div className="chips category__all" role="group" aria-label={`${label}: Kategorie wählen`}>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip chip--sm${c.id === current ? ' is-on' : ''}`} aria-pressed={c.id === current}
              onClick={() => {
                setChoosing(false);
                if (c.id === current) return;
                const undo = setCategory(name, c.id);
                toast(`„${label}“ steht jetzt unter „${c.title}“`, { label: 'Rückgängig', run: undo });
              }}>
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
