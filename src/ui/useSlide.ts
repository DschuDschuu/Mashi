import { useRef } from 'react';

/**
 * Kleine Wisch-Animation beim Tab-Wechsel: Der neue Inhalt gleitet von der Seite herein,
 * aus der er kommt – rechts, wenn es weiter geht, links, wenn es zurück geht.
 * Gibt die CSS-Klasse zurück; der Inhalt braucht dazu `key` = Tab, damit er neu einsetzt.
 * Beim ersten Anzeigen: keine Animation. „Bewegung reduzieren“ schaltet sie im CSS ab.
 */
export function useSlide(index: number): string {
  const prev = useRef(index);
  const dir = useRef<'' | 'next' | 'prev'>('');
  if (index !== prev.current) {
    dir.current = index > prev.current ? 'next' : 'prev';
    prev.current = index;
  }
  return dir.current ? `slide slide--${dir.current}` : '';
}
