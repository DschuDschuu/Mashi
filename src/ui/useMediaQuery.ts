import { useSyncExternalStore } from 'react';

/**
 * Ab dieser Breite gilt das Tablet-Layout. Muss zu den @media-Regeln in app.css passen
 * (dort als (min-width: 768px) geschrieben).
 */
export const TABLET_QUERY = '(min-width: 768px)';

/** Reagiert live auf Drehen des Geräts oder Ändern der Fenstergröße. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export const useIsTablet = () => useMediaQuery(TABLET_QUERY);
