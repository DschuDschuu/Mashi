import { useEffect, useRef, useState } from 'react';
import { isValidEan } from '../../domain/nutrition/openFoodFacts';
import { Icon } from './Icon';

/** Die eingebaute Barcode-Erkennung (Chrome/Android) – in TypeScript noch nicht beschrieben. */
interface Detector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorClass = new (opts: { formats: string[] }) => Detector;
const DetectorImpl = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;

/**
 * Barcode scannen mit der Kamera. Kann das Gerät keine Barcodes lesen, tippst du die Nummer
 * unter dem Strichcode ab – das Feld ist immer da. Die Prüfziffer fängt Lese- und Tippfehler ab.
 */
export function BarcodeScanner({ onCode, onClose }: { onCode: (ean: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>(DetectorImpl ? 'Kamera wird gestartet …' : 'Dieses Gerät kann Barcodes nicht direkt lesen – tippe die Nummer unter dem Strichcode ab.');
  const [typed, setTyped] = useState('');
  // Immer die aktuelle Rückmeldung nutzen, ohne die Kamera bei jedem Neuzeichnen neu zu starten
  const report = useRef(onCode);
  report.current = onCode;

  useEffect(() => {
    if (!DetectorImpl) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done || !video.current) {
          // Schon wieder geschlossen, während die Kamera anging – sonst bliebe sie an
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('Halte den Strichcode ins Bild.');
        const detector = new DetectorImpl({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        timer = setInterval(async () => {
          if (!video.current || done) return;
          const found = (await detector.detect(video.current).catch(() => [])).map((b) => b.rawValue).find(isValidEan);
          if (found) {
            done = true;
            report.current(found);
          }
        }, 250);
      } catch {
        setStatus('Die Kamera ließ sich nicht öffnen (Zugriff erlaubt?). Du kannst die Nummer auch abtippen.');
      }
    })();
    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const code = typed.replace(/\D/g, '');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet scanner" role="dialog" aria-modal="true" aria-label="Barcode scannen" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Barcode scannen</h2>
        {DetectorImpl && <video ref={video} className="scanner__video" muted playsInline />}
        <p className="small muted">{status}</p>
        <div className="scanner__manual">
          <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="z. B. 4056489…" aria-label="Barcode-Nummer" />
          <button className="btn btn--primary btn--sm" disabled={!isValidEan(code)} onClick={() => onCode(code)}>Übernehmen</button>
        </div>
        {code.length >= 8 && !isValidEan(code) && <p className="small error">Die Nummer stimmt nicht – bitte noch einmal prüfen.</p>}
        <button className="btn btn--ghost btn--block" onClick={onClose}><Icon name="close" size={18} /> Abbrechen</button>
      </div>
    </div>
  );
}
