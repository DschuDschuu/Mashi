import { STATUS_INFO } from '../../domain/catalog';
import type { RecipeStatus } from '../../domain/types';
import { STATUS_ICONS } from '../catalogIcons';
import { Icon } from './Icon';

export function StatusBadge({ status, withIcon = false }: { status: RecipeStatus; withIcon?: boolean }) {
  const s = STATUS_INFO[status];
  return (
    <span className={`badge tint-${s.tint}`}>
      {withIcon && <Icon name={STATUS_ICONS[status]} size={13} />}
      {s.label}
    </span>
  );
}
