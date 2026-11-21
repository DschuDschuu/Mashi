/**
 * Weihnachts-Deko (Feiertagsthema, siehe domain/seasons.ts: 1.–26. Dezember; Julia: „mehr Deko“, Tannengrün + Rot):
 * leiser Schneefall und eine Lichterkette oben – beides HINTER den Karten (z-index -1 in .app, wie bei Halloween),
 * deckt also nie Text oder Knöpfe zu. Dazu per CSS eine Schneehaube auf der Leiste unten und hier der Stechpalmenzweig
 * für die Platzhalterbilder. Alles nur Bild (aria-hidden), nur transform/opacity; bei „weniger Bewegung“ steht es still.
 * Im Kochmodus nicht eingeblendet (App.tsx).
 */
import type { CSSProperties } from 'react';
import { useSpecial } from '../settings';
import { Icon } from './Icon';

/** Flocken: Lage (vw), Größe (px), Dauer und Verzögerung (s), seitliches Wehen (px) – fest, damit nichts springt */
const FLAKES: [x: number, size: number, dur: number, delay: number, drift: number, star: boolean][] = [
  [4, 6, 14, 0, 18, false], [12, 10, 19, 6, -24, true], [21, 5, 12, 3, 14, false], [30, 7, 16, 9, -16, false],
  [38, 12, 22, 2, 26, true], [46, 5, 13, 11, -12, false], [55, 8, 17, 5, 20, false], [63, 10, 21, 13, -22, true],
  [71, 6, 15, 1, 16, false], [79, 5, 12, 8, -14, false], [86, 11, 20, 4, 24, true], [93, 7, 16, 12, -18, false],
  [17, 4, 11, 15, 10, false], [51, 4, 12, 17, -10, false], [83, 4, 11, 16, 12, false],
];

/** Lichterkette: Birnen im Abstand der Girlanden-Bögen (60 px), Farben im Wechsel, jede funkelt zu ihrer Zeit */
const BULB_COLORS = ['#d8383d', '#e8b04a', '#3f8a5a', '#e8b04a'];
const BULBS = 34; // reicht auch für breite Bildschirme – was übersteht, schneidet overflow: hidden ab

export function WeihnachtsDeko() {
  if (useSpecial() !== 'weihnachten') return null;
  return (
    <div className="xm-sky" aria-hidden="true">
      <div className="xm-lights">
        {Array.from({ length: BULBS }, (_, i) => (
          <span key={i} className="xm-bulb" style={{ '--i': i, '--c': BULB_COLORS[i % BULB_COLORS.length] } as CSSProperties} />
        ))}
      </div>
      {FLAKES.map(([x, size, dur, delay, drift, star], i) => (
        <span key={i} className="xm-flake" style={{ '--x': `${x}vw`, '--s': `${size}px`, '--dur': `${dur}s`, '--delay': `-${delay}s`, '--drift': `${drift}px` } as CSSProperties}>
          {star ? <Icon name="snow" size={size} /> : <i className="xm-dot" />}
        </span>
      ))}
    </div>
  );
}

/** Stechpalmenzweig in der Ecke der Platzhalterbilder (wie das Spinnennetz an Halloween) – zwei Blätter, drei Beeren */
export function HollyCorner({ className }: { className?: string }) {
  return (
    <svg className={`holly ${className ?? ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <path className="holly__leaf" d="M60 6C50 4 40 8 33 16c4 1 6 4 5 8 4-1 7 0 9 3 2-4 5-6 9-6-2-5-1-10 4-15z" />
      <path className="holly__leaf" d="M58 4C56 14 50 22 41 27c0 4-3 7-7 7 1 4 0 7-3 9 4 2 6 5 6 9 5-2 10-1 15 4 1-10-1-20-1-29 4-9 7-17 7-23z" transform="rotate(-38 46 26)" />
      <path className="holly__vein" d="M58 7C49 9 41 13 35 19M57 6c-1 10-5 18-12 24" />
      <circle className="holly__berry" cx="38" cy="24" r="4" />
      <circle className="holly__berry" cx="45" cy="29" r="4" />
      <circle className="holly__berry" cx="36" cy="32" r="3.6" />
    </svg>
  );
}
