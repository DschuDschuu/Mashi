import type { CookedResult } from '../data/store';
import { toast } from './toast';

/** Rückmeldung nach „Gekocht“: was aus der Speisekammer genommen wurde – mit „Rückgängig“. */
export function cookedToast(result: CookedResult | null) {
  if (!result) return;
  // zurückgenommen – auch wenn nichts aus der Speisekammer genommen worden war
  if (result.restored) {
    toast(result.restored.length ? `Zurück in der Speisekammer: ${result.restored.join(', ')}` : 'Nicht mehr als gekocht gemerkt');
    return;
  }
  const parts = [
    result.used.length ? `Aus der Speisekammer: ${result.used.join(', ')}` : '',
    result.toCheck.length ? `Bitte prüfen: ${result.toCheck.join(', ')}` : '',
  ].filter(Boolean);
  const action = result.undo ? { label: 'Rückgängig', run: result.undo } : undefined;
  toast(parts.length ? parts.join(' · ') : 'Als gekocht gemerkt', action);
}
