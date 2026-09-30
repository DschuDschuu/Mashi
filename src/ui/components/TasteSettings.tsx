import { useState } from 'react';
import { setTastes, usePantry, useRecipes } from '../../data/store';
import { summarizeTastes } from '../../domain/tastes';
import { ask } from '../confirm';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * „Vorlieben für die KI“ (Julia): ein Freitext, der bei KI-Rezepten mitgeht – „kein Koriander, gern scharf“.
 * Der Knopf schreibt einen Vorschlag aus deinen Rezepten hinein (Favoriten, gut Bewertetes, häufige
 * Stichworte) – ohne KI, direkt auf dem Gerät. Gespeichert beim Verlassen des Felds; gilt auf allen Geräten.
 */
export function TasteSettings() {
  const saved = usePantry().tastes ?? '';
  const recipes = useRecipes();
  const [text, setText] = useState(saved);
  const commit = (t = text) => {
    if (t.trim() === saved) return;
    setTastes(t);
    toast(t.trim() ? 'Vorlieben gespeichert' : 'Vorlieben gelöscht');
  };
  const fromRecipes = async () => {
    const summary = summarizeTastes(recipes);
    if (!summary) return toast('Noch keine Favoriten oder gut bewerteten Rezepte – markiere ein paar mit ★ oder bewerte sie nach dem Kochen.');
    // eigene Zeilen („kein Koriander“) nicht einfach überschreiben
    if (text.trim() && !(await ask({ title: 'Vorlieben ersetzen?', text: 'Der Vorschlag aus deinen Rezepten ersetzt, was jetzt im Feld steht. Eigene Zeilen wie „kein Koriander“ kannst du danach wieder ergänzen.', confirm: 'Ersetzen' }))) return;
    setText(summary);
    commit(summary);
  };
  return (
    <div className="panel stack tastes">
      <div>
        <strong>Vorlieben für die KI</strong>
        <p className="small muted">Geht bei jedem KI-Rezept mit, z. B. „kein Koriander, gern scharf, wenig Sahne“. Gilt auf allen Geräten.</p>
      </div>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => commit()} aria-label="Vorlieben für die KI"
        placeholder={'z. B. kein Koriander\ngern scharf und asiatisch\nwenig Sahne'} />
      <button type="button" className="btn btn--soft btn--sm" onClick={() => void fromRecipes()}>
        <Icon name="sparkles" size={16} /> Aus meinen Rezepten erstellen
      </button>
      <p className="small muted">Der Vorschlag entsteht auf deinem Gerät aus Favoriten, gut bewerteten Rezepten und ihren Stichworten. Notizen wie „zu scharf“ ergänzt du am besten selbst.</p>
    </div>
  );
}
