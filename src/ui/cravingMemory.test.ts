import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCraving, loadCraving, saveCraving } from './cravingMemory';

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
