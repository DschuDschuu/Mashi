import { describe, expect, it } from 'vitest';
import { mealFactor, mealsNeeded, mealsOf, mealStep, suggestPot, type SuggestCandidate } from './weekSuggest';

// erfundene Rezepte und Werte – keine echten (das Repo ist öffentlich)
const range = { min: 1000, max: 1200 };

describe('Ein Essen im kcal-Bereich (Julia: „1000 bis 1200 pro Portion – 2 Portionen sind dann 1“)', () => {
  it('am liebsten eine Portion, sonst 1,5 oder 2 zusammen, oder eine halbe', () => {
    expect(mealFactor(1100, range)).toBe(1);
    expect(mealFactor(700, range)).toBe(1.5); // 1050
    expect(mealFactor(550, range)).toBe(2); // 1100
    expect(mealFactor(2200, range)).toBe(0.5); // 1100
  });

  it('passt nichts oder kcal unbekannt: kein Essen – ohne Bereich immer 1', () => {
    expect(mealFactor(900, range)).toBeUndefined(); // 900 zu wenig, 1350 zu viel
    expect(mealFactor(300, range)).toBeUndefined(); // auch 2 Portionen = 600
    expect(mealFactor(undefined, range)).toBeUndefined();
    expect(mealFactor(undefined, undefined)).toBe(1);
    expect(mealFactor(450, undefined)).toBe(1);
  });

  it('weiter Bereich: lieber die Portion wie im Rezept', () => {
    expect(mealFactor(700, { min: 600, max: 1200 })).toBe(1);
  });

  it('gerade Zahlen bei 1,5 je Essen – bei zwei Personen sind es 3 ganze', () => {
    expect(mealStep(1.5, { portions: 1 })).toBe(2);
    expect(mealStep(1, { portions: 1 })).toBe(1);
    expect(mealStep(1.5, { portions: 2 })).toBe(1);
    expect(mealStep(0.5, { portions: 1 })).toBe(2);
  });

  it('Essen pro Woche: Abende (Standard 7) plus Mittage; Essen je Topf-Eintrag', () => {
    expect(mealsNeeded({ lunchDays: [] })).toBe(7);
    expect(mealsNeeded({ evenings: 5, lunchDays: [0, 2, 4] })).toBe(8);
    expect(mealsOf({ portions: 3, per: 1.5 }, { portions: 1 })).toBe(2);
    expect(mealsOf({ portions: 4, per: 1.5 }, { portions: 1 })).toBe(2); // eine Portion übrig
    expect(mealsOf({ portions: 4 }, { portions: 2 })).toBe(2);
  });
});

describe('Topf aus den Angeboten füllen (Julia: „Mashi schlägt vor“, „wenige Rezepte“)', () => {
  const hh = { portions: 1, lunchDays: [] as number[] };
  const curry: SuggestCandidate = { recipeId: 'curry', kcal: 1100, keeps: 3 };
  const chili: SuggestCandidate = { recipeId: 'chili', kcal: 700, keeps: 2, freezable: true };
  const salat: SuggestCandidate = { recipeId: 'salat', kcal: 900, keeps: 2 };
  const suppe: SuggestCandidate = { recipeId: 'suppe', kcal: 1050, keeps: 2 };

  it('der Reihe nach, jedes Rezept so viele Essen, wie es hält; einfrierbar bis zur halben Woche', () => {
    const s = suggestPot([curry, chili, suppe], hh);
    expect(s.pot).toEqual([
      { recipeId: 'curry', portions: 3 }, // hält 3 Tage, ein Abend je Tag
      { recipeId: 'chili', portions: 4 }, // hält nur 2 Tage, ist aber einfrierbar: die übrigen 4 Abende
    ]);
    expect(s.missing).toBe(0);
    // einfrierbar allein: höchstens die halbe Woche, dann das nächste Rezept
    expect(suggestPot([chili, suppe, curry], hh).pot.map((p) => `${p.recipeId}:${p.portions}`)).toEqual(['chili:4', 'suppe:2', 'curry:1']);
  });

  it('mit kcal-Bereich: 1,5 Portionen je Essen, gerade Zahl Essen', () => {
    expect(suggestPot([chili], { ...hh, kcal: range }).pot).toEqual([{ recipeId: 'chili', portions: 6, per: 1.5 }]); // 4 Essen
  });

  it('kcal-Bereich: was nicht passt, bleibt draußen; fehlt am Ende etwas, sagt Mashi wie viel', () => {
    const s = suggestPot([salat, curry, suppe], { ...hh, kcal: range });
    expect(s.pot.map((p) => p.recipeId)).toEqual(['curry', 'suppe']);
    expect(s.missing).toBe(2);
  });

  it('ohne kcal-Bereich zählt jedes Rezept wie es ist', () => {
    expect(suggestPot([salat], hh).pot).toEqual([{ recipeId: 'salat', portions: 2 }]);
  });

  it('1,5 je Essen: nur gerade Zahlen – passt nur noch 1 Essen, kommt das nächste Rezept', () => {
    const s = suggestPot([chili, suppe], { ...hh, evenings: 5, kcal: range }, 4);
    expect(s.pot).toEqual([{ recipeId: 'suppe', portions: 1 }]);
    expect(s.missing).toBe(0);
  });

  it('Mittage zählen mit: mehr Essen je Tag, also mehr aus einem Rezept', () => {
    const s = suggestPot([curry], { ...hh, evenings: 7, lunchDays: [0, 1, 2, 3, 4] });
    expect(s.pot).toEqual([{ recipeId: 'curry', portions: 5 }]); // 3 Tage × 12/7 Essen
  });

  it('was schon im Topf liegt, bleibt und zählt mit', () => {
    const s = suggestPot([curry, suppe], hh, 6, ['curry']);
    expect(s.pot).toEqual([{ recipeId: 'suppe', portions: 1 }]);
  });

  it('zwei Personen: Portionen = Essen × je Essen × 2', () => {
    const s = suggestPot([chili], { portions: 2, lunchDays: [], evenings: 4, kcal: range }); // 2 Essen (halbe Woche)
    expect(s.pot).toEqual([{ recipeId: 'chili', portions: 6, per: 1.5 }]);
  });
});
