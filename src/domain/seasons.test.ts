import { describe, expect, it } from 'vitest';
import { activeSpecial, firstAdvent, isAutumnRecipe, isChristmasDays, isChristmasEve, isEvening, isHalloweenNight, seasonEnd, seasonOn, toggleSpecial, type Season } from './seasons';

describe('Feiertagsthemen', () => {
  it('Halloween läuft vom 15. Oktober bis einschließlich 2. November', () => {
    expect(seasonOn('2026-10-14')).toBeUndefined();
    expect(seasonOn('2026-10-15')?.id).toBe('halloween');
    expect(seasonOn('2026-11-02')?.id).toBe('halloween');
    expect(seasonOn('2026-11-03')).toBeUndefined();
  });

  it('ist in der Saison von selbst an, sonst aus', () => {
    expect(activeSpecial('2026-10-29')).toBe('halloween');
    expect(activeSpecial('2026-11-20')).toBeUndefined();
  });

  it('1. Advent: vierter Sonntag vor Weihnachten (27.11. bis 3.12.)', () => {
    expect(firstAdvent(2026)).toBe('11-29'); // 25.12. ist ein Freitag
    expect(firstAdvent(2022)).toBe('11-27'); // 25.12. ist ein Sonntag – dann zählt der Sonntag davor als 4. Advent
    expect(firstAdvent(2024)).toBe('12-01');
    expect(firstAdvent(2023)).toBe('12-03'); // 25.12. ist ein Montag
  });

  it('Weihnachten läuft vom 1. Advent oder 1. Dezember (was früher ist) bis einschließlich 26. Dezember', () => {
    expect(seasonOn('2026-11-28')).toBeUndefined();
    expect(activeSpecial('2026-11-29')).toBe('weihnachten'); // 1. Advent
    expect(activeSpecial('2026-12-26')).toBe('weihnachten');
    expect(activeSpecial('2026-12-27')).toBeUndefined();
    expect(seasonOn('2023-11-30')).toBeUndefined(); // 1. Advent erst am 3.12. → ab dem 1.12.
    expect(activeSpecial('2023-12-01')).toBe('weihnachten');
    expect(seasonOn('2026-11-02')?.id).toBe('halloween'); // Halloween bleibt, wie es war
  });

  it('ab dem 1. Advent ausgeschaltet: Ruhe bis zum 26.', () => {
    expect(toggleSpecial('weihnachten', false, '2026-11-29')).toEqual({ id: 'aus', until: '2026-12-26' });
  });

  it('Weihnachten ausgeschaltet: Ruhe bis zum 26., nächstes Jahr kommt es wieder', () => {
    const off = toggleSpecial('weihnachten', false, '2026-12-05');
    expect(off).toEqual({ id: 'aus', until: '2026-12-26' });
    expect(activeSpecial('2026-12-20', off)).toBeUndefined();
    expect(activeSpecial('2027-12-03', off)).toBe('weihnachten');
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

describe('Halloween-Extras', () => {
  it('abends heißt 18 bis 6 Uhr', () => {
    expect(isEvening(new Date(2026, 9, 29, 17, 59))).toBe(false);
    expect(isEvening(new Date(2026, 9, 29, 18, 0))).toBe(true);
    expect(isEvening(new Date(2026, 9, 30, 5, 59))).toBe(true);
    expect(isEvening(new Date(2026, 9, 30, 6, 0))).toBe(false);
  });

  it('Halloween-Nacht ist nur der 31. Oktober', () => {
    expect(isHalloweenNight('2026-10-31')).toBe(true);
    expect(isHalloweenNight('2026-10-30')).toBe(false);
    expect(isHalloweenNight('2026-11-01')).toBe(false);
  });

  it('Heiligabend ist nur der 24., die Feiertage 24. bis 26. Dezember', () => {
    expect(isChristmasEve('2026-12-24')).toBe(true);
    expect(isChristmasEve('2026-12-23')).toBe(false);
    expect(isChristmasEve('2026-12-25')).toBe(false);
    expect(['12-23', '12-24', '12-25', '12-26', '12-27'].map((d) => isChristmasDays(`2026-${d}`))).toEqual([false, true, true, true, false]);
  });

  it('Herbstrezepte erkennt Mashi an Titel oder Zutaten', () => {
    expect(isAutumnRecipe('Ofengemüse', ['Hokkaido', 'Feta'])).toBe(true);
    expect(isAutumnRecipe('Kürbissuppe', [])).toBe(true);
    expect(isAutumnRecipe('Tomaten-Linsen-Curry', ['Linsen', 'Möhre'])).toBe(false);
  });
});
