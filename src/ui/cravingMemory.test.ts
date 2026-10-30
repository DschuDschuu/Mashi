import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCraving, loadCraving, loadRecent, rememberPlate, saveCraving, withRecent } from './cravingMemory';

// Tests laufen ohne Browser – ein kleiner Ersatz für localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
afterEach(() => store.clear());

const taco = { direction: 'taco', picks: { carb: ['tortillas'] }, closed: ['carb' as const] };

describe('angefangener Stepper', () => {
  it('merkt sich Getipptes und Stand unter einem mashi-Schlüssel – und vergisst ihn wieder', () => {
    saveCraving('Taco', taco);
    expect([...store.keys()]).toEqual(['mashi-craving-v1']);
    expect(loadCraving()).toEqual({ q: 'Taco', state: taco });
    clearCraving();
    expect(loadCraving()).toBeUndefined();
  });

  it('gilt nur bis Mitternacht (Julia: am nächsten Tag frisch)', () => {
    saveCraving('Taco', taco, new Date(2026, 9, 26, 23, 50));
    expect(loadCraving(new Date(2026, 9, 26, 23, 59))?.q).toBe('Taco');
    expect(loadCraving(new Date(2026, 9, 27, 0, 5))).toBeUndefined();
  });

  it('kaputte oder fremde Einträge zählen nicht', () => {
    store.set('mashi-craving-v1', '{kaputt');
    expect(loadCraving()).toBeUndefined();
    store.set('mashi-craving-v1', JSON.stringify({ q: 'Taco', state: { picks: {} } }));
    expect(loadCraving()).toBeUndefined();
  });
});

describe('„Wie letztes Mal?“ (Julia)', () => {
  const plate = (title: string, protein: string) => ({ title, state: { direction: 'taco', picks: { carb: ['tortillas'], protein: [protein] }, closed: [] } });

  it('neu vorn, dasselbe Gericht nur einmal (egal in welcher Reihenfolge gewählt), höchstens drei', () => {
    let list = withRecent([], plate('A', 'hack'));
    list = withRecent(list, plate('B', 'haehnchen'));
    list = withRecent(list, plate('A wieder', 'hack'));
    expect(list.map((p) => p.title)).toEqual(['A wieder', 'B']);
    for (const p of ['tofu', 'bohnen', 'halloumi']) list = withRecent(list, plate(p, p));
    expect(list.map((p) => p.title)).toEqual(['halloumi', 'bohnen', 'tofu']);
    const mixed = { title: 'M', state: { picks: { veg: ['mais', 'paprika'] }, closed: [] } };
    expect(withRecent([mixed], { title: 'M2', state: { picks: { veg: ['paprika', 'mais'] }, closed: [] } })).toHaveLength(1);
  });

  it('merkt den ganzen Teller unter einem mashi-Schlüssel – alle Stufen erledigt, ohne Würfel- und „ohne“-Notizen', () => {
    rememberPlate({ ...taco, without: ['hack'], rolled: { picks: ['tortillas'], closed: ['carb'] } }, 'Mein Taco');
    expect([...store.keys()]).toEqual(['mashi-craving-recent-v1']);
    const [p] = loadRecent();
    expect(p.title).toBe('Mein Taco');
    expect(p.state).toEqual({ direction: 'taco', picks: { carb: ['tortillas'] }, closed: ['carb', 'protein', 'sauce', 'veg', 'topping'] });
  });

  it('kaputte Einträge zählen nicht', () => {
    store.set('mashi-craving-recent-v1', '{kaputt');
    expect(loadRecent()).toEqual([]);
    store.set('mashi-craving-recent-v1', JSON.stringify([{ title: 'x' }, plate('ok', 'hack')]));
    expect(loadRecent().map((p) => p.title)).toEqual(['ok']);
  });
});
