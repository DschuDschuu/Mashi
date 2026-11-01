import { useEffect, useRef } from 'react';

/**
 * Weit oder schnell genug nach unten gezogen? (Julia: „das Panel, das von unten rausfährt, soll nach unten wegziehbar
 * sein“) – ab 80 px, oder ein kurzer schneller Wisch ab 40 px; sonst federt es zurück.
 */
export const dragCloses = (dy: number, ms: number): boolean => dy > 80 || (dy > 40 && ms < 250);

/** wo ein Ziehen nicht das Blatt meint: Felder – und was selbst gezogen wird (Bildausschnitt, Preis-Diagramm: data-nodrag) */
const isField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"], [data-nodrag]');

/**
 * Nach unten wegziehen: mit dem Finger überall im Blatt, solange es ganz oben steht (sonst scrollt es erst seinen
 * Inhalt), mit der Maus am Griff. Schließt wie Escape oder ein Tipp daneben – nichts wird gespeichert.
 */
function dragToClose(el: HTMLElement, close: () => void): () => void {
  let y0 = 0, x0 = 0, t0 = 0, dy = 0, dragging = false, armed = false;
  const move = (y: number) => { el.style.transition = 'none'; el.style.transform = `translateY(${Math.max(0, y)}px)`; };
  const finish = () => {
    if (!dragging) { armed = false; return; }
    dragging = false; armed = false;
    if (dragCloses(dy, Date.now() - t0)) { close(); return; }
    // zurückfedern
    el.style.transition = 'transform 0.18s ease-out';
    el.style.transform = '';
  };
  const start = (x: number, y: number) => { x0 = x; y0 = y; t0 = Date.now(); dy = 0; armed = el.scrollTop <= 0; };
  const onTouchStart = (e: TouchEvent) => { if (!isField(e.target)) start(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchMove = (e: TouchEvent) => {
    if (!armed) return;
    dy = e.touches[0].clientY - y0;
    const dx = e.touches[0].clientX - x0;
    // erst entscheiden, wenn klar ist: nach unten, nicht quer (Karussell) – und das Blatt steht ganz oben
    if (!dragging) {
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) { if (Math.abs(dx) > 8 || dy < -8) armed = false; return; }
      if (dy < 8) return;
      dragging = true;
    }
    e.preventDefault(); // nicht die Seite dahinter ziehen
    move(dy);
  };
  // Maus: nur am Griff (sonst wäre jedes Markieren ein Ziehen)
  const grip = el.querySelector<HTMLElement>('.sheet__grip');
  const onMouseDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    start(e.clientX, e.clientY);
    dragging = true;
    const onMove = (m: PointerEvent) => { dy = m.clientY - y0; move(dy); };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); finish(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', finish);
  el.addEventListener('touchcancel', finish);
  grip?.addEventListener('pointerdown', onMouseDown);
  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', finish);
    el.removeEventListener('touchcancel', finish);
    grip?.removeEventListener('pointerdown', onMouseDown);
  };
}

/**
 * Für Blätter und Dialoge: Escape schließt, der Fokus springt beim Öffnen hinein (auf das erste
 * Bedienelement) und beim Schließen zurück auf den Knopf, der es geöffnet hat. Tab bleibt im Blatt.
 * Blätter (mit Griff, .sheet__grip) lassen sich nach unten wegziehen (dragToClose).
 */
export function useSheet<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((e) => !e.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const all = focusable();
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    // nur Blätter, die von unten kommen (mit Griff) – Dialoge in der Mitte nicht
    const el = ref.current;
    const stopDrag = el?.querySelector('.sheet__grip') ? dragToClose(el, () => close.current()) : undefined;
    return () => {
      window.removeEventListener('keydown', onKey);
      stopDrag?.();
      opener?.focus?.();
    };
  }, []);
  return ref;
}
