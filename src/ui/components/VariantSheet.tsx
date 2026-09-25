import { useState } from 'react';
import { macroShares, needsAsking, pickFor, type VariantChoice } from '../../domain/nutrition/variants';
import type { RecipeContent } from '../../domain/types';
import { setFavoriteVariant, useMacroGoal } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';
import { choicesFor } from '../useNutrition';
import { useSheet } from '../useSheet';

const pct = (n: number) => Math.round(n);

/**
 * „Welches Pesto nimmst du?“ – nur für Zutaten, von denen mehrere Sorten im Vorrat liegen.
 * Vorausgewählt: die Sorte, die am nächsten an deinem Makro-Ziel liegt (oder deine letzte Wahl).
 */
export function VariantSheet({ choices, pick, title = 'Welche Sorte nimmst du?', onDone, onClose }: {
  choices: VariantChoice[];
  pick: Record<string, string>;
  title?: string;
  onDone: (pick: Record<string, string>) => void;
  onClose: () => void;
}) {
  const ref = useSheet(onClose);
  const goal = useMacroGoal();
  const [value, setValue] = useState(pick);
  /** Favoriten im Blatt sofort sichtbar – gespeichert wird direkt (gilt für alle Rezepte) */
  const [favs, setFavs] = useState<Record<string, string | null>>(() => Object.fromEntries(choices.map((c) => [c.ingredientId, c.all.find((v) => v.favorite)?.id ?? null])));
  const asking = choices.filter((c) => c.options.length > 1);
  const toggleFavorite = (c: VariantChoice, id: string, name: string) => {
    const next = favs[c.ingredientId] === id ? null : id;
    setFavoriteVariant(c.all, next);
    setFavs({ ...favs, [c.ingredientId]: next });
    if (next) setValue({ ...value, [c.ingredientId]: id });
    toast(next ? `★ „${name}“ ist dein Favorit – gilt für alle Rezepte mit ${c.name}` : `Favorit zurückgenommen – Rezepte rechnen wieder mit dem Durchschnitt`);
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet variants" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{title}</h2>
        <p className="small muted">Beide liegen im Vorrat. Vorgeschlagen ist die Sorte, die näher an deinem Ziel liegt ({goal.carbs} / {goal.protein} / {goal.fat} – Kohlenhydrate / Eiweiß / Fett). Mit ★ machst du eine Sorte zum Favoriten: Dann rechnen alle Rezepte damit und Mashi fragt nicht mehr.</p>
        {asking.map((c) => (
          <fieldset key={c.ingredientId} className="variants__group">
            <legend>{c.name}</legend>
            {c.options.map((o) => {
              const s = macroShares(o.per100g);
              return (
                <label key={o.id} className={`variants__opt${value[c.ingredientId] === o.id ? ' is-on' : ''}`}>
                  <input type="radio" name={c.ingredientId} checked={value[c.ingredientId] === o.id}
                    onChange={() => setValue({ ...value, [c.ingredientId]: o.id })} />
                  <span className="variants__text">
                    <span>{o.name}{o.id === c.suggested && !favs[c.ingredientId] && <span className="variants__best">passt besser</span>}</span>
                    <span className="small muted">{Math.round(o.per100g.kcal)} kcal · KH {pct(s.carbs)} % · Eiweiß {pct(s.protein)} % · Fett {pct(s.fat)} %</span>
                  </span>
                  <button type="button" className={`variants__star${favs[c.ingredientId] === o.id ? ' is-on' : ''}`}
                    aria-pressed={favs[c.ingredientId] === o.id} aria-label={favs[c.ingredientId] === o.id ? `${o.name}: Favorit zurücknehmen` : `${o.name} als Favorit`}
                    onClick={(e) => { e.preventDefault(); toggleFavorite(c, o.id, o.name); }}>
                    <Icon name="star" size={20} filled={favs[c.ingredientId] === o.id} />
                  </button>
                </label>
              );
            })}
          </fieldset>
        ))}
        <div className="variants__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn--primary" onClick={() => onDone(value)}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vor „Zum Wochenplan“ / „Kochmodus starten“: liegen mehrere Sorten im Vorrat, erst fragen –
 * sonst direkt weiter (eine Sorte da = diese, keine = Durchschnitt).
 */
export function useVariantPrompt() {
  const [open, setOpen] = useState<{ choices: VariantChoice[]; pick: Record<string, string>; then: (p: Record<string, string>) => void } | null>(null);
  const ask = (content: RecipeContent, own: Record<string, string> | undefined, then: (pick: Record<string, string>) => void) => {
    const choices = choicesFor(content);
    const pick = pickFor(choices, own);
    if (needsAsking(choices)) setOpen({ choices, pick, then });
    else then(pick);
  };
  const sheet = open && (
    <VariantSheet choices={open.choices} pick={open.pick} onClose={() => setOpen(null)}
      onDone={(p) => { setOpen(null); open.then(p); }} />
  );
  return { ask, sheet };
}
