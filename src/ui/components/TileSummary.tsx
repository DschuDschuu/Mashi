import { Icon, type IconName } from './Icon';

/**
 * Kopf einer aufklappbaren Kachel – sieht aus wie die Zeile „Meine Produkte“:
 * Symbol, Titel, kurze Unterzeile, Pfeil (dreht sich beim Öffnen).
 */
/** @param alert z. B. „enthält etwas, das bald weg muss“ – zeigt eine rote Uhr */
export function TileSummary({ icon, title, text, alert }: { icon: IconName; title: string; text: string; alert?: string }) {
  return (
    <summary className="fold__head">
      <Icon name={icon} size={20} />
      <span className="fold__text">
        <strong>{title}</strong>
        <small className="muted">{text}</small>
      </span>
      {alert && <span className="fold__alert" role="img" aria-label={alert} title={alert}><Icon name="clock" size={18} /></span>}
      <Icon name="chevron" size={18} className="fold__chevron" />
    </summary>
  );
}
