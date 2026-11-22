import { useState } from 'react';
import { createRecipes, useRecipes } from '../../data/store';
import { currentContent } from '../../domain/recipe';
import { duplicatesOf, parseRecipeFile, type FileRecipe, type RecipeFileImport as Parsed } from '../../domain/recipeFile';
import { navigate } from '../../router';
import { portionCount } from '../format';
import { toast } from '../toast';
import { FileButton } from './Controls';
import { Icon } from './Icon';
import { shrinkPhoto } from './ImageCropper';

/**
 * Rezept-Datei einspielen (Julia: „so wie beim Adventskalender, für normale Rezepte“) – unter Plus → Importieren.
 * Vorschau mit Häkchen je Rezept: Was es schon gibt (gleicher Titel), ist abgewählt, lässt sich aber anhaken; kaputte
 * Rezepte stehen mit Grund da und werden übersprungen. Eingespielt wird nach „Zum Testen“, mit einem Rückgängig.
 * Format: docs/REZEPT-DATEI.md.
 */
export function RecipeFileImport() {
  const recipes = useRecipes();
  const [result, setResult] = useState<(Parsed & { fileName: string; dups: Set<number> }) | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    const parsed = parseRecipeFile(await file.text());
    // Doppelte einmal beim Lesen bestimmen – nach dem Einspielen wären sonst alle „schon da“
    const titles = recipes.filter((r) => !r.trial).map((r) => currentContent(r).title);
    const dups = duplicatesOf(parsed.recipes, titles);
    setResult({ ...parsed, fileName: file.name, dups });
    setPicked(new Set(parsed.recipes.map((_, i) => i).filter((i) => !dups.has(i))));
  };

  const toggle = (i: number) => setPicked((p) => {
    const next = new Set(p);
    if (!next.delete(i)) next.add(i);
    return next;
  });

  const apply = async () => {
    if (!result) return;
    const chosen = result.recipes.filter((_, i) => picked.has(i));
    setBusy(true);
    try {
      // Fotos auf 800 px – wie eigene Fotos; eins, das sich nicht lesen lässt, fällt weg, das Rezept bleibt
      const ready: FileRecipe[] = [];
      for (const r of chosen) {
        const { image, ...rest } = r;
        const small = image ? await shrinkPhoto(image) : undefined;
        ready.push(small ? { ...rest, image: small } : rest);
      }
      const { undo } = createRecipes(ready);
      setResult(null);
      toast(ready.length === 1 ? `„${ready[0].content.title}“ steht unter „Zum Testen“` : `${ready.length} Rezepte stehen unter „Zum Testen“`,
        { label: 'Rückgängig', run: undo });
      navigate('/kochbuch?segment=testen');
    } finally {
      setBusy(false);
    }
  };

  const details = (r: FileRecipe, dup: boolean) => [
    portionCount(r.content.servings),
    `${r.content.ingredients.length} ${r.content.ingredients.length === 1 ? 'Zutat' : 'Zutaten'}`,
    r.keepsDays ? `hält ${r.keepsDays} ${r.keepsDays === 1 ? 'Tag' : 'Tage'}` : '',
    r.freezable ? 'einfrierbar' : '',
    r.image ? 'mit Foto' : '',
    dup ? 'gibt es schon' : '',
  ].filter(Boolean).join(' · ');

  return (
    <section className="panel recipe-file" aria-labelledby="recipe-file-title">
      <h2 className="recipe-file__title" id="recipe-file-title">Viele Rezepte auf einmal</h2>
      <p className="small muted">Eine Rezept-Datei (JSON), z. B. von einer KI erstellt. Du siehst erst eine Vorschau – die Rezepte kommen nach „Zum Testen“.</p>
      <FileButton className="btn btn--ghost btn--block import-file" accept="application/json,.json,text/plain,.txt" disabled={busy} onFile={(f) => void onFile(f)}>
        <Icon name="file" size={18} /> Rezept-Datei wählen
      </FileButton>

      {result && !result.recipes.length && (
        <div className="error" role="alert">
          <strong>{result.fileName}: so geht es noch nicht</strong>
          <ul className="advent-fill__list">
            {result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            {result.errors.length > 8 && <li>… und {result.errors.length - 8} weitere</li>}
          </ul>
        </div>
      )}

      {result && result.recipes.length > 0 && (
        <div className="offer-preview">
          <p>
            <strong>{result.fileName}</strong> · {result.recipes.length} {result.recipes.length === 1 ? 'Rezept' : 'Rezepte'} gefunden
            {result.dups.size > 0 && ` – ${result.dups.size} davon gibt es schon (abgewählt)`}
          </p>
          <ul className="shopping">
            {result.recipes.map((r, i) => (
              <li key={`${r.content.title}${i}`} className="shopping__item">
                <label>
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                  <span className="shopping__text">
                    <span className="shopping__name">{r.content.title}</span>
                    <span className="shopping__from">{details(r, result.dups.has(i))}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {result.errors.length > 0 && (
            <div className="error" role="alert">
              <strong>Wird übersprungen</strong>
              <ul className="advent-fill__list">
                {result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
                {result.errors.length > 8 && <li>… und {result.errors.length - 8} weitere</li>}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <ul className="advent-fill__list small muted">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" disabled={!picked.size || busy} onClick={() => void apply()}>
              {busy ? 'Einen Moment …' : picked.size === 1 ? '1 Rezept einspielen' : `${picked.size} Rezepte einspielen`}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setResult(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <details className="advent-fill__format small">
        <summary>Wie muss die Datei aussehen?</summary>
        <p>Ein Rezept oder eine Liste davon, je mit <code>titel</code>, <code>portionen</code>, <code>zutaten</code> (je <code>name</code>,
          <code> menge</code>, <code>einheit</code>, nach Wunsch <code>hinweis</code>, <code>teil</code>, <code>optional</code>) und <code>schritte</code> (Texte).</p>
        <p>Dazu nach Wunsch: <code>beschreibung</code>, <code>vorbereitung</code> und <code>kochzeit</code> (Minuten), <code>kategorie</code>,
          <code> geraete</code>, <code>schwierigkeit</code>, <code>schlagworte</code>, <code>tipp</code>, für Meal Prep <code>haltbar_tage</code>,
          <code> einfrierbar</code>, <code>aufbewahrung</code> – und <code>bild</code> (Foto als <code>data:image/jpeg;base64,…</code>, keine Links).</p>
        <p>Einheiten wie in Mashi: g, kg, ml, l, EL, TL, Prise, Stück, Zehe, Dose, Glas, Bund, Handvoll, cm, Portion.</p>
      </details>
    </section>
  );
}
