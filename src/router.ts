import { useSyncExternalStore } from 'react';

/**
 * Minimaler Hash-Router (#/rezept/abc?p=3).
 * Warum kein react-router: eine Abhängigkeit weniger, und Hash-URLs laufen auf
 * GitHub Pages ohne 404-Umleitung.
 */
export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

/** kaputte %-Folge (#/rezept/%E0%A4%A) → der Rohtext statt eines Absturzes beim Start (Code-Review #20) */
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** „#/rezept/abc?p=3“ zerlegen – ohne zu werfen, auch bei kaputten Adressen */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean).map(decode), query: new URLSearchParams(qs) };
}

const parse = () => parseHash(location.hash);

let current = parse();
const listeners = new Set<() => void>();
const update = () => {
  current = parse();
  listeners.forEach((l) => l());
};
// Zurück/Vor im Browser bzw. am Handy und Links mit #… kommen als hashchange
window.addEventListener('hashchange', update);

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}

/**
 * Wie viele Schritte wir selbst in den Verlauf gelegt haben – damit „Zurück“ nie aus der App führt.
 * Steht am Verlaufseintrag selbst (history.state): der Zurück-Knopf des Handys stellt sie so automatisch richtig.
 * Vorher zählte eine Variable nur navigate() hoch – nach dem Handy-Zurück stimmte sie nicht mehr, und „Zurück“ in
 * der App konnte aus der App hinausführen (Code-Review #20).
 */
const depthNow = (): number => {
  const d = (history.state as { mashiDepth?: unknown } | null)?.mashiDepth;
  return typeof d === 'number' ? d : 0;
};

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState({ mashiDepth: depthNow() }, '', `#${path}`);
  else history.pushState({ mashiDepth: depthNow() + 1 }, '', `#${path}`);
  update(); // pushState/replaceState lösen kein hashchange aus
}

/** Zurück – oder zur Rückfallseite, wenn die App direkt auf einer Unterseite geöffnet wurde. */
export function goBack(fallback = '/') {
  if (depthNow() > 0) history.back();
  else navigate(fallback, { replace: true });
}
