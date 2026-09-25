import { Icon } from './Icon';

/**
 * Oben rechts im Bild: dieses Gericht braucht etwas auf, das bald weg muss.
 * Groß (Startseite) mit Text, klein (Wochenplan) nur als Uhr-Punkt.
 */
export function UseUpBadge({ names, compact = false }: { names: string[]; compact?: boolean }) {
  if (!names.length) return null;
  const label = `Braucht auf, was bald weg muss: ${names.join(', ')}`;
  return (
    <span className={`useup-badge${compact ? ' useup-badge--dot' : ''}`} role="img" aria-label={label} title={label}>
      <Icon name="clock" size={compact ? 13 : 14} />
      {!compact && <span>Bald verbrauchen</span>}
    </span>
  );
}
