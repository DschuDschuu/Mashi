/**
 * Service Worker nur im fertigen Build – im Entwicklungsmodus würde er
 * alte Dateien ausliefern und jede Änderung verstecken.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // Beim allerersten Besuch lädt die Seite ihre Dateien, BEVOR der Service Worker
      // aktiv ist. Wir sagen ihm deshalb, was schon geladen wurde – damit auch der
      // allererste Start danach offline funktioniert.
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => new URL(u).origin === location.origin);
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'cache-urls', urls: [location.href, ...urls] });
    } catch (e) {
      console.warn('Mashi: Service Worker nicht registriert', e);
    }
  });
}
