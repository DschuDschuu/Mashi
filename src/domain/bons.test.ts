import { describe, expect, it } from 'vitest';
import { addBon, bonFromImport, dropDayPrices, dropUnsavedDay, editBonLine, includeBonLine, importedOnDay, sameBonOf, unsavedDays, withdrawBonStock, MAX_BONS, paidOf, purchasesOf, type SavedBon } from './bons';
import { applyImport, emptyPantry, proposeImport, receiptKey, type Pantry } from './pantry';
import { parseReceipt } from './receipt';
import { parseSavings, recordSavings } from './savings';

const DAY = '2026-10-02T12:00:00.000Z';
const NOW = '2026-10-02T15:00:00.000Z';
let n = 0;
const id = () => `id${n++}`;

const TEXT = `EUR
Rinderhack 500g 3,29 A
Preisvorteil -0,80
Speisequark mager 0,79 x 3 2,37 A
Joghurt 0,99 A
RABATT 30% -0,30
Zu zahlen 5,55`;

/** Bon einlesen wie in der App: Vorrat, Preise, Ersparnis – und den Bon aufheben */
function imported(edit?: (rows: ReturnType<typeof proposeImport>) => void): Pantry {
  const rows = proposeImport(parseReceipt(TEXT), []);
  edit?.(rows);
  const savings = parseSavings(TEXT);
  const p = applyImport(emptyPantry(), rows, NOW, id, DAY);
  return recordSavings(addBon(p, bonFromImport(rows, DAY, NOW, 'b1', '2026-10-02|5.55', savings)), savings, DAY);
}
const item = (p: Pantry, name: string) => p.items.filter((i) => i.name === name);
const historyOf = (p: Pantry, name: string) => (p.history ?? []).filter((h) => receiptKey(h.name) === receiptKey(name));

