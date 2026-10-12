import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDay, localNoon } from './dates';

afterEach(() => { vi.unstubAllEnvs(); });

describe('Kalendertag in Ortszeit (Code-Review #24)', () => {
  it('um 0:30 Uhr in Deutschland ist schon der neue Tag – auch wenn UTC noch beim Vortag ist', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    const halbEins = new Date('2026-10-11T22:30:00.000Z'); // = 12.10. 0:30 Uhr in Berlin (Sommerzeit)
    expect(halbEins.toISOString().slice(0, 10)).toBe('2026-10-11'); // so rechnete Mashi vorher
    expect(localDay(halbEins)).toBe('2026-10-12');
    expect(localNoon(halbEins)).toBe('2026-10-12T12:00:00.000Z');
  });
});
