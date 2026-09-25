import { useState } from 'react';
import { cleanOcrText, parseRecipeText, type TextImport } from '../../domain/importText';
import { navigate } from '../../router';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { recognizeText } from '../ocr';
import { RecipeFormScreen } from './RecipeFormScreen';

/**
 * Rezept aus kopiertem Text übernehmen (Webseite, Chat, Notiz-App) – oder aus einem Foto
 * (Kochbuchseite, Zettel, Screenshot): die Texterkennung läuft im Browser, wie beim Kassenbon.
 * Ohne KI: Mashi liest Zutaten, Schritte, Portionen und Zeit selbst heraus.
 * Danach öffnet sich das normale Formular vorausgefüllt – gespeichert wird erst nach Prüfung.
 */
export function ImportScreen() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<TextImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Foto wird gelesen: Fortschritt 0–1, null = nicht aktiv */
  const [reading, setReading] = useState<number | null>(null);
  const [fromPhoto, setFromPhoto] = useState(false);

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(0);
    try {
      const t = await recognizeText(file, setReading);
      if (!t.trim()) throw new Error('leer');
      setText(cleanOcrText(t));
      setFromPhoto(true);
    } catch (e) {
      console.error('Mashi: Foto ließ sich nicht lesen', e);
      setError('Aus dem Foto ließ sich kein Text lesen. Beim ersten Mal braucht die Texterkennung Internet. Tipp: gerade von oben fotografieren, gut ausgeleuchtet, nur eine Spalte.');
    } finally {
      setReading(null);
    }
  };

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
        <p className="muted">Fotografiere ein Rezept (Kochbuch, Zettel, Screenshot) – oder kopiere es von einer Webseite, aus einem Chat oder einer Notiz. Mashi erkennt Zutaten, Schritte, Portionen und Zeiten.</p>
        <label className={`btn btn--primary btn--block${reading !== null ? ' is-disabled' : ''}`}>
          <Icon name="camera" size={18} /> {reading !== null ? `Lese Foto … ${Math.round(reading * 100)} %` : 'Rezept fotografieren oder Bild wählen'}
          <input type="file" accept="image/*" hidden disabled={reading !== null} onChange={(e) => { void readPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {fromPhoto && <p className="scan-note" role="status">Text aus dem Foto erkannt. Prüf ihn kurz – Texterkennung verliest sich gern bei Brüchen (½) und Einheiten – und tippe dann auf „Erkennen“.</p>}
        <label className="field"><span>Rezepttext</span>
          <textarea className="import-text" rows={12} value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder={'Tomatensuppe\n4 Portionen\n\nZutaten:\n800 g Tomaten\n1 Zwiebel\n…\n\nZubereitung:\n1. Zwiebel würfeln.\n…'} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-2">
          <button className="btn btn--ghost" type="button" onClick={paste}><Icon name="clipboard" size={18} /> Einfügen</button>
          <button className="btn btn--primary" type="button" disabled={!text.trim() || reading !== null} onClick={recognize}>Erkennen</button>
        </div>
        <div className="tip tint-sky">
          <Icon name="info" size={20} />
          <p>Erkannte Zutaten und Mengen siehst du <strong>immer erst zur Prüfung</strong> – gespeichert wird erst, wenn du es sagst. Das Foto verlässt dein Gerät nicht.</p>
        </div>
        <button className="btn btn--soft btn--block" onClick={() => navigate('/neu/manuell', { replace: true })}>Stattdessen selbst eintragen</button>
      </div>
    </main>
  );
}
