import { navigate } from '../../router';
import { Icon } from './Icon';

/**
 * Zahnrad zu Synchronisation, Sicherung, Einstellungen und Archiv – dezent in der Farbe des Logos,
 * ohne Knopf-Rahmen, damit die Startseite ruhig bleibt. Auf dem Tablet steht es in der Seitenleiste.
 */
export function SettingsButton({ className = '' }: { className?: string }) {
  return (
    <button className={`settings-btn ${className}`.trim()} onClick={() => navigate('/mehr')} aria-label="Einstellungen">
      <Icon name="gear" size={20} />
    </button>
  );
}
