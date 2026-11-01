import { describe, expect, it } from 'vitest';
import { chosenContent } from './choices';
import { sideContent } from './mix';
import { DRESSINGS, activeSalad, isSaladIngredient, makeSalad, saladText, saladToppings, saladVeg, withSalad } from './sideSalad';
import type { Recipe, RecipeContent } from './types';

// erfundenes Rezept – keine echten (das Repo ist öffentlich)
const content = (): RecipeContent => ({
  ...sideContent('Testauflauf'), servings: 2,
  ingredients: [{ id: 'n', name: 'Nudeln', amount: 250, unit: 'g' }, { id: 't', name: 'Tomaten', amount: 200, unit: 'g' }],
  steps: [{ id: 's1', text: 'Nudeln mit Tomaten in die Form geben und backen.' }],
});
const recipe = (extra: Partial<Recipe> = {}): Recipe => ({
  id: 'r', createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [], versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: content() }],
  ...extra,
});
const AT = '2026-11-01T12:00:00.000Z';
const salad = (extra: { keep?: boolean } = {}) => makeSalad(['salat', 'gurke', 'tomaten'], { dressing: 'joghurt', topping: 'feta', now: AT, ...extra })!;

describe('Beilagensalat (Julia: zu jedem Rezept, Zutaten selbst gewählt)', () => {
  it('zur Wahl: Gemüse, das roh geht – kein Brokkoli; Toppings ohne Ei und Cheddar', () => {
    const veg = saladVeg().map((s) => s.id);
    expect(veg).toEqual(expect.arrayContaining(['salat', 'gurke', 'tomaten', 'avocado', 'paprika']));
    expect(veg).not.toContain('brokkoli');
    expect(veg).not.toContain('zucchini');
    const tops = saladToppings().map((s) => s.id);
    expect(tops).toContain('feta');
    expect(tops).not.toContain('ei');
    expect(tops).not.toContain('cheddar');
  });

  it('gespeichert mit Mengen pro Portion – zusammen etwa 120 g Gemüse, eine Beilage', () => {
    const s = salad();
    expect(s.items.map((i) => i.side)).toEqual(['salat', 'gurke', 'tomaten']);
    expect(s.items.reduce((n, i) => n + i.grams, 0)).toBeGreaterThanOrEqual(119);
    expect(s.items.reduce((n, i) => n + i.grams, 0)).toBeLessThanOrEqual(121);
    expect(s).toMatchObject({ dressing: 'joghurt', topping: { side: 'feta', name: 'Feta', grams: 20 }, at: AT });
    expect(s.keep).toBeUndefined();
    expect(makeSalad(['salat'], { now: AT })!.items[0].grams).toBe(50); // eine Sorte: deine Menge
    expect(makeSalad([], { now: AT })).toBeUndefined();
    expect(makeSalad(['salat'], { dressing: 'gibtsnicht', now: AT })).not.toHaveProperty('dressing');
  });

  it('im Rezept: Zutaten mit „Beilagensalat“ für die Portionen, Dressing dazu, ein Schritt am Ende – kein eigener Teil', () => {
    const c = withSalad(content(), salad());
    const extra = c.ingredients.slice(2);
    expect(extra.every((i) => i.note === 'Beilagensalat' && !i.part)).toBe(true);
    expect(extra.map((i) => i.name)).toEqual(['Salat', 'Gurke', 'Tomaten', 'Joghurt', 'Zitronensaft', 'Feta']);
    expect(extra.find((i) => i.name === 'Joghurt')).toMatchObject({ amount: 4, unit: 'EL' }); // 2 EL × 2 Portionen
    expect(extra.find((i) => i.name === 'Feta')).toMatchObject({ amount: 40, unit: 'g' }); // halbe Topping-Menge: 20 g × 2
    const step = c.steps.at(-1)!;
    expect(step.text).toBe('Beilagensalat: Salat waschen und zupfen, Gurke in Scheiben schneiden und Tomaten würfeln; Joghurt mit Zitronensaft glatt rühren, salzen und pfeffern und unterheben – Feta drüberbröseln.');
    expect(step.ingredientIds).toEqual(extra.map((i) => i.id));
    // deine Schritte bleiben – mit ihren Zutaten von vorher: die Salat-Tomaten stehen nicht über „Nudeln mit Tomaten …“
    expect(c.steps[0]).toMatchObject({ text: content().steps[0].text, ingredientIds: ['n', 't'] });
    expect(extra.every(isSaladIngredient)).toBe(true);
    expect(c.ingredients.slice(0, 2).some(isSaladIngredient)).toBe(false);
    expect(withSalad(content(), undefined)).toEqual(content());
    expect(saladText(salad())).toBe('Salat, Gurke und Tomaten · Joghurt · Feta');
  });

  it('Balsamico (Julia: „mein Standard-Dressing“) steht zuerst – vorgewählt, ohne Öl', () => {
    expect(DRESSINGS[0].id).toBe('balsamico');
    const c = withSalad(content(), makeSalad(['salat'], { dressing: 'balsamico', now: AT }));
    expect(c.ingredients.slice(2).map((i) => `${i.amount} ${i.unit} ${i.name}`)).toEqual(['100 g Salat', '2 EL Balsamico']);
    expect(c.steps.at(-1)!.text).toBe('Beilagensalat: Salat waschen und zupfen; Balsamico mit Salz und Pfeffer verrühren und unterheben.');
  });

  it('nur fürs nächste Kochen: gilt, bis nach dem Dazunehmen gekocht wird – „immer dazu“ bleibt', () => {
    expect(activeSalad(recipe({ salad: salad() }))).toBeDefined();
    expect(activeSalad(recipe({ salad: salad(), lastCookedAt: '2026-10-30T18:00:00.000Z' }))).toBeDefined(); // vorher gekocht
    expect(activeSalad(recipe({ salad: salad(), lastCookedAt: '2026-11-01T19:00:00.000Z' }))).toBeUndefined(); // danach gekocht
    expect(activeSalad(recipe({ salad: salad({ keep: true }), lastCookedAt: '2026-11-01T19:00:00.000Z' }))).toBeDefined();
  });

  it('chosenContent: mit Salat, solange er gilt – danach wieder das Rezept allein', () => {
    expect(chosenContent(recipe({ salad: salad() })).ingredients).toHaveLength(8);
    const cooked = recipe({ salad: salad(), lastCookedAt: '2026-11-01T19:00:00.000Z' });
    expect(chosenContent(cooked)).toBe(cooked.versions[0].content);
  });
});
