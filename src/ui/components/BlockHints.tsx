import { useMemo, useState } from 'react';
import { blockHints, hintBlock, type BlockHint } from '../../domain/blockHints';
import { currentContent } from '../../domain/recipe';
import { SIDE_KINDS, type SideKind } from '../../domain/sides';
import type { Recipe } from '../../domain/types';
import { setBlocks, skipBlockHint } from '../../data/store';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Icon } from './Icon';

const labelOf = (k: SideKind) => SIDE_KINDS.find((x) => x.kind === k)?.label ?? k;
const stagesOf = (h: BlockHint) => [h.kind, ...(h.also ?? [])].map(labelOf).join(' und ');

/**
 * Bausteine vorschlagen (Julia: Weg B, „Beides“): im Kochbuch für alle Rezepte, auf der Rezeptseite für dieses – je
 * ein Knopf wie „Zutaten vereinheitlichen“, der die Liste öffnet. Übernehmen oder „Nein“ (fragt dann nicht mehr), beides
 * mit Rückgängig; „Alle übernehmen“ für den ersten Durchgang. Nichts mehr offen: der Knopf verschwindet.
 */
export function BlockHints({ recipes, all = false }: { recipes: readonly Recipe[]; /** im Kochbuch: aus welchem Rezept */ all?: boolean }) {
  // im Kochbuch für alle Rezepte – nicht bei jedem Tastendruck in der Suche neu
  const hints = useMemo(() => blockHints(recipes), [recipes]);
  const [open, setOpen] = useState(false);
  if (!hints.length) {
    // alles erledigt: auch das Fenster vergessen – sonst ginge es nach „Rückgängig“ von allein wieder auf
    if (open) setOpen(false);
    return null;
  }
  const n = hints.length;
  return (
    <>
      <button type="button" className="rename-cta block-hints__cta" onClick={() => setOpen(true)}>
        <Icon name="grid" size={16} /> {n === 1 ? '1 Baustein' : `${n} Bausteine`} {all ? 'in deinen Rezepten ' : ''}gefunden
      </button>
      {open && <HintSheet hints={hints} recipes={recipes} all={all} onClose={() => setOpen(false)} />}
    </>
  );
}

function HintSheet({ hints, recipes, all, onClose }: { hints: BlockHint[]; recipes: readonly Recipe[]; all: boolean; onClose: () => void }) {
  const ref = useSheet(onClose);
  const blocksOf = (id: string) => recipes.find((r) => r.id === id)?.blocks ?? [];
  const titleOf = (id: string) => { const r = recipes.find((x) => x.id === id); return r ? currentContent(r).title : ''; };

  const take = (h: BlockHint) =>
    toast(`${h.name}: Baustein als ${stagesOf(h)}`, { label: 'Rückgängig', run: setBlocks(h.recipeId, [...blocksOf(h.recipeId), hintBlock(h)]) });
  const skip = (h: BlockHint) =>
    toast(`${h.name}: Mashi fragt nicht mehr`, { label: 'Rückgängig', run: skipBlockHint(h.recipeId, h.part) });
  // je Rezept einmal speichern – ein Rückgängig für alles
  const takeAll = () => {
    const ids = [...new Set(hints.map((h) => h.recipeId))];
    const undos = ids.map((id) => setBlocks(id, [...blocksOf(id), ...hints.filter((h) => h.recipeId === id).map(hintBlock)]));
    toast(`${hints.length} Bausteine übernommen`, { label: 'Rückgängig', run: () => undos.reverse().forEach((u) => u()) });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet renames" role="dialog" aria-modal="true" aria-label="Bausteine gefunden" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Bausteine gefunden</h2>
        <p className="small muted">Übernommen tauchen sie bei „Worauf hast du Lust?“ und im Wochenplan auf – mit deinen Schritten. Stufe und Richtung kannst du später am Rezept ändern.</p>
        <ul className="renames__list">
          {hints.map((h) => (
            <li key={`${h.recipeId}|${h.part ?? ''}`}>
              <span className="block-hints__what">
                <strong>{h.name}</strong> als {stagesOf(h)}
                {all && h.part && <span className="small muted"> · aus „{titleOf(h.recipeId)}“</span>}
              </span>
              <span className="block-hints__actions">
                <button type="button" className="link link--muted" onClick={() => skip(h)}>Nein</button>
                <button type="button" className="btn btn--soft btn--sm" onClick={() => take(h)}><Icon name="check" size={14} /> Übernehmen</button>
              </span>
            </li>
          ))}
        </ul>
        <div className="variants__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Später</button>
          {hints.length > 1 && <button type="button" className="btn btn--primary" onClick={takeAll}>Alle übernehmen</button>}
        </div>
      </div>
    </div>
  );
}
