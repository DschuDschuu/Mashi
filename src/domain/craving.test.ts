import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS, EMPTY_CRAVING, STAGES, chooseDirection, closeStep, cravingSteps, cravingText, cravingTitle, currentStep,
  directionsFor, guessKind, optionsFor, pick, recipeChoiceId, recipeChoices, reopen, understand,
} from './craving';
import { followBlockParts } from './parts';
import { withNewVersion } from './recipe';
import { sideOf } from './sides';
import type { Ingredient, Recipe, RecipeBlock, RecipeContent } from './types';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const ing = (id: string, name: string, part?: string): Ingredient => ({ id, name, amount: 100, unit: 'g', ...(part ? { part } : {}) });
const content = (title: string, ingredients: Ingredient[] = [ing('i1', 'Testmehl')]): RecipeContent => ({
  title, description: '', servings: 2, prepMinutes: 10, cookMinutes: 15, difficulty: 1, ingredients,
  steps: [{ id: 's1', text: 'machen', timerMinutes: 6 }], categories: [], tags: [], devices: [],
});
const recipe = (id: string, title: string, blocks?: RecipeBlock[], ingredients?: Ingredient[]): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [], versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: content(title, ingredients) }],
  ...(blocks ? { blocks } : {}),
});
const streifen = recipe('r1', 'Knusprige Teststreifen', [{ kind: 'protein', directions: ['taco', 'bowl'] }]);
const dips = recipe('r2', 'Testplatte', [{ part: 'Testdip', kind: 'sauce', directions: [] }], [ing('a', 'Joghurt', 'Testdip'), ing('b', 'Brot')]);

describe('Richtungen', () => {
  it('zeigen nur Bausteine, die es gibt – jede Stufe hat etwas', () => {
    for (const d of DIRECTIONS) {
      for (const k of STAGES) {
        expect(d.options[k].length, `${d.name}: ${k}`).toBeGreaterThan(0);
        for (const id of d.options[k]) expect(sideOf(id)?.kind, `${d.name}: ${id}`).toBe(k);
      }
    }
  });
});

describe('understand – das Textfeld', () => {
  it('„Taco“ → Richtung mit Tortillas, weiter beim Protein', () => {
    const s = understand('Taco')!;
    expect(s.direction).toBe('taco');
    expect(s.picks.carb).toEqual(['tortillas']);
    expect(currentStep(s)).toBe('protein');
  });

  it('„Hähnchen“ → Protein gesetzt, dann wird nach der Richtung gefragt', () => {
    const s = understand('Hähnchen')!;
    expect(s.picks.protein).toEqual(['haehnchen']);
    expect(currentStep(s)).toBe('direction');
    // Hähnchen gibt es nicht bei jeder Richtung – nur die passenden stehen zur Wahl
    expect(directionsFor(s).map((d) => d.id)).toContain('bowl');
  });

  it('versteht mehrere Wörter, Mehrzahl und Füllwörter: „Tacos mit Hack und Mais“', () => {
    const s = understand('Tacos mit Hack und Mais')!;
    expect(s.direction).toBe('taco');
    expect(s.picks.protein).toEqual(['hack']);
    expect(s.picks.veg).toEqual(['mais']);
    // Beilage bleibt offen – da kommt vielleicht noch mehr dazu
    expect(currentStep(s)).toBe('sauce');
  });

  it('kennt Wörter neben dem Namen („Nudeln“ → Pasta)', () => {
    expect(understand('Nudeln')?.direction).toBe('pasta');
  });

  it('nichts Bekanntes → undefined', () => {
    expect(understand('irgendwas Leckeres')).toBeUndefined();
    expect(understand('')).toBeUndefined();
  });
});

describe('Stufen', () => {
  it('Einzel-Stufe schließt mit der Wahl, Beilage sammelt bis „Weiter“', () => {
    let s = chooseDirection(EMPTY_CRAVING, 'bowl');
    expect(currentStep(s)).toBe('carb');
    s = pick(s, 'carb', 'reis');
    s = pick(s, 'protein', 'tofu');
    s = closeStep(s, 'sauce'); // ohne Sauce weiter
    expect(currentStep(s)).toBe('veg');
    s = pick(pick(pick(s, 'veg', 'gurke'), 'veg', 'avocado'), 'veg', 'gurke'); // Gurke wieder abgewählt
    expect(s.picks.veg).toEqual(['avocado']);
    expect(currentStep(s)).toBe('veg');
    s = closeStep(closeStep(s, 'veg'), 'topping');
    expect(currentStep(s)).toBeUndefined();
    expect(cravingText(s)).toBe('Reis, Tofu & Avocado');
  });

  it('„Ändern“ öffnet die Stufe wieder, die Wahl bleibt', () => {
    const s = reopen(pick(chooseDirection(EMPTY_CRAVING, 'curry'), 'carb', 'naan'), 'carb');
    expect(currentStep(s)).toBe('carb');
    expect(s.picks.carb).toEqual(['naan']);
  });

  it('was zum Gewählten passt, steht vorn (Hack → Käse vor Koriander)', () => {
    const s = pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', 'hack');
    expect(optionsFor(s, 'topping')[0].id).toBe('kaese');
    const tofu = pick(chooseDirection(EMPTY_CRAVING, 'bowl'), 'protein', 'tofu');
    expect(optionsFor(tofu, 'sauce')[0].id).toBe('erdnuss');
  });

  it('Richtung wechseln behält Gewähltes', () => {
    const s = chooseDirection(pick(EMPTY_CRAVING, 'protein', 'haehnchen'), 'wrap');
    expect(s.picks).toEqual({ protein: ['haehnchen'], carb: ['wraps'] });
    expect(currentStep(s)).toBe('sauce');
  });
});

