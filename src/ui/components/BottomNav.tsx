import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../router';
import { useSheet } from '../useSheet';
import { Icon, type IconName } from './Icon';
import { useSpecial } from '../settings';

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Start', icon: 'home' },
  { path: '/kochbuch', label: 'Kochbuch', icon: 'book' },
  // Speisekammer vor Plan: das lange Wort nicht ganz am Rand, wo es in die Rundung des Displays ragt
  { path: '/speisekammer', label: 'Speisekammer', icon: 'archive' },
  { path: '/plan', label: 'Plan', icon: 'calendar' },
];

/**
 * Handy: Leiste unten. Tablet (ab 768 px): Seitenleiste links – gleiche Knöpfe, per CSS umgebaut.
 * onlyTablet: auf Unterseiten (Rezept, Formulare) zeigt das Handy keine Leiste, das Tablet schon.
 */
export function BottomNav({ active, onlyTablet = false }: { active?: string; onlyTablet?: boolean }) {
  const [sheet, setSheet] = useState(false);
  const halloween = useSpecial() === 'halloween';
  // Halloween: beim Reiterwechsel steigt kurz ein kleiner Geist aus dem neuen Grabstein (Julia) – nicht beim ersten Zeichnen
  const [rise, setRise] = useState(0);
  const before = useRef(active);
  useEffect(() => {
    if (before.current !== active && active) setRise((n) => n + 1);
    before.current = active;
  }, [active]);
  const tab = (t: (typeof TABS)[number]) => (
    <button key={t.path} className={`nav__item${active === t.path ? ' is-active' : ''}`} onClick={() => navigate(t.path)} aria-current={active === t.path ? 'page' : undefined}>
      <NavIcon name={t.icon} stone={halloween} rise={halloween && active === t.path ? rise : 0} />
      <span>{t.label}</span>
    </button>
  );
  return (
    <>
      <nav className={`nav${onlyTablet ? ' nav--tablet-only' : ''}`} aria-label="Hauptnavigation">
        <span className="nav__logo" aria-hidden="true">Mashi</span>
        {TABS.slice(0, 2).map(tab)}
        <button className="nav__plus" onClick={() => setSheet(true)} aria-label="Neu: Rezept, Kassenbon oder Vorrat" aria-haspopup="dialog">
          {/* Halloween: der runde Knopf wird zum Kürbis mit Stiel und Rippen */}
          {/* abends glimmt er von innen wie eine Laterne (CSS: :root[data-hw-evening]) */}
          {halloween && <span className="nav__glow" aria-hidden="true" />}
          {halloween && (
            <svg className="nav__pumpkin" viewBox="0 0 50 50" aria-hidden="true">
              <path className="nav__pumpkin-body" d="M25 13c-3.4-2-8.6-2.4-12.6.3C7 16.8 5.2 22.6 5.8 27.6c.8 7.2 5.6 11.8 11.4 11.6 2.9 0 5.3-1 7.8-1s4.9 1 7.8 1c5.8.2 10.6-4.4 11.4-11.6.6-5-1.2-10.8-6.6-14.3-4-2.7-9.2-2.3-12.6-.3z" />
              <path className="nav__pumpkin-ribs" d="M19 14c-2.6 3.4-3.8 7.8-3.8 12.6s1.2 9 3.4 11.6M31 14c2.6 3.4 3.8 7.8 3.8 12.6s-1.2 9-3.4 11.6" />
              <path className="nav__pumpkin-stem" d="M25 13V8.6c0-1.8 1-3.4 2.8-4.2" />
            </svg>
          )}
          <Icon name="plus" size={halloween ? 20 : 26} className="nav__plus-icon" />
        </button>
        {TABS.slice(2).map(tab)}
        {/* nur Tablet (per CSS): Einstellungen unten in der Seitenleiste */}
        <button className={`nav__item nav__settings${active === '/mehr' ? ' is-active' : ''}`} onClick={() => navigate('/mehr')} aria-label="Einstellungen">
          <NavIcon name="gear" />
          <span>Einstellungen</span>
        </button>
      </nav>
      {sheet && <CreateSheet onClose={() => setSheet(false)} />}
    </>
  );
}

/**
 * Icon eines Reiters – beim aktiven liegt ein Pinselstrich in der Akzentfarbe dahinter (per CSS eingeblendet).
 * Die Form: kräftiger Zug, beide Enden ausgefranst, ein paar Borstenspuren.
 * Halloween: statt des Pinsels steht jedes Icon auf einem grauen Grabstein, der aktive wird orange (Julia).
 */
