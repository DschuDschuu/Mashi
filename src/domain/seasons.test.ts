import { describe, expect, it } from 'vitest';
import { activeSpecial, seasonEnd, seasonOn, toggleSpecial, type Season } from './seasons';

describe('Feiertagsthemen', () => {
  it('Halloween läuft vom 15. Oktober bis einschließlich 2. November', () => {
    expect(seasonOn('2026-10-14')).toBeUndefined();
    expect(seasonOn('2026-10-15')?.id).toBe('halloween');
    expect(seasonOn('2026-11-02')?.id).toBe('halloween');
    expect(seasonOn('2026-11-03')).toBeUndefined();
  });

  it('ist in der Saison von selbst an, sonst aus', () => {
    expect(activeSpecial('2026-10-29')).toBe('halloween');
    expect(activeSpecial('2026-12-01')).toBeUndefined();
  });

  it('ausgeschaltet bleibt es bis Saisonende aus – nächstes Jahr kommt es wieder', () => {
    const off = toggleSpecial('halloween', false, '2026-10-29');
    expect(off).toEqual({ id: 'aus', until: '2026-11-02' });
    expect(activeSpecial('2026-11-01', off)).toBeUndefined();
    expect(activeSpecial('2027-10-20', off)).toBe('halloween');
  });

  it('in der Saison wieder einschalten heißt: zurück zur Automatik', () => {
    expect(toggleSpecial('halloween', true, '2026-10-29')).toBeUndefined();
  });

  it('außerhalb der Saison von Hand eingeschaltet bleibt es an, bis man es ausschaltet', () => {
    const on = toggleSpecial('halloween', true, '2026-12-05');
    expect(on).toEqual({ id: 'halloween', until: 'immer' });
    expect(activeSpecial('2027-03-01', on)).toBe('halloween');
    expect(toggleSpecial('halloween', false, '2027-03-01')).toBeUndefined();
  });

  it('Saisons über Neujahr: Ende liegt im nächsten Jahr', () => {
    const winter: Season = { id: 'halloween', label: 'Test', from: '12-20', to: '01-06' };
    expect(seasonEnd(winter, '2026-12-24')).toBe('2027-01-06');
    expect(seasonEnd(winter, '2027-01-02')).toBe('2027-01-06');
  });
});
