import { useState } from 'react';
import { navigate } from '../../router';
import { useSheet } from '../useSheet';
import { Icon, type IconName } from './Icon';

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
  const tab = (t: (typeof TABS)[number]) => (
    <button key={t.path} className={`nav__item${active === t.path ? ' is-active' : ''}`} onClick={() => navigate(t.path)} aria-current={active === t.path ? 'page' : undefined}>
      <NavIcon name={t.icon} />
      <span>{t.label}</span>
    </button>
  );
  return (
    <>
      <nav className={`nav${onlyTablet ? ' nav--tablet-only' : ''}`} aria-label="Hauptnavigation">
        <span className="nav__logo" aria-hidden="true">Mashi</span>
        {TABS.slice(0, 2).map(tab)}
        <button className="nav__plus" onClick={() => setSheet(true)} aria-label="Neu: Rezept, Kassenbon oder Vorrat" aria-haspopup="dialog">
          <Icon name="plus" size={26} />
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
 */
function NavIcon({ name }: { name: IconName }) {
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
];

export function CreateSheet({ onClose }: { onClose: () => void }) {
  const ref = useSheet(onClose);
  const option = (o: Option) => (
    <button key={o.path} className={`option tint-${o.tint}`} onClick={() => { onClose(); navigate(o.path); }}>
      <span className="option__icon"><Icon name={o.icon} size={24} /></span>
      <span className="option__text">
        <strong>{o.title}</strong>
        <small>{o.text}</small>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Neu" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Neues Rezept</h2>
        <div className="sheet__options">{OPTIONS.map(option)}</div>
        <h2 className="sheet__title sheet__title--sub">Speisekammer</h2>
        <div className="sheet__options">{PANTRY_OPTIONS.map(option)}</div>
      </div>
    </div>
  );
}
