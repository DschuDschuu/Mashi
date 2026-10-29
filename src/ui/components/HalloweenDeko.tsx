/**
 * Halloween-Deko (Feiertagsthema, siehe domain/seasons.ts): Fledermäuse am Himmel, ein Geist, der vor einer
 * Fledermaus erschrickt, Netz mit Spinne oben (seilt sich beim Scrollen ab), abends ein Mond.
 * Alles nur Bild (aria-hidden, keine Klicks) und CSS-Animation – nur transform/opacity, das rechnet der
 * Browser sparsam. Der Himmel liegt HINTER den Karten (z-index -1 in .app), deckt also nie Text oder Knöpfe zu.
 * Im Kochmodus nicht eingeblendet (App.tsx), bei „weniger Bewegung“ steht alles still (app.css).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { localDay } from '../../domain/dates';
import { isEvening, isHalloweenNight } from '../../domain/seasons';
import { useSpecial } from '../settings';
import { CELEBRATE } from '../celebrate';

/** Fledermaus mit zwei Flügeln, die einzeln vom Körper aus schlagen (CSS: .hw-wing), und orangen Augen */
function Bat() {
  return (
    <svg className="hw-bat" width="46" height="23" viewBox="0 0 60 30" aria-hidden="true">
      <path className="hw-wing hw-wing--l" d="M27 12C22 6 12 4 2 8c3 2 4 5 3 8 4-2 7-1 9 2 3-3 6-2 8 1 1-3 3-4 5-3z" />
      <path className="hw-wing hw-wing--r" d="M33 12c5-6 15-8 25-4-3 2-4 5-3 8-4-2-7-1-9 2-3-3-6-2-8 1-1-3-3-4-5-3z" />
      <ellipse cx="30" cy="16" rx="4" ry="6" />
      <circle cx="30" cy="9.5" r="3.6" />
      <path d="M27.6 7.4 27 3l2.4 3.3zM32.4 7.4 33 3l-2.4 3.3z" />
      <circle className="hw-bat__eye" cx="28.7" cy="9.4" r="0.75" />
      <circle className="hw-bat__eye" cx="31.3" cy="9.4" r="0.75" />
    </svg>
  );
}

/** Wehender Saum: zwei Wellenformen im Wechsel (SMIL – CSS kann Pfade in Safari nicht verformen) */
const HEM_A = 'M8 22C8 12.5 13.4 6 20 6C26.6 6 32 12.5 32 22L32 44c-2 3-4 3-6 0c-2-3-4-3-6 0c-2 3-4 3-6 0c-2-3-4-3-6 0Z';
const HEM_B = 'M8 22C8 12.5 13.4 6 20 6C26.6 6 32 12.5 32 22L32 44c-2-3-4-3-6 0c-2 3-4 3-6 0c-2-3-4-3-6 0c-2 3-4 3-6 0Z';

function ScaredGhost() {
  return (
    <svg className="hw-ghost" width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">
      <path className="hw-ghost__body" d={HEM_A}>
        <animate attributeName="d" dur="1.2s" repeatCount="indefinite" values={`${HEM_A};${HEM_B};${HEM_A}`} />
      </path>
      <g className="hw-ghost__calm">
        <ellipse className="hw-ink" cx="16" cy="21" rx="1.7" ry="2.3" /><ellipse className="hw-ink" cx="24" cy="21" rx="1.7" ry="2.3" />
        <path className="hw-line" d="M17.5 27q2.5 2.2 5 0" />
        <circle className="hw-blush" cx="12.5" cy="25.5" r="1.8" /><circle className="hw-blush" cx="27.5" cy="25.5" r="1.8" />
      </g>
      <g className="hw-ghost__shock">
        <path className="hw-arms" d="M8 27 3 19M32 27l5-8" />
        <circle className="hw-big" cx="15.5" cy="20" r="3.6" /><circle className="hw-big" cx="24.5" cy="20" r="3.6" />
        <circle className="hw-ink" cx="15.5" cy="20" r="1.5" /><circle className="hw-ink" cx="24.5" cy="20" r="1.5" />
        <ellipse className="hw-ink" cx="20" cy="29" rx="2.2" ry="3" />
      </g>
    </svg>
  );
}

