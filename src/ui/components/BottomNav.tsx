import { useState } from 'react';
import { navigate } from '../../router';
import { useSheet } from '../useSheet';
import { Icon, type IconName } from './Icon';

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Start', icon: 'home' },
  { path: '/kochbuch', label: 'Kochbuch', icon: 'book' },
  { path: '/plan', label: 'Plan', icon: 'calendar' },
  { path: '/speisekammer', label: 'Speisekammer', icon: 'archive' },
];

/**
 * Handy: Leiste unten. Tablet (ab 768 px): Seitenleiste links – gleiche Knöpfe, per CSS umgebaut.
 * onlyTablet: auf Unterseiten (Rezept, Formulare) zeigt das Handy keine Leiste, das Tablet schon.
 */
export function BottomNav({ active, onlyTablet = false }: { active?: string; onlyTablet?: boolean }) {
  const [sheet, setSheet] = useState(false);
  const tab = (t: (typeof TABS)[number]) => (
    <button key={t.path} className={`nav__item${active === t.path ? ' is-active' : ''}`} onClick={() => navigate(t.path)} aria-current={active === t.path ? 'page' : undefined}>
      <Icon name={t.icon} size={22} filled={false} />
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
          <Icon name="gear" size={22} />
          <span>Einstellungen</span>
        </button>
      </nav>
      {sheet && <CreateSheet onClose={() => setSheet(false)} />}
    </>
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
