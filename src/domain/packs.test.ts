import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { localFoodTable as T } from './nutrition/localFoods';
import { addItem, freezeItem, thawFit, thawItem, thawNeeds, deductRecipe, emptyPantry, returnTaken, takenBetween, type Pantry, type PantryItem } from './pantry';
import { attachPacks, changeAmount, mergeSamePacks, openItem, suggestPantryUnit, packSuggestions } from './packs';
import { amountLabel } from './pantryLabel';
import { merge3Pantry } from './syncMerge';
import { restockNeeds } from './restock';
import { useByOf } from './shelfLife';
import type { Ingredient, RecipeContent } from './types';

const NOW = '2026-09-27T12:00:00.000Z';
let n = 0;
const id = () => `x${n++}`;
const content = (ingredients: Ingredient[]): RecipeContent => ({ ...createMockRecipes()[0].versions[0].content, servings: 2, ingredients });
const milch = (amount = 3): PantryItem => ({ id: 'm', name: 'Milch', amount, unit: 'Stück', pack: { amount: 1000, unit: 'ml' }, addedAt: NOW });
const hack = (amount = 4): PantryItem => ({ id: 'h', name: 'Rinderhack', amount, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: NOW });
const pantry = (...items: PantryItem[]): Pantry => ({ ...emptyPantry(), items });
const cook = (p: Pantry, ing: Ingredient) => deductRecipe(p, content([ing]), 2, T, {}, {}, NOW, id).pantry;
const show = (p: Pantry) => p.items.map(amountLabel);