/** Uhr für Abend/31.10. – jede Minute neu, damit der Mond auch bei offener App um 18 Uhr aufgeht */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function HalloweenDeko() {
  const halloween = useSpecial() === 'halloween';
  const now = useNow();
  const night = isHalloweenNight(localDay(now));
  const evening = isEvening(now);
  const corner = useRef<HTMLDivElement>(null);

  // Abend und 31.10. als Merkmal am Dokument – so reagieren auch Leiste (Laterne) und Koch-Geist (Hexenhut) per CSS
  useEffect(() => {
    if (!halloween) return;
    const root = document.documentElement.dataset;
    if (evening) root.hwEvening = ''; else delete root.hwEvening;
    if (night) root.hwNight = ''; else delete root.hwNight;
    return () => { delete root.hwEvening; delete root.hwNight; };
  }, [halloween, evening, night]);

  // Spinne seilt sich beim Runterscrollen ab (höchstens 60 px), beim Hochscrollen klettert sie zurück
  useEffect(() => {
    if (!halloween) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => corner.current?.style.setProperty('--drop', `${Math.min(window.scrollY * 0.25, 60)}px`));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [halloween]);

  if (!halloween) return null;
  return (
    <>
      <div className="hw-sky" aria-hidden="true">
        {/* Mond abends und am 31.10. – im Himmel hinter den Karten, damit er beim Scrollen keinen Text verdeckt */}
        {(evening || night) && (
          <svg className="hw-moon" width="26" height="26" viewBox="0 0 24 24">
            <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
          </svg>
        )}
        {/* zwei Bahnen mit Pausen – meist eine unterwegs, manchmal zwei (Julia: etwas weniger); am 31.10. eine dritte */}
        <span className="hw-flight hw-flight--1"><span className="hw-swoop"><span className="hw-tilt"><Bat /></span></span></span>
        <span className="hw-flight hw-flight--2"><span className="hw-swoop"><span className="hw-tilt"><Bat /></span></span></span>
        {night && <span className="hw-flight hw-flight--3"><span className="hw-swoop"><span className="hw-tilt"><Bat /></span></span></span>}
        {/* kleine Geschichte: Geist schwebt, Fledermaus taucht auf, Geist zittert, „!“, holt Schwung, flitzt davon */}
        <span className="hw-chase">
          <span className="hw-chase__ghost">
            <span className="hw-chase__bob">
              <span className="hw-bang">!</span>
              <ScaredGhost />
              <span className="hw-speed"><i /><i /><i /></span>
            </span>
          </span>
          <span className="hw-chase__bat"><span className="hw-chase__flip"><Bat /></span></span>
        </span>
      </div>
      <div className="hw-corner" ref={corner} aria-hidden="true">
        <CobwebCorner className="hw-corner__web" />
        {/* Faden und Spinne schwingen zusammen wie ein Pendel; der Faden wird beim Scrollen länger (--drop) */}
        <span className="hw-drop">
          <span className="hw-thread" />
          <svg className="hw-spider" width="16" height="14" viewBox="0 20 16 14">
            <path d="M5.6 24.5 2 22.5 M5.6 26.5 1.5 26.5 M5.8 28.4 2.5 31 M10.4 24.5 14 22.5 M10.4 26.5 14.5 26.5 M10.2 28.4 13.5 31" />
            <ellipse cx="8" cy="26" rx="2.6" ry="3.2" />
          </svg>
        </span>
      </div>
    </>
  );
}

/**
 * Nach „Gekocht“ flattert einmal ein kleiner Schwarm über den Bildschirm (Julia) – auch im Kochmodus,
 * dort ist man ja gerade fertig. Hört auf celebrate() (ui/celebrate.ts).
 */
