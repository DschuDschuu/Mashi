import type { CookedResult } from '../data/store';
import { toast } from './toast';

/** Rückmeldung nach „Gekocht“: was aus der Speisekammer genommen wurde. */
export function cookedToast(result: CookedResult | null) {
  if (!result) return;
  const parts = [
    result.used.length ? `Aus der Speisekammer: ${result.used.join(', ')}` : '',
    result.toCheck.length ? `Bitte prüfen: ${result.toCheck.join(', ')}` : '',
  ].filter(Boolean);
  if (parts.length) toast(parts.join(' · '));
}
