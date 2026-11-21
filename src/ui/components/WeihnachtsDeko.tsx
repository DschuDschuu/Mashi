/**
 * Weihnachts-Deko (Feiertagsthema, siehe domain/seasons.ts: 1. Advent bzw. 1.12. bis 26.12.; Julia: „mehr Deko“, Tannengrün + Rot,
 * dann „noch etwas lame – Animation, Sterne, Weihnachtsmänner, Schneemänner, sei kreativ“):
 * - Himmel HINTER den Karten (z-index -1 in .app, wie bei Halloween – deckt also nie Text oder Knöpfe zu):
 *   Lichterkette, Schneefall, etwa einmal pro Minute der Weihnachtsmann im Schlitten mit zwei Rentieren und
 *   Sternenstaub, ab und zu eine Sternschnuppe. Heiligabend: zweiter Schlitten, dichterer Schnee.
 * - Schneemann auf der Schneehaube der Leiste (BottomNav), winkt, wackelt beim Antippen.
 * - Weihnachtsmütze auf dem Logo und goldene Sterne drumherum (StartScreen); Logo antippen = Schneegestöber.
 * - Lebkuchenmann guckt aus der Ecke der Platzhalterbilder (RecipeImage).
 * Alles nur transform/opacity, bei „weniger Bewegung“ steht es still (app.css). Im Kochmodus nicht eingeblendet
 * (App.tsx) – nur das Schneegestöber nach „Gekocht“ (XmasBurst), da ist man ja gerade fertig.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { localDay } from '../../domain/dates';
import { isChristmasEve } from '../../domain/seasons';
import { CELEBRATE } from '../celebrate';
import { useSpecial } from '../settings';
import { Icon } from './Icon';

/** Ereignis „Schneegestöber“ – das Logo löst es aus, XmasBurst hört zu (wie CELEBRATE) */
const SNOW_BURST = 'mashi-schneegestoeber';
export const schneegestoeber = () => window.dispatchEvent(new Event(SNOW_BURST));

/** Flocken: Lage (vw), Größe (px), Dauer und Verzögerung (s), seitliches Wehen (px) – fest, damit nichts springt */
const FLAKES: [x: number, size: number, dur: number, delay: number, drift: number, star: boolean][] = [
  [4, 6, 14, 0, 18, false], [12, 10, 19, 6, -24, true], [21, 5, 12, 3, 14, false], [30, 7, 16, 9, -16, false],
  [38, 12, 22, 2, 26, true], [46, 5, 13, 11, -12, false], [55, 8, 17, 5, 20, false], [63, 10, 21, 13, -22, true],
  [71, 6, 15, 1, 16, false], [79, 5, 12, 8, -14, false], [86, 11, 20, 4, 24, true], [93, 7, 16, 12, -18, false],
  [17, 4, 11, 15, 10, false], [51, 4, 12, 17, -10, false], [83, 4, 11, 16, 12, false],
];
/** Heiligabend: noch einmal so viele dazwischen */
const MORE_FLAKES: typeof FLAKES = [
  [8, 8, 15, 4, -18, true], [16, 5, 13, 9, 12, false], [26, 9, 18, 1, 20, false], [34, 6, 14, 12, -14, false],
  [42, 10, 20, 7, 22, true], [59, 6, 13, 3, -16, false], [67, 8, 17, 10, 18, false], [75, 11, 21, 6, -20, true],
  [90, 5, 12, 2, 14, false], [97, 7, 15, 14, -12, false], [3, 4, 10, 8, 10, false], [48, 4, 11, 5, -8, false],
];

/** Lichterkette: Birnen im Abstand der Girlanden-Bögen (60 px), Farben im Wechsel, jede funkelt zu ihrer Zeit */
const BULB_COLORS = ['#d8383d', '#e8b04a', '#3f8a5a', '#e8b04a'];
const BULBS = 34; // reicht auch für breite Bildschirme – was übersteht, schneidet overflow: hidden ab

/** Fünfzackiger Stern (24er-Raster) */
const STAR = 'M12 2.2l2.9 6.4 7 .7-5.3 4.7 1.5 6.9L12 17.3l-6.1 3.6 1.5-6.9L2.1 9.3l7-.7z';

