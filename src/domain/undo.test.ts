import { describe, expect, it } from 'vitest';
import { reverseKeyed, reverseList, reverseRecord } from './undo';

// Erfundene Daten: Gerät A tippt „Abgehaktes entfernen“, Gerät B schreibt dazwischen „Backpapier“ auf
describe('Rückgängig als Umkehrung (Code-Review #4)', () => {
  it('Liste: Zwischendurch Dazugekommenes bleibt, Entferntes kommt zurück', () => {
    const before = [{ name: 'Milch' }, { name: 'Eier' }];
    const after = [{ name: 'Eier' }];                                    // „Milch“ entfernt
    const now = [{ name: 'Eier' }, { name: 'Backpapier' }];              // vom anderen Gerät
    expect(reverseList(now, before, after)).toEqual([{ name: 'Eier' }, { name: 'Backpapier' }, { name: 'Milch' }]);
  });

  it('Liste: was die Aktion hinzugefügt hat, fliegt wieder raus', () => {
    expect(reverseList(['a', 'neu', 'b'], ['a'], ['a', 'neu'])).toEqual(['a', 'b']);
  });

  it('mit Schlüssel: zurück nur, was seit der Aktion unverändert ist', () => {
    const before = [{ id: 'x', n: 1 }, { id: 'y', n: 1 }, { id: 'z', n: 1 }];
    const after = [{ id: 'x', n: 2 }, { id: 'y', n: 2 }, { id: 'neu', n: 1 }]; // x, y geändert, z entfernt, neu angelegt
    const now = [{ id: 'x', n: 2 }, { id: 'y', n: 5 }, { id: 'neu', n: 1 }, { id: 'b', n: 1 }]; // y inzwischen nochmal geändert, b vom anderen Gerät
    expect(reverseKeyed(now, before, after, (i) => i.id)).toEqual([
      { id: 'x', n: 1 }, // zurück
      { id: 'y', n: 5 }, // neuere Änderung bleibt
      { id: 'b', n: 1 }, // fremd – bleibt
      { id: 'z', n: 1 }, // entfernt – kommt zurück
    ]);
  });

  it('Zuordnung (Kategorien): nur der geänderte Schlüssel', () => {
    expect(reverseRecord({ quark: 'milch', tofu: 'sonstiges' }, { quark: 'kuehl' }, { quark: 'milch' })).toEqual({ quark: 'kuehl', tofu: 'sonstiges' });
    expect(reverseRecord({ quark: 'milch' }, undefined, { quark: 'milch' })).toBeUndefined();
  });
});
