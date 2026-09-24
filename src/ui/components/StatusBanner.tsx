import { useSyncState } from '../../data/backend';
import { useSaveError } from '../../data/store';
import { navigate } from '../../router';
import { Icon } from './Icon';

/**
 * Zeigt Probleme beim Speichern oder Abgleichen – statt sie nur in die Konsole zu schreiben.
 * Offline ist kein Fehler: Mashi arbeitet weiter und gleicht später ab. Das gibt es nur als kleinen Hinweis.
 */
export function StatusBanner() {
  const saveError = useSaveError();
  const sync = useSyncState();

  if (saveError) {
    return (
      <div className="status-banner status-banner--error" role="alert">
        <Icon name="info" size={18} />
        <span>{saveError}</span>
      </div>
    );
  }
  if (sync.kind === 'fehler') {
    return (
      <button className="status-banner status-banner--error" role="alert" onClick={() => navigate('/mehr')}>
        <Icon name="info" size={18} />
        <span>Abgleich gestoppt: {sync.message} <u>Details</u></span>
      </button>
    );
  }
  if (sync.kind === 'offline') {
    return (
      <div className="status-pill" role="status">
        <span className="dot dot--yellow" /> Offline – wird später abgeglichen
      </div>
    );
  }
  return null;
}
