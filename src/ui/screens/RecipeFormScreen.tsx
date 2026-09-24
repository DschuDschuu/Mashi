import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../../domain/catalog';
import { cloneContent, currentContent, newId } from '../../domain/recipe';
import type { Difficulty, RecipeContent, RecipeImage } from '../../domain/types';
import type { TextImport } from '../../domain/importText';
import { createRecipe, regenerateImage, saveContent, setImage as storeImage, useRecipe } from '../../data/store';
import { goBack, navigate } from '../../router';
import { ChipSelect, DevicePicker, Stepper } from '../components/Controls';
import { IngredientEditor, StepEditor } from '../components/ContentEditors';
import { RecipeImage as RecipeImageView } from '../components/RecipeImage';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { downscale } from '../photo';
import { toast } from '../toast';

const EMPTY: RecipeContent = {
  title: '', description: '', servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
  ingredients: [{ id: newId('i'), name: '' }], steps: [{ id: newId('s'), text: '' }],
  categories: [], tags: [], devices: [],
};

/**
 * Formular für „Eigenes Rezept“, „Bearbeiten“ (dann entsteht eine neue Version)
 * und zum Prüfen eines Text-Imports (draft: vorausgefüllt, mit Hinweisen).
 */
export function RecipeFormScreen({ editId, draft }: { editId?: string; draft?: TextImport }) {
  const existing = useRecipe(editId);
  const [c, setC] = useState<RecipeContent>(() =>
    existing ? cloneContent(currentContent(existing)) : cloneContent(draft?.content ?? EMPTY));
  const [tagText, setTagText] = useState(c.tags.join(', '));
  const [notes, setNotes] = useState(draft?.notes ?? '');
  // Importiertes ist fremd – erst testen. Eigenes, das man kennt, darf direkt ins Kochbuch.
  const [tested, setTested] = useState<'ja' | 'nein'>(draft ? 'nein' : 'ja');
  const [image, setImage] = useState<RecipeImage | undefined>(existing?.image);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<RecipeContent>) => setC((prev) => ({ ...prev, ...patch }));

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setImage({ kind: 'url', url: await downscale(file) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const content: RecipeContent = {
      ...c,
      title: c.title.trim(),
      tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
      ingredients: c.ingredients.filter((i) => i.name.trim()),
      steps: c.steps.filter((s) => s.text.trim()),
    };
    if (!content.title) return setError('Bitte gib dem Rezept einen Titel.');
    if (!content.ingredients.length) return setError('Mindestens eine Zutat, bitte.');

    if (existing) {
      // Das Foto gehört zum Rezept, nicht zur Version – ein neues Foto erzeugt keine neue Version.
      const photoChanged = image !== existing.image;
      if (photoChanged) {
        if (image) storeImage(existing.id, image);
        else void regenerateImage(existing.id);
      }
      const changed = saveContent(existing.id, content);
      toast(changed ? `Gespeichert als Version ${existing.versions.length + 1}` : photoChanged ? 'Foto gespeichert' : 'Keine Änderungen');
      goBack(`/rezept/${existing.id}`);
    } else {
      const id = createRecipe(content, { source: draft ? 'import' : 'selbst', status: tested === 'ja' ? 'kochbuch' : 'zum_testen', image, notes });
      toast('Rezept gespeichert');
      navigate(`/rezept/${id}`, { replace: true });
    }
  };

  return (
    <main className="screen">
      <TopBar title={existing ? 'Rezept bearbeiten' : draft ? 'Import prüfen' : 'Eigenes Rezept'} />
      <form className="stack" onSubmit={submit} noValidate>
        {draft && (
          <div className="tip tint-butter">
            <Icon name="info" size={20} />
            <div>
              <p><strong>Bitte kurz prüfen.</strong> Mashi hat den Text gelesen – gespeichert wird erst, wenn du unten auf „Rezept speichern“ tippst.</p>
              {draft.warnings.length > 0 && <ul className="small">{draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </div>
          </div>
        )}
        <div className="photo-pick">
          {image ? <RecipeImageView image={image} size="md" /> : <div className="photo-pick__empty">Kein Foto – Mashi erzeugt nach dem Speichern ein Bild.</div>}
          <div className="stack stack--tight">
            <label className="btn btn--soft">
              {image?.kind === 'url' ? 'Anderes Foto' : 'Eigenes Foto wählen'}
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            {image?.kind === 'url' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImage(undefined)}>Foto entfernen</button>}
          </div>
        </div>

        <label className="field"><span>Titel</span>
          <input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Omas Kartoffelsalat" required />
        </label>
        <label className="field"><span>Beschreibung</span>
          <textarea rows={2} value={c.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        <div className="panel">
          <div className="row-between"><span>Portionen</span><Stepper value={c.servings} onChange={(servings) => set({ servings })} label="Portionen" /></div>
          <div className="row-2">
            <label className="field"><span>Vorbereitung (Min.)</span>
              <input type="number" inputMode="numeric" min={0} value={c.prepMinutes} onChange={(e) => set({ prepMinutes: Number(e.target.value) || 0 })} />
            </label>
            <label className="field"><span>Kochzeit (Min.)</span>
              <input type="number" inputMode="numeric" min={0} value={c.cookMinutes} onChange={(e) => set({ cookMinutes: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <h3 className="small muted">Schwierigkeit</h3>
          <ChipSelect single options={[{ value: '1', label: 'Einfach' }, { value: '2', label: 'Mittel' }, { value: '3', label: 'Anspruchsvoll' }]}
            selected={[String(c.difficulty)]} onChange={([v]) => v && set({ difficulty: Number(v) as Difficulty })} />
        </div>

        <div className="panel">
          <IngredientEditor items={c.ingredients} onChange={(ingredients) => set({ ingredients })} newItem={() => ({ id: newId('i'), name: '' })} />
        </div>
        <div className="panel">
          <StepEditor steps={c.steps} ingredients={c.ingredients} onChange={(steps) => set({ steps })} />
        </div>

        <div className="panel">
          <h3 className="small muted">Kategorien</h3>
          <ChipSelect options={CATEGORIES.map((x) => ({ value: x.id, label: x.label }))} selected={c.categories} onChange={(categories) => set({ categories })} />
          <h3 className="small muted">Geräte</h3>
          <DevicePicker selected={c.devices} onChange={(devices) => set({ devices })} />
          <label className="field"><span>Tags (mit Komma getrennt)</span>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Schnell, Vegetarisch, Sommer" />
          </label>
        </div>

        {!existing && (
          <>
            <label className="field"><span>Persönliche Notizen</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="panel">
              <h3 className="small muted">Hast du es schon mal gekocht?</h3>
              <ChipSelect single options={[{ value: 'ja', label: 'Ja – direkt ins Kochbuch' }, { value: 'nein', label: 'Nein – erst testen' }]}
                selected={[tested]} onChange={([v]) => v && setTested(v as 'ja' | 'nein')} />
            </div>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block btn--lg" type="submit">{existing ? 'Als neue Version speichern' : 'Rezept speichern'}</button>
      </form>
    </main>
  );
}
