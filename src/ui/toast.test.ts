import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToast, dismissToast, holdToast, releaseToast, toast, toastMs } from './toast';

describe('Toast (Julia: „verkürzen oder wegwischbar machen“)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { dismissToast(); vi.useRealTimers(); });

  it('kürzer als früher: ohne Knopf ab 2 s, mit „Rückgängig“ 5 s – lange Texte länger, höchstens 10 s', () => {
    expect(toastMs('Gespeichert', false)).toBe(2160);
    expect(toastMs('Kurz', false)).toBe(2000);
    expect(toastMs('„Romanesco“ als Baustein', true)).toBe(5000);
    expect(toastMs('x'.repeat(300), true)).toBe(10000);
  });

  it('geht von selbst', () => {
    toast('„Romanesco“ als Baustein', { label: 'Rückgängig', run: () => {} });
    vi.advanceTimersByTime(4900);
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(currentToast()).toBeNull();
  });

  it('solange der Finger darauf liegt, bleibt er – danach läuft die Restzeit weiter', () => {
    toast('„Romanesco“ als Baustein', { label: 'Rückgängig', run: () => {} });
    vi.advanceTimersByTime(3000);
    holdToast();
    vi.advanceTimersByTime(20000);
    expect(currentToast()).not.toBeNull();
    releaseToast();
    vi.advanceTimersByTime(1900); // Rest: 2 s
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(currentToast()).toBeNull();
  });

  it('kurz vor Schluss festgehalten: danach noch mindestens 1,5 s zum Lesen', () => {
    toast('Gespeichert');
    vi.advanceTimersByTime(2100);
    holdToast();
    releaseToast();
    vi.advanceTimersByTime(1400);
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(currentToast()).toBeNull();
  });

  it('wegwischen schließt sofort', () => {
    toast('Gespeichert');
    holdToast();
    dismissToast();
    expect(currentToast()).toBeNull();
    releaseToast(); // nach dem Wisch – kommt nicht wieder
    expect(currentToast()).toBeNull();
  });
});
