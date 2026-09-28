import { describe, expect, it } from 'vitest';
import { localFoodTable as T } from './nutrition/localFoods';
import { exclusiveStages, stageOf, withStage } from './stage';
import { basicsOf, DEFAULT_BASICS, keyOfName } from './mealplan';
import { DEFAULT_NO_NUTRITION, zeroOf } from './nutrition/noNutrition';

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
