import { useState } from 'react';
import { parseRecipeText, type TextImport } from '../../domain/importText';
import { navigate } from '../../router';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { RecipeFormScreen } from './RecipeFormScreen';

/**
 * Rezept aus kopiertem Text übernehmen (Webseite, Chat, Notiz-App).
 * Ohne KI: Mashi liest Zutaten, Schritte, Portionen und Zeit selbst heraus.
 * Danach öffnet sich das normale Formular vorausgefüllt – gespeichert wird erst nach Prüfung.
 */
export function ImportScreen() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<TextImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (draft) return <RecipeFormScreen draft={draft} />;

  const recognize = () => {
    const result = parseRecipeText(text);
    if (!result.content.ingredients.length && !result.content.steps.length) {
      setError('Darin hat Mashi weder Zutaten noch Schritte gefunden. Hast du den ganzen Rezepttext kopiert?');
      return;
    }
    setDraft(result);
  };

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setError(null);
    } catch {
      setError('Einfügen ging nicht automatisch – tippe lange ins Textfeld und wähle „Einfügen“.');
    }
  };

  return (
    <main className="screen">
      <TopBar title="Rezept importieren" />
      <div className="stack">
        <p className="muted">Kopiere ein Rezept von einer Webseite, aus einem Chat oder einer Notiz und füge es hier ein. Mashi erkennt Zutaten, Schritte, Portionen und Zeiten.</p>
        <label className="field"><span>Rezepttext</span>
          <textarea className="import-text" rows={12} value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder={'Tomatensuppe\n4 Portionen\n\nZutaten:\n800 g Tomaten\n1 Zwiebel\n…\n\nZubereitung:\n1. Zwiebel würfeln.\n…'} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-2">
          <button className="btn btn--ghost" type="button" onClick={paste}><Icon name="clipboard" size={18} /> Einfügen</button>
          <button className="btn btn--primary" type="button" disabled={!text.trim()} onClick={recognize}>Erkennen</button>
        </div>
        <div className="tip tint-sky">
          <Icon name="info" size={20} />
          <p>Foto, Screenshot und PDF kommen mit der KI-Anbindung. Auch dann gilt: erkannte Zutaten und Mengen siehst du <strong>immer erst zur Prüfung</strong>.</p>
        </div>
        <button className="btn btn--soft btn--block" onClick={() => navigate('/neu/manuell', { replace: true })}>Stattdessen selbst eintragen</button>
      </div>
    </main>
  );
}