export function WeihnachtsDeko() {
  if (useSpecial() !== 'weihnachten') return null;
  const eve = isChristmasEve(localDay(new Date()));
  const flakes = eve ? [...FLAKES, ...MORE_FLAKES] : FLAKES;
  return (
    <div className="xm-sky" aria-hidden="true">
      <div className="xm-lights">
        {Array.from({ length: BULBS }, (_, i) => (
          <span key={i} className="xm-bulb" style={{ '--i': i, '--c': BULB_COLORS[i % BULB_COLORS.length] } as CSSProperties} />
        ))}
      </div>
      {flakes.map(([x, size, dur, delay, drift, star], i) => (
        <span key={i} className="xm-flake" style={{ '--x': `${x}vw`, '--s': `${size}px`, '--dur': `${dur}s`, '--delay': `-${delay}s`, '--drift': `${drift}px` } as CSSProperties}>
          {star ? <Icon name="snow" size={size} /> : <i className="xm-dot" />}
        </span>
      ))}
      <span className="xm-shoot" />
      <span className="xm-sleigh"><span className="xm-sleigh__bob"><StarDust /><SantaSleigh /></span></span>
      {eve && <span className="xm-sleigh xm-sleigh--2"><span className="xm-sleigh__bob"><StarDust /><SantaSleigh /></span></span>}
    </div>
  );
}

/** Ein Rentier nach rechts, `x` = Mitte des Körpers; die Beine galoppieren (CSS), das vordere hat eine rote Nase */
function Reindeer({ x, red = false }: { x: number; red?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path className="xm-deer__legs xm-deer__legs--b" d="M-7 28 L-11 35 M-3.5 28.5 L-5.5 36" />
      <path className="xm-deer__legs xm-deer__legs--f" d="M6 28.5 L10.5 35 M9.5 27.5 L14.5 33" />
      <ellipse className="xm-deer__tail" cx="-11.6" cy="22.6" rx="2.1" ry="1.5" />
      <ellipse className="xm-deer__body" cx="0" cy="25" rx="11" ry="5.4" />
      <path className="xm-deer__body" d="M6 23C9 20 11 16 12.5 13l3.6 2C14.5 19 12 23 9 26z" />
      <ellipse className="xm-deer__body" cx="15.5" cy="13.4" rx="4.3" ry="3" />
      <ellipse className="xm-deer__snout" cx="18.6" cy="14.6" rx="2.3" ry="1.8" />
      <circle className={red ? 'xm-deer__nose xm-deer__nose--red' : 'xm-deer__nose'} cx="20.6" cy="14.3" r={red ? 1.6 : 1.2} />
      <circle className="xm-deer__eye" cx="15.8" cy="12.5" r="0.7" />
      <path className="xm-deer__ear" d="M13 11.6l-3.2-1.3 2.3 2.6z" />
      <path className="xm-deer__antler" d="M14 10.6C13 7 11 5 8.5 4.2M12 7.2l-1.4-2.6M13.6 8.6l1.9-3M16.2 10.4c.4-3.4 1.8-5.4 3.8-6M17.2 7.4l1.4-2.2" />
      <path className="xm-deer__harness" d="M4 21.4c0 3.6.6 6.4 2 8" />
      <circle className="xm-gold" cx="6.2" cy="29.8" r="1.2" />
    </g>
  );
}

/** Weihnachtsmann im Schlitten mit Geschenkesack, davor zwei Rentiere – nach rechts unterwegs */
function SantaSleigh() {
  return (
    <svg className="xm-santa" width="132" height="46" viewBox="0 0 132 46">
      <path className="xm-reins" d="M39 19c12 3 22 4 33 2.4M39 19c22-1.4 44-1.6 67 .6" />
      <Reindeer x={72} />
      <Reindeer x={106} red />
      {/* Sack und Weihnachtsmann – der Schlitten davor verdeckt die untere Hälfte */}
      <path className="xm-sack" d="M9 27C7 17 10 9 15 8c4 1 7 8 6 19z" />
      <path className="xm-gold-line" d="M12.6 10.4q2.4 1.8 4.6 0" />
      <path className="xm-red" d="M20 27c0-10 4-14 9-14s8 5 8 14z" />
      <path className="xm-arm" d="M33 18q4 1 6 1" />
      <circle className="xm-mitten" cx="39.6" cy="19" r="1.9" />
      <circle className="xm-skin" cx="29" cy="10" r="4.6" />
      <path className="xm-white" d="M24.6 9.5c0 7 8.8 7 8.8 0-1.9 2-6.9 2-8.8 0z" />
      <circle className="xm-ink" cx="30.8" cy="8.6" r="0.7" />
      <circle className="xm-nose" cx="33.3" cy="9.7" r="1.1" />
      <path className="xm-red" d="M25 5.8c.6-4 4.5-5.4 8.2 0zM26 2.6C23 1.2 20 2 18.4 4.6c2.6-1 5.2-.6 7 .6z" />
      <rect className="xm-white" x="24" y="5" width="10" height="2.6" rx="1.3" />
      <circle className="xm-white" cx="18.2" cy="4.8" r="1.7" />
      {/* Schlitten mit goldener Zierleiste und Kufe */}
      <path className="xm-sleigh-body" d="M6 20c-.5 10 3 16 10 16h26c7 0 11-5 12-14 .5-4-2-6.5-4.5-5.5 1.5 2 1 5.5-1.5 7.5-2 1.5-5 2-8 2H14c-2 0-3-2-3-5 0-2-1.5-3.5-3-3.5-1.2 0-2 1.1-2 2.5z" />
      <path className="xm-gold-line" d="M10 30h36" />
      <path className="xm-runner" d="M3 41h41c6 0 10-3 11-8M14 36v5M38 36v5" />
    </svg>
  );
}