describe('Name', () => {
  it('Richtung + Protein', () => {
    expect(cravingTitle(understand('Taco mit Hähnchen')!)).toBe('Taco mit Hähnchenbrust');
    expect(cravingTitle(understand('Curry')!)).toBe('Curry');
  });
});

describe('Deine Rezepte als Bausteine', () => {
  it('nur markierte, nicht archivierte; Teile nur, wenn es sie gibt', () => {
    const plain = recipe('r3', 'Ohne Markierung');
    const gone = recipe('r4', 'Teil weg', [{ part: 'Gibtsnicht', kind: 'sauce', directions: [] }]);
    const archived = { ...recipe('r5', 'Alt', [{ kind: 'veg', directions: [] }]), archivedAt: '2026-01-01' };
    const own = recipeChoices([streifen, dips, plain, gone, archived]);
    expect(own.map((c) => c.id)).toEqual([recipeChoiceId('r1'), recipeChoiceId('r2', 'Testdip')]);
    expect(own[1]).toMatchObject({ name: 'Testdip', kind: 'sauce', from: 'Testplatte' });
  });

  it('zählt vorgekochte Portionen (nicht gefroren) – und stellt sie nach vorn', () => {
    const pantry = { items: [
      { id: 'p1', name: 'Knusprige Teststreifen', amount: 2, unit: 'Stück' as const, addedAt: '', recipeId: 'r1' },
      { id: 'p2', name: 'Knusprige Teststreifen', amount: 3, unit: 'Stück' as const, addedAt: '', recipeId: 'r1', frozenAt: '2026-01-01' },
    ] };
    const own = recipeChoices([streifen], pantry);
    expect(own[0].ready).toBe(2);
    const s = chooseDirection(EMPTY_CRAVING, 'taco');
    expect(optionsFor(s, 'protein', own)[0].id).toBe('rezept:r1');
    // aufwärmen statt nach Rezept kochen
    expect(cravingSteps(pick(s, 'protein', 'rezept:r1'), own).find((x) => x.id === 'rezept:r1')).toMatchObject({ text: 'aus dem Kühlschrank aufwärmen', minutes: 5 });
  });

  it('Richtungen: das Rezept nur dort, wo es hinpasst – ohne Richtung überall', () => {
    const own = recipeChoices([streifen, dips]);
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'bowl'), 'protein', own)[0].id).toBe('rezept:r1');
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', own).some((c) => c.id === 'rezept:r1')).toBe(false);
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'pasta'), 'sauce', own)[0].id).toBe('rezept:r2:Testdip');
    expect(directionsFor(pick(EMPTY_CRAVING, 'protein', 'rezept:r1'), own).map((d) => d.id)).toEqual(['taco', 'bowl']);
  });

  it('Textfeld: dein Rezept, wenn es genauer passt – sonst der feste Baustein', () => {
    const own = recipeChoices([streifen]);
    expect(understand('Teststreifen', own)?.picks.protein).toEqual(['rezept:r1']);
    expect(understand('knusprige Teststreifen', own)?.picks.protein).toEqual(['rezept:r1']);
    expect(understand('Hähnchen', own)?.picks.protein).toEqual(['haehnchen']);
    expect(cravingTitle(understand('Taco Teststreifen', own)!, own)).toBe('Taco mit Knusprige Teststreifen');
  });

  it('Stufe vorschlagen am Namen', () => {
    expect(guessKind('Honig-Senf-Dip')).toBe('sauce');
    expect(guessKind('Kräuterreis')).toBe('carb');
    expect(guessKind('Krautsalat')).toBe('veg');
    expect(guessKind('Knusprige Teststreifen')).toBe('protein');
  });
});

describe('Markierung folgt dem umbenannten Teil', () => {
  const before = content('T', [ing('a', 'Joghurt', 'Dip'), ing('b', 'Knoblauch', 'Dip'), ing('c', 'Brot')]);

  it('Teil umbenannt → Markierung zieht mit', () => {
    const after = content('T', [ing('a', 'Joghurt', 'Kräuterdip'), ing('b', 'Knoblauch', 'Kräuterdip'), ing('c', 'Brot')]);
    expect(followBlockParts([{ part: 'Dip', kind: 'sauce', directions: ['wrap'] }], before, after)).toEqual([{ part: 'Kräuterdip', kind: 'sauce', directions: ['wrap'] }]);
  });

  it('Teil aufgelöst → Markierung fällt weg, das ganze Rezept bleibt', () => {
    const after = content('T', [ing('a', 'Joghurt'), ing('b', 'Knoblauch'), ing('c', 'Brot')]);
    expect(followBlockParts([{ part: 'Dip', kind: 'sauce', directions: [] }, { kind: 'protein', directions: [] }], before, after)).toEqual([{ kind: 'protein', directions: [] }]);
  });

  it('beim Bearbeiten (neue Version) passiert das von selbst', () => {
    const r = { ...recipe('r9', 'T', [{ part: 'Dip', kind: 'sauce', directions: [] }]), versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer' as const, content: before }] };
    const next = withNewVersion(r, content('T', [ing('a', 'Joghurt', 'Soße'), ing('b', 'Knoblauch', 'Soße'), ing('c', 'Brot')]), 'nutzer');
    expect(next.blocks).toEqual([{ part: 'Soße', kind: 'sauce', directions: [] }]);
  });
});
