import { useState } from 'react';
import { setDoorPhoto, useAdventImage } from '../../data/adventStore';
import type { AdventCalendar } from '../../domain/advent';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { FileButton } from './Controls';
import { Icon } from './Icon';
import { CARD_ASPECT, ImageCropper } from './ImageCropper';

/**
 * „Fotos ergänzen“ (Julia: „Bilder nachträglich ergänzen“): alle Türchen mit Titel und Foto, je Foto wählen, Ausschnitt
 * festlegen (derselbe Zuschnitt wie bei Rezeptfotos, 4 : 3 wie oben im Türchen) oder entfernen. Geht jederzeit, auch vor
 * Dezember – ohne ein Türchen zu öffnen. Jede Änderung mit „Rückgängig“.
 */
export function AdventPhotosSheet({ cal, onClose }: { cal: AdventCalendar; onClose: () => void }) {
  const ref = useSheet(onClose);
  const [cropping, setCropping] = useState<{ day: number; src: Blob } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const apply = async (day: number, url: string | undefined) => {
    setBusy(day);
    try {
      const undo = await setDoorPhoto(day, url);
      if (undo) toast(url ? `Foto für Türchen ${day} gespeichert` : `Foto von Türchen ${day} entfernt`, { label: 'Rückgängig', run: undo });
    } catch (e) {
      console.error('Mashi: Foto für den Adventskalender nicht gespeichert', e);
      toast('Das Foto ließ sich nicht speichern – ist der Speicher voll?');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet sheet--tall advent-photos" role="dialog" aria-modal="true" aria-labelledby="advent-photos-title" onClick={(e) => e.stopPropagation()} ref={ref}>
          <div className="sheet__grip" />
          <h2 className="sheet__title" id="advent-photos-title">Fotos ergänzen</h2>
          <ul className="advent-photos__list">
            {cal.doors.map((d) => (
              <li key={d.day} className="advent-photos__row">
                <Thumb id={d.imageId} day={d.day} />
                <span className="advent-photos__text">
                  <small className="muted">Türchen {d.day}</small>
                  <strong>{d.content.title}</strong>
                </span>
                <span className="advent-photos__actions">
                  <FileButton className="btn btn--soft btn--sm" disabled={busy !== null} onFile={(file) => setCropping({ day: d.day, src: file })}>
                    {busy === d.day ? '…' : d.imageId ? 'Ändern' : 'Foto'}
                  </FileButton>
                  {d.imageId && (
                    <button type="button" className="iconbtn" aria-label={`Foto von Türchen ${d.day} entfernen`} disabled={busy !== null} onClick={() => apply(d.day, undefined)}>
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {cropping && (
        <ImageCropper src={cropping.src} aspect={CARD_ASPECT} onCancel={() => setCropping(null)}
          onDone={({ url }) => {
            const { day } = cropping;
            setCropping(null);
            void apply(day, url);
          }} />
      )}
    </>
  );
}

/** kleines Vorschaubild – lädt das Foto erst hier; ohne Foto die Nummer */
function Thumb({ id, day }: { id?: string; day: number }) {
  const url = useAdventImage(id);
  return url
    ? <img className="advent-photos__thumb" src={url} alt="" />
    : <span className="advent-photos__thumb is-empty" aria-hidden="true">{day}</span>;
}
