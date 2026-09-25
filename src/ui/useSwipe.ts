import { useRef, type TouchEvent } from 'react';

/** Ab dieser Strecke (px) zählt eine Bewegung als Wischen */
const MIN_DISTANCE = 60;

/**
 * Wischen nach links/rechts erkennen – nur, wenn die Bewegung deutlich waagerecht ist,
 * damit normales Scrollen nach oben/unten nicht versehentlich den Tab wechselt.
 * Beginnt die Berührung in einem Eingabefeld (z. B. Notizen), passiert nichts.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      start.current = target.closest('input, textarea, select, [contenteditable]') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
