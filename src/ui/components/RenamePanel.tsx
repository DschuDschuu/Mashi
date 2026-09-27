import { useState } from 'react';
import { applyRenames, renameKey, renameSuggestions, type Rename } from '../../domain/renames';
import type { Recipe } from '../../domain/types';
import { currentContent } from '../../domain/recipe';
import { dismissRename, saveContent } from '../../data/store';
import { toast } from '../toast';
import { useRenameOptions } from '../useRenames';
import { useSheet } from '../useSheet';
import { Icon } from './Icon';

/**
 * „Zutaten vereinheitlichen“: alle Namensvorschläge eines Rezepts auf einen Blick – abhaken,
 * übernehmen, eine neue Version. Nur sichtbar, wenn es etwas vorzuschlagen gibt.
 */
export function RenamePanel({ recipe }: { recipe: Recipe }) {
  const options = useRenameOptions();
  const list = renameSuggestions(currentContent(recipe), options);
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <>
      <button type="button" className="rename-cta" onClick={() => setOpen(true)}>
        <Icon name="sparkles" size={16} /> {list.length === 1 ? '1 Zutat vereinheitlichen' : `${list.length} Zutaten vereinheitlichen`}
      </button>
      {open && <RenameSheet recipe={recipe} list={list} onClose={() => setOpen(false)} />}
    </>
  );
}

function RenameSheet({ recipe, list, onClose }: { recipe: Recipe; list: Rename[]; onClose: () => void }) {
  const ref = useSheet(onClose);
  const [picked, setPicked] = useState(() => new Set(list.map((r) => r.ingredientId)));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = () => {
    const chosen = list.filter((r) => picked.has(r.ingredientId));
    if (chosen.length) {
      saveContent(recipe.id, applyRenames(currentContent(recipe), chosen), 'Zutaten vereinheitlicht');
      toast(`${chosen.length === 1 ? '1 Zutat' : `${chosen.length} Zutaten`} vereinheitlicht – neue Version`);
    }
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet renames" role="dialog" aria-modal="true" aria-label="Zutaten vereinheitlichen" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Zutaten vereinheitlichen</h2>
        <p className="small muted">Einheitliche Namen helfen Einkaufsliste, Vorrat und deinen Produkten. Die bisherige Fassung bleibt als Version erhalten.</p>
        <ul className="renames__list">
          {list.map((r) => (
            <li key={r.ingredientId}>
              <label>
                <input type="checkbox" checked={picked.has(r.ingredientId)} onChange={() => toggle(r.ingredientId)} />
                <span><s>{r.from}</s> → <strong>{r.to}</strong></span>
              </label>
              <button type="button" className="link link--muted" onClick={() => { dismissRename(renameKey(r.from)); toggle(r.ingredientId); }}>Nicht mehr vorschlagen</button>
            </li>
          ))}
        </ul>
        <div className="variants__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={!picked.size}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}
