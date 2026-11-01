import { describe, expect, it } from 'vitest';
import { dragCloses } from './useSheet';

describe('Blatt nach unten wegziehen (Julia: „soll nach unten wegziehbar sein“)', () => {
  it('weit genug – oder ein kurzer schneller Wisch – schließt; sonst federt es zurück', () => {
    expect(dragCloses(120, 600)).toBe(true);
    expect(dragCloses(81, 2000)).toBe(true);
    expect(dragCloses(60, 150)).toBe(true); // schneller Wisch
    expect(dragCloses(60, 400)).toBe(false); // langsam und kurz
    expect(dragCloses(30, 100)).toBe(false); // nur angetippt und gewackelt
    expect(dragCloses(-50, 100)).toBe(false); // nach oben
  });
});
