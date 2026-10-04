import { describe, expect, it } from 'vitest';
import { localFoodTable as T } from './nutrition/localFoods';
import { exclusiveStages, stageOf, withStage } from './stage';
import { basicsKeys, basicsOf, DEFAULT_BASICS, keyOfName } from './mealplan';
import { DEFAULT_NO_NUTRITION, spiceName, withSpices, zeroOf } from './nutrition/noNutrition';
import { withMyProducts, type MyProduct } from './nutrition/myProducts';
import { buildFoodList } from './nutrition/foodList';

const TOMATEN = { below: 4, unit: 'Stück' as const };

describe('Eine Stufe je Lebensmittel', () => {
  it('erkennt die Stufe – auch unter anderem Namen („Nudeln“ = „Pasta“)', () => {
    const p = { basics: ['Pasta'], restock: [{ name: 'Passata', ...TOMATEN }] };
    expect(stageOf('Nudeln', p, T)).toMatchObject({ stage: 'haus', basic: 'Pasta' });
    expect(stageOf('Passierte Tomaten', p, T)).toMatchObject({ stage: 'nachkaufen', rule: { name: 'Passata' } });
    expect(stageOf('Mais', p, T).stage).toBe('normal');
  });

  it('ohne eigene Liste gilt die Vorbelegung „immer im Haus“', () => {
    expect(stageOf('Reis', {}, T).stage).toBe('haus');
  });

  it('neue Stufe: die andere fällt weg', () => {
    const haus = withStage({ basics: ['Tomatenmark'], restock: [], noNutrition: [] }, 'Tomatenmark', 'nachkaufen', T, { below: 2, unit: 'Stück' });
    expect(haus).toEqual({ basics: [], restock: [{ name: 'Tomatenmark', below: 2, unit: 'Stück' }], noNutrition: [] });
    const back = withStage(haus, 'Tomatenmark', 'haus', T);
    expect(back).toEqual({ basics: ['Tomatenmark'], restock: [], noNutrition: [] });
    expect(withStage(back, 'Tomatenmark', 'normal', T)).toEqual({ basics: [], restock: [], noNutrition: [] });
  });

  it('bisher beides → nachkaufen (die genauere Einstellung)', () => {
    expect(exclusiveStages({ basics: ['Pasta', 'Tomatenmark'], restock: [{ name: 'Tomatenmark', ...TOMATEN }], noNutrition: [] }, T)).toEqual({ basics: ['Pasta'] });
    expect(exclusiveStages({ basics: ['Pasta'], restock: [{ name: 'Mais', ...TOMATEN }], noNutrition: [] }, T)).toBeUndefined();
  });
});

describe('Vierte Stufe: ohne Nährwerte', () => {
  it('wird erkannt (auch die Vorbelegung, z. B. Kreuzkümmel) und schließt die anderen aus', () => {
    expect(stageOf('Kreuzkümmel', {}, T).stage).toBe('ohne');
    const s = withStage({ basics: ['Sumach'], restock: [], noNutrition: [] }, 'Sumach', 'ohne', T);
    expect(s).toEqual({ basics: [], restock: [], noNutrition: ['Sumach'] });
    expect(withStage(s, 'Sumach', 'haus', T)).toEqual({ basics: ['Sumach'], restock: [], noNutrition: [] });
  });
  it('bisher „immer im Haus“ UND „ohne Nährwerte“ → ohne Nährwerte', () => {
    expect(exclusiveStages({ basics: ['Pasta', 'Kreuzkümmel'], restock: [], noNutrition: ['Kreuzkümmel'] }, T)).toEqual({ basics: ['Pasta'] });
  });
});

describe('Listen mit Vorbelegung', () => {
  it('nie eingestellt = Vorbelegung, bewusst geleert bleibt leer', () => {
    expect(basicsOf({})).toEqual(DEFAULT_BASICS);
    expect(basicsOf(undefined)).toEqual(DEFAULT_BASICS);
    expect(basicsOf({ basics: [] })).toEqual([]);
    expect(zeroOf({})).toEqual(DEFAULT_NO_NUTRITION);
    expect(zeroOf({ noNutrition: [] })).toEqual([]);
  });

  it('ein Name, ein Schlüssel – egal wie geschrieben', () => {
    expect(keyOfName('Nudeln', T)).toBe(keyOfName('Pasta', T));
    expect(keyOfName('Mais', T)).not.toBe(keyOfName('Pasta', T));
  });
});

describe('Gewürz und frisches Kraut mit gleichem Namen (Julia: Petersilie getrocknet und Bund)', () => {
  // erfundene Werte: frische Petersilie als eigenes Lebensmittel, dazu „Petersilie“ in den Gewürzen
  const bund: MyProduct = { id: 'p-pet', name: 'Petersilie', replaces: [], per100g: { kcal: 40, protein: 4, carbs: 3, fat: 1 }, updatedAt: '2026-10-01T00:00:00Z' };
  const mine = withMyProducts(T, [bund]);
  const pantry = { basics: [], noNutrition: ['Petersilie'], restock: [{ name: 'Petersilie', below: 1, unit: 'Stück' as const }] };
  const table = withSpices(mine, pantry.noNutrition);

  it('der Bund behält „Nachkaufen“, das Gewürz ist die getrocknete', () => {
    expect(stageOf('Petersilie', pantry, table)).toMatchObject({ stage: 'nachkaufen' });
    expect(stageOf('Petersilie getrocknet', pantry, table)).toMatchObject({ stage: 'ohne', zero: 'Petersilie' });
    // und keine der beiden räumt die andere weg
    expect(exclusiveStages(pantry, table)).toBeUndefined();
  });

  it('Gewürz neu anlegen löscht nicht „Nachkaufen“ beim Bund – und umgekehrt', () => {
    const fresh = { basics: [], noNutrition: [], restock: pantry.restock };
    const added = withStage(fresh, 'Petersilie', 'ohne', withSpices(mine, []));
    expect(added).toMatchObject({ noNutrition: ['Petersilie'], restock: pantry.restock });
    expect(withStage(pantry, 'Petersilie', 'haus', table)).toMatchObject({ noNutrition: ['Petersilie'], basics: ['Petersilie'], restock: [] });
  });

  it('der Bund bleibt einkaufbar: nur die getrocknete zählt zu den Basics', () => {
    const keys = basicsKeys(pantry, table);
    expect(keys.has(keyOfName('Petersilie getrocknet', table)!)).toBe(true);
    expect(keys.has(keyOfName('Petersilie', table)!)).toBe(false);
  });

  it('„Meine Lebensmittel“: zwei Zeilen – der Bund unter Produkte, „Petersilie getrocknet“ unter Gewürze', () => {
    const rows = buildFoodList([bund], [], pantry.noNutrition, T, [], [], (z) => spiceName(z, table));
    expect(rows.map((r) => [r.name, r.products.length, r.zero ?? ''])).toEqual([['Petersilie', 1, ''], ['Petersilie getrocknet', 0, 'Petersilie']]);
  });
});
