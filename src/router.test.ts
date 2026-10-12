import { describe, expect, it, vi } from 'vitest';

// Der Router liest beim Laden window/location – in den Tests (ohne Browser) nachgestellt
vi.stubGlobal('window', { addEventListener: () => undefined });
vi.stubGlobal('location', { hash: '#/rezept/%E0%A4%A' });
const { parseHash } = await import('./router');

describe('Router (Code-Review #20)', () => {
  it('kaputte %-Folge: kein Absturz beim Start, der Rohtext bleibt', () => {
    expect(parseHash('#/rezept/%E0%A4%A').segments).toEqual(['rezept', '%E0%A4%A']);
  });

  it('normale Adressen wie bisher – Umlaute dekodiert, Abfrage getrennt', () => {
    const r = parseHash('#/preise/lebensmittel/H%C3%A4hnchen?t=H%C3%A4hnchen');
    expect(r.segments).toEqual(['preise', 'lebensmittel', 'Hähnchen']);
    expect(r.query.get('t')).toBe('Hähnchen');
    expect(parseHash('').path).toBe('/');
  });
});