/** Goldener Sternenstaub, den der Schlitten hinter sich herzieht – sitzt in .xm-sleigh__bob, fliegt also mit */
function StarDust() {
  return (
    <span className="xm-dust">
      {Array.from({ length: 6 }, (_, i) => (
        <svg key={i} className="xm-dust__star" style={{ '--i': i } as CSSProperties} viewBox="0 0 24 24"><path d={STAR} /></svg>
      ))}
    </span>
  );
}

/**
 * Schneegestöber (Julia): Logo antippen – und nach „Gekocht“ feiert Weihnachten mit (wie der Fledermaus-Schwarm an
 * Halloween). Flocken und goldene Sterne fallen einmal kräftig über alles, nicht anklickbar; dann ist wieder Ruhe.
 */
export function XmasBurst() {
  const xmas = useSpecial() === 'weihnachten';
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!xmas) return;
    const go = () => setRun((n) => n + 1);
    window.addEventListener(SNOW_BURST, go);
    window.addEventListener(CELEBRATE, go);
    return () => { window.removeEventListener(SNOW_BURST, go); window.removeEventListener(CELEBRATE, go); };
  }, [xmas]);
  if (!xmas || !run) return null;
  return (
    <div className="xm-burst" key={run} aria-hidden="true" onAnimationEnd={(e) => { if (e.target === e.currentTarget) setRun(0); }}>
      {Array.from({ length: 34 }, (_, i) => {
        const style = {
          '--x': `${((i * 29 + 7) % 96) + 2}vw`, '--s': `${7 + ((i * 7) % 10)}px`, '--dur': `${1.7 + ((i * 13) % 10) / 10}s`,
          '--delay': `${((i * 17) % 9) * 0.08}s`, '--drift': `${((i * 23) % 50) - 25}px`, '--rot': `${i % 2 ? 200 : -160}deg`,
        } as CSSProperties;
        return (
          <span key={i} className={`xm-burst__bit${i % 3 === 0 ? ' xm-burst__bit--star' : ''}`} style={style}>
            {i % 3 === 0 ? <svg viewBox="0 0 24 24"><path d={STAR} /></svg> : i % 3 === 1 ? <Icon name="snow" size={14} /> : <i className="xm-dot" />}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Schneemann auf der Schneehaube der Leiste unten rechts (Julia) – winkt ab und zu; antippen: er wackelt, der Hut
 * hüpft. Steckt in der Leiste: auf Unterseiten ohne Leiste (Rezept, Formulare) ist er also auch weg.
 */
export function Snowman() {
  const [wiggle, setWiggle] = useState(0);
  return (
    <button type="button" className="xm-snowman" onClick={() => setWiggle((n) => n + 1)} aria-label="Schneemann – antippen zum Wackeln">
      <span className={`xm-snowman__wiggle${wiggle ? ' is-on' : ''}`} key={wiggle}>
        <svg className="xm-snowman__svg" viewBox="0 0 44 56" aria-hidden="true">
          <path className="xm-stick" d="M10 36 2 29M5 31.6 3.4 27.6" />
          <path className="xm-stick xm-snowman__arm" d="M34 36 42 28M39.4 30.6l3.2.4" />
          <circle className="xm-snowball" cx="22" cy="42" r="12.5" />
          <circle className="xm-snowball" cx="22" cy="21.5" r="8.5" />
          <path className="xm-red" d="M13.8 27.6c5.2 2.8 11.2 2.8 16.4 0l.4 3.4c-5.6 2.6-11.6 2.6-17.2 0zM25 31.4l2.6 8.1 3-1.1-2.2-7.4z" />
          <circle className="xm-ink" cx="22" cy="39" r="1.3" /><circle className="xm-ink" cx="22" cy="44" r="1.3" /><circle className="xm-ink" cx="22" cy="49" r="1.3" />
          <circle className="xm-ink" cx="19" cy="19.5" r="1.1" /><circle className="xm-ink" cx="25" cy="19.5" r="1.1" />
          <path className="xm-carrot" d="M22 22l7 1.4-7 1z" />
          <path className="xm-smile" d="M18.6 25.2h0M20.6 26.2h0M23.4 26.2h0M25.4 25.2h0" />
          <g className="xm-snowman__hat">
            <rect className="xm-hatblack" x="13" y="12.2" width="18" height="2.6" rx="1.3" />
            <rect className="xm-hatblack" x="15.5" y="2.4" width="13" height="10.6" rx="1.5" />
            <rect className="xm-red" x="15.5" y="9.4" width="13" height="2.4" />
            <circle className="xm-berry" cx="26.4" cy="10.6" r="1.3" />
          </g>
        </svg>
      </span>
    </button>
  );
}

/** Weihnachtsmütze auf dem „M“ des Logos – wiegt sich leicht, der Bommel wippt */
export function SantaHat() {
  return (
    <svg className="xm-hat" viewBox="0 0 48 40" aria-hidden="true">
      <path className="xm-red" d="M11 30c1-11 7-20 16-22 6-1 11 3 12.5 9 1 4 1.5 9 1.5 13z" />
      <path className="xm-red-dark" d="M27 8.2C20 6 12 7.5 6.5 15c5.5-3 11.5-3.5 16-1z" />
      <circle className="xm-hat__pom xm-white" cx="6.2" cy="15.6" r="4.6" />
      <rect className="xm-white" x="7" y="27" width="37" height="8.5" rx="4.25" />
    </svg>
  );
}

/** Goldene Sterne rund ums Logo: links/oben/rechts, nie über Baum, Zahnrad oder Herz; jeder funkelt zu seiner Zeit */
const LOGO_STARS: [left: string, top: number, size: number][] = [
  ['5%', 52, 13], ['25%', 70, 9], ['70%', 66, 10], ['87%', 60, 12], ['13%', 82, 7],
];
export function LogoStars() {
  return (
    <>
      {LOGO_STARS.map(([left, top, size], i) => (
        <svg key={i} className="xm-star" style={{ left, top, width: size, height: size, '--i': i } as CSSProperties} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </>
  );
}

/**
 * Lebkuchenmann guckt unten rechts aus dem Platzhalterbild und winkt (Julia: statt der Stechpalme). Der Rest steckt
 * unter der Bildkante (overflow: hidden). Jedes Bild winkt zu seiner eigenen Zeit – versetzt nach dem Farbton (--h).
 */
export function GingerbreadCorner({ className }: { className?: string }) {
  return (
    <svg className={`ginger ${className ?? ''}`} viewBox="0 0 40 46" aria-hidden="true">
      <path className="ginger__limb" d="M11 23 3.5 30" />
      <path className="ginger__limb ginger__arm" d="M29 23 36.5 15" />
      <path className="ginger__body" d="M13 18h14c2 0 3 2 3 4v24H10V22c0-2 1-4 3-4z" />
      <circle className="ginger__body" cx="20" cy="10" r="8.5" />
      <path className="ginger__icing" d="M5 28.2l1.5-1.1 1 1.5 1.5-1.1M31.4 19l1.5-.9.8 1.6 1.5-.9M16.6 13.2q3.4 3 6.8 0M12.5 21.5h15" />
      <circle className="ginger__eye" cx="17" cy="9" r="1.2" /><circle className="ginger__eye" cx="23" cy="9" r="1.2" />
      <circle className="ginger__cheek" cx="14.6" cy="12.4" r="1.4" /><circle className="ginger__cheek" cx="25.4" cy="12.4" r="1.4" />
      <circle className="xm-berry" cx="20" cy="26" r="1.9" /><circle className="ginger__drop" cx="20" cy="32" r="1.9" />
    </svg>
  );
}
