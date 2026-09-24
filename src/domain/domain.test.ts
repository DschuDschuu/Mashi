import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { filterRecipes } from './filter';
import { computeNutrition } from './nutrition/engine';
import { localFoodTable } from './nutrition/localFoods';
import { currentContent, originalVersion } from './recipe';
import { formatAmount, scaleIngredients } from './scaling';
import type { RecipeContent } from './types';
import { diffContent } from './versions';

const base = (ingredients: RecipeContent['ingredients'], servings = 2): RecipeContent => ({
  title: 'Test', description: '', servings, prepMinutes: 5, cookMinutes: 10, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});

describe('Portionen', () => {
  it('skaliert Mengen linear und lässt Zutaten ohne Menge in Ruhe', () => {
    const c = base([{ id: 'a', name: 'Reis', amount: 150, unit: 'g' }, { id: 'b', name: 'Salz' }]);
    const scaled = scaleIngredients(c, 3);
    expect(scaled[0].amount).toBe(225);
    expect(scaled[1].amount).toBeUndefined();
  });

  it('zeigt Mengen küchentauglich an', () => {
    expect(formatAmount(1.5, 'EL')).toBe('1½');
    expect(formatAmount(0.5, 'TL')).toBe('½');
    expect(formatAmount(0.1, 'TL')).toBe('¼'); // nie „0 TL“
    expect(formatAmount(2.97, 'Stück')).toBe('3');
    expect(formatAmount(337.5, 'g')).toBe('340');
    expect(formatAmount(7.25, 'g')).toBe('7,3');
    expect(formatAmount(1.25, 'kg')).toBe('1,25');
  });
});

describe('Nährwertengine', () => {
  it('rechnet exakt zugeordnete Zutaten als „berechnet“', () => {
    const n = computeNutrition(base([{ id: 'a', name: 'Reis', amount: 100, unit: 'g' }], 1), localFoodTable);
    expect(n.accuracy).toBe('berechnet');
    expect(n.perServing!.kcal).toBeCloseTo(350);
    expect(n.perServing!.carbs).toBeCloseTo(78);
  });

  it('teilt durch die Portionszahl', () => {
    const n = computeNutrition(base([{ id: 'a', name: 'Reis', amount: 200, unit: 'g' }], 2), localFoodTable);
    expect(n.perServing!.kcal).toBeCloseTo(350);
    expect(n.total!.kcal).toBeCloseTo(700);
  });

  it('nutzt Stückgewichte und lebensmittelspezifische Löffel', () => {
    const n = computeNutrition(base([{ id: 'a', name: 'Avocado', amount: 1, unit: 'Stück' }, { id: 'b', name: 'Gochujang', amount: 1, unit: 'EL' }], 1), localFoodTable);
    expect(n.items[0].grams).toBe(150);
    expect(n.items[1].grams).toBe(18);
    expect(n.accuracy).toBe('berechnet');
  });

  it('wird bei einer kleinen unbekannten Zutat zu „geschätzt“', () => {
    const n = computeNutrition(base([
      { id: 'a', name: 'Reis', amount: 400, unit: 'g' },
      { id: 'b', name: 'Hähnchenhack', amount: 300, unit: 'g' },
      { id: 'c', name: 'Paprika', amount: 1, unit: 'Stück' },
      { id: 'd', name: 'Kimchi', amount: 100, unit: 'g' },
    ]), localFoodTable);
    expect(n.accuracy).toBe('geschaetzt');
    expect(n.items[3].status).toBe('unmatched');
    expect(n.perServing).not.toBeNull();
  });

  it('zeigt lieber nichts, wenn zu viel unbekannt ist', () => {
    const n = computeNutrition(base([
      { id: 'a', name: 'Reis', amount: 100, unit: 'g' },
      { id: 'b', name: 'Drachenfrucht-Chutney', amount: 300, unit: 'g' },
    ]), localFoodTable);
    expect(n.accuracy).toBe('nicht_verfuegbar');
    expect(n.perServing).toBeNull();
  });

  it('ignoriert optionale Zutaten und Salz ohne Menge', () => {
    const n = computeNutrition(base([
      { id: 'a', name: 'Reis', amount: 100, unit: 'g' },
      { id: 'b', name: 'Salz & Pfeffer' },
      { id: 'c', name: 'Sesam', amount: 1, unit: 'TL', optional: true },
    ], 1), localFoodTable);
    expect(n.accuracy).toBe('berechnet');
    expect(n.perServing!.kcal).toBeCloseTo(350);
  });

  it('erkennt Zusätze in Klammern und bevorzugt den längeren Namen', () => {
    expect(localFoodTable.matchName('Paprika (rot oder bunt)')?.quality).toBe('exact');
    expect(localFoodTable.matchName('geräuchertes Paprikapulver')?.food.ref.foodId).toBe('paprikapulver');
    expect(localFoodTable.matchName('kleine rote Zwiebel')).toMatchObject({ quality: 'approx' });
  });

  it('berechnet für alle Beispielrezepte plausible Werte', () => {
    for (const r of createMockRecipes()) {
      const n = computeNutrition(currentContent(r), localFoodTable);
      if (n.perServing) {
        expect(n.perServing.kcal, currentContent(r).title).toBeGreaterThan(50);
        expect(n.perServing.kcal, currentContent(r).title).toBeLessThan(1500);
      }
    }
  });
});

