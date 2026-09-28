import { useState } from 'react';
import { updateSettings } from '../settings';
import { useSheet } from '../useSheet';
import { useSlide } from '../useSlide';
import { useSwipe } from '../useSwipe';
import { Icon, type IconName } from './Icon';

/** Die Karten der Einführung – kurz, je eine Funktion. Reihenfolge wie im Alltag: planen, einkaufen, kochen. */
const CARDS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'heart', title: 'Willkommen bei Mashi', text: 'Dein Kochbuch, das mitdenkt: Rezepte, Wochenplan, Einkaufsliste und Vorrat an einem Ort. Wisch dich kurz durch – dauert eine Minute.' },
  { icon: 'book', title: 'Kochbuch', text: 'Eigene Rezepte anlegen, Text oder ein Foto aus dem Kochbuch einlesen, KI-Ideen erst testen. Jede Änderung wird eine neue Version – die alte bleibt.' },
  { icon: 'calendar', title: 'Wochenplan', text: 'Gerichte für die Woche planen. Mashi schlägt Rezepte mit gemeinsamen Zutaten vor, zeigt, was noch fehlt, und rechnet Nährwerte pro Portion.' },
  { icon: 'cart', title: 'Einkaufsliste', text: 'Entsteht aus dem Plan und zieht ab, was schon im Vorrat ist. „Immer im Haus“ steht unter Basics. Abhaken im Laden – oder der Kassenbon hakt ab.' },
  { icon: 'archive', title: 'Speisekammer', text: 'Deinen Vorrat pflegst du über den Kassenbon oder von Hand. „Bald verbrauchen“ zeigt, was weg muss – und welche Rezepte es aufbrauchen.' },
  { icon: 'bookmark', title: 'Meine Lebensmittel', text: 'Deine Produkte mit Nährwerten – per Etikett-Foto, Open Food Facts oder abgetippt, gern mit Marke. Mehrere Sorten einer Zutat mit Favorit ★, dazu „Nachkaufen“, „Immer im Haus“ und „Gewürze“.' },
  { icon: 'play', title: 'Kochmodus', text: 'Schritt für Schritt mit Timer, der Bildschirm bleibt an. Mengen nur für dieses Mal ändern – und am Ende „Fertig“: Die Zutaten gehen aus dem Vorrat.' },
  { icon: 'gear', title: 'Einstellungen', text: 'Übers Zahnrad: Farbthema, Makro-Ziel, Sicherung und Abgleich mit deinen Geräten. Diese Einführung findest du dort auch wieder.' },
];

/**
 * Einführung beim ersten Start: Karten zum Durchwischen, jederzeit überspringbar.
 * Wieder aufrufbar unter Einstellungen → „Einführung ansehen“. Gemerkt wird je Gerät.
 */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const done = () => { updateSettings({ onboarded: true }); onClose(); };
  const ref = useSheet<HTMLDivElement>(done);
  const go = (n: number) => { if (n >= 0 && n < CARDS.length) setI(n); };
  const swipe = useSwipe(() => go(i + 1), () => go(i - 1));
  const slide = useSlide(i);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  return (
    <div className="sheet-backdrop onboarding-backdrop">
      <div className="sheet onboarding" role="dialog" aria-modal="true" aria-label="Einführung" ref={ref} {...swipe}>
        <button type="button" className="link link--muted onboarding__skip" onClick={done}>Überspringen</button>
        <div key={i} className={`onboarding__card ${slide}`} aria-live="polite">
          <span className="onboarding__icon"><Icon name={card.icon} size={40} /></span>
          <h2 className="onboarding__title">{card.title}</h2>
          <p className="onboarding__text">{card.text}</p>
        </div>
        <div className="onboarding__dots" role="tablist" aria-label="Karte wählen">
          {CARDS.map((c, n) => (
            <button key={c.title} type="button" role="tab" aria-selected={n === i} aria-label={`${n + 1}: ${c.title}`}
              className={n === i ? 'is-on' : ''} onClick={() => go(n)} />
          ))}
        </div>
        <div className="onboarding__actions">
          {i > 0 ? <button type="button" className="btn btn--ghost" onClick={() => go(i - 1)}>Zurück</button> : <span />}
          <button type="button" className="btn btn--primary" onClick={() => (last ? done() : go(i + 1))}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