describe('Gespeicherte Bons', () => {
  it('der Bon kommt mit allen Zeilen, Rabatt je Artikel und Ersparnis', () => {
    const p = imported();
    const bon = p.bons![0];
    expect(bon.lines.map((l) => [l.bon, l.price, paidOf(l)])).toEqual([
      ['Rinderhack 500g', 3.29, 2.49],
      ['Speisequark mager', 2.37, 2.37],
      ['Joghurt', 0.99, 0.69],
    ]);
    expect(bon.savings).toEqual({ lidlPlus: 0, offers: 0.8, mhd: 0.3 });
    expect(bon.total).toBe(5.55);
  });

  it('derselbe Bon noch einmal ersetzt den alten; nur die neuesten bleiben', () => {
    const p = imported();
    const again = addBon(p, { ...p.bons![0], id: 'b2' });
    expect(again.bons!.map((b) => b.id)).toEqual(['b2']);
    let many: Pantry = emptyPantry();
    for (let i = 0; i < MAX_BONS + 3; i++) many = addBon(many, { id: `x${i}`, date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), lines: [], updatedAt: NOW } satisfies SavedBon);
    expect(many.bons).toHaveLength(MAX_BONS);
    expect(many.bons![0].id).toBe('x3');
  });

  it('Menge korrigieren: Vorrat um den Unterschied – schon Verbrauchtes bleibt verbraucht', () => {
    // beim Prüfen vertippt: 5000 statt 500 g
    const wrong = imported((rows) => { rows[0] = { ...rows[0], name: 'Rinderhack', amount: 5000, unit: 'g' }; });
    expect(item(wrong, 'Rinderhack')[0]).toMatchObject({ amount: 1, unit: 'Stück', pack: { amount: 5000, unit: 'g' } });
    const p = editBonLine(wrong, 'b1', 0, { amount: 500 }, NOW, id);
    expect(item(p, 'Rinderhack')).toHaveLength(1);
    expect(item(p, 'Rinderhack')[0]).toMatchObject({ amount: 1, pack: { amount: 500, unit: 'g' } });
    // Preis je g mitgezogen (3,29 € für 500 g – vorher für 5000 g)
    expect(historyOf(p, 'Rinderhack')[0].perUnit).toBeCloseTo(3.29 / 500);
    expect(p.prices.find((x) => x.name === 'Rinderhack')!.perUnit).toBeCloseTo(3.29 / 500);
    // gelernt für den nächsten Bon
    expect(p.rules.find((r) => r.key === 'rinderhack 500g')).toMatchObject({ name: 'Rinderhack', amount: 500, unit: 'g' });
  });

  it('lose Menge: 300 g verkocht, dann 5000 → 500 g korrigiert → 200 g übrig', () => {
    const wrong = imported((rows) => { rows[1] = { ...rows[1], name: 'Quark', amount: 5000, unit: 'g', line: { ...rows[1].line, count: 1 } }; });
    const used: Pantry = { ...wrong, items: wrong.items.map((i) => (i.name === 'Quark' ? { ...i, amount: 4700, pack: undefined, unit: 'g' } : i)) };
    const fixed = { ...used, bons: used.bons!.map((b) => ({ ...b, lines: b.lines.map((l, i) => (i === 1 ? { ...l, weightKg: 5 } : l)) })) };
    const p = editBonLine(fixed, 'b1', 1, { amount: 500 }, NOW, id);
    expect(item(p, 'Quark')[0]).toMatchObject({ amount: 200, unit: 'g' });
  });

  it('Zuordnung ändern: was noch da ist, wandert zur anderen Sorte', () => {
    const p0 = imported((rows) => { rows[0] = { ...rows[0], name: 'Rinderhack', amount: 500, unit: 'g' }; });
    const p = editBonLine(p0, 'b1', 0, { productId: 'leicht' }, NOW, id);
    const hack = item(p, 'Rinderhack');
    expect(hack).toHaveLength(1);
    expect(hack[0]).toMatchObject({ productId: 'leicht', amount: 1, pack: { amount: 500, unit: 'g' } });
  });

  it('Zuordnung ändern: ein alter Preis ohne Sorte vom selben Tag bleibt nicht als „ohne Sorte“ übrig', () => {
    // Zeile hatte schon eine Sorte, der Preis im Verlauf aber noch keine (eingelesen, bevor Preise ihre Sorte kannten)
    const p0 = imported((rows) => { rows[0] = { ...rows[0], name: 'Rinderhack', amount: 500, unit: 'g', productId: 'normal' }; });
    const old = { ...p0, history: (p0.history ?? []).map(({ productId: _, ...h }) => h) };
    const p = editBonLine(old, 'b1', 0, { productId: 'leicht' }, NOW, id);
    expect(historyOf(p, 'Rinderhack').map((h) => h.productId)).toEqual(['leicht']);
  });

  it('Zuordnung ändern, aber schon aufgebraucht: es entsteht nichts Neues', () => {
    const p0 = imported((rows) => { rows[0] = { ...rows[0], name: 'Rinderhack', amount: 500, unit: 'g' }; });
    const eaten = { ...p0, items: p0.items.filter((i) => i.name !== 'Rinderhack') };
    expect(item(editBonLine(eaten, 'b1', 0, { productId: 'leicht' }, NOW, id), 'Rinderhack')).toHaveLength(0);
  });

  it('Anzahl korrigieren: 2 statt 3 Packungen Quark', () => {
    const p0 = imported((rows) => { rows[1] = { ...rows[1], name: 'Quark', amount: 750, unit: 'g' }; });
    expect(item(p0, 'Quark')[0]).toMatchObject({ amount: 3, pack: { amount: 250, unit: 'g' } });
    const p = editBonLine(p0, 'b1', 1, { count: 2, amount: 500 }, NOW, id);
    expect(item(p, 'Quark')[0]).toMatchObject({ amount: 2, pack: { amount: 250, unit: 'g' } });
  });

  it('Rabatt korrigieren: Ersparnis von Bon und Monat ziehen mit, der Regalpreis bleibt', () => {
    const p0 = imported();
    const p = editBonLine(p0, 'b1', 0, { discounts: [{ kind: 'angebot', amount: 1 }, { kind: 'lidlplus', amount: 0.2 }] }, NOW, id);
    expect(p.bons![0].savings).toEqual({ lidlPlus: 0.2, offers: 1, mhd: 0.3 });
    expect(p.savings!.find((s) => s.key === '2026-10-02|5.55')).toMatchObject({ lidlPlus: 0.2, offers: 1, mhd: 0.3 });
    expect(historyOf(p, 'Rinderhack 500g')[0].perUnit).toBe(historyOf(p0, 'Rinderhack 500g')[0].perUnit);
  });

  it('zurück auf den alten Stand = wie vorher (so funktioniert „Rückgängig“)', () => {
    const p0 = imported((rows) => { rows[1] = { ...rows[1], name: 'Quark', amount: 750, unit: 'g' }; });
    const old = p0.bons![0].lines[1];
    const changed = editBonLine(p0, 'b1', 1, { count: 2, amount: 500, price: 1.58 }, NOW, id);
    const back = editBonLine(changed, 'b1', 1, { count: old.count, amount: old.amount, price: old.price }, NOW, id);
    expect(item(back, 'Quark').map((i) => [i.amount, i.pack])).toEqual(item(p0, 'Quark').map((i) => [i.amount, i.pack]));
    expect(historyOf(back, 'Quark')).toEqual(historyOf(p0, 'Quark'));
    expect(back.bons![0].lines[1]).toEqual(old);
  });

  it('Einkäufe eines Lebensmittels – neueste zuerst, Übersprungenes nicht', () => {
    const p = imported();
    const later = addBon(p, { id: 'b9', date: '2026-10-09T12:00:00.000Z', lines: [{ ...p.bons![0].lines[2] }, { ...p.bons![0].lines[2], skip: true }], updatedAt: NOW });
    expect(purchasesOf(later.bons, (l) => l.name === 'Joghurt').map((x) => [x.bonId, x.index])).toEqual([['b9', 0], ['b1', 2]]);
  });

  it('alten Import ersetzen: Preise des Tages neu, Vorrat bleibt, andere Bons desselben Tages behalten ihre', () => {
    // vor dem Update eingelesen: kein Bon gespeichert, Name falsch („Hackfleisch“ statt „Rinderhack“)
    const rows = proposeImport(parseReceipt(TEXT), []);
    rows[0] = { ...rows[0], name: 'Hackfleisch' };
    const old = applyImport(emptyPantry(), rows, NOW, id, DAY);
    const other: SavedBon = { id: 'x', key: 'anderer', date: DAY, lines: [{ bon: 'Quark', count: 1, name: 'Speisequark mager' }], updatedAt: NOW };
    const withOther = addBon(old, other);
    const items = withOther.items;
    // neu eingelesen, diesmal richtig
    const fixed = proposeImport(parseReceipt(TEXT), withOther.rules);
    fixed[0] = { ...fixed[0], name: 'Rinderhack' };
    const p = applyImport(dropDayPrices(withOther, DAY, '2026-10-02|5.55'), fixed, NOW, id, DAY, { stock: false });
    expect(p.items).toEqual(items);
    expect(historyOf(p, 'Hackfleisch')).toEqual([]);
    expect(p.prices.find((x) => x.name === 'Hackfleisch')).toBeUndefined();
    expect(historyOf(p, 'Rinderhack')).toHaveLength(1);
    // vom anderen Bon desselben Tages: bleibt (und wird hier nur aktualisiert)
    expect(historyOf(p, 'Speisequark mager')).toHaveLength(1);
  });

  it('am Tag wiedererkannt – auch wenn der Endbetrag diesmal anders gelesen wurde', () => {
    const p = imported();
    expect(importedOnDay(p, '2026-10-02T09:00:00.000Z')).toBe(true);
    expect(importedOnDay(p, '2026-10-03T12:00:00.000Z')).toBe(false);
    expect(importedOnDay(p, undefined)).toBe(false);
    // nur Preise vom Tag (alter Import ohne gespeicherten Bon) reichen auch
    expect(importedOnDay({ ...emptyPantry(), history: [{ name: 'Quark', perUnit: 1, unit: 'g', date: DAY }] }, DAY)).toBe(true);
  });

  it('derselbe Einkauf als gespeicherter Bon: gleicher Tag, mindestens die Hälfte gleicher Artikel', () => {
    const p = addBon(imported(), { id: 'abends', key: 'rewe', date: DAY, lines: [{ bon: 'Kaffee', count: 1, name: 'Kaffee' }], updatedAt: NOW });
    const rows = proposeImport(parseReceipt(TEXT), []);
    expect(sameBonOf(p, DAY, rows)?.id).toBe('b1');
    expect(sameBonOf(p, DAY, [{ key: 'tee' }])).toBeUndefined();
  });

  it('doppelt eingelesen: Mengen dieses Bons wieder raus – nur, was noch da ist; danach ändern Korrekturen den Vorrat nicht', () => {
    const once = imported((rows) => { rows[1] = { ...rows[1], name: 'Quark', amount: 750, unit: 'g' }; });
    // derselbe Bon noch einmal, ohne Wiedererkennung → doppelt
    const rows = proposeImport(parseReceipt(TEXT), once.rules);
    const twice = addBon(applyImport(once, rows, NOW, id, DAY), bonFromImport(rows, DAY, NOW, 'b2', 'anders', parseSavings(TEXT)));
    expect(item(twice, 'Quark')[0].amount).toBe(6);
    const fixed = withdrawBonStock(twice, 'b2', NOW);
    expect(item(fixed, 'Quark')[0].amount).toBe(3);
    expect(fixed.bons!.find((b) => b.id === 'b2')!.noStock).toBe(true);
    expect(withdrawBonStock(fixed, 'b2', NOW)).toBe(fixed); // zweimal abziehen geht nicht
    expect(item(editBonLine(fixed, 'b2', 1, { count: 2, amount: 500 }, NOW, id), 'Quark')[0].amount).toBe(3);
  });

  it('Tage ohne gespeicherten Bon: auflisten und ganz löschen – Preise, Ersparnis, „schon importiert“', () => {
    // vor dem Update eingelesen, ohne Datum → am Tag des Einlesens gelandet
    const rows = proposeImport(parseReceipt(TEXT), []);
    const wrongDay = '2026-09-01T12:00:00.000Z';
    const savings = parseSavings(TEXT);
    const old = recordSavings({ ...applyImport(emptyPantry(), rows, NOW, id, wrongDay), receipts: ['2026-09-01|5.55'] }, savings, wrongDay);
    const p = addBon(old, { id: 'neu', date: DAY, lines: [], updatedAt: NOW });
    expect(unsavedDays(p).map((d) => [d.day, d.names.length])).toEqual([['2026-09-01', 3]]);
    const items = p.items;
    const gone = dropUnsavedDay(p, '2026-09-01');
    expect(unsavedDays(gone)).toEqual([]);
    expect(gone.prices).toEqual([]);
    expect(gone.savings).toEqual([]);
    expect(gone.receipts).toEqual([]);
    expect(gone.items).toBe(items); // die Speisekammer bleibt
    // ein Tag mit gespeichertem Bon lässt sich so nicht löschen (dafür gibt es den Bon)
    expect(dropUnsavedDay(p, '2026-10-02')).toBe(p);
  });

  it('Gewicht nachtragen: Kürbis bleibt „2 Stück“ im Vorrat, der Preisverlauf rechnet ab jetzt je kg', () => {
    const rows = proposeImport(parseReceipt(['EUR', 'Butternuss-Kürbis 3,23 x 2 6,45 A', 'Zu zahlen 6,45'].join('\n')), []);
    rows[0] = { ...rows[0], name: 'Kürbis', amount: 2, unit: 'Stück' };
    const p0 = addBon(applyImport(emptyPantry(), rows, NOW, id, DAY), bonFromImport(rows, DAY, NOW, 'k', 'k'));
    expect(historyOf(p0, 'Kürbis')[0].unit).toBe('Stück');
    const p = editBonLine(p0, 'k', 0, { weightKg: 3.242 }, NOW, id);
    expect(item(p, 'Kürbis')[0]).toMatchObject({ amount: 2, unit: 'Stück' });
    expect(historyOf(p, 'Kürbis')).toHaveLength(1);
    expect(historyOf(p, 'Kürbis')[0].unit).toBe('g');
    expect(historyOf(p, 'Kürbis')[0].perUnit * 1000).toBeCloseTo(6.45 / 3.242);
  });
});

