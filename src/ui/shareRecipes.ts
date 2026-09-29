import { createBackup } from '../domain/backup';
import { currentContent } from '../domain/recipe';
import type { Recipe } from '../domain/types';

/** „Omas Lasagne“ → „omas-lasagne“ – für einen Dateinamen, den jedes Handy mag */
const slug = (s: string) => s.toLocaleLowerCase('de-DE')
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'rezept';

export type ShareResult = 'geteilt' | 'heruntergeladen' | 'abgebrochen';

/**
 * Rezepte weitergeben – komplett (Versionen, Bewertungen, Notizen, Foto) als Mashi-Datei übers
 * Teilen-Menü des Handys (WhatsApp, Mail …). Beim anderen: Einstellungen → Sicherung → Einspielen,
 * seine eigenen Rezepte bleiben dabei erhalten (wird zusammengeführt).
 * Chrome auf Android teilt keine .json-Dateien → dieselbe Datei als Text (.txt). Kann das Gerät gar
 * keine Dateien teilen (Laptop), wird sie heruntergeladen.
 */
export async function shareRecipes(recipes: readonly Recipe[]): Promise<ShareResult> {
  const json = JSON.stringify(createBackup([...recipes]), null, 2);
  const one = recipes.length === 1 ? currentContent(recipes[0]).title : undefined;
  const base = one ? `mashi-rezept-${slug(one)}` : `mashi-rezepte-${new Date().toISOString().slice(0, 10)}`;
  const title = one ? `„${one}“ aus Mashi` : `${recipes.length} Rezepte aus Mashi`;
  const text = `${title}. So ${one ? 'kommt es' : 'kommen sie'} in dein Mashi: Einstellungen → Sicherung → Einspielen → diese Datei wählen.`;

  const files = [new File([json], `${base}.json`, { type: 'application/json' }), new File([json], `${base}.txt`, { type: 'text/plain' })];
  const file = files.find((f) => navigator.canShare?.({ files: [f] }));
  if (file) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'geteilt';
    } catch (e) {
      // selbst abgebrochen → nichts tun; sonst (Fehler beim Teilen) unten herunterladen
      if ((e as DOMException).name === 'AbortError') return 'abgebrochen';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `${base}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'heruntergeladen';
}

/** Rückmeldung nach dem Teilen – beim Herunterladen, wie es weitergeht */
export const shareMessage = (r: ShareResult) =>
  r === 'heruntergeladen' ? 'Datei gespeichert – schick sie z. B. per WhatsApp; eingespielt wird unter Einstellungen → Sicherung' : undefined;
