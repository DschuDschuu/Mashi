import { useMemo, useState } from 'react';
import { blockHints } from '../../domain/blockHints';
import { applyRenames, renameKey, renameSuggestions, type Rename } from '../../domain/renames';
import type { Recipe } from '../../domain/types';
import { currentContent } from '../../domain/recipe';
import { dismissRename, saveContent, usePantry } from '../../data/store';
import { useRenameOptions } from '../useRenames';
import { useSheet } from '../useSheet';
import { toast } from '../toast';
import { BlockHints } from './BlockHints';
import { Icon } from './Icon';

const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('de-DE'));

type Group = { recipe: Recipe; list: Rename[] };

/** Namensvorschläge je Rezept – archivierte nicht */
function useRenameGroups(recipes: readonly Recipe[]): Group[] {
  const options = useRenameOptions();
  return useMemo(() => recipes.filter((r) => !r.archivedAt)
    .map((recipe) => ({ recipe, list: renameSuggestions(currentContent(recipe), options) }))
    .filter((g) => g.list.length > 0), [recipes, options]);
}

/**
 * „Rezepte aufräumen“ in den Einstellungen (Julia: nicht mehr als Knopf in jedem Rezept und im Kochbuch): Zutaten
 * vereinheitlichen über alle Rezepte, gefundene Bausteine (mit „Drin“ und „Ähnlich“) und die ausgeblendeten Namensvorschläge.
 */
export function RecipeTidy({ recipes }: { recipes: readonly Recipe[] }) {
  const groups = useRenameGroups(recipes);
  const hints = useMemo(() => blockHints(recipes), [recipes]);
  const dismissed = usePantry().renameDismissed ?? [];
  if (!groups.length && !hints.length && !dismissed.length) return <p className="small muted">Nichts aufzuräumen.</p>;
  return (
    <div className="stack">
      <RenameAll groups={groups} />
      <BlockHints recipes={recipes} all />
      <DismissedRenames keys={dismissed} />
    </div>
  );
}

/** Alle Namensvorschläge auf einen Blick – abhaken, übernehmen; je Rezept eine neue Version */
function RenameAll({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  const n = groups.reduce((t, g) => t + g.list.length, 0);
  return (
    <>
      <button type="button" className="rename-cta" onClick={() => setOpen(true)}>
        <Icon name="sparkles" size={16} /> {n === 1 ? '1 Zutat' : `${n} Zutaten`} vereinheitlichen{groups.length > 1 ? ` – in ${groups.length} Rezepten` : ''}
      </button>
      {open && <RenameSheet groups={groups} onClose={() => setOpen(false)} />}
    </>
  );
}

const keyOf = (g: Group, r: Rename) => `${g.recipe.id}|${r.ingredientId}`;

function RenameSheet({ groups, onClose }: { groups: Group[]; onClose: () => void }) {
  const ref = useSheet(onClose);
  const [picked, setPicked] = useState(() => new Set(groups.flatMap((g) => g.list.map((r) => keyOf(g, r)))));
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const apply = () => {
    let count = 0;
    for (const g of groups) {
      const chosen = g.list.filter((r) => picked.has(keyOf(g, r)));
      if (!chosen.length) continue;
      saveContent(g.recipe.id, applyRenames(currentContent(g.recipe), chosen), 'Zutaten vereinheitlicht');
      count += chosen.length;
    }
    // hier sieht man die Rezepte nicht – darum sagen, was passiert ist
    if (count) toast(`${count === 1 ? '1 Zutat' : `${count} Zutaten`} vereinheitlicht`);
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet renames" role="dialog" aria-modal="true" aria-label="Zutaten vereinheitlichen" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Zutaten vereinheitlichen</h2>
        {groups.map((g) => (
          <section key={g.recipe.id} className="renames__group">
            {groups.length > 1 && <h3 className="h3">{currentContent(g.recipe).title}</h3>}
            <ul className="renames__list">
              {g.list.map((r) => (
                <li key={r.ingredientId}>
                  <label>
                    <input type="checkbox" checked={picked.has(keyOf(g, r))} onChange={() => toggle(keyOf(g, r))} />
                    <span><s>{r.from}</s> → <strong>{r.to}</strong></span>
                  </label>
                  <button type="button" className="link link--muted" onClick={() => { dismissRename(renameKey(r.from)); toggle(keyOf(g, r)); }}>Nicht mehr vorschlagen</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="variants__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={!picked.size}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}

/** Ausgeblendete Namensvorschläge – antippen, um sie wieder vorzuschlagen (früher unten in „Meine Lebensmittel“) */
function DismissedRenames({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <details className="panel fold">
      <summary className="small"><strong>Ausgeblendete Namensvorschläge ({keys.length})</strong></summary>
      <div className="chips">
        {keys.map((k) => (
          <button key={k} type="button" className="afilter" onClick={() => dismissRename(k, true)} aria-label={`${cap(k)} wieder vorschlagen`}>
            {cap(k)} <Icon name="refresh" size={14} />
          </button>
        ))}
      </div>
    </details>
  );
}
