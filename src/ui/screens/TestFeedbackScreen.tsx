import { useState } from 'react';
import { cloneContent, currentContent, newId } from '../../domain/recipe';
import type { Rating, Recipe, RecipeContent, RecipeImage as RecipeImageData } from '../../domain/types';
import { describeChange, diffContent } from '../../domain/versions';
import { adoptToCookbook, archiveRecipe, setImage, submitTest, useRecipe } from '../../data/store';
import { navigate } from '../../router';
import { Stars } from '../components/Controls';
import { Icon } from '../components/Icon';
import { IngredientEditor, StepEditor } from '../components/ContentEditors';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';
import { downscale } from '../photo';
import { toast } from '../toast';

export function TestFeedbackScreen({ id }: { id: string }) {
  const recipe = useRecipe(id);
  if (!recipe) return null;
  return <Feedback recipe={recipe} />;
}

function Feedback({ recipe }: { recipe: Recipe }) {
  const original = currentContent(recipe);
  const [rating, setRating] = useState<Rating | 0>(0);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<RecipeContent>(() => cloneContent(original));
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<RecipeImageData | null>(null);
  const changes = diffContent(original, draft);

  const save = (next: 'zum_testen' | 'bewaehrt' | 'kochbuch') => {
    if (!rating) return;
    if (photo) setImage(recipe.id, photo);
    submitTest(recipe.id, { rating, note, content: draft, nextStatus: next === 'kochbuch' ? 'bewaehrt' : next });
    if (next === 'kochbuch') {
      adoptToCookbook(recipe.id);
      toast('Ins Kochbuch übernommen');
    } else {
      toast(next === 'bewaehrt' ? 'Als bewährt markiert' : 'Gespeichert – bleibt zum Testen');
    }
    navigate(`/rezept/${recipe.id}`, { replace: true });
  };

  return (
    <main className="screen">
      <TopBar title="Wie war's?" backTo={`/rezept/${recipe.id}`} />

      <div className="mini-recipe">
        <RecipeImage image={recipe.image} size="sm" />
        <div>
          <strong>{original.title}</strong>
          <span className="muted small">Version {recipe.versions.length}</span>
        </div>
      </div>

      <section className="panel">
        <h2 className="h3">Bewertung</h2>
        <Stars value={rating} onChange={setRating} />
        <label className="field">
          <span>Test-Notiz</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Mehr Gochujang verwenden. Reis war zu viel." />
        </label>
      </section>

      <section className="panel">
        <h2 className="h3">Foto vom Ergebnis</h2>
        <div className="photo-pick">
          {photo && <RecipeImage image={photo} size="md" />}
          <label className="btn btn--soft">
            <Icon name="camera" size={18} /> {photo ? 'Anderes Foto' : 'Foto aufnehmen oder wählen'}
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto({ kind: 'url', url: await downscale(file) });
            }} />
          </label>
          {!photo && <p className="muted small">Optional. Wird zum Bild des Rezepts – so sieht es bei dir aus.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="row-between">
          <h2 className="h3">Rezept anpassen</h2>
          <button className="link" onClick={() => setEditing(!editing)}>{editing ? 'Fertig' : 'Mengen & Schritte ändern'}</button>
        </div>
        {!editing && changes.length === 0 && <p className="muted small">Hast du etwas anders gemacht? Halte es hier fest – die Ursprungsversion bleibt erhalten.</p>}
        {editing && (
          <>
            <IngredientEditor
              items={draft.ingredients}
              onChange={(ingredients) => setDraft({ ...draft, ingredients })}
              newItem={() => ({ id: newId('i'), name: '' })}
            />
            <StepEditor steps={draft.steps} ingredients={draft.ingredients} onChange={(steps) => setDraft({ ...draft, steps })} />
          </>
        )}
        {changes.length > 0 && (
          <div className="changes">
            <h3 className="small muted">Deine Änderungen</h3>
            <ul>{changes.map((c, i) => <li key={i}>{describeChange(c)}</li>)}</ul>
          </div>
        )}
      </section>

      <div className="stack stack--actions">
        {!rating && <p className="muted small center">Gib zuerst eine Bewertung ab.</p>}
        <button className="btn btn--primary btn--block" disabled={!rating} onClick={() => save('bewaehrt')}>
          <Icon name="heart" size={18} /> Als bewährt übernehmen
        </button>
        {rating >= 4 && (
          <button className="btn btn--soft btn--block" onClick={() => save('kochbuch')}>
            <Icon name="book" size={18} /> Direkt ins Kochbuch
          </button>
        )}
        <button className="btn btn--ghost btn--block" disabled={!rating} onClick={() => save('zum_testen')}>Speichern &amp; weiter testen</button>
        <button className="link link--muted center" onClick={() => { archiveRecipe(recipe.id); toast('Archiviert'); navigate('/kochbuch?segment=testen', { replace: true }); }}>
          Nicht mein Fall – archivieren
        </button>
      </div>
    </main>
  );
}
