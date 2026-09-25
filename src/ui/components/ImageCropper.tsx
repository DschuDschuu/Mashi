import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { useSheet } from '../useSheet';

/** Kartenformat: so erscheint das Foto im Kochbuch (die Karten schneiden höchstens noch ein paar Pixel ab). */
export const CARD_ASPECT = 4 / 3;
const MAX_ZOOM = 4;
/** Ausgabe: 800 px breit reicht fürs Handy und hält das Rezept-Dokument klein (es wird abgeglichen). */
const OUT_WIDTH = 800;

/**
 * Bildausschnitt wählen: fester Rahmen im Kartenformat, das Bild darunter verschieben (Finger/Maus/Pfeiltasten)
 * und zoomen (Regler, zwei Finger, Mausrad). Ergebnis: JPEG als Daten-URL.
 *
 * Intern merken wir uns die Bildmitte (in Bildpixeln) und den Zoom – nicht die Pixelposition im Rahmen.
 * So bleibt der Ausschnitt gleich, auch wenn sich die Rahmenbreite ändert (Drehen, Tablet).
 */
export function ImageCropper({ src, onDone, onCancel, aspect = CARD_ASPECT }: {
  src: Blob | string;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
  aspect?: number;
}) {
  const sheetRef = useSheet(onCancel);
  const frame = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameW, setFrameW] = useState(0);
  const [view, setView] = useState({ cx: 0, cy: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const el = new Image();
    // Nach dem Aufräumen (anderes Bild, Dialog zu) keine Meldungen mehr – sonst meldet das
    // abgebrochene Laden „Fehler“, weil seine URL schon widerrufen ist.
    let live = true;
    el.onload = () => { if (live) { setImg(el); setView({ cx: el.naturalWidth / 2, cy: el.naturalHeight / 2, zoom: 1 }); } };
    el.onerror = () => { if (live) setFailed(true); };
    el.src = url;
    return () => { live = false; if (typeof src !== 'string') URL.revokeObjectURL(url); };
  }, [src]);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const frameH = frameW / aspect;
  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  /** Zoom 1 = das Bild füllt den Rahmen gerade eben aus („cover“) */
  const cover = frameW ? Math.max(frameW / w, frameH / h) : 1;
  const scaleOf = (zoom: number) => cover * zoom;

  /** Mitte so begrenzen, dass nie ein leerer Rand im Rahmen entsteht */
  const clamp = (v: { cx: number; cy: number; zoom: number }) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const s = scaleOf(zoom);
    const hw = frameW / (2 * s);
    const hh = frameH / (2 * s);
    return { zoom, cx: Math.min(w - hw, Math.max(hw, v.cx)), cy: Math.min(h - hh, Math.max(hh, v.cy)) };
  };
  const v = frameW ? clamp(view) : view;
  const s = scaleOf(v.zoom);

  const pan = (dx: number, dy: number) => setView((p) => clamp({ ...p, cx: p.cx - dx / scaleOf(p.zoom), cy: p.cy - dy / scaleOf(p.zoom) }));
  /** Zoomen um einen Punkt im Rahmen (mx, my): der Bildpunkt darunter bleibt, wo er ist */
  const zoomAt = (zoom: number, mx = frameW / 2, my = frameH / 2) => setView((p) => {
    const cur = clamp(p);
    const s0 = scaleOf(cur.zoom);
    const px = cur.cx + (mx - frameW / 2) / s0;
    const py = cur.cy + (my - frameH / 2) / s0;
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const s1 = scaleOf(z);
    return clamp({ zoom: z, cx: px - (mx - frameW / 2) / s1, cy: py - (my - frameH / 2) / s1 });
  });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    try { frame.current?.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg – Ziehen geht trotzdem, solange er im Rahmen bleibt */ }
  };
  const onMove = (e: PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const next = local(e);
    if (map.size === 1) {
      pan(next.x - prev.x, next.y - prev.y);
    } else if (map.size === 2) {
      // Zwei Finger: Abstand ändert den Zoom, die Mitte zwischen den Fingern verschiebt mit
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(next.x - other.x, next.y - other.y);
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const m1 = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
      if (d0 > 0) setView((p) => {
        const cur = clamp(p);
        const z = Math.min(MAX_ZOOM, Math.max(1, cur.zoom * (d1 / d0)));
        const s0 = scaleOf(cur.zoom);
        const s1 = scaleOf(z);
        const px = cur.cx + (m0.x - frameW / 2) / s0;
        const py = cur.cy + (m0.y - frameH / 2) / s0;
        return clamp({ zoom: z, cx: px - (m1.x - frameW / 2) / s1, cy: py - (m1.y - frameH / 2) / s1 });
      });
    }
    map.set(e.pointerId, next);
  };
  const onUp = (e: PointerEvent) => { pointers.current.delete(e.pointerId); };
  const onWheel = (e: WheelEvent) => {
    const p = local(e);
    zoomAt(v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = 20;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); pan(...moves[e.key]); }
    if (e.key === '+' || e.key === '=') zoomAt(v.zoom * 1.1);
    if (e.key === '-') zoomAt(v.zoom / 1.1);
  };

  const apply = () => {
    if (!img || !frameW) return;
    const sw = frameW / s;
    const sh = frameH / s;
    const outW = Math.round(Math.min(OUT_WIDTH, sw)); // nicht künstlich vergrößern
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = Math.round(outW / aspect);
    canvas.getContext('2d')!.drawImage(img, v.cx - sw / 2, v.cy - sh / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    onDone(canvas.toDataURL('image/jpeg', 0.8));
  };

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet cropper" role="dialog" aria-modal="true" aria-label="Bildausschnitt wählen" onClick={(e) => e.stopPropagation()} ref={sheetRef}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">Ausschnitt wählen</h2>
        {failed ? <p className="error" role="alert">Dieses Bild lässt sich nicht öffnen. Versuch ein anderes (JPEG oder PNG).</p> : (
          <>
            <div ref={frame} className="cropper__frame" style={{ aspectRatio: String(aspect) }} tabIndex={0}
              aria-label="Bild verschieben: Pfeiltasten; zoomen: Plus und Minus"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} onKeyDown={onKey}>
              {img && frameW > 0 && (
                <img src={img.src} alt="" draggable={false} className="cropper__img"
                  style={{ width: w, height: h, transform: `translate(${frameW / 2 - v.cx * s}px, ${frameH / 2 - v.cy * s}px) scale(${s})` }} />
              )}
              <div className="cropper__grid" aria-hidden />
            </div>
            <label className="cropper__zoom">
              <span className="muted small">Zoom</span>
              <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={v.zoom} onChange={(e) => zoomAt(Number(e.target.value))} aria-label="Zoom" />
            </label>
            <p className="muted small">Bild mit dem Finger verschieben, mit zwei Fingern oder dem Regler zoomen. So erscheint es im Kochbuch.</p>
          </>
        )}
        <div className="cropper__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={!img || failed}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}
