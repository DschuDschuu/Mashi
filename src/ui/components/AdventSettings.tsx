import { useRef, useState } from 'react';
import { fillCalendar, loadDoorImages, useAdvent } from '../../data/adventStore';
import { ADVENT_DEMO } from '../../data/adventDemo';
import { isDemo } from '../../data/store';
import { exportAdvent, needsFilling, parseAdventJson, type AdventDoor, type AdventImport } from '../../domain/advent';
import { ask } from '../confirm';
import { shareJsonFile } from '../shareRecipes';
import { toast } from '../toast';
import { AdventPhotosSheet } from './AdventPhotos';
import { Icon } from './Icon';
import { shrinkPhoto } from './ImageCropper';

/**
 * Adventskalender in den Einstellungen (Julia: „Hochladen und Ändern nicht beim Adventskalender“): befüllen (Julias
 * JSON-Datei, Vorschau mit Fehlern/Hinweisen, dann übernehmen – mit Rückgängig), neu befüllen, Fotos ergänzen, Format.
 * Die Adventsseite selbst zeigt nur noch die Türchen.
 */
export function AdventSettings() {
  const cal = useAdvent();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<(AdventImport & { fileName: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  // „Fotos ergänzen“ (Julia): alle Türchen in einer Liste, je Foto wählen oder entfernen
  const [photos, setPhotos] = useState(false);
  if (!cal) return null;
  const filled = cal.doors.length > 0;
  const stale = needsFilling(cal, new Date());

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = ''; // dieselbe Datei nach dem Verbessern erneut wählbar
    if (!file) return;
    setResult({ ...parseAdventJson(await file.text()), fileName: file.name });
  };

  const apply = async (doors: AdventDoor[], images: Record<number, string>) => {
    if (filled && !stale && !(await ask({
      title: 'Kalender neu befüllen?',
      text: 'Die Türchen bekommen die Rezepte aus der neuen Datei. Was du schon geöffnet oder gespeichert hast, bleibt.',
      confirm: 'Neu befüllen',
    }))) return;
    setBusy(true);
    try {
      const { undo, photosFailed } = await fillCalendar(doors, await shrinkAll(images));
      setResult(null);
      toast(`Adventskalender mit ${doors.length} Türchen befüllt${photosFailed ? ' – die Fotos passten nicht in den Speicher' : ''}`, { label: 'Rückgängig', run: undo });
    } finally {
      setBusy(false);
    }
  };
  const photoCount = result ? Object.keys(result.images).length : 0;

  // Export (Julia: „fertig machen und dann kopieren“): Rezepte + Fotos im Dateiformat, ohne Fortschritt – übers
  // Teilen-Menü, am Laptop als Download. Lesbar eingerückt, falls du die Datei noch von Hand bearbeitest.
  const exportFile = async () => {
    setBusy(true);
    try {
      const json = JSON.stringify(exportAdvent(cal, await loadDoorImages()), null, 2);
      const year = cal.year || new Date().getFullYear();
      const res = await shareJsonFile(json, `mashi-adventskalender-${year}`, `Adventskalender ${year} aus Mashi`,
        'So kommt er in dein Mashi: Einstellungen → Adventskalender → „Kalender befüllen …“ → diese Datei wählen.');
      if (res === 'geteilt') toast('Adventskalender geteilt');
      else if (res === 'heruntergeladen') toast('Datei gespeichert – weiterschicken z. B. per WhatsApp; eingespielt wird unter Einstellungen → Adventskalender');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel advent-fill" id="adventskalender">
      <p className="small muted">
        {!filled
          ? 'Spiel eine Datei mit 24 Rezepten ein – eins pro Türchen. Vom 1. bis 24. Dezember geht jeden Tag eins auf; ins Kochbuch kommt ein Rezept erst, wenn du es am Türchen speicherst.'
          : stale
            ? 'Der Kalender ist vom letzten Jahr – spiel die Rezepte für diesen Dezember ein.'
            : `${cal.doors.length} Türchen befüllt. Eine neue Datei ersetzt die Rezepte – Geöffnetes und Gespeichertes bleibt.`}
      </p>
      <div className="advent-fill__buttons">
        <button type="button" className={`btn ${filled && !stale ? 'btn--ghost' : 'btn--primary'}`} disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="file" size={18} /> {filled ? 'Neu befüllen …' : 'Kalender befüllen …'}
        </button>
        {isDemo() && !filled && (
          <button type="button" className="btn btn--soft" disabled={busy} onClick={() => {
            const demo = parseAdventJson(JSON.stringify(ADVENT_DEMO));
            void apply(demo.doors, demo.images);
          }}>
            Mit Beispielrezepten
          </button>
        )}
        {filled && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPhotos(true)}>
            <Icon name="image" size={18} /> Fotos ergänzen …
          </button>
        )}
        {filled && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={exportFile}>
            <Icon name="share" size={18} /> Exportieren …
          </button>
        )}
      </div>
      {photos && <AdventPhotosSheet cal={cal} onClose={() => setPhotos(false)} />}
      {/* je nach Handy kommt die Datei als .json oder .txt an */}
      <input ref={input} type="file" accept="application/json,.json,text/plain,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {result && (result.errors.length ? (
        <div className="error" role="alert">
          <strong>{result.fileName}: so geht es noch nicht</strong>
          <ul className="advent-fill__list">
            {result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            {result.errors.length > 8 && <li>… und {result.errors.length - 8} weitere</li>}
          </ul>
        </div>
      ) : (
        <div className="backup-preview">
          <p><strong>{result.fileName}</strong> · {result.doors.length} Rezepte gefunden{photoCount > 0 && `, ${photoCount} mit Foto`}</p>
          {result.warnings.length > 0 && (
            <ul className="advent-fill__list small muted">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => apply(result.doors, result.images)}>
              {busy ? (photoCount ? 'Fotos werden verkleinert …' : 'Einen Moment …') : 'Befüllen'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setResult(null)}>Abbrechen</button>
          </div>
        </div>
      ))}

      <details className="advent-fill__format small">
        <summary>Wie muss die Datei aussehen?</summary>
        <p>Eine JSON-Liste mit einem Eintrag je Tag: <code>tag</code> (1–24), <code>titel</code>, <code>portionen</code>,
          <code> zutaten</code> (je <code>name</code>, <code>menge</code>, <code>einheit</code>) und <code>schritte</code> (Texte).
          Dazu nach Wunsch <code>beschreibung</code>, <code>vorbereitung</code>, <code>backzeit</code> (Minuten), <code>tipp</code> und
          <code> bild</code> (Foto als <code>data:image/jpeg;base64,…</code>, bis 4 MB – keine Links).</p>
        <p>Einheiten wie in Mashi: g, kg, ml, l, EL, TL, Prise, Stück, Zehe, Dose, Glas, Bund, Handvoll, cm, Portion.</p>
      </details>
    </div>
  );
}

/** Fotos aus der Datei auf 800 px (lange Seite) verkleinern – wie eigene Fotos; ein kaputtes fällt still weg */
async function shrinkAll(images: Record<number, string>): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const [day, url] of Object.entries(images)) {
    const small = await shrinkPhoto(url);
    if (small) out[Number(day)] = small;
  }
  return out;
}
