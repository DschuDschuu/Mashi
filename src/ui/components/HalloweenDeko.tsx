/**
 * Halloween-Deko (Feiertagsthema, siehe domain/seasons.ts): Fledermäuse am Himmel, ein Geist, der vor einer
 * Fledermaus erschrickt, und ein Spinnennetz mit Spinne oben in der Ecke.
 * Alles nur Bild (aria-hidden, keine Klicks) und reine CSS-Animation – nur transform/opacity, das rechnet der
 * Browser sparsam. Der Himmel liegt HINTER den Karten (z-index -1 in .app), deckt also nie Text oder Knöpfe zu.
 * Im Kochmodus nicht eingeblendet (App.tsx), bei „weniger Bewegung“ steht alles still (app.css).
 */
import { useSpecial } from '../settings';

const BAT = 'M16 4.5c.6-1 1-2.2 1-2.2l.6 1.6h-3.2l.6-1.6s.4 1.2 1 2.2zM14.2 4.6c-1.6-.1-3.4-1.6-4.6-3.3C8.5 3.4 5.4 4.4 2 3.6c1.8 2 2.2 4.4 1.9 6.4 1.8-1.2 4-1.2 5.4.2.6-1.5 2.2-2.2 3.7-1.6.6 1.6 1.7 3.6 3 4.4 1.3-.8 2.4-2.8 3-4.4 1.5-.6 3.1.1 3.7 1.6 1.4-1.4 3.6-1.4 5.4-.2-.3-2 .1-4.4 1.9-6.4-3.4.8-6.5-.2-7.6-2.3-1.2 1.7-3 3.2-4.6 3.3z';
const GHOST = 'M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6z';

function Bat({ width = 34 }: { width?: number }) {
  return (
    <svg className="hw-bat__svg" width={width} height={width / 2} viewBox="0 0 32 16">
      <path d={BAT} />
    </svg>
  );
}

export function HalloweenDeko() {
  if (useSpecial() !== 'halloween') return null;
  return (
    <>
      <div className="hw-sky" aria-hidden="true">
        {/* drei Bahnen, zeitversetzt (app.css) – so sind immer mindestens zwei unterwegs (Julia) */}
        <span className="hw-bat hw-bat--1"><span className="hw-bob"><Bat /></span></span>
        <span className="hw-bat hw-bat--2"><span className="hw-bob"><Bat width={26} /></span></span>
        <span className="hw-bat hw-bat--3"><span className="hw-bob"><Bat width={30} /></span></span>
        {/* kleine Geschichte: Geist schwebt, Fledermaus kommt, Geist erschrickt und flitzt davon */}
        <span className="hw-chase">
          <span className="hw-chase__bat"><Bat /></span>
          <svg className="hw-chase__ghost" width="34" height="34" viewBox="0 0 24 24">
            <path className="hw-ghost__body" d={GHOST} />
            <g className="hw-ghost__calm"><circle cx="9.6" cy="11" r="1.2" /><circle cx="14.4" cy="11" r="1.2" /><path d="M10.8 14.4c.7.6 1.7.6 2.4 0" /></g>
            <g className="hw-ghost__shock"><circle cx="9.6" cy="10.6" r="1.8" /><circle cx="14.4" cy="10.6" r="1.8" /><ellipse cx="12" cy="15.4" rx="1.4" ry="1.8" /></g>
          </svg>
        </span>
      </div>
      <div className="hw-corner" aria-hidden="true">
        <CobwebCorner className="hw-corner__web" />
        <svg className="hw-spider" width="16" height="34" viewBox="0 0 16 34">
          <path d="M8 0v22 M5.6 24.5 2 22.5 M5.6 26.5 1.5 26.5 M5.8 28.4 2.5 31 M10.4 24.5 14 22.5 M10.4 26.5 14.5 26.5 M10.2 28.4 13.5 31" />
          <ellipse cx="8" cy="26" rx="2.6" ry="3.2" />
        </svg>
      </div>
    </>
  );
}

/** Spinnennetz für die Ecke oben rechts – gespiegelt (CSS) auch für oben links */
export function CobwebCorner({ className }: { className?: string }) {
  return (
    <svg className={`cobweb ${className ?? ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M64 0 4 0M64 0 64 60M64 0 14 30M64 0 34 50M64 0 24 6M64 0 52 44" />
      <path d="M50 0c0 4 2 6 4 7s4 4 3 10c3-1 5 0 7 1" />
      <path d="M36 0c0 6 3 10 6 12s4 5 3 9c3 0 6 1 7 5s3 6 12 6" />
      <path d="M20 0c1 8 4 14 8 17s7 4 7 10c4 0 8 2 9 6s4 7 20 9" />
    </svg>
  );
}
