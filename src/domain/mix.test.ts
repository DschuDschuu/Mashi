import { describe, expect, it } from 'vitest';
import { emptyPlan } from './mealplan';
import { comboContent, goesTogether, isMixPart, mixChoices, planCombo, sideContent, toggleGoesWith } from './mix';
import type { Recipe } from './types';

// erfundene Bausteine – keine echten Rezepte (das Repo ist öffentlich)
const recipe = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: sideContent(title) }],
  ...extra,
});
const tomate = recipe('s1', 'Tomatensoße', { mix: 'sosse', goesWith: ['b2'] });
const pesto = recipe('s2', 'Pesto', { mix: 'sosse', favorite: true });
const pasta = recipe('b1', 'Pasta', { mix: 'beilage' });
const gnocchi = recipe('b2', 'Gnocchi', { mix: 'beilage' });
const reis = recipe('b3', 'Reis', { mix: 'beilage', archivedAt: '2026-01-01' });
const normal = recipe('r1', 'Ofengemüse');
const all = [tomate, pesto, pasta, gnocchi, reis, normal];
const ids = (list: Recipe[]) => list.map((r) => r.id);

describe('Mix & Match (Julia: Soßen und Beilagen frei kombinieren)', () => {
  it('nur Bausteine sind Mix-Teile – normale Rezepte nicht', () => {
    expect(all.filter(isMixPart).map((r) => r.id)).toEqual(['s1', 's2', 'b1', 'b2', 'b3']);
  });

  it('Auswahl je Rolle: ohne Archiviertes, Favorit zuerst, dann nach Name', () => {
    expect(ids(mixChoices(all, 'sosse'))).toEqual(['s2', 's1']);
    expect(ids(mixChoices(all, 'beilage'))).toEqual(['b2', 'b1']);
  });

  it('„passt gut zu“ gilt in beide Richtungen', () => {
    expect(goesTogether(tomate, gnocchi)).toBe(true);
    expect(goesTogether(gnocchi, tomate)).toBe(true);
    expect(goesTogether(pesto, gnocchi)).toBe(false);
  });

  it('„passt gut zu“ umschalten – aus nimmt es an beiden Seiten weg', () => {
    expect(toggleGoesWith(pesto, pasta)).toEqual({ a: ['b1'], b: [] });
    // an der Beilage gesetzt, von der Soße aus abgeschaltet
    expect(toggleGoesWith(tomate, { ...gnocchi, goesWith: ['s1'] })).toEqual({ a: [], b: [] });
  });

  it('Beilage = Mini-Rezept mit 1 Portion und einer Zutat (Julia: 100 g pro Person)', () => {
    const c = sideContent('  Gnocchi ');
    expect(c.title).toBe('Gnocchi');
    expect(c.servings).toBe(1);
    expect(c.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit }))).toEqual([{ name: 'Gnocchi', amount: 100, unit: 'g' }]);
    expect(sideContent('Reis', 80).ingredients[0].amount).toBe(80);
  });
});

describe('Kombination als ein Gericht (nur zum Rechnen)', () => {
  it('beide Bausteine auf die Portionen umgerechnet, Zutaten eindeutig, längere Zeit zählt', () => {
    const sauce = { ...sideContent('Testsoße', 400), servings: 4, cookMinutes: 20 };
    const side = { ...sideContent('Pasta'), cookMinutes: 10 };
    const c = comboContent([sauce, side], 2);
    expect(c.title).toBe('Testsoße + Pasta');
    expect(c.servings).toBe(2);
    expect(c.cookMinutes).toBe(20);
    expect(c.ingredients.map((i) => [i.name, i.amount])).toEqual([['Testsoße', 200], ['Pasta', 200]]);
    expect(new Set(c.ingredients.map((i) => i.id)).size).toBe(2);
  });
});

describe('Kombination in den Wochenplan', () => {
  it('neue Bausteine kommen mit den Portionen in den Plan', () => {
    const r = planCombo(emptyPlan(), ['s1', 'b1'], 2);
    expect(r.plan.items).toEqual([{ recipeId: 's1', servings: 2 }, { recipeId: 'b1', servings: 2 }]);
    expect(r.added).toEqual(['s1', 'b1']);
  });

  it('gleiche Soße nochmal: Portionen addieren, „nur dieses Mal“-Mengen fallen weg', () => {
    const plan = { ...emptyPlan(), items: [{ recipeId: 's1', servings: 2, amounts: { x: 300 }, variants: { y: 'p' } }] };
    const r = planCombo(plan, ['s1', 'b2'], 3);
    expect(r.plan.items).toEqual([{ recipeId: 's1', servings: 5, variants: { y: 'p' } }, { recipeId: 'b2', servings: 3 }]);
    expect(r.more).toEqual(['s1']);
    expect(r.added).toEqual(['b2']);
  });

  it('schon gekocht: bleibt unverändert und wird gemeldet', () => {
    const plan = { ...emptyPlan(), items: [{ recipeId: 's1', servings: 2 }], cooked: ['s1'] };
    const r = planCombo(plan, ['s1', 'b1'], 2);
    expect(r.plan.items[0]).toEqual({ recipeId: 's1', servings: 2 });
    expect(r.cooked).toEqual(['s1']);
  });
});