describe('Versionen', () => {
  it('erkennt Mengenänderungen als Änderung statt als gelöscht + neu', () => {
    const gochujang = createMockRecipes().find((r) => r.id === 'gochujang-bowl')!;
    const changes = diffContent(originalVersion(gochujang).content, currentContent(gochujang));
    expect(changes).toContainEqual({ kind: 'ingredient-changed', name: 'Hähnchenhack', before: '300 g Hähnchenhack', after: '350 g Hähnchenhack' });
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'ingredient-changed', name: 'Gochujang', after: '2 EL Gochujang' }));
    expect(changes.filter((c) => c.kind === 'ingredient-added' || c.kind === 'ingredient-removed')).toHaveLength(0);
  });

  it('wertet reine Portionsänderung nicht als Mengenänderung', () => {
    const a = base([{ id: 'x', name: 'Reis', amount: 100, unit: 'g' }], 2);
    const b = { ...a, servings: 4, ingredients: [{ id: 'x', name: 'Reis', amount: 200, unit: 'g' as const }] };
    expect(diffContent(a, b)).toEqual([{ kind: 'field-changed', field: 'Portionen', before: '2', after: '4' }]);
  });
});

describe('Filter', () => {
  const recipes = createMockRecipes();
  const nut = (r: (typeof recipes)[number]) => computeNutrition(currentContent(r), localFoodTable);

  it('kombiniert Gerät UND Zeit UND Protein', () => {
    const hits = filterRecipes(recipes, { devices: ['airfryer'], maxMinutes: 30, minProtein: 25 }, nut);
    expect(hits.map((r) => r.id)).toEqual(['airfryer-chicken']);
  });

  it('zeigt KI-Entwürfe nicht im Kochbuch', () => {
    expect(filterRecipes(recipes, {}, nut).some((r) => r.status === 'ki_entwurf')).toBe(false);
  });

  it('sucht auch in Zutaten', () => {
    expect(filterRecipes(recipes, { query: 'gochujang' }, nut).map((r) => r.id)).toContain('gochujang-bowl');
  });
});

describe('Versionen – Schritte verschieben', () => {
  const content = (steps: string[]): RecipeContent => ({
    ...base([], 2),
    steps: steps.map((t) => ({ id: t, text: `Text ${t}` })),
  });

  it('meldet Verschieben als eine Änderung, nicht als „jeder Schritt angepasst“', () => {
    expect(diffContent(content(['a', 'b', 'c']), content(['c', 'a', 'b']))).toEqual([{ kind: 'steps-reordered' }]);
  });

  it('ein Schritt dazwischen eingefügt ist KEIN Verschieben', () => {
    const after = content(['a', 'b', 'c']);
    after.steps.splice(1, 0, { id: 'neu', text: 'vergessen' });
    expect(diffContent(content(['a', 'b', 'c']), after)).toEqual([{ kind: 'step-added', index: 1 }]);
  });

  it('verschoben und geändert: beides wird gemeldet', () => {
    const after = content(['b', 'a']);
    after.steps[1] = { ...after.steps[1], text: 'geändert' };
    expect(diffContent(content(['a', 'b']), after)).toEqual([
      { kind: 'step-changed', index: 1 },
      { kind: 'steps-reordered' },
    ]);
  });

  it('entfernen allein ist kein Verschieben', () => {
    expect(diffContent(content(['a', 'b', 'c']), content(['a', 'c']))).toEqual([{ kind: 'step-removed', index: 1 }]);
  });
});

describe('Nährwerte – vernachlässigbare Zutaten', () => {
  it('„3 Prisen Pfeffer“ und Wasser stufen ein Rezept nicht auf „geschätzt“ herab', () => {
    const n = computeNutrition(base([
      { id: 'a', name: 'Reis', amount: 100, unit: 'g' },
      { id: 'b', name: 'Pfeffer', amount: 3, unit: 'Prise' },
      { id: 'c', name: 'kochendes Wasser', amount: 800, unit: 'g' },
      { id: 'd', name: 'getrocknete italienische Kräuter', amount: 2, unit: 'TL' },
    ], 1), localFoodTable);
    expect(n.accuracy).toBe('berechnet');
    expect(n.perServing!.kcal).toBeCloseTo(350);
  });
});
