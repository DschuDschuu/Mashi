import { describe, expect, it } from 'vitest';
import { byUrgency, isDone, newlyDone, pauseTimer, remainingOf, removeTimer, resumeTimer, startTimer, type CookTimer } from './timers';

const MIN = 60_000;
const T0 = 1_000_000;

describe('Mehrere Timer im Kochmodus', () => {
  it('laufen unabhängig: Reis 10 Min. und Soße 3 Min. zugleich', () => {
    let list: CookTimer[] = [];
    list = startTimer(list, { id: 'reis', label: 'Schritt 2', minutes: 10, step: 1 }, T0);
    list = startTimer(list, { id: 'sosse', label: 'Schritt 4', minutes: 3, step: 3 }, T0 + MIN);
    const now = T0 + 4 * MIN;
    expect(list.map((t) => [t.id, remainingOf(t, now)])).toEqual([['reis', 6 * MIN], ['sosse', 0]]);
    expect(isDone(list[1], now)).toBe(true);
  });

  it('je Schritt nur ein Timer – erneut starten ersetzt ihn; eigene Timer dürfen mehrere sein', () => {
    let list: CookTimer[] = [];
    list = startTimer(list, { id: 'a', label: 'Schritt 2', minutes: 10, step: 1 }, T0);
    list = startTimer(list, { id: 'b', label: 'Schritt 2', minutes: 5, step: 1 }, T0);
    list = startTimer(list, { id: 'ofen', label: 'Ofen', minutes: 15 }, T0);
    list = startTimer(list, { id: 'teig', label: 'Teig', minutes: 30 }, T0);
    expect(list.map((t) => t.id)).toEqual(['b', 'ofen', 'teig']);
  });

  it('Pause hält die Restzeit fest, Weiter läuft von dort', () => {
    let list = startTimer([], { id: 'x', label: 'Ofen', minutes: 10 }, T0);
    list = pauseTimer(list, 'x', T0 + 4 * MIN);
    expect(remainingOf(list[0], T0 + 20 * MIN)).toBe(6 * MIN); // pausiert: die Zeit steht
    list = resumeTimer(list, 'x', T0 + 20 * MIN);
    expect(remainingOf(list[0], T0 + 22 * MIN)).toBe(4 * MIN);
  });

  it('klingelt genau einmal je Timer – auch wenn zwei zugleich ablaufen', () => {
    let list = startTimer([], { id: 'a', label: 'A', minutes: 1 }, T0);
    list = startTimer(list, { id: 'b', label: 'B', minutes: 1 }, T0);
    const rung = new Set<string>();
    const first = newlyDone(list, rung, T0 + MIN);
    expect(first).toEqual(['a', 'b']);
    first.forEach((id) => rung.add(id));
    expect(newlyDone(list, rung, T0 + 2 * MIN)).toEqual([]);
  });

  it('Leiste: Fertiges zuerst, dann was bald abläuft, Pausiertes zuletzt', () => {
    let list = startTimer([], { id: 'lang', label: 'L', minutes: 20 }, T0);
    list = startTimer(list, { id: 'pause', label: 'P', minutes: 2 }, T0);
    list = startTimer(list, { id: 'kurz', label: 'K', minutes: 5 }, T0);
    list = startTimer(list, { id: 'fertig', label: 'F', minutes: 1 }, T0);
    list = pauseTimer(list, 'pause', T0);
    expect(byUrgency(list, T0 + 2 * MIN).map((t) => t.id)).toEqual(['fertig', 'kurz', 'lang', 'pause']);
  });

  it('0 oder ungültige Minuten starten nichts; Abbrechen entfernt nur diesen', () => {
    expect(startTimer([], { id: 'x', label: 'X', minutes: 0 }, T0)).toEqual([]);
    const list = startTimer(startTimer([], { id: 'a', label: 'A', minutes: 1 }, T0), { id: 'b', label: 'B', minutes: 2 }, T0);
    expect(removeTimer(list, 'a').map((t) => t.id)).toEqual(['b']);
  });
});