export function CelebrationSwarm() {
  const halloween = useSpecial() === 'halloween';
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!halloween) return;
    const go = () => setRun((n) => n + 1);
    window.addEventListener(CELEBRATE, go);
    return () => window.removeEventListener(CELEBRATE, go);
  }, [halloween]);
  if (!halloween || !run) return null;
  return (
    <div className="hw-swarm" key={run} aria-hidden="true" onAnimationEnd={(e) => { if (e.target === e.currentTarget) setRun(0); }}>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="hw-swarm__bat" style={{ '--i': i } as CSSProperties}><Bat /></span>
      ))}
    </div>
  );
}

const SAYINGS = [
  'Buh! Schon was gekocht?',
  'Gespenstisch lecker, sag ich dir.',
  'Keine Angst, ich ess nur Reste.',
  'Pssst … ich rühr nur kurz um.',
  'Heute koch ich mit dir!',
  'Ich hätte Lust auf Kürbissuppe.',
];

/**
 * Koch-Geist auf der Startkachel: sitzt immer hinter der Kante, hält sich mit einer Hand fest, winkt mit der Kelle
 * (Julia: Variante B). Antippen → Spruch in der Sprechblase und ein Kichern. Am 31.10. mit Hexenhut (CSS).
 */
export function ChefGhost() {
  const [say, setSay] = useState<string>();
  const [giggle, setGiggle] = useState(0);
  const last = useRef(-1);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = () => {
    let i = Math.floor(Math.random() * SAYINGS.length);
    if (i === last.current) i = (i + 1) % SAYINGS.length; // nie zweimal derselbe Spruch
    last.current = i;
    setSay(SAYINGS[i]);
    setGiggle((n) => n + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSay(undefined), 3200);
  };
  return (
    <>
      <button type="button" className="chef" onClick={tap} aria-label="Koch-Geist – antippen für einen Spruch">
        {/* key: jedes Antippen startet das Kichern neu; beim ersten Zeichnen kichert er nicht */}
        <span className={`chef__giggle${giggle ? ' is-on' : ''}`} key={giggle}>
          <svg className="chef__svg" width="52" height="56" viewBox="0 0 52 56" aria-hidden="true">
            <g className="chef__hat chef__hat--cook">
              <path className="chef__cap" d="M15 15a4.5 4.5 0 0 1 2.6-8.3 5.6 5.6 0 0 1 10.6-1.2 4.5 4.5 0 0 1 5 8.5V19H15z" />
              <path className="chef__band" d="M15 16.2h18.2" />
            </g>
            <g className="chef__hat chef__hat--witch">
              <path className="chef__witch" d="M17 18.5 25.5 2.5q1.4-1.6 2 .4L31 18.5z" />
              <path className="chef__witch-band" d="M18.4 15.6h11.8" />
              <ellipse className="chef__witch" cx="24" cy="19" rx="13" ry="2.4" />
            </g>
            <path className="chef__body" d="M10 56V32c0-8 6.3-14 14-14s14 6 14 14v24z" />
            <g className="chef__eyes">
              <ellipse className="hw-ink" cx="20" cy="31" rx="1.7" ry="2.3" /><ellipse className="hw-ink" cx="28" cy="31" rx="1.7" ry="2.3" />
            </g>
            <path className="hw-line" d="M21.5 37q2.5 2.2 5 0" />
            <circle className="hw-blush" cx="16.5" cy="35" r="1.8" /><circle className="hw-blush" cx="31.5" cy="35" r="1.8" />
            <g className="chef__arm">
              <path className="chef__arm-line" d="M37 34c4 0 7-3 8-7" />
              <path className="chef__ladle" d="M45 27 48 16" />
              <ellipse className="chef__bowl" cx="48.5" cy="13.5" rx="2.6" ry="3.2" />
            </g>
          </svg>
        </span>
      </button>
      <span className="chef__hand" aria-hidden="true" />
      {say && <span className="chef__bubble" role="status" key={say}>{say}</span>}
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
