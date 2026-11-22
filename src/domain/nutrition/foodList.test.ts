import { describe, expect, it } from 'vitest';
import { buildFoodList, extraWords, findExisting, findFoodRow, matchesFilter, sameSpelling, tabOf } from './foodList';
import { localFoodTable } from './localFoods';
import type { MyProduct } from './myProducts';

// Erfundene Produkte
const p = (id: string, name: string, extra: Partial<MyProduct> = {}): MyProduct => ({
  id, name, replaces: [], per100g: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, updatedAt: '2026-09-26T00:00:00Z', ...extra,
});
const pestoA = p('a', 'Pesto A (Test)', { names: ['grünes pesto'] });
const pestoB = p('b', 'Pesto B (Test)', { names: ['grünes pesto'] });
const milk = p('m', 'Milch 0,1 % (Test)', { replaces: ['milch'] });
const gochu = p('g', 'Gochujang', { replaces: ['gochujang'] });

describe('Meine Lebensmittel – eine Liste', () => {
  const rows = buildFoodList([pestoA, milk, pestoB, gochu], ['Gochujang', 'Pasta'], ['Kreuzkümmel'], localFoodTable);
  const by = (name: string) => rows.find((r) => r.name === name);

  it('fasst Sorten derselben Zutat in einer Zeile zusammen', () => {
    expect(by('Grünes pesto')?.products.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('schreibt die Zutat so, wie sie in deinen Rezepten steht', () => {
    const spelled = buildFoodList([pestoA, pestoB], [], [], localFoodTable, ['Grünes Pesto', 'Spaghetti']);
    expect(spelled.map((r) => r.name)).toEqual(['Grünes Pesto']);
  });

  it('ordnet nach der ersetzten Zutat, auch wenn ein freier Name dazukommt', () => {
    const both = buildFoodList([{ ...milk, names: ['skyr-dessert'] }], ['Milch'], [], localFoodTable);
    expect(both).toHaveLength(1);
    expect([both[0].ingredient, both[0].basic]).toEqual(['Milch', 'Milch']);
  });

  it('zeigt ein einzelnes Produkt unter seinem Namen', () => {
    expect(by('Milch 0,1 %')?.products).toHaveLength(1); // „(Test)“ gilt als Marke
  });

  it('hängt „Immer im Haus“ an das passende Produkt – oder legt eine eigene Zeile mit Tabellenwerten an', () => {
    expect(by('Gochujang')?.basic).toBe('Gochujang');
    expect(by('Gochujang')?.products).toHaveLength(1);
    const pasta = by('Pasta')!;
    expect(pasta.products).toHaveLength(0);
    expect(pasta.table?.per100g.kcal).toBeGreaterThan(0);
  });

  it('kennt „Ohne Nährwerte“ und filtert', () => {
    expect(by('Kreuzkümmel')?.zero).toBe('Kreuzkümmel');
    expect(rows.filter((r) => matchesFilter(r, 'haus')).map((r) => r.name)).toEqual(['Gochujang', 'Pasta']);
    expect(rows.filter((r) => matchesFilter(r, 'ohne')).map((r) => r.name)).toEqual(['Kreuzkümmel']);
    // Produkte = was du pflegst – ohne Grundvorrat (immer im Haus, ohne Nährwerte)
    expect(rows.filter((r) => matchesFilter(r, 'produkte')).map((r) => r.name)).toEqual(['Grünes pesto', 'Milch 0,1 %']);
  });

  it('„Ohne Nährwerte“ steht nur im eigenen Tab – auch wenn es immer im Haus ist', () => {
    const both = buildFoodList([], ['Zimt'], ['Zimt'], localFoodTable);
    expect((['produkte', 'haus', 'ohne'] as const).filter((f) => matchesFilter(both[0], f))).toEqual(['ohne']);
  });

  it('lässt eine gerade geleerte Zeile stehen, statt sie verschwinden zu lassen', () => {
    // Pasta war nur „Immer im Haus“ – ausgeschaltet, aber noch angefasst
    const kept = buildFoodList([], [], [], localFoodTable, [], ['Pasta']);
    expect(kept.map((r) => [r.name, r.basic, r.products.length])).toEqual([['Pasta', undefined, 0]]);
    expect(buildFoodList([], [], [], localFoodTable)).toEqual([]);
  });

  it('sortiert alphabetisch – jede Zutat genau einmal', () => {
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b, 'de')));
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('Gibt es das Lebensmittel schon? (weitere Sorte)', () => {
  const p = (id: string, name: string, replaces: string[] = []): MyProduct => ({ id, name, replaces, per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, updatedAt: '2026-10-02T12:00:00.000Z' });
  const rows = buildFoodList([p('h', 'Rinderhack', ['rinderhack']), p('m', 'Milch', ['magermilch'])], [], [], localFoodTable);
  const find = (n: string) => findFoodRow(rows, n, localFoodTable)?.products[0].id;
  it('gleicher Name, Name vom Bon mit Zusatz, dasselbe Lebensmittel laut Tabelle', () => {
    expect(find('Rinderhack')).toBe('h');
    expect(find('Rinderhack leicht 500g')).toBe('h');
    expect(find('Hackfleisch')).toBe('h');
  });
  it('nur ganze Wörter – Kokosmilch ist keine Milch-Sorte; „Nein, neu anlegen“ gilt', () => {
    expect(find('Kokosmilch')).toBeUndefined();
    expect(findFoodRow(rows, 'Rinderhack', localFoodTable, 'rinderhack')).toBeUndefined();
  });
});

describe('Gibt es das schon? – überall dieselbe Prüfung (findExisting)', () => {
  const p = (id: string, name: string, extra: Partial<MyProduct> = {}): MyProduct => ({ id, name, replaces: [], per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, updatedAt: '2026-11-22T12:00:00.000Z', ...extra });
  const rows = buildFoodList(
    [p('h', 'Rinderhack', { replaces: ['rinderhack'] }), p('k', 'Testkimchi', { names: ['kimchi'] }), p('f', 'Haferflocken', { replaces: ['haferflocken'] }), p('b', 'Grüne Bohnen', { names: ['grüne bohnen'] })],
    ['Reis'], ['Zimt'], localFoodTable,
  );
  const hit = (n: string) => {
    const h = findExisting(rows, n, localFoodTable);
    return h && { name: h.row.name, same: h.same, spelling: !!h.spelling };
  };

  it('gleicher Name, auch klein geschrieben oder mit Leerzeichen – dasselbe Lebensmittel', () => {
    expect(hit('Rinderhack')).toEqual({ name: 'Rinderhack', same: true, spelling: false });
    expect(hit('  rinderhack ')).toMatchObject({ name: 'Rinderhack', same: true });
    // der eigene Name einer Sorte zählt auch
    expect(hit('Testkimchi')).toMatchObject({ name: 'Testkimchi', same: true });
  });

  it('findet auch, was es nur „Immer im Haus“ oder als Gewürz gibt (Julia: Hinweis fehlte)', () => {
    expect(hit('Reis')).toMatchObject({ name: 'Reis', same: true });
    expect(hit('Zimt')).toMatchObject({ name: 'Zimt', same: true });
  });

  it('andere Schreibweise: Plural, ae statt ä, Bindestrich, Leerzeichen', () => {
    expect(hit('Haferflocke')).toEqual({ name: 'Haferflocken', same: true, spelling: true });
    expect(hit('Kimchis')).toMatchObject({ name: 'Testkimchi', same: true, spelling: true });
    expect(hit('Gruene Bohnen')).toMatchObject({ name: 'Grüne Bohnen', same: true });
    expect(hit('Rinder-Hack')).toMatchObject({ name: 'Rinderhack', same: true });
  });

  it('nur ähnlich: enthält einen vorhandenen Namen – dann darf es auch etwas Eigenes sein', () => {
    expect(hit('Rinderhack scharf')).toMatchObject({ name: 'Rinderhack', same: false });
    expect(findExisting(rows, 'Rinderhack scharf', localFoodTable, 'rinderhack scharf')).toBeUndefined();
  });

  it('keine falschen Treffer bei kurzen Wörtern und Wortteilen', () => {
    expect(sameSpelling('Eis', 'Ei')).toBe(false);
    expect(sameSpelling('Reis', 'Rei')).toBe(false);
    expect(sameSpelling('Pasta', 'Paste')).toBe(false);
    expect(hit('Zimtschnecke')).toBeUndefined();
    expect(hit('')).toBeUndefined();
  });

  it('der Zusatz einer neuen Sorte ist, was über den vorhandenen Namen hinausgeht', () => {
    expect(extraWords('Milch 1,5 %', 'Milch')).toBe('1,5 %');
    expect(extraWords('Rinderhack leicht', 'rinderhack')).toBe('leicht');
    expect(extraWords('Bio Rinderhack leicht', 'Rinderhack')).toBe('Bio leicht');
    expect(extraWords('Rinderhack', 'Rinderhack')).toBeUndefined();
    expect(extraWords('Kokosmilch', 'Milch')).toBeUndefined();
  });

  it('die Zeile kennt ihren Tab', () => {
    const tab = (n: string) => tabOf(rows.find((r) => r.name === n)!);
    expect([tab('Rinderhack'), tab('Reis'), tab('Zimt')]).toEqual(['produkte', 'haus', 'ohne']);
  });
});
