import { useEffect, useRef, useState } from 'react';
import { openDoor, useAdvent, useAdventImage } from '../../data/adventStore';
import { dailyDoor, doorOn } from '../../domain/advent';
import { localDay } from '../../domain/dates';
import { navigate } from '../../router';
import { useSheet } from '../useSheet';
import { AdventDoorArt } from './AdventDoorArt';
import { Icon } from './Icon';
import { useTourPending } from './PageIntro';

/** Tag, an dem der Dialog zuletzt kam – je Gerät (localStorage, mit mashi- davor: der Origin ist geteilt) */
const SHOWN_KEY = 'mashi-advent-dialog';
const readShown = () => {
  try {
    return localStorage.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
};
const writeShown = (day: string) => {
  try {
    localStorage.setItem(SHOWN_KEY, day);
  } catch {
    /* gesperrter Speicher – dann kommt er eben beim nächsten Start noch einmal */
  }
};

/** so lange schwingt die Tür auf, dann geht es zum Rezept (wie advent-swing in app.css) */
const SWING_MS = 650;

/**
 * Täglicher Dialog (Julia: „der Adventskalender soll täglich als Dialog aufpoppen“): vom 1. bis 24. Dezember beim
 * ersten Öffnen der Startseite am Tag, solange das heutige Türchen zu ist (advent.ts: dailyDoor). Das Türchen groß, mit
 * „Öffnen“ (die Tür schwingt auf, dahinter das Foto, dann das Rezept) und „Später“ (bis morgen Ruhe; die Karte auf der
 * Startseite bleibt). Wartet, bis die Tour der Startseite durch ist – sonst lägen zwei Dinge übereinander.
 */
export function AdventDailyDialog() {
  const cal = useAdvent();
  const tourPending = useTourPending('start');
  const [day, setDay] = useState<number | null>(null);

  useEffect(() => {
    if (!cal || tourPending || day !== null) return;
    const d = dailyDoor(cal, new Date(), readShown());
    if (!d) return;
    // erst steht die Seite, dann kommt der Dialog
    const t = setTimeout(() => {
      writeShown(localDay());
      setDay(d);
    }, 600);
    return () => clearTimeout(t);
  }, [cal, tourPending, day]);

  if (!cal || day === null) return null;
  const door = doorOn(cal, day);
  if (!door) return null;
  return <DoorDialog day={day} imageId={door.imageId} onClose={() => setDay(-1)} />;
}

function DoorDialog({ day, imageId, onClose }: { day: number; imageId?: string; onClose: () => void }) {
  const ref = useSheet(onClose);
  const photo = useAdventImage(imageId);
  const [swinging, setSwinging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const open = () => {
    if (swinging) return;
    // schon hier als geöffnet merken: die Adventsseite schwingt dann nicht noch einmal, sondern zeigt gleich das Rezept
    const go = () => {
      openDoor(day);
      onClose();
      navigate(`/advent?tag=${day}`);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return go();
    setSwinging(true);
    timer.current = setTimeout(go, SWING_MS);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet advent-dialog" role="dialog" aria-modal="true" aria-labelledby="advent-dialog-title" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <p className="advent-dialog__kicker"><Icon name="gift" size={16} /> Adventskalender</p>
        <h2 className="sheet__title" id="advent-dialog-title">Türchen {day} wartet auf dich</h2>
        <button type="button" className={`advent-dialog__door${swinging ? ' is-swinging' : ''}`} onClick={open} aria-label={`Türchen ${day} öffnen`}>
          {/* hinter der Tür: das Foto des Rezepts – oder ein warmes Leuchten */}
          <span className="advent-dialog__inside" aria-hidden="true">{photo && <img src={photo} alt="" />}</span>
          <span className="advent-dialog__leaf" aria-hidden="true"><AdventDoorArt day={day} /></span>
          {swinging && (
            <span className="advent-door__sparks" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => <Icon key={i} name="sparkles" size={18} className={`advent-spark advent-spark--${i}`} />)}
            </span>
          )}
        </button>
        <div className="advent-dialog__actions">
          <button type="button" className="btn btn--primary btn--block" onClick={open} disabled={swinging}>Öffnen</button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onClose} disabled={swinging}>Später</button>
        </div>
      </div>
    </div>
  );
}
