import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { currentContent } from './recipe';
import { detectStepIngredients, stepIngredients } from './stepIngredients';
import type { Ingredient, Step } from './types';

const byId = (id: string) => currentContent(createMockRecipes().find((r) => r.id === id)!);
const names = (list: Ingredient[]) => list.map((i) => i.name);
const step = (text: string, ingredientIds?: string[]): Step => ({ id: 's', text, ingredientIds });

describe('Zutaten pro Schritt – automatische Erkennung', () => {
  const bowl = byId('gochujang-bowl');

  it('findet Zutaten im Schritttext, auch im Plural', () => {
    expect(names(detectStepIngredients(bowl.steps[0], bowl.ingredients))).toEqual(['Reis (z. B. Basmatireis)']);
    expect(names(detectStepIngredients(bowl.steps[1], bowl.ingredients))).toEqual([
      'Paprika (rot oder bunt)', 'Knoblauch', 'Frühlingszwiebeln',
    ]);
  });

  it('verwechselt Reis nicht mit Reisessig und Sesam nicht mit Sesamöl', () => {
    const s4 = names(detectStepIngredients(bowl.steps[3], bowl.ingredients));
    expect(s4).toEqual(['Gochujang', 'Sojasauce', 'Sesamöl', 'Reisessig']);
    const s5 = names(detectStepIngredients(bowl.steps[4], bowl.ingredients));
    expect(s5).toEqual(['Reis (z. B. Basmatireis)', 'Avocado', 'Frühlingszwiebeln', 'Sesam']);
  });

  it('findet „Ei“, aber nicht im Wort „ein“', () => {
    const chicken = byId('airfryer-chicken');
    expect(names(detectStepIngredients(chicken.steps[1], chicken.ingredients))).toEqual(['Panko', 'Ei']);
    expect(names(detectStepIngredients(step('Ein Stück Butter zugeben'), chicken.ingredients))).toEqual([]);
  });

  it('ignoriert Eigenschaftswörter: „rote“ Linsen erscheinen nicht bei der roten Zwiebel', () => {
    const curry = byId('linsen-curry');
    expect(names(detectStepIngredients(step('Die rote Zwiebel würfeln'), curry.ingredients))).toEqual(['Zwiebel']);
  });
});

describe('Zutaten pro Schritt – feste Zuordnung', () => {
  const bowl = byId('gochujang-bowl');

  it('nimmt die feste Zuordnung, wenn der Text die Zutat umschreibt („Hackfleisch“, „Gemüse“)', () => {
    // Schritt 3 der Bowl ist in den Beispieldaten fest zugeordnet
    expect(names(stepIngredients(bowl.steps[2], bowl.ingredients))).toEqual(['Hähnchenhack', 'Paprika (rot oder bunt)', 'Knoblauch']);
  });

  it('leere Liste heißt ausdrücklich „keine Zutaten“ – nicht „automatisch“', () => {
    expect(stepIngredients(step('Reis garen', []), bowl.ingredients)).toEqual([]);
  });

  it('übergeht Zutaten, die inzwischen gelöscht wurden', () => {
    const [first] = bowl.ingredients;
    expect(names(stepIngredients(step('x', [first.id, 'gibt-es-nicht']), bowl.ingredients))).toEqual([first.name]);
  });
});
