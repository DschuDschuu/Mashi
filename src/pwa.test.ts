import { describe, expect, it } from 'vitest';
import { buildIdFrom } from './pwa';

describe('Neue Version erkennen', () => {
  it('liest den Fingerabdruck aus der Startseite', () => {
    const html = '<script type="module" crossorigin src="./assets/index-CPmUfL2i.js"></script><link href="./assets/index-DJT2AAUw.css">';
    expect(buildIdFrom(html)).toBe('assets/index-CPmUfL2i.js');
  });

  it('gleich bei voller Adresse und bei relativem Pfad – sonst gäbe es falschen Alarm', () => {
    expect(buildIdFrom('https://dschudschuu.github.io/Mashi/assets/index-CPmUfL2i.js'))
      .toBe(buildIdFrom('<script src="./assets/index-CPmUfL2i.js">'));
  });

  it('ohne Programmcode (z. B. Fehlerseite) kein Fingerabdruck – dann keine Meldung', () => {
    expect(buildIdFrom('<html><body>404</body></html>')).toBeNull();
  });
});
