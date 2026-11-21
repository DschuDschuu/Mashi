/**
 * Eingebettete Fotos (data-URL) – so speichert Mashi Fotos: als Text im Dokument, nie als Web-Adresse. Eine Adresse
 * würde bei jedem Anzeigen geladen, der Absender sähe deine IP und wann du Mashi nutzt (Code-Review #22).
 * Gemeinsam für Sicherungen (backup.ts) und die Fotos im Adventskalender (advent.ts).
 */

/** größtes Foto aus einer Datei (als data-URL, ~3 MB) – der Zuschnitt erzeugt deutlich kleinere */
export const MAX_IMAGE = 4_000_000;

export const isDataImage = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= MAX_IMAGE && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