describe('Übersprungene Zeile nachträglich aufnehmen (Julia: wegen des Preises)', () => {
  // beim Einlesen übersprungen: der Joghurt
  const skipped = () => imported((rows) => { rows[2] = { ...rows[2], skip: true }; });

  it('nur der Preis: Verlauf und Gelerntes, Vorrat bleibt – die Zeile ist „nur Preis“', () => {
    const before = skipped();
    expect(item(before, 'Joghurt')).toHaveLength(0);
    expect(historyOf(before, 'Joghurt')).toHaveLength(0);
    const p = includeBonLine(before, 'b1', 2, { name: 'Joghurt', amount: 500, unit: 'g' }, false, NOW, id);
    expect(item(p, 'Joghurt')).toHaveLength(0);
    expect(historyOf(p, 'Joghurt')[0].perUnit).toBeCloseTo(0.99 / 500);
    expect(p.bons![0].lines[2]).toMatchObject({ name: 'Joghurt', priceOnly: true });
    expect(p.bons![0].lines[2].skip).toBeUndefined();
    // beim nächsten Bon nicht mehr überspringen
    expect(p.rules.find((r) => r.key === 'joghurt')).toMatchObject({ name: 'Joghurt', amount: 500, unit: 'g' });
    expect(p.rules.find((r) => r.key === 'joghurt')!.skip).toBeUndefined();
    // Ersparnis unverändert (zählte beim Einlesen schon)
    expect(p.bons![0].savings).toEqual(before.bons![0].savings);
    // spätere Korrektur der Menge bucht nichts in den Vorrat
    expect(item(editBonLine(p, 'b1', 2, { amount: 1000 }, NOW, id), 'Joghurt')).toHaveLength(0);
  });

  it('mit Haken: auch in die Speisekammer', () => {
    const p = includeBonLine(skipped(), 'b1', 2, { name: 'Joghurt', amount: 500, unit: 'g' }, true, NOW, id);
    expect(item(p, 'Joghurt')[0]).toMatchObject({ amount: 1, unit: 'Stück', pack: { amount: 500, unit: 'g' }, boughtAt: DAY });
    expect(p.bons![0].lines[2].priceOnly).toBeUndefined();
  });

  it('nicht übersprungene Zeilen bleiben unberührt', () => {
    const p = imported();
    expect(includeBonLine(p, 'b1', 0, { name: 'X' }, true, NOW, id)).toBe(p);
  });
});