function NavIcon({ name, stone = false, rise = 0 }: { name: IconName; stone?: boolean; rise?: number }) {
  if (stone) {
    return (
      <span className="nav__icon nav__icon--stone">
        {rise > 0 && (
          <svg className="nav__rise" key={rise} width="22" height="27" viewBox="0 0 24 30" aria-hidden="true">
            <path d="M4 26V12a8 8 0 0 1 16 0v14l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2z" />
            <circle cx="9.5" cy="12.5" r="1.3" /><circle cx="14.5" cy="12.5" r="1.3" />
          </svg>
        )}
        <svg className="nav__stone" viewBox="0 0 40 42" aria-hidden="true">
          <path d="M5 42V17C5 8.2 11.7 2 20 2s15 6.2 15 15v25z" />
          <path className="nav__stone-crack" d="M27 9l-2.4 3.4 1.6 1.4-1.8 3" />
        </svg>
        <Icon name={name} size={19} className="nav__glyph" />
      </span>
    );
  }
  return (
    <span className="nav__icon">
      <svg className="nav__brush" viewBox="0 0 48 26" aria-hidden="true">
        <path d="M7.5 8.6C13.5 6.6 21 6 28.5 5.7c6.6-.3 11.4-.8 15 .4 2.2.7 2 2.3.2 2.9 2.4.8 2.5 2.6.3 3.3 2.4.9 2.1 2.9-.8 3.6-5.8 1.4-13.6 2.1-21.4 2.9-6 .6-11.2 1.5-15 1-1.9-.2-2-1.5-.6-2.2-2.4-.6-2.4-2.4-.3-3-2.4-.8-2.2-2.8 0-3.3-1.4-.9-.7-2.2 1.6-2.7z" />
        <g className="nav__bristles">
          <path d="M34.5 17.9c3.4-.5 6.9-1.2 10.2-2.3" strokeWidth="1.3" />
          <path d="M31.5 19.8c3.6-.4 7.3-1.1 10.8-2" strokeWidth="0.9" opacity="0.8" />
          <path d="M40.8 4.4c1.9-.3 3.8-.2 5.2.3" strokeWidth="1" opacity="0.8" />
          <path d="M13.5 6.1c-3.4.3-6.8 1-9.8 2.1" strokeWidth="1.3" />
          <path d="M16.5 4.4c-3.6.2-7.2.8-10.6 1.8" strokeWidth="0.9" opacity="0.8" />
          <path d="M7.4 20.9c-1.9.2-3.7 0-5.1-.5" strokeWidth="1" opacity="0.8" />
        </g>
      </svg>
      <Icon name={name} size={22} className="nav__glyph" />
    </span>
  );
}

/** text = nur der Tooltip – die Zeilen sind flach (Julia: brauchten zu viel Platz), der Titel sagt es schon */
type Option = { path: string; icon: IconName; title: string; text: string; tint: string };
const OPTIONS: Option[] = [
  { path: '/neu/ki', icon: 'sparkles', title: 'Mit KI erstellen', text: 'Aus deinen Zutaten und Wünschen wird eine Idee zum Ausprobieren.', tint: 'mint' },
  { path: '/neu/manuell', icon: 'pencil', title: 'Eigenes Rezept', text: 'Ein Rezept, das du schon kennst, selbst eintragen.', tint: 'rose' },
  { path: '/neu/import', icon: 'camera', title: 'Importieren', text: 'Ein kopiertes Rezept von Webseite, Chat oder Notiz übernehmen.', tint: 'sky' },
];
/** Nach dem Einkauf – das zweithäufigste „Neu“ */
const PANTRY_OPTIONS: Option[] = [
  { path: '/speisekammer/bon', icon: 'clipboard', title: 'Kassenbon importieren', text: 'Screenshot aus Lidl Plus – Mashi trägt alles ein.', tint: 'butter' },
  { path: '/speisekammer?neu=1', icon: 'archive', title: 'Vorrat eintragen', text: 'Etwas von Hand in die Speisekammer legen.', tint: 'sage' },
  // das Feld oben auf der Liste ist gleich bereit (siehe ShoppingScreen)
  { path: '/einkauf?neu=1', icon: 'cart', title: 'Zur Einkaufsliste hinzufügen', text: 'Etwas aufschreiben, das du besorgen willst.', tint: 'peach' },
];

export function CreateSheet({ onClose }: { onClose: () => void }) {
  const ref = useSheet(onClose);
  const option = (o: Option) => (
    <button key={o.path} className={`option tint-${o.tint}`} title={o.text} onClick={() => { onClose(); navigate(o.path); }}>
      <span className="option__icon"><Icon name={o.icon} size={20} /></span>
      <span className="option__text"><strong>{o.title}</strong></span>
      <Icon name="chevron" size={16} />
    </button>
  );
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Neu" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Neues Rezept</h2>
        <div className="sheet__options">{OPTIONS.map(option)}</div>
        <h2 className="sheet__title sheet__title--sub">Speisekammer & Einkauf</h2>
        <div className="sheet__options">{PANTRY_OPTIONS.map(option)}</div>
      </div>
    </div>
  );
}
