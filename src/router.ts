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

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}

/** Wie viele Schritte wir selbst in die History gelegt haben – damit „Zurück“ nie aus der App führt. */
let depth = 0;

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    history.replaceState(null, '', `#${path}`);
    current = parse();
    listeners.forEach((l) => l());
  } else {
    depth++;
    location.hash = path;
  }
}

/** Zurück – oder zur Rückfallseite, wenn die App direkt auf einer Unterseite geöffnet wurde. */
export function goBack(fallback = '/') {
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}
