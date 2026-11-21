import { useState } from 'react';
import { useAdvent } from '../../data/adventStore';
import { adventHint, doorOn, showsTree } from '../../domain/advent';
import { navigate } from '../../router';
import { Icon } from './Icon';

/** „Dieses Jahr nicht erinnern“ – je Gerät und Jahr (localStorage, mit mashi- davor: der Origin ist geteilt) */
const HIDE_KEY = 'mashi-advent-hide';
const hiddenYear = () => {
  try {
    return Number(localStorage.getItem(HIDE_KEY)) || 0;
  } catch {
    return 0;
  }
};

/**
 * Kleiner Baum oben neben dem Zahnrad (Julia) – führt zum Adventskalender, solange er befüllt ist, bis zum 6. Januar
 * (advent.ts: showsTree). Dezent wie das Zahnrad, damit die Startseite ruhig bleibt.
 */
export function AdventTreeButton({ className = '' }: { className?: string }) {
  const cal = useAdvent();
  if (!cal || !showsTree(cal, new Date())) return null;
  return (
    <button type="button" className={`settings-btn advent-tree ${className}`.trim()} onClick={() => navigate('/advent')} aria-label="Adventskalender">
      <Icon name="tree" size={20} />
    </button>
  );
}

/**
 * Adventskalender auf der Startseite (advent.ts: adventHint): vom 1. bis 24. Dezember das Türchen des Tages, ab dem
 * 15. November die Erinnerung, ihn zu befüllen – die lässt sich wegklicken; befüllt bis zum 1. Dezember der
 * Countdown. Den Rest des Jahres: nichts.
 */
export function AdventBanner() {
  const cal = useAdvent();
  const now = new Date();
  const [hidden, setHidden] = useState(hiddenYear);
  if (!cal) return null; // noch nicht geladen – keine „befüllen“-Erinnerung, die gleich wieder verschwindet
  const hint = adventHint(cal, now);
  if (!hint) return null;

  if (hint.kind === 'fill') {
    if (hidden === now.getFullYear()) return null;
    const hide = () => {
      try {
        localStorage.setItem(HIDE_KEY, String(now.getFullYear()));
      } catch {
        /* gesperrter Speicher – dann eben nur bis zum Neuladen weg */
      }
      setHidden(now.getFullYear());
    };
    return (
      <div className="advent-banner">
        {/* befüllt wird in den Einstellungen (Julia) */}
        <button type="button" className="advent-banner__main" onClick={() => navigate('/mehr?advent')}>
          <Icon name="gift" size={22} />
          <span className="advent-banner__text">
            <strong>Adventskalender</strong>
            <span>Noch leer – jetzt mit deinen Rezepten befüllen</span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="iconbtn advent-banner__close" aria-label="Dieses Jahr nicht mehr erinnern" onClick={hide}>
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  // Vorfreude vor dem 1. Dezember (Julia): jeden Tag einer weniger – führt zu den (noch geschlossenen) Türchen
  if (hint.kind === 'countdown') {
    const n = cal.doors.length;
    return (
      <div className="advent-banner">
        <button type="button" className="advent-banner__main" onClick={() => navigate('/advent')}>
          <Icon name="gift" size={22} />
          <span className="advent-banner__text">
            {/* kurz gehalten: passt auf 375 px in eine Zeile */}
            <strong>{hint.days === 1 ? 'Morgen geht Türchen 1 auf' : `Noch ${hint.days} Tage bis zum 1. Türchen`}</strong>
            <span>{n === 1 ? 'Ein Adventsrezept wartet auf dich' : `${n} Adventsrezepte warten auf dich`}</span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    );
  }

  const door = doorOn(cal, hint.day);
  if (!door) return null; // für heute steht kein Rezept in der Datei
  return (
    <div className="advent-banner">
      <button type="button" className="advent-banner__main" onClick={() => navigate(`/advent?tag=${hint.day}`)}>
        <Icon name="gift" size={22} />
        <span className="advent-banner__text">
          {hint.opened ? (
            <><strong>Türchen {hint.day}: {door.content.title}</strong><span>Nochmal ansehen</span></>
          ) : (
            <><strong>Türchen {hint.day} öffnen</strong><span>Dein Adventsrezept für heute wartet</span></>
          )}
        </span>
        <Icon name="chevron" size={16} />
      </button>
    </div>
  );
}
