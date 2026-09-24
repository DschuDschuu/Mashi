import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../../domain/catalog';
import { cloneContent, currentContent, newId } from '../../domain/recipe';
import type { Difficulty, RecipeContent, RecipeImage } from '../../domain/types';
import { createRecipe, saveContent, useRecipe } from '../../data/store';
import { goBack, navigate } from '../../router';
import { ChipSelect, DevicePicker, Stepper } from '../components/Controls';
import { IngredientEditor, StepEditor } from '../components/ContentEditors';
import { RecipeImage as RecipeImageView } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';
import { toast } from '../toast';

const EMPTY: RecipeContent = {
  title: '', description: '', servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
  ingredients: [{ id: newId('i'), name: '' }], steps: [{ id: newId('s'), text: '' }],
  categories: [], tags: [], devices: [],
};

/** Formular für „Eigenes Rezept“ und „Bearbeiten“ (dann entsteht eine neue Version). */
export function RecipeFormScreen({ editId }: { editId?: string }) {
  const existing = useRecipe(editId);
  const [c, setC] = useState<RecipeContent>(() => (existing ? cloneContent(currentContent(existing)) : cloneContent(EMPTY)));
  const [tagText, setTagText] = useState(c.tags.join(', '));
  const [notes, setNotes] = useState('');
  const [tested, setTested] = useState<'ja' | 'nein'>('ja');
  const [image, setImage] = useState<RecipeImage | undefined>(existing?.image);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<RecipeContent>) => setC((prev) => ({ ...prev, ...patch }));

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setImage({ kind: 'url', url: await downscale(file, 800) });
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
      const changed = saveContent(existing.id, content);
      toast(changed ? `Gespeichert als Version ${existing.versions.length + 1}` : 'Keine Änderungen');
      goBack(`/rezept/${existing.id}`);
    } else {
      // Eigene Rezepte, die man schon kennt, dürfen direkt ins Kochbuch.
      const id = createRecipe(content, { source: 'selbst', status: tested === 'ja' ? 'kochbuch' : 'zum_testen', image, notes });
      toast('Rezept gespeichert');
      navigate(`/rezept/${id}`, { replace: true });
    }
  };

  return (
    <main className="screen">
      <TopBar title={existing ? 'Rezept bearbeiten' : 'Eigenes Rezept'} />
      <form className="stack" onSubmit={submit} noValidate>
        {!existing && (
          <div className="photo-pick">
            {image ? <RecipeImageView image={image} size="md" /> : <div className="photo-pick__empty">Kein Foto – Mashi erzeugt nach dem Speichern ein Bild.</div>}
            <label className="btn btn--soft">
              Eigenes Foto wählen
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          </div>
        )}

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

/** Foto verkleinern, damit es im Prototyp in den localStorage passt (später: Supabase Storage). */
function downscale(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