describe('Packungen im Vorrat', () => {
  it('Anzeige wie im Schrank', () => {
    expect(amountLabel(hack())).toBe('4 × 500 g');
    expect(amountLabel(milch(2))).toBe('2 × 1 l');
    expect(amountLabel({ amount: 750, unit: 'ml', openedAt: NOW })).toBe('750 ml offen');
    expect(amountLabel({ amount: 2, unit: 'Stück' })).toBe('2 Stück');
  });

  it('Kochen bricht eine Packung an: 3 × 1 l, 250 ml gebraucht → 2 × 1 l + 750 ml offen', () => {
    const after = cook(pantry(milch()), { id: 'a', name: 'Milch', amount: 250, unit: 'ml' });
    expect(show(after)).toEqual(['2 × 1 l', '750 ml offen']);
    expect(after.items[1].openedAt).toBe(NOW);
  });

  it('beim nächsten Mal zuerst die offene Packung', () => {
    const once = cook(pantry(milch()), { id: 'a', name: 'Milch', amount: 250, unit: 'ml' });
    expect(show(cook(once, { id: 'a', name: 'Milch', amount: 250, unit: 'ml' }))).toEqual(['2 × 1 l', '500 ml offen']);
  });

  it('Hack: 600 g aus 4 × 500 g → 2 × 500 g + 400 g offen', () => {
    expect(show(cook(pantry(hack()), { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }))).toEqual(['2 × 500 g', '400 g offen']);
  });

  it('genau aufgehend: 1000 g aus 4 × 500 g → 2 × 500 g, nichts offen', () => {
    expect(show(cook(pantry(hack()), { id: 'a', name: 'Rinderhack', amount: 1000, unit: 'g' }))).toEqual(['2 × 500 g']);
  });

  it('„1 Dose“ im Rezept = 1 Packung', () => {
    const tomaten: PantryItem = { id: 't', name: 'Passierte Tomaten', amount: 3, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: NOW };
    expect(show(cook(pantry(tomaten), { id: 'a', name: 'Passierte Tomaten', amount: 1, unit: 'Dose' }))).toEqual(['2 × 500 g']);
  });

  it('„Gekocht“ zurücknehmen: die Packung kommt zurück, der offene Rest verschwindet', () => {
    const before = pantry(hack());
    const after = cook(before, { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' });
    expect(show(returnTaken(after, takenBetween(before, after)))).toEqual(['4 × 500 g']);
  });

  it('von Hand angebrochen: eine Packung wird zum offenen Rest', () => {
    const joghurt: PantryItem = { id: 'j', name: 'Joghurt', amount: 3, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: NOW };
    expect(openItem([joghurt], 'j', NOW, id).map(amountLabel)).toEqual(['2 × 500 g', '500 g offen']);
  });

  it('anbrechen und gleich 150 g herausnehmen → 350 g offen; alles herausnehmen → eine Packung weniger', () => {
    const joghurt: PantryItem = { id: 'j', name: 'Joghurt', amount: 3, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: NOW };
    expect(openItem([joghurt], 'j', NOW, id, 150).map(amountLabel)).toEqual(['2 × 500 g', '350 g offen']);
    expect(openItem([joghurt], 'j', NOW, id, 500).map(amountLabel)).toEqual(['2 × 500 g']);
  });

  it('Stück ohne Packungsgröße: ein Becher wird offen, die anderen bleiben zu (keine Mengenfrage)', () => {
    const becher: PantryItem = { id: 'b', name: 'Joghurt', amount: 3, unit: 'Stück', addedAt: NOW };
    const after = openItem([becher], 'b', NOW, id, 150); // eine versehentliche Menge wird ignoriert – nichts verschwindet
    expect(after.map(amountLabel)).toEqual(['2 Stück', '1 Stück offen']);
    expect(after.map((i) => !!i.openedAt)).toEqual([false, true]);
  });

  it('ohne Packungsgröße: der Eintrag selbst wird offen und kleiner', () => {
    const lose: PantryItem = { id: 'l', name: 'Joghurt', amount: 500, unit: 'g', addedAt: NOW };
    expect(openItem([lose], 'l', NOW, id, 100).map(amountLabel)).toEqual(['400 g offen']);
  });

  it('Angebrochenes und andere Packungsgrößen werden nicht zusammengelegt', () => {
    let items = cook(pantry(hack()), { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }).items;
    items = addItem(items, { name: 'Rinderhack', amount: 2, unit: 'Stück', pack: { amount: 500, unit: 'g' } }, NOW, id);
    items = addItem(items, { name: 'Rinderhack', amount: 1, unit: 'Stück', pack: { amount: 250, unit: 'g' } }, NOW, id);
    expect(items.map(amountLabel)).toEqual(['4 × 500 g', '400 g offen', '1 × 250 g']);
  });
});

describe('Offen hält kürzer', () => {
  const opened: PantryItem = { id: 'o', name: 'Milch', amount: 750, unit: 'ml', addedAt: NOW, boughtAt: NOW, openedAt: NOW };
  const day = (d: Date) => d.toISOString().slice(0, 10);

  it('ab Öffnen 3 Tage (Milch geschlossen hielte 7)', () => {
    expect(day(useByOf(opened, T)!)).toBe('2026-09-30');
  });
  it('aber nie länger als das Datum der Packung', () => {
    expect(day(useByOf({ ...opened, useBy: '2026-09-28T12:00:00.000Z' }, T)!)).toBe('2026-09-28');
  });
  it('Tube, Konserve, Nudeln: je nach Lebensmittel', () => {
    const open = (name: string): PantryItem => ({ ...opened, name });
    expect(useByOf(open('Tomatenmark'), T)).toBeUndefined(); // Tube – keine Erinnerung
    expect(useByOf(open('Gochujang'), T)).toBeUndefined();
    expect(day(useByOf(open('Pesto'), T)!)).toBe('2026-10-04'); // 1 Woche
    expect(day(useByOf(open('Passierte Tomaten'), T)!)).toBe('2026-09-30'); // wie Frisches
    expect(useByOf(open('Pasta'), T)).toBeUndefined(); // trocken – auch offen keine Erinnerung
    expect(useByOf(open('Sojasauce'), T)).toBeUndefined();
  });
  it('eigener Wert für „offen“', () => {
    expect(day(useByOf(opened, T, { opened: 5 })!)).toBe('2026-10-02');
  });
});

describe('Nachkaufen zählt nur Geschlossenes', () => {
  it('1 geschlossene Packung + offene → unter 2', () => {
    const p: Pantry = { ...pantry(milch(1), { id: 'o', name: 'Milch', amount: 750, unit: 'ml', addedAt: NOW, openedAt: NOW }), restock: [{ name: 'Milch', below: 2, unit: 'Stück' }] };
    expect(restockNeeds(p, T)[0].label).toBe('Im Vorrat 1 Stück · Nachkaufen unter 2 Stück');
  });
});

describe('Ganze Packung verwenden?', () => {
  const ask = (amount: number) => packSuggestions(pantry(hack()), [{ id: 'a', name: 'Rinderhack', amount, unit: 'g' }], T);

  it('600 g, Packung 500 g → „nur 500 g?“ (sonst 400 g offen)', () => {
    expect(ask(600)).toEqual([expect.objectContaining({ amount: 500, planned: 600, packs: 1, wouldOpen: 400 })]);
  });
  it('450 g → „die ganze Packung?“', () => {
    expect(ask(450)).toEqual([expect.objectContaining({ amount: 500, packs: 1, wouldOpen: 50 })]);
  });
  it('geht auf (1000 g) oder zu weit weg (700 g) → keine Frage', () => {
    expect(ask(1000)).toEqual([]);
    expect(ask(700)).toEqual([]);
  });
  it('schon etwas offen → keine Frage (das Offene kommt zuerst dran)', () => {
    const p = pantry(hack(), { id: 'o', name: 'Rinderhack', amount: 100, unit: 'g', addedAt: NOW, openedAt: NOW });
    expect(packSuggestions(p, [{ id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }], T)).toEqual([]);
  });
});

describe('Alte Vorräte bekommen ihre Packungsgröße', () => {
  const joghurt = { id: 'pj', packageAmount: 500, packageUnit: 'g' as const };
  const table = { ...T, matchName: (n: string) => (n === 'Joghurt' ? { food: { ref: { provider: 'mine', foodId: 'pj' }, name: 'Joghurt', per100g: { kcal: 60, protein: 4, carbs: 5, fat: 3 } }, quality: 'exact' as const } : T.matchName(n)) };

  it('„2⅔ Stück Joghurt“ → „2 × 500 g“ + „333 g offen“', () => {
    const items = attachPacks([{ id: 'j', name: 'Joghurt', amount: 2.67, unit: 'Stück', addedAt: NOW }], table, [joghurt], NOW)!;
    expect(items.map(amountLabel)).toEqual(['2 × 500 g', '335 g offen']);
    // Produkt gemerkt: neue Becher vom selben Produkt werden dazugezählt
    expect(addItem(items, { name: 'Joghurt', amount: 3, unit: 'Stück', pack: { amount: 500, unit: 'g' }, productId: 'pj' }, NOW, id).map(amountLabel)).toEqual(['5 × 500 g', '335 g offen']);
  });
  it('ohne Produkt mit Packung (Paprika) bleibt alles, wie es ist', () => {
    expect(attachPacks([{ id: 'p', name: 'Paprika', amount: 2.5, unit: 'Stück', addedAt: NOW }], table, [joghurt], NOW)).toBeUndefined();
  });
});

describe('Einheit beim Eintragen mit Produkt', () => {
  it('Produkt mit Packung → Stück; echtes Glas (Pesto) → Glas', () => {
    const pesto = T.matchName('Pesto')?.food;
    expect(suggestPantryUnit(T.matchName('Joghurt')?.food, { packageAmount: 500, packageUnit: 'g' }, T.matchName('Joghurt')?.food)).toBe('Stück');
    expect(suggestPantryUnit(pesto, { packageAmount: 190, packageUnit: 'g' }, pesto)).toBe('Glas');
  });
});

describe('Offener Joghurt vom Produkt ist kein Glas', () => {
  it('Produkt mit Packung 500 g: offen 3 Tage, nicht 14', async () => {
    const { withMyProducts } = await import('./nutrition/myProducts');
    const table = withMyProducts(T, [{ id: 'pj2', name: 'Joghurt', replaces: ['joghurt-35'], names: ['joghurt'], per100g: { kcal: 60, protein: 4, carbs: 5, fat: 3 }, packageAmount: 500, packageUnit: 'g', updatedAt: NOW }]);
    const open: PantryItem = { id: 'o', name: 'Joghurt', amount: 350, unit: 'g', addedAt: NOW, boughtAt: NOW, openedAt: NOW };
    expect(useByOf(open, table)!.toISOString().slice(0, 10)).toBe('2026-09-30');
  });
});

describe('Doppelte Zeilen zusammenlegen', () => {
  it('„2 × 500 g“ (ohne Sorte) + „2 × 500 g“ (mit Sorte) → „4 × 500 g“; Offenes und andere Größen bleiben', () => {
    const p = (id: string, amount: number, extra: Partial<PantryItem> = {}): PantryItem => ({ id, name: 'Joghurt', amount, unit: 'Stück', pack: { amount: 500, unit: 'g' }, addedAt: NOW, ...extra });
    const items = mergeSamePacks([
      p('a', 2), p('b', 2, { productId: 'pj' }),
      { id: 'o', name: 'Joghurt', amount: 400, unit: 'g', addedAt: NOW, openedAt: NOW },
      p('c', 1, { pack: { amount: 250, unit: 'g' } }),
    ])!;
    expect(items.map(amountLabel)).toEqual(['4 × 500 g', '400 g offen', '1 × 250 g']);
    expect(items[0].productId).toBe('pj');
  });
  it('nichts doppelt → undefined', () => {
    expect(mergeSamePacks([{ id: 'a', name: 'Joghurt', amount: 2, unit: 'Stück', addedAt: NOW }])).toBeUndefined();
  });
});

describe('Alte Einträge in ml/g werden Packungen', () => {
  const milch = { id: 'pm', packageAmount: 1000, packageUnit: 'ml' as const };
  const table = { ...T, matchName: (n: string) => (n === 'Milch' ? { food: { ref: { provider: 'mine', foodId: 'pm' }, name: 'Milch', per100g: { kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 } }, quality: 'exact' as const } : T.matchName(n)) };
  const ml = (id: string, amount: number, extra: Partial<PantryItem> = {}): PantryItem => ({ id, name: 'Milch', amount, unit: 'ml', addedAt: NOW, ...extra });

  it('„3000 ml“ → „3 × 1 l“, „400 ml“ → „400 ml offen“, „2500 ml“ → „2 × 1 l“ + „500 ml offen“', () => {
    expect(attachPacks([ml('a', 3000)], table, [milch], NOW)!.map(amountLabel)).toEqual(['3 × 1 l']);
    expect(attachPacks([ml('b', 400)], table, [milch], NOW)!.map(amountLabel)).toEqual(['400 ml offen']);
    expect(attachPacks([ml('c', 2500)], table, [milch], NOW)!.map(amountLabel)).toEqual(['2 × 1 l', '500 ml offen']);
  });
  it('schon offen oder gefroren und nicht aufgehend → bleibt, wie es ist', () => {
    expect(attachPacks([ml('d', 800, { openedAt: NOW }), ml('e', 1500, { frozenAt: NOW })], table, [milch], NOW)).toBeUndefined();
  });
  it('große Mengen lesbar: „1500 g“ → „1,5 kg“, „1200 ml offen“ → „1,2 l offen“', () => {
    expect(amountLabel({ amount: 1500, unit: 'g' })).toBe('1,5 kg');
    expect(amountLabel({ amount: 1200, unit: 'ml', openedAt: NOW })).toBe('1,2 l offen');
    expect(amountLabel({ amount: 400, unit: 'ml' })).toBe('400 ml');
  });
});

describe('Umstellen auf Packungen – zwei Geräte, Stückware', () => {
  const joghurt = { id: 'pj', packageAmount: 500, packageUnit: 'g' as const };
  const table = { ...T, matchName: (n: string) => (n === 'Joghurt' ? { food: { ref: { provider: 'mine', foodId: 'pj' }, name: 'Joghurt', per100g: { kcal: 60, protein: 4, carbs: 5, fat: 3 } }, quality: 'exact' as const } : T.matchName(n)) };
  it('beide Geräte stellen gleichzeitig um → derselbe offene Rest (gleiche ID), nicht zwei', () => {
    const it0: PantryItem = { id: 'j', name: 'Joghurt', amount: 1300, unit: 'g', addedAt: NOW };
    const a = attachPacks([it0], table, [joghurt], NOW)!;
    const b = attachPacks([it0], table, [joghurt], '2026-09-28T12:05:00.000Z')!;
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    const merged = merge3Pantry({ ...emptyPantry(), items: [it0] }, { ...emptyPantry(), items: a }, { ...emptyPantry(), items: b });
    expect(merged.items.map(amountLabel)).toEqual(['2 × 500 g', '300 g offen']);
  });
  it('„6 Zwiebeln“ mit einem Produkt „Netz 1 kg“ bleiben 6 Stück', () => {
    const netz = { id: 'pz', packageAmount: 1000, packageUnit: 'g' as const };
    const t2 = { ...T, matchName: (n: string) => (n === 'Zwiebel' ? { food: { ...T.matchName('Zwiebel')!.food, ref: { provider: 'mine', foodId: 'pz' } }, quality: 'exact' as const } : T.matchName(n)) };
    expect(attachPacks([{ id: 'z', name: 'Zwiebel', amount: 6, unit: 'Stück', addedAt: NOW }], t2, [netz], NOW)).toBeUndefined();
  });
});

describe('Nachkaufen in g zählt Offenes mit', () => {
  it('Regel „Hack unter 1200 g“: 2 × 500 g + 400 g offen = 1400 g → reicht', () => {
    const p: Pantry = { ...pantry(hack(2), { id: 'o', name: 'Rinderhack', amount: 400, unit: 'g', addedAt: NOW, openedAt: NOW }), restock: [{ name: 'Rinderhack', below: 1200, unit: 'g' }] };
    expect(restockNeeds(p, T)).toEqual([]);
  });
});

describe('Gefrorenes und Aufgetautes', () => {
  it('angebrochen eingefroren, Wochen später aufgetaut → nicht sofort „drüber“ (Offen-Frist ab dem Auftauen)', () => {
    const open: PantryItem = { id: 'o', name: 'Milch', amount: 500, unit: 'ml', addedAt: '2026-09-01T12:00:00.000Z', openedAt: '2026-09-01T12:00:00.000Z' };
    const frozen = freezeItem([open], 'o', '2026-09-01T13:00:00.000Z');
    const [thawed] = thawItem(frozen, 'o', NOW, 1);
    expect(useByOf(thawed, T)!.getTime()).toBeGreaterThan(new Date(NOW).getTime());
  });
  it('gefrorene Packung angebrochen: ganze bleiben gefroren, der Rest ist aufgetaut und hält kurz', () => {
    const three = cook(pantry({ ...hack(3), frozenAt: '2026-09-01T12:00:00.000Z' }), { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' });
    expect(three.items.map((i) => [amountLabel(i), !!i.frozenAt])).toEqual([['1 × 500 g', true], ['400 g offen', false]]);
    const p = pantry({ ...hack(2), frozenAt: '2026-09-01T12:00:00.000Z' });
    const after = cook(p, { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' });
    // 600 g aus 2 × 500 g: beide aufgetaut, 400 g bleiben – nicht mehr gefroren
    expect(after.items.map((i) => [amountLabel(i), !!i.frozenAt])).toEqual([['400 g offen', false]]);
    expect(after.items.find((i) => i.openedAt)!.useBy).toBeDefined();
  });
  it('Frisches wird zuerst genommen, Gefrorenes (auch angebrochen eingefroren) zuletzt', () => {
    const p = pantry(hack(1), { id: 'f', name: 'Rinderhack', amount: 300, unit: 'g', addedAt: NOW, openedAt: NOW, frozenAt: NOW });
    const after = cook(p, { id: 'a', name: 'Rinderhack', amount: 200, unit: 'g' });
    expect(after.items.find((i) => i.frozenAt)!.amount).toBe(300);
  });
  it('Aufgetautes mit Datum wird nicht mit frischer Ware zusammengelegt', () => {
    const thawed: PantryItem = { ...hack(2), id: 't', useBy: '2026-09-29T12:00:00.000Z' };
    expect(mergeSamePacks([hack(1), thawed])).toBeUndefined();
    expect(addItem([thawed], { name: 'Rinderhack', amount: 1, unit: 'Stück', pack: { amount: 500, unit: 'g' } }, NOW, id)).toHaveLength(2);
  });
  it('„Ganze Packung?“: nie mehr Packungen, als da sind', () => {
    expect(packSuggestions(pantry(hack(2)), [{ id: 'a', name: 'Rinderhack', amount: 1600, unit: 'g' }], T)).toEqual([]);
  });
});

describe('Auftauen fürs geplante Gericht', () => {
  const FROZEN = '2026-09-01T12:00:00.000Z';
  const dishFor = (p: Pantry, ing: Ingredient) => ({ recipeId: 'r', taken: takenBetween(p, cook(p, ing)), stock: new Map() });

  it('nur gefroren da: so viele Packungen auftauen, wie das Gericht braucht – der Rest bleibt gefroren', () => {
    const p = pantry({ ...hack(3), frozenAt: FROZEN });
    const needs = thawNeeds(dishFor(p, { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }), T);
    expect(needs.map((x) => [x.item.id, x.amount])).toEqual([['h', 2]]);
    const after = thawItem(p.items, 'h', NOW, 1, 2, id);
    expect(after.map((i) => [amountLabel(i), !!i.frozenAt, !!i.useBy])).toEqual([['1 × 500 g', true, false], ['2 × 500 g', false, true]]);
  });

  it('Frisches reicht → nichts auftauen', () => {
    const p = pantry(hack(2), { ...hack(3), id: 'tk', frozenAt: FROZEN });
    expect(thawNeeds(dishFor(p, { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }), T)).toEqual([]);
  });

  it('TK-Gemüse kommt gefroren in den Topf → kein Hinweis', () => {
    const p = pantry({ id: 'e', name: 'Erbsen', amount: 750, unit: 'g', addedAt: NOW, frozenAt: FROZEN });
    expect(thawNeeds(dishFor(p, { id: 'a', name: 'Erbsen', amount: 200, unit: 'g' }), T)).toEqual([]);
  });

  it('loser Block in Gramm: der ganze Eintrag taut auf (ein Block lässt sich nicht teilen)', () => {
    const p = pantry({ id: 'b', name: 'Rinderhack', amount: 1000, unit: 'g', addedAt: NOW, frozenAt: FROZEN });
    const [need] = thawNeeds(dishFor(p, { id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }), T);
    expect(need.amount).toBeUndefined();
    expect(thawItem(p.items, 'b', NOW, 1, need.amount, id).map((i) => [i.amount, !!i.frozenAt])).toEqual([[1000, false]]);
  });
});

describe('Portionen passend zum Aufgetauten', () => {
  const FROZEN = '2026-09-01T12:00:00.000Z';
  // Rezept: 500 g Hack für 4 Portionen = 125 g je Portion
  const lasagne = { ...content([{ id: 'a', name: 'Rinderhack', amount: 500, unit: 'g' }]), servings: 4 };
  const needsAt = (p: Pantry, servings: number) => {
    const d = deductRecipe(p, lasagne, servings, T, {}, {}, NOW, id);
    return thawNeeds({ recipeId: 'r', taken: takenBetween(p, d.pantry), stock: new Map() }, T);
  };

  it('5 Portionen = 625 g → 2 Packungen auftauen; 1 kg reicht für 8, eine Packung für 4', () => {
    const needs = needsAt(pantry({ ...hack(3), frozenAt: FROZEN }), 5);
    expect(needs.map((n) => [n.amount, n.used])).toEqual([[2, 1.25]]);
    expect(thawFit(needs, 5)).toEqual({ up: 8, down: { servings: 4, packs: 1 } });
  });

  it('passt genau (4 Portionen, 1 Packung) → kein Vorschlag', () => {
    expect(thawFit(needsAt(pantry({ ...hack(3), frozenAt: FROZEN }), 4), 4)).toEqual({});
  });

  it('abgerundet: 1 kg-Block bei 150 g je Portion → 6, nicht 7 (sonst fehlte gleich wieder etwas)', () => {
    const block = pantry({ id: 'b', name: 'Rinderhack', amount: 1000, unit: 'g', addedAt: NOW, frozenAt: FROZEN });
    const d = deductRecipe(block, { ...lasagne, ingredients: [{ id: 'a', name: 'Rinderhack', amount: 600, unit: 'g' }] }, 4, T, {}, {}, NOW, id);
    const needs = thawNeeds({ recipeId: 'r', taken: takenBetween(block, d.pantry), stock: new Map() }, T);
    // ein Block lässt sich nicht teilen → nur „mehr Portionen“, kein „weniger auftauen“
    expect(thawFit(needs, 4)).toEqual({ up: 6 });
  });
});

describe('Menge von Hand ändern: weniger = angebrochen, außer ganze Packungen oder Stücke', () => {
  const NOW = '2026-09-30T10:00:00.000Z';
  const base = (x: Partial<PantryItem>): PantryItem => ({ id: 'a', name: 'Testzutat', addedAt: '2026-09-20T10:00:00.000Z', ...x });
  const one = (items: PantryItem[]) => items.map(({ id: _i, addedAt: _a, boughtAt: _b, ...rest }) => rest);

  it('g/ml ohne Packung: weniger heißt offen, mehr nicht', () => {
    expect(changeAmount([base({ amount: 1000, unit: 'g' })], 'a', 700, NOW)[0]).toMatchObject({ amount: 700, openedAt: NOW });
    expect(changeAmount([base({ amount: 500, unit: 'g' })], 'a', 600, NOW)[0].openedAt).toBeUndefined();
    // schon offen: das Datum bleibt, an dem es geöffnet wurde
    expect(changeAmount([base({ amount: 500, unit: 'ml', openedAt: '2026-09-28T10:00:00.000Z' })], 'a', 300, NOW)[0].openedAt).toBe('2026-09-28T10:00:00.000Z');
  });

  it('ganze Packungen oder Stücke weniger: der Rest bleibt zu', () => {
    const cans = base({ amount: 3, unit: 'Stück', pack: { amount: 400, unit: 'ml' } });
    expect(changeAmount([cans], 'a', 2, NOW)).toEqual([{ ...cans, amount: 2, check: false }]);
    expect(changeAmount([base({ amount: 6, unit: 'Stück' })], 'a', 4, NOW)[0].openedAt).toBeUndefined();
  });

  it('Bruchteil einer Packung: zwei bleiben zu, eine wird zum offenen Rest', () => {
    const cans = base({ amount: 3, unit: 'Stück', pack: { amount: 400, unit: 'ml' } });
    const out = changeAmount([cans], 'a', 2.5, NOW, () => 'rest');
    expect(one(out)).toMatchObject([
      { amount: 2, unit: 'Stück', pack: { amount: 400, unit: 'ml' } },
      { amount: 200, unit: 'ml', openedAt: NOW },
    ]);
    expect(out[0].openedAt).toBeUndefined();
    expect(amountLabel(out[0]) + ' + ' + amountLabel(out[1])).toBe('2 × 400 ml + 200 ml offen');
  });

  it('0 = alle; Vorgekochtes und Eingefrorenes werden nie „angebrochen“', () => {
    expect(changeAmount([base({ amount: 500, unit: 'g' })], 'a', 0, NOW)).toEqual([]);
    expect(changeAmount([base({ amount: 3, unit: 'Stück', recipeId: 'r' })], 'a', 2, NOW)[0].openedAt).toBeUndefined();
    expect(changeAmount([base({ amount: 800, unit: 'g', frozenAt: NOW })], 'a', 400, NOW)[0].openedAt).toBeUndefined();
  });
});
