import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS, EMPTY_CRAVING, STAGES, chooseDirection, closeStep, cookbookMatches, cravingCooking, cravingMinutes, cravingPartsFrom, cravingSteps, cravingText, cravingTitle, currentStep,
  baseCraving, coveredBy, halfOf, ownComboSteps, ownSteps, plateImage, weekCookSteps, cravingCombo, cravingContent, directionOf, guessKind, matchingRecipes, optionsFor, pick, recipeChoiceId, recipeChoices, reopen, rollCraving, runsAlone, staleTrials, startLabel, stockMarks, understand, variantTargets, withoutGone, cravingTimeline,
  type CravingState, type StockMark,
} from './craving';
import { cookingContent } from './homemade';
import { localFoodTable } from './nutrition/localFoods';
import { emptyPantry, type Pantry, type PantryItem } from './pantry';
import { FINISH, doneParts, followBlockParts } from './parts';
import { currentContent, withNewVersion } from './recipe';
import { SIDES, comboText, foodOf, ownEntry, ownOf, ownSidesOf, sideIngredient, sideOf, sidesOf } from './sides';
import { computeNutrition } from './nutrition/engine';
import { swapFor } from './swaps';
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
  it('„Taco“ → Richtung Tortilla, die Tortillas sind gleich gewählt (Julia: „ich kauf immer die gleichen“)', () => {
    const s = understand('Taco')!;
    expect(s.direction).toBe('taco');
    expect(directionOf(s.direction)?.name).toBe('Tortilla');
    expect(s.picks.carb).toEqual(['tortillas']);
    expect(currentStep(s)).toBe('protein');
    expect(understand('Wraps')).toMatchObject({ direction: 'taco', picks: { carb: ['tortillas'] } });
  });

  it('ein Wort, das Richtung und Baustein ist, wählt beides: „Pasta“', () => {
    expect(understand('Pasta')).toMatchObject({ direction: 'pasta', picks: { carb: ['pasta'] } });
  });

  it('„Wraps“ werden nicht mehr angeboten, alte Abende kennen sie noch', () => {
    expect(optionsFor(EMPTY_CRAVING, 'carb').some((c) => c.id === 'wraps')).toBe(false);
    expect(sideOf('wraps')?.name).toBe('Wraps');
  });

  it('„Hähnchen“ → Protein gesetzt, ohne Richtung geht es gleich beim Kohlenhydrat los (Julia: „wenn es einfach beginnt“)', () => {
    const s = understand('Hähnchen')!;
    expect(s.picks.protein).toEqual(['haehnchen']);
    expect(s.direction).toBeUndefined();
    expect(currentStep(s)).toBe('carb');
    // ohne Richtung stehen alle Kohlenhydrate zur Wahl
    expect(optionsFor(s, 'carb').length).toBeGreaterThan(8);
  });

  it('„alle zeigen“: mit Richtung nur Passendes, auf Wunsch alles', () => {
    const s = chooseDirection(EMPTY_CRAVING, 'curry');
    expect(optionsFor(s, 'carb').map((c) => c.id)).toEqual(['reis', 'naan']);
    expect(optionsFor(s, 'carb', [], undefined, true).map((c) => c.id)).toContain('pasta');
  });

  it('versteht mehrere Wörter, Mehrzahl und Füllwörter: „Tacos mit Hack und Mais“', () => {
    const s = understand('Tacos mit Hack und Mais')!;
    expect(s.direction).toBe('taco');
    expect(s.picks.protein).toEqual(['hack']);
    expect(s.picks.veg).toEqual(['mais']);
    // Gemüse bleibt offen – da kommt vielleicht noch mehr dazu
    expect(currentStep(s)).toBe('sauce');
  });

  it('kennt Wörter neben dem Namen („Nudeln“ → Pasta)', () => {
    expect(understand('Nudeln')?.direction).toBe('pasta');
  });

  it('nichts Bekanntes → undefined', () => {
    expect(understand('irgendwas Leckeres')).toBeUndefined();
    expect(understand('')).toBeUndefined();
  });

  it('„ohne“ wählt nichts aus – bis zum nächsten „mit“; „ohne Sauce“ erledigt die Stufe', () => {
    const s = understand('Pasta ohne Hack')!;
    expect(s.direction).toBe('pasta');
    expect(s.picks.protein).toBeUndefined();
    expect(currentStep(s)).toBe('protein');
    expect(understand('Tacos ohne Hack und Käse mit Mais')).toMatchObject({ direction: 'taco', picks: { veg: ['mais'] } });
    expect(understand('Tacos ohne Hack und Käse mit Mais')!.picks.topping).toBeUndefined();
    const t = understand('Taco ohne Sauce')!;
    expect(t.closed).toContain('sauce');
    expect(t.picks.sauce).toBeUndefined();
    // auch eine Einzel-Stufe bleibt zu, obwohl die Richtung sonst offene Stufen wieder öffnet
    expect(understand('Bowl ohne Protein')!.closed).toContain('protein');
  });

  it('„ohne Hack“ blendet Hackfleisch und Hack-Patty aus – „alle zeigen“ holt sie zurück, wählen hebt den Ausschluss auf', () => {
    const s = understand('Pasta ohne Hack')!;
    expect(s.without).toEqual(expect.arrayContaining(['hack', 'patty']));
    expect(optionsFor(s, 'protein').map((c) => c.id)).not.toContain('hack');
    expect(optionsFor(s, 'protein', [], undefined, true).map((c) => c.id)).toContain('hack');
    expect(pick(s, 'protein', 'hack').without).toEqual(['patty']);
    // bleibt beim Richtungswechsel (chooseDirection baut den Stand neu)
    expect(chooseDirection(s, 'taco').without).toEqual(s.without);
    // nur bei deutlichem Treffer: „ohne Fleisch“ schließt kein Hackfleisch aus
    expect(understand('Bowl ohne Fleisch')!.without).toBeUndefined();
  });
});

describe('Kohlenhydrat gibt die Richtung vor', () => {
  it('ohne Richtung: Gnocchi → Pasta, Naan → Curry; Reis passt zu zweien → keine', () => {
    const s = understand('Hähnchen')!;
    expect(pick(s, 'carb', 'gnocchi').direction).toBe('pasta');
    expect(pick(s, 'carb', 'naan').direction).toBe('curry');
    expect(pick(s, 'carb', 'reis').direction).toBeUndefined();
  });

  it('eine gewählte Richtung bleibt, solange das Kohlenhydrat dazu passt; sonst wechselt sie', () => {
    const bowl = chooseDirection(EMPTY_CRAVING, 'bowl');
    expect(pick(bowl, 'carb', 'reis').direction).toBe('bowl');
    // „alle zeigen“ und doch Tortillas: dann ist es eine Tortilla
    expect(pick(bowl, 'carb', 'tortillas').direction).toBe('taco');
  });

  it('öffnet nichts wieder, was schon erledigt ist', () => {
    const s = closeStep(EMPTY_CRAVING, 'protein');
    expect(pick(s, 'carb', 'pasta').closed).toContain('protein');
  });
});

describe('Stufen', () => {
  it('Einzel-Stufe schließt mit der Wahl, Gemüse sammelt bis „Weiter“', () => {
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
    const s = chooseDirection(pick(EMPTY_CRAVING, 'protein', 'haehnchen'), 'burger');
    expect(s.picks).toEqual({ protein: ['haehnchen'], carb: ['buns'] });
    expect(currentStep(s)).toBe('sauce');
  });
});

describe('Name', () => {
  it('Richtung + Protein', () => {
    expect(cravingTitle(understand('Taco mit Hähnchen')!)).toBe('Tortilla mit Hähnchenbrust');
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
  });

  it('Textfeld: dein Rezept, wenn es genauer passt – sonst der feste Baustein', () => {
    const own = recipeChoices([streifen]);
    expect(understand('Teststreifen', own)?.picks.protein).toEqual(['rezept:r1']);
    expect(understand('knusprige Teststreifen', own)?.picks.protein).toEqual(['rezept:r1']);
    expect(understand('Hähnchen', own)?.picks.protein).toEqual(['haehnchen']);
    expect(cravingTitle(understand('Taco Teststreifen', own)!, own)).toBe('Knusprige Teststreifen als Tortilla');
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

describe('Aus dem Gericht ein Rezept machen', () => {
  let n = 0;
  const newId = () => `x${++n}`;

  it('feste Bausteine werden Zutaten (Menge × Portionen) mit Schritten, das Längste zuerst', () => {
    const s = closeStep(closeStep(pick(pick(chooseDirection(EMPTY_CRAVING, 'bowl'), 'carb', 'reis'), 'protein', 'tofu'), 'sauce'), 'veg');
    const c = cravingContent(closeStep(s, 'topping'), { servings: 2, title: ' Meine Bowl ', newId });
    expect(c.title).toBe('Meine Bowl');
    expect(c.servings).toBe(2);
    expect(c.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit }))).toEqual([
      { name: 'Reis', amount: 150, unit: 'g' }, { name: 'Tofu', amount: 200, unit: 'g' },
    ]);
    // Zeitleiste: Reis köchelt allein (sofort), Tofu braucht dich 10 Min. und endet mit dem Reis (nach 5 Min.)
    expect(c.steps.map((st) => st.timerMinutes)).toEqual([15, 10, undefined]);
    expect(c.steps[0].text).toMatch(/^Sofort – Reis: /);
    expect(c.steps[1].text).toMatch(/^Nach 5 Min\. – Tofu: /);
    // zum Schluss anrichten wie eine Bowl (cookStyle.ts) – kein Timer
    expect(c.steps[2].text).toMatch(/^Zum Schluss – Anrichten: Reis in Schalen verteilen, Tofu nebeneinander darauflegen/);
    expect(c.tags).toEqual(['Bowl']);
    // der Reis läuft allein, der Tofu passt hinein → 15
    expect(c.cookMinutes).toBe(15);
  });

  it('ganzes Rezept → verknüpfte Zutat in Portionen; Teil → seine Zutaten (umgerechnet) und Schritte', () => {
    const own = recipeChoices([streifen, dips]);
    let s = pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', 'rezept:r1');
    s = pick(s, 'sauce', 'rezept:r2:Testdip');
    const c = cravingContent(s, { own, recipes: [streifen, dips], servings: 4, title: '', newId });
    expect(c.ingredients.find((i) => i.recipeId === 'r1')).toMatchObject({ name: 'Knusprige Teststreifen', amount: 4, unit: 'Portion' });
    // Testplatte ist für 2 Portionen: 100 g Joghurt → 200 g für 4
    expect(c.ingredients.find((i) => i.name === 'Joghurt')).toMatchObject({ amount: 200, part: 'Testdip' });
    expect(c.ingredients.some((i) => i.name === 'Brot')).toBe(false);
    expect(c.title).toBe('Knusprige Teststreifen als Tortilla');
  });

  it('Vorgekochtes: nur aufwärmen', () => {
    const own = recipeChoices([streifen], { items: [{ id: 'p', name: 'x', amount: 4, unit: 'Stück', addedAt: '', recipeId: 'r1' }] });
    const c = cravingContent(pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', 'rezept:r1'), { own, recipes: [streifen], servings: 2, title: 'T', newId });
    // aufwärmen läuft allein – sofort; die Tortillas brauchen dich zum Schluss
    expect(c.steps.some((st) => st.text === 'Sofort – Knusprige Teststreifen aus dem Kühlschrank aufwärmen')).toBe(true);
  });

  it('ein vorgekochter Teil: bleibt Teil mit Zutaten, das Gericht merkt sich seine Herkunft – dann zählt er als fertig', () => {
    const items = [{ id: 'p', name: 'x', amount: 2, unit: 'Stück' as const, addedAt: '', recipeId: 'r2', part: 'Testdip' }];
    const own = recipeChoices([dips], { items });
    const s = pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'sauce', 'rezept:r2:Testdip', own);
    const c = cravingContent(s, { own, recipes: [dips], servings: 2, title: 'T', newId });
    // die Zutaten des Dips bleiben (Nährwerte; selbst kochen, wenn er nicht mehr da ist) …
    expect(c.ingredients.find((i) => i.name === 'Joghurt')).toMatchObject({ part: 'Testdip' });
    // … und die Herkunft macht ihn fertig: nicht einkaufen, im Kochmodus übersprungen (doneParts)
    const from = cravingPartsFrom(s, own);
    expect(from).toEqual({ Testdip: 'r2' });
    expect(doneParts(items, 'neues-gericht', from)).toEqual(['Testdip']);
    expect(doneParts(items, 'neues-gericht')).toEqual([]);
    // Anzeige: nur aus dem Kühlschrank – und so zählt er auch in der Zeit
    expect(cravingSteps(s, own).find((st) => st.id === 'rezept:r2:Testdip')).toMatchObject({ text: 'aus dem Kühlschrank, bei Bedarf erwärmen', minutes: 3 });
    // feste Bausteine und ganze Rezepte haben keine Herkunft
    expect(cravingPartsFrom(pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', 'hack'))).toBeUndefined();
  });
});

describe('Vorrats-Punkte (Julia)', () => {
  const NOW = new Date(2026, 8, 25, 10);
  const iso = (d: number) => new Date(2026, 8, d, 12).toISOString();
  const item = (name: string, bought: number, extra: Partial<PantryItem> = {}): PantryItem => ({ id: name, name, addedAt: iso(bought), boughtAt: iso(bought), ...extra });
  const pantry = (items: PantryItem[], basics: string[] = []): Pantry => ({ ...emptyPantry(), items, basics });

  it('Speisekammer = da, läuft bald ab = bald, „Immer im Haus“ = da; Vorgekochtes und Fehlendes ohne Punkt', () => {
    const marks = stockMarks(pantry([item('Pasta', 1), item('Hähnchenbrust', 24), item('Tofu', 24, { recipeId: 'r1' })], ['Reis']), localFoodTable, NOW);
    expect(marks('Pasta')).toBe('da');
    expect(marks('Hähnchenbrust')).toBe('bald');
    expect(marks('Reis')).toBe('da');
    expect(marks('Tofu')).toBeUndefined();
    expect(marks('Brokkoli')).toBeUndefined();
  });

  it('Reihenfolge: was weg muss, dann was da ist – innerhalb davon, was gut passt; der Punkt steht an der Wahl', () => {
    const marks = (n: string) => (n === 'Brokkoli' ? 'da' as const : n === 'Tomaten' ? 'bald' as const : undefined);
    const s = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'linsen');
    // ohne Vorrat: Spinat (passt zu Linsen) vorn, sonst die Reihenfolge der Richtung
    expect(optionsFor(s, 'veg').map((c) => c.id)).toEqual(['spinat', 'zucchini', 'brokkoli', 'tomaten', 'paprika']);
    const opts = optionsFor(s, 'veg', [], undefined, false, marks);
    expect(opts.map((c) => c.id)).toEqual(['tomaten', 'brokkoli', 'spinat', 'zucchini', 'paprika']);
    expect(opts.map((c) => c.stock)).toEqual(['bald', 'da', undefined, undefined, undefined]);
  });
});

describe('Bausteine über ihr echtes Lebensmittel (Julia: Guacamole über die Avocado)', () => {
  const nutritionStatus = (id: string) => {
    const ing = sideIngredient(id, 1)!;
    return computeNutrition({ ...content(''), ingredients: [{ ...ing, id: 'x' }] }, localFoodTable).items[0].status;
  };

  it('jeder Baustein mit food findet sein Lebensmittel in der Tabelle – auch der Burger-Cheddar (Stück = Scheibe)', () => {
    for (const s of SIDES.filter((x) => x.food)) expect(nutritionStatus(s.id), s.name).not.toMatch(/unmatched|no-weight|no-amount/);
    expect(nutritionStatus('cheddar')).not.toMatch(/unmatched|no-weight|no-amount/);
  });

  it('Einkauf und Abbuchen mit dem, was du kaufst – im Teller bleibt der Name', () => {
    expect(sideIngredient('guacamole', 2)).toMatchObject({ name: 'Avocado', amount: 120, unit: 'g' });
    expect(sideIngredient('patty', 1)).toMatchObject({ name: 'Hackfleisch', amount: 150 });
    expect(sideIngredient('pasta', 1)).toMatchObject({ name: 'Pasta' });
    expect(sideOf('guacamole')?.name).toBe('Guacamole');
  });

  it('„Kaufst du als“ (Julia: „Guacamole kaufe ich fertig“) geht vor Mashis Standard – leer: wieder der Standard', () => {
    const hh = { sideFood: { guacamole: 'Guacamole fertig', patty: '  ' } };
    expect(sideIngredient('guacamole', 1, hh)).toMatchObject({ name: 'Guacamole fertig', amount: 60 });
    expect(sideIngredient('patty', 1, hh)?.name).toBe('Hackfleisch');
    expect(foodOf(sideOf('schmand')!, hh)).toBe('Schmand');
    // auch der Vorrats-Punkt schaut auf deine Angabe
    const marks = (n: string) => (n === 'Guacamole fertig' ? 'da' as const : undefined);
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'taco'), 'sauce', [], hh, false, marks).find((c) => c.id === 'guacamole')?.stock).toBe('da');
  });

  it('Vorrats-Punkt über das Lebensmittel: Joghurt im Kühlschrank → Punkt am Joghurt-Dip', () => {
    const marks = (n: string) => (n === 'Joghurt' ? 'da' as const : undefined);
    const opts = optionsFor(chooseDirection(EMPTY_CRAVING, 'taco'), 'sauce', [], undefined, false, marks);
    expect(opts.find((c) => c.id === 'joghurt')?.stock).toBe('da');
  });
});

describe('Live-Werte am Teller: das Gericht, wie es gekocht würde', () => {
  it('ein ganzes Rezept als Baustein wird in seine Zutaten aufgelöst – feste Bausteine bleiben, wie sie sind', () => {
    const own = recipeChoices([streifen]);
    const s = pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', 'rezept:r1', own);
    const c = cravingCooking(s, { own, recipes: [streifen], servings: 2 });
    expect(c.ingredients.map((i) => i.name)).toEqual(expect.arrayContaining(['Tortillas', 'Testmehl']));
    expect(c.ingredients.some((i) => i.unit === 'Portion')).toBe(false);
  });
});

describe('Würfeln (Julia: „Überrasch mich“)', () => {
  // fester, wiederholbarer Zufall (mulberry32) – jeder Testlauf würfelt gleich; ein einfacher Generator lieferte bei
  // kleinen Startwerten zuerst fast immer ≈ 0, dann würfelten die Tests gar nicht richtig
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const seeds = Array.from({ length: 100 }, (_, i) => i + 1);

  it('füllt alles, was offen ist – mit einer Richtung und nur Passendem; beim Gemüse höchstens zwei', () => {
    for (const n of seeds.slice(0, 30)) {
      const s = rollCraving(EMPTY_CRAVING, { rng: seeded(n) });
      expect(currentStep(s), `Wurf ${n}`).toBeUndefined();
      const dir = directionOf(s.direction)!;
      for (const k of STAGES) for (const id of s.picks[k] ?? []) expect(dir.options[k], `${dir.name}: ${id}`).toContain(id);
      expect((s.picks.veg ?? []).length).toBeLessThanOrEqual(2);
      expect(s.rolled?.direction).toBe(s.direction);
    }
  });

  it('deine Wahl bleibt – nochmal würfeln tauscht nur das Gewürfelte; ein bewusstes „Ohne Sauce weiter“ auch', () => {
    const mine = closeStep(pick(chooseDirection(EMPTY_CRAVING, 'bowl'), 'protein', 'tofu'), 'sauce');
    const first = rollCraving(mine, { rng: seeded(7) });
    expect(first.picks.protein).toEqual(['tofu']);
    expect(first.picks.sauce).toBeUndefined();
    expect(first.rolled!.picks).not.toContain('tofu');
    expect(first.rolled!.direction).toBeUndefined(); // die Richtung war deine
    const again = rollCraving(first, { rng: seeded(99) });
    expect(again.direction).toBe('bowl');
    expect(again.picks.protein).toEqual(['tofu']);
    expect(again.picks.sauce).toBeUndefined();
    expect(currentStep(again)).toBeUndefined();
  });

  it('nochmal würfeln wechselt meist – das zuletzt Gewürfelte zählt weniger (sonst blieb die Sauce oft Pesto)', () => {
    // je Stufe gemessen, nicht am ganzen Teller: der wiederholt sich wegen zwei Gemüsen auch ohne Abschlag kaum
    const pasta = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'haehnchen');
    const sameSauce = seeds.filter((n) => {
      const first = rollCraving(pasta, { rng: seeded(n) });
      return rollCraving(first, { rng: seeded(n + 1000) }).picks.sauce?.[0] === first.picks.sauce?.[0];
    }).length;
    // gemessen: ohne Abschlag 37 von 100, mit 6
    expect(sameSauce).toBeLessThan(20);
  });

  it('nie, was du ausgeschlossen hast („Tacos ohne Hack“)', () => {
    const s = understand('Tacos ohne Hack')!;
    for (const n of seeds) expect(rollCraving(s, { rng: seeded(n) }).picks.protein ?? []).not.toEqual(expect.arrayContaining(['hack']));
  });

  it('klug gewichtet: was bald weg muss, landet deutlich öfter auf dem Teller', () => {
    const pasta = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'haehnchen');
    const count = (stock?: (n: string) => StockMark | undefined) =>
      seeds.filter((n) => rollCraving(pasta, { rng: seeded(n), stock }).picks.veg?.includes('brokkoli')).length;
    const withStock = count((n) => (n === 'Brokkoli' ? 'bald' : undefined));
    expect(withStock).toBeGreaterThan(70);
    expect(withStock).toBeGreaterThan(count() + 20);
  });
});

describe('Gemerkter Teller (Julia: „Wie letztes Mal?“)', () => {
  it('was es nicht mehr gibt, fällt weg – die Stufe ist dann wieder offen; Bekanntes bleibt erledigt', () => {
    const own = recipeChoices([streifen]);
    const s = { direction: 'taco', picks: { carb: ['tortillas'], protein: ['rezept:weg'], sauce: ['salsa', 'eigen:sauce:Weg'] }, closed: [...STAGES] };
    const now = withoutGone(s, own);
    expect(now.picks).toEqual({ carb: ['tortillas'], sauce: ['salsa', 'eigen:sauce:Weg'] }); // eigene Bausteine stehen in der id
    expect(currentStep(now)).toBe('protein');
    expect(withoutGone({ ...s, picks: { protein: ['rezept:r1'] } }, own).picks.protein).toEqual(['rezept:r1']);
  });
});

describe('Wie lange es dauert – die Zeitleiste (Julia: „was wann starten“)', () => {
  it('erkennt, was allein läuft – auch in eigenen Zubereitungen', () => {
    for (const t of ['mit doppelter Menge Wasser köcheln', 'in Salzwasser kochen', 'würfeln und im Ofen rösten', 'in Röschen dämpfen', 'aus dem Kühlschrank aufwärmen']) {
      expect(runsAlone(t), t).toBe(true);
    }
    for (const t of ['in Streifen schneiden und braten', 'drüberstreuen', 'Joghurt mit Knoblauch verrühren', undefined]) expect(runsAlone(t), t).toBe(false);
  });

  it('was allein läuft, startet so, dass es zum Schluss fertig ist; deine Hände: erst das Kalte, dann das Heiße', () => {
    const t = cravingTimeline([
      { id: 'reis', minutes: 15, text: 'mit doppelter Menge Wasser köcheln' },
      { id: 'tofu', minutes: 10, text: 'würfeln und knusprig braten' },
      { id: 'gurke', minutes: 2, text: 'in Scheiben schneiden' },
      { id: 'sesam', minutes: 2, text: 'ohne Fett kurz rösten' },
      { id: 'feta', minutes: 0, text: 'drüberbröseln' },
    ]);
    expect(t.total).toBe(15);
    // Gurke schneiden zuerst, der Tofu wird erst danach gebraten – sonst wäre er kalt, bis alles fertig ist
    expect(t.steps.map((s) => [s.id, startLabel(s)])).toEqual([
      ['reis', 'sofort'], ['gurke', 'nach 1 Min.'], ['tofu', 'nach 3 Min.'], ['sesam', 'nach 13 Min.'], ['feta', 'zum Schluss'],
    ]);
  });

  it('Tortilla: Guacamole und Salsa zuerst, Hähnchen braten danach, die Tortillas ganz zum Schluss warm', () => {
    const t = cravingTimeline([
      { id: 'tortillas', minutes: 2, text: 'in der Pfanne kurz erwärmen' },
      { id: 'haehnchen', minutes: 8, text: 'in Streifen schneiden und braten' },
      { id: 'guacamole', minutes: 5, text: 'Avocado zerdrücken, mit Limette und Salz abschmecken' },
      { id: 'salsa', minutes: 5, text: 'Tomaten und Zwiebel würfeln, mit Limette mischen' },
    ]);
    expect(t.steps.map((s) => s.id)).toEqual(['guacamole', 'salsa', 'haehnchen', 'tortillas']);
    expect(t.total).toBe(20);
  });

  it('braucht die Handarbeit länger, setzt das Alleinlaufende später auf – nie zwei Dinge gleichzeitig in deinen Händen', () => {
    const t = cravingTimeline([
      { id: 'pasta', minutes: 10, text: 'in Salzwasser kochen' },
      { id: 'haehnchen', minutes: 8, text: 'in Streifen schneiden und braten' },
      { id: 'paprika', minutes: 5, text: 'in Streifen schneiden, kurz anbraten' },
    ]);
    expect(t.total).toBe(13);
    expect(t.steps.map((s) => [s.id, s.start])).toEqual([['haehnchen', 0], ['pasta', 3], ['paprika', 8]]);
  });

  it('Gesamtzeit auf 5 Minuten aufgerundet – neun Bausteine nur mit Handarbeit waren früher „in 8 Min. fertig“', () => {
    expect(cravingMinutes([8, 5, 5, 5, 5, 3, 2, 0, 0].map((minutes) => ({ minutes })))).toBe(35);
    expect(cravingMinutes([{ minutes: 10 }, { minutes: 0 }])).toBe(10);
    expect(cravingMinutes([{ minutes: 0 }])).toBe(0);
    expect(cravingMinutes([])).toBe(0);
  });
});

describe('Ausweg: aus dem Kochbuch, wenn Mashi nichts zusammenbauen kann', () => {
  const lasagne = recipe('l1', 'Omas Testlasagne');
  const archiv = { ...recipe('l2', 'Alte Testlasagne'), archivedAt: '2026-01-01' };
  const probe = { ...recipe('l3', 'Probier-Testlasagne'), trial: true };
  it('findet am ganzen Text oder an einzelnen Wörtern – ohne Archiv und Probiergerichte', () => {
    expect(understand('Testlasagne')).toBeUndefined();
    expect(cookbookMatches('Testlasagne', [lasagne, archiv, probe]).map((r) => r.id)).toEqual(['l1']);
    expect(cookbookMatches('was mit Testlasagne', [lasagne]).map((r) => r.id)).toEqual(['l1']);
    expect(cookbookMatches('Gibtsnicht', [lasagne])).toEqual([]);
  });
});

describe('Als Variante speichern: passende Rezepte (Julia)', () => {
  it('vorn, was dieselbe Grundlage nutzt; dann gleiche Zutaten und Titelwörter – keine Probiergerichte, nichts aus dem Archiv', () => {
    const bolo = recipe('bo', 'Testbolo');
    const mitBolo = { ...recipe('sp', 'Testspaghetti', undefined, [{ id: 'x', name: 'Testbolo', recipeId: 'bo' }, ing('n', 'Nudeln')]) };
    const trial = { ...recipe('t', 'Testspätzle mit Testbolo', undefined, [{ id: 'y', name: 'Testbolo', recipeId: 'bo' }, ing('s', 'Spätzle')]), trial: true };
    const spaetzle = recipe('k', 'Käsespätzle', undefined, [ing('s', 'Spätzle')]);
    const fremd = recipe('f', 'Testsuppe', undefined, [ing('m', 'Möhren')]);
    const alt = { ...recipe('a', 'Testspätzle alt', undefined, [ing('s', 'Spätzle')]), archivedAt: '2026-01-01' };
    const andere = { ...recipe('o', 'Testspätzle Probe'), trial: true };
    const ids = variantTargets(trial, [fremd, spaetzle, alt, andere, mitBolo, bolo, trial]).map((r) => r.id);
    expect(ids.slice(0, 2).sort()).toEqual(['bo', 'sp']);
    expect(ids).toContain('k');
    expect(ids).not.toContain('f');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('o');
    expect(ids).not.toContain('t');
  });
});

describe('Probiergerichte aufräumen', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const t = (id: string, extra: Partial<Recipe>) => ({ ...recipe(id, 'T'), trial: true, createdAt: '2026-10-01T00:00:00Z', ...extra });
  it('nur alt, nie gekocht und nicht eingeplant', () => {
    const list = [t('alt', {}), t('frisch', { createdAt: '2026-10-25T00:00:00Z' }), t('gekocht', { lastCookedAt: '2026-10-02' }), t('plan', {}), recipe('normal', 'N')];
    expect(staleTrials(list, new Set(['plan']), now)).toEqual(['alt']);
  });
});

describe('Passt dazu aus deinem Kochbuch', () => {
  const r = (id: string, title: string, names: string[], extra: Partial<Recipe> = {}) => ({ ...recipe(id, title, undefined, names.map((n, i) => ing(`${id}${i}`, n))), ...extra });
  const bowl = r('b', 'Testbowl mit Tofu', ['Reis', 'Tofu', 'Gurke']);
  const curry = r('c', 'Testcurry', ['Reis', 'Kichererbsen']);
  const tofuPfanne = r('t', 'Tofupfanne', ['Tofu', 'Paprika']);
  const archived = { ...r('a', 'Alte Bowl', ['Reis', 'Tofu']), archivedAt: '2026-01-01' };
  const trial = { ...r('p', 'Probier-Bowl', ['Reis', 'Tofu']), trial: true };

  it('zählt gewählte Bausteine als Zutaten und die Richtung im Titel – mindestens zwei Treffer', () => {
    const s = pick(pick(chooseDirection(EMPTY_CRAVING, 'bowl'), 'carb', 'reis'), 'protein', 'tofu');
    // Curry (nur Reis) und Tofupfanne (nur Tofu) haben je einen Treffer – zu wenig bei drei Wahlen
    expect(matchingRecipes(s, { recipes: [curry, tofuPfanne, bowl, archived, trial] }).map((x) => x.id)).toEqual(['b']);
  });

  it('am Namen: „Hähnchenbrust“ trifft „Hähnchenbrustfilet“; mit einer Wahl reicht ein Treffer', () => {
    const h = r('h', 'Irgendwas', ['Hähnchenbrustfilet']);
    expect(matchingRecipes(pick(EMPTY_CRAVING, 'protein', 'haehnchen'), { recipes: [h, curry] }).map((x) => x.id)).toEqual(['h']);
  });

  it('gleiches Lebensmittel über keyOf („Basmatireis“ = Reis)', () => {
    const basmati = r('m', 'Irgendwas', ['Basmatireis', 'Tofu']);
    const keyOf = (n: string) => (/reis$/i.test(n) ? 'food:reis' : undefined);
    // drei Angaben → zwei Treffer nötig: ohne keyOf trifft nur Tofu
    const s = pick(pick(chooseDirection(EMPTY_CRAVING, 'bowl'), 'carb', 'reis'), 'protein', 'tofu');
    expect(matchingRecipes(s, { recipes: [basmati], keyOf }).map((x) => x.id)).toEqual(['m']);
    expect(matchingRecipes(s, { recipes: [basmati] }).map((x) => x.id)).toEqual([]);
  });

  it('nichts gewählt → nichts; Favoriten zuerst', () => {
    expect(matchingRecipes(EMPTY_CRAVING, { recipes: [bowl] })).toEqual([]);
    const fav = { ...r('f', 'Lieblingscurry', ['Reis']), favorite: true };
    expect(matchingRecipes(chooseDirection(EMPTY_CRAVING, 'curry'), { recipes: [curry, fav] }).map((x) => x.id)).toEqual(['f', 'c']);
  });
});

describe('Vorgekochtes aus dem Wochenplan', () => {
  it('verplante Portionen zählen nicht als „im Kühlschrank“', () => {
    const pantry = { items: [{ id: 'p', name: 'x', amount: 3, unit: 'Stück' as const, addedAt: '', recipeId: 'r1' }] };
    expect(recipeChoices([streifen], pantry, new Map([['r1', 2]]))[0].ready).toBe(1);
    expect(recipeChoices([streifen], pantry, new Map([['r1', 5]]))[0].ready).toBeUndefined();
  });
});

describe('Passt dazu – bei zwei Angaben reicht ein Treffer', () => {
  it('„Pasta mit Pesto“: Pasta im Titel oder Pesto im Titel genügt', () => {
    const avo = { ...recipe('v', 'Cremige Testpasta', undefined, [ing('v1', 'Avocado')]) };
    const sauce = { ...recipe('w', 'Pesto-Testsauce', undefined, [ing('w1', 'Basilikum')]) };
    const other = { ...recipe('o', 'Testsuppe', undefined, [ing('o1', 'Karotte')]) };
    const s = understand('Pasta mit Pesto')!;
    expect(matchingRecipes(s, { recipes: [avo, sauce, other] }).map((x) => x.id).sort()).toEqual(['v', 'w']);
  });
});

describe('Burger (Julia)', () => {
  it('„Cheeseburger“ → Richtung Burger mit Brötchen; zum Patty passen Cheddar und Burgersauce', () => {
    const s = understand('Cheeseburger')!;
    expect(s.direction).toBe('burger');
    expect(s.picks.carb).toEqual(['buns']);
    expect(currentStep(s)).toBe('protein');
    const p = pick(s, 'protein', 'patty');
    expect(optionsFor(p, 'sauce')[0].id).toBe('burgersauce');
    expect(optionsFor(p, 'topping')[0].id).toBe('cheddar');
    expect(cravingTitle(p)).toBe('Burger mit Hack-Patty');
  });
});

describe('Ein Baustein für mehrere Stufen (Julia: Bolognese ist Protein und Sauce)', () => {
  const bolo = recipe('bo', 'Testbolo', [{ kind: 'protein', also: ['sauce'], directions: ['pasta'] }]);
  const own = recipeChoices([bolo]);

  it('steht schon beim Protein – gewählt ist die Sauce erledigt („steckt in“)', () => {
    let s = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'carb', 'pasta');
    expect(optionsFor(s, 'protein', own)[0].id).toBe('rezept:bo');
    s = pick(s, 'protein', 'rezept:bo', own);
    expect(currentStep(s)).toBe('veg');
    expect(coveredBy(s, 'sauce', own)?.name).toBe('Testbolo');
    // auch bei der Sauce steht sie zur Wahl, falls man dort anfängt
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'pasta'), 'sauce', own)[0].id).toBe('rezept:bo');
  });

  it('wird sie ersetzt (doch Hack), ist die Sauce wieder offen; was dort gewählt ist, bleibt', () => {
    const s = pick(pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'rezept:bo', own), 'protein', 'hack', own);
    expect(s.closed).not.toContain('sauce');
    // Sauce ist mehrfach wählbar (Julia: Bolo + Dip) – erledigt erst mit „Weiter“
    const pesto = closeStep(pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'sauce', 'pesto', own), 'sauce');
    const withPesto = pick(pick(pesto, 'protein', 'rezept:bo', own), 'protein', 'hack', own);
    expect(withPesto.picks.sauce).toEqual(['pesto']);
    expect(withPesto.closed).toContain('sauce');
  });

  it('zur Bolo noch ein Dip (Julia): Sauce wieder öffnen, mehrere wählbar – die Bolo steht dort nicht noch einmal', () => {
    let s = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'rezept:bo', own);
    s = reopen(s, 'sauce');
    expect(optionsFor(s, 'sauce', own).some((c) => c.id === 'rezept:bo')).toBe(false);
    s = pick(pick(s, 'sauce', 'joghurt', own), 'sauce', 'pesto', own);
    expect(s.picks.sauce).toEqual(['joghurt', 'pesto']);
    expect(s.closed).not.toContain('sauce'); // erst „Weiter“ schließt
    expect(pick(s, 'sauce', 'pesto', own).picks.sauce).toEqual(['joghurt']); // nochmal tippen nimmt raus
    let n = 0;
    const c = cravingContent(closeStep(s, 'sauce'), { own, recipes: [bolo], servings: 2, title: 'T', newId: () => `x${++n}` });
    expect(c.ingredients.filter((i) => i.recipeId === 'bo')).toHaveLength(1);
    expect(c.ingredients.some((i) => i.name === 'Joghurt-Dip' || i.name === 'Joghurt')).toBe(true);
  });

  it('Richtung wechseln lässt die abgedeckte Stufe erledigt', () => {
    const s = chooseDirection(pick(EMPTY_CRAVING, 'protein', 'rezept:bo', own), 'pasta', own);
    expect(s.closed).toContain('sauce');
  });

  it('Textfeld: „Testbolo“ wählt sie samt Sauce', () => {
    const s = understand('Pasta Testbolo', own)!;
    expect(s.picks.protein).toEqual(['rezept:bo']);
    expect(s.closed).toContain('sauce');
  });
});

describe('Tortilla = Taco + Wrap', () => {
  it('alte Markierung „wrap“ zählt als Tortilla', () => {
    const old = recipe('w', 'Testwrapfüllung', [{ kind: 'protein', directions: ['wrap'] }]);
    const own = recipeChoices([old]);
    expect(own[0].directions).toEqual(['taco']);
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', own)[0].id).toBe('rezept:w');
  });
});

describe('Baukasten im Wochenplan: die Grundlage ist schon gewählt', () => {
  // unmarkiert entscheiden die Schritte (Julia: „an den Schritten“): köchelt sie, ist sie Protein und Sauce
  const withSteps = (r: Recipe, ...texts: string[]): Recipe => ({
    ...r, versions: [{ ...r.versions[0], content: { ...r.versions[0].content, steps: texts.map((text, i) => ({ id: `x${i}`, text })) } }],
  });

  it('unmarkiert: Bolognese & Co. decken Protein und Sauce ab, eine Sauce nur die Sauce', () => {
    const { state, own } = baseCraving(withSteps(recipe('g', 'Testbolognese'), 'Hack anbraten.', 'Mit Tomaten 30 Min. köcheln lassen.'));
    expect(state.picks.protein).toEqual(['rezept:g']);
    expect(state.closed).toEqual(expect.arrayContaining(['protein', 'sauce']));
    expect(currentStep(state)).toBe('carb');
    expect(own).toHaveLength(1);
    expect(baseCraving(recipe('t', 'Testtomatensauce')).state.closed).toEqual(['sauce']);
  });

  it('unmarkiert und kein Topf (Rundgang): was gebacken oder nur gebraten wird, deckt die Sauce nicht ab', () => {
    const lasagne = withSteps(recipe('l', 'Testlasagne'), 'Sauce köcheln lassen.', 'Schichten und im Ofen backen.');
    const frikadellen = withSteps(recipe('f', 'Testfrikadellen'), 'Formen und in der Pfanne braten.');
    for (const r of [lasagne, frikadellen]) {
      const { state } = baseCraving(r);
      expect(state.closed, currentContent(r).title).toEqual(['protein']);
      expect(weekCookSteps('pasta', r)[0]).not.toHaveProperty('pot');
    }
    expect(weekCookSteps('pasta', withSteps(recipe('g', 'Testbolognese'), 'Köcheln lassen.'))[0]).toMatchObject({ pot: true });
  });

  it('markiert mit einer Richtung: die ist gleich gewählt; gespeichert werden nur die festen Bausteine', () => {
    const { state, own } = baseCraving(recipe('g', 'Testchili', [{ kind: 'sauce', directions: ['taco'] }]));
    expect(state.direction).toBe('taco');
    expect(currentStep(state)).toBe('protein');
    const done = pick(pick(state, 'protein', 'bohnen', own), 'veg', 'mais', own);
    expect(cravingCombo(done)).toBe('tortillas,bohnen,mais');
  });

  it('eigene Bausteine (Julia: „Tomaten“) stehen in jeder Richtung hinten', () => {
    const s = chooseDirection(EMPTY_CRAVING, 'bowl');
    const list = optionsFor(s, 'veg', [], { customSides: ['eigen:veg:Testtomaten', 'eigen:topping:Testkerne'] });
    expect(list.at(-1)?.name).toBe('Testtomaten');
    expect(list.some((c) => c.name === 'Testkerne')).toBe(false);
  });

  it('heißt ein eigener wie ein fester (alte „Tomaten“), steht er nur einmal da (Julia: „2 mal Tomaten“)', () => {
    const list = optionsFor(EMPTY_CRAVING, 'veg', [], { customSides: ['eigen:veg:tomaten', 'eigen:veg:Testtomaten'] });
    expect(list.filter((c) => c.name.toLowerCase() === 'tomaten').map((c) => c.id)).toEqual(['tomaten']);
    expect(list.some((c) => c.name === 'Testtomaten')).toBe(true);
  });
});

describe('Passt gut zu und ersetzt (Julia: in den Grundrezepten notieren, zu was sie passen)', () => {
  it('„Passt gut zu“ am Rezept: steht vorn, sobald es gewählt ist – auch im Wochenplan', () => {
    const bolo = { ...recipe('bo', 'Testbolo', [{ kind: 'protein', also: ['sauce'], directions: [] }]), pairs: ['spaetzle', 'parmesan'] };
    const own = recipeChoices([bolo]);
    const s = pick(chooseDirection(EMPTY_CRAVING, 'pasta'), 'protein', 'rezept:bo', own);
    expect(optionsFor(s, 'carb', own)[0].id).toBe('spaetzle');
    expect(optionsFor(s, 'topping', own)[0].id).toBe('parmesan');
    const week = baseCraving({ ...recipe('g', 'Testbolognese'), pairs: ['spaetzle'] });
    expect(optionsFor(chooseDirection(week.state, 'pasta', week.own), 'carb', week.own)[0].id).toBe('spaetzle');
  });

  it('dein Rezept ersetzt einen festen Baustein: der feste ist weg, das Textfeld findet deins', () => {
    const guac = recipe('gu', 'Avocado-Testcreme', [{ kind: 'sauce', directions: [], replaces: 'guacamole' }]);
    const own = recipeChoices([guac]);
    const sauces = optionsFor(chooseDirection(EMPTY_CRAVING, 'taco'), 'sauce', own).map((c) => c.id);
    expect(sauces[0]).toBe('rezept:gu');
    expect(sauces).not.toContain('guacamole');
    expect(understand('Taco mit Guacamole', own)?.picks.sauce).toEqual(['rezept:gu']);
    // passt wie die feste Guacamole zum Hähnchen – ohne sie stünde Hack vorn
    expect(optionsFor(chooseDirection(EMPTY_CRAVING, 'taco'), 'protein', own)[0].id).toBe('hack');
    const s = pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'sauce', 'rezept:gu', own);
    expect(optionsFor(s, 'protein', own)[0].id).toBe('haehnchen');
  });
});

describe('Teller als Bild (Julia)', () => {
  const bolo = recipe('bo', 'Testbolo', [{ kind: 'protein', also: ['sauce'], directions: ['pasta'] }]);
  const own = recipeChoices([bolo]);

  it('je Stufe, was darauf liegt – leere Stufen fehlen, die Farbe kommt mit', () => {
    const s = { direction: 'bowl', picks: { carb: ['reis'], protein: ['tofu'], veg: ['brokkoli', 'paprika'] }, closed: [...STAGES] };
    expect(plateImage(s, [], 155)).toEqual({ kind: 'plate', fields: { carb: ['Reis'], protein: ['Tofu'], veg: ['Brokkoli', 'Paprika'] }, hue: 155 });
  });

  it('Bolognese: eine Hälfte, die mitgebrachte Stufe ist nicht leer – egal, wo sie gewählt wurde', () => {
    const asProtein = { picks: { carb: ['pasta'], protein: ['rezept:bo'], topping: ['parmesan'] }, closed: [...STAGES] };
    expect(plateImage(asProtein, own, 40)).toEqual({
      kind: 'plate', half: true, hue: 40, fields: { carb: ['Pasta'], protein: ['Testbolo'], sauce: ['Testbolo'], topping: ['Parmesan'] },
    });
    const asSauce = { picks: { sauce: ['rezept:bo'] }, closed: [] };
    expect(plateImage(asSauce, own, 40)).toMatchObject({ half: true, fields: { protein: ['Testbolo'], sauce: ['Testbolo'] } });
  });

  it('liegt schon Hackfleisch beim Protein, bleiben es zwei Felder', () => {
    const s = { picks: { protein: ['hack'], sauce: ['rezept:bo'] }, closed: [] };
    expect(halfOf(s, own)).toBeUndefined();
    expect(plateImage(s, own, 40)).toEqual({ kind: 'plate', hue: 40, fields: { protein: ['Hackfleisch'], sauce: ['Testbolo'] } });
  });
});

describe('Deine Rezepte als Baustein im Wochenplan (Julia: deine Guacamole auch dort)', () => {
  const own = recipeChoices([streifen, dips]);
  const s = { picks: { carb: ['tortillas'], protein: ['rezept:r1'], sauce: ['rezept:r2:Testdip'], topping: ['koriander'] }, closed: [] };

  it('gespeicherte Form: feste wie bisher, deine in Stufen-Reihenfolge dazu – die Grundlage selbst nicht', () => {
    const combo = cravingCombo(s, own, 'grundlage')!;
    expect(combo).toBe('tortillas,mein:protein:r1:Knusprige%20Teststreifen,mein:sauce:r2:Testdip:teil,koriander');
    expect(comboText(combo)).toBe('Tortillas, Knusprige Teststreifen, Testdip & Koriander');
    expect(cravingCombo(s)).toBe('tortillas,koriander'); // ohne deine Rezepte dieselbe Form wie bisher
    expect(cravingCombo(s, own, 'r1')).toBe('tortillas,mein:sauce:r2:Testdip:teil,koriander');
  });

  it('Komma, Plus und Doppelpunkt im Namen trennen nichts – alte Leser sehen nur die festen', () => {
    const name = 'Dip: scharf, mit Chili+Limette';
    const entry = ownEntry({ recipeId: 'r9', kind: 'sauce', name, part: name });
    const side = `reis,${entry}`;
    expect(ownSidesOf(side)).toEqual([{ entry, recipeId: 'r9', kind: 'sauce', name, part: name }]);
    expect(sidesOf(side).map((x) => x.id)).toEqual(['reis']);
    expect(comboText(side)).toBe(`Reis & ${name}`);
    expect(ownOf('mein:sauce:r9:%E0%A4%A')).toBeUndefined(); // kaputt kodiert: weglassen statt abstürzen
  });

  it('So geht’s: genug vorgekocht → aus dem Kühlschrank, sonst nach deinem Rezept; gelöschtes Rezept fällt weg', () => {
    const side = cravingCombo({ picks: { sauce: ['rezept:r2:Testdip'] }, closed: [] }, own)!;
    expect(ownComboSteps(side, [dips], [], 1)).toMatchObject([{ name: 'Testdip', text: 'nach deinem Rezept', source: 'rezept' }]);
    const items: PantryItem[] = [{ id: 'p', name: 'Testdip', amount: 2, unit: 'Stück', addedAt: '', recipeId: 'r2', part: 'Testdip' }];
    expect(ownComboSteps(side, [dips], items, 2)[0].text).toBe('aus dem Kühlschrank, bei Bedarf erwärmen');
    expect(ownComboSteps(side, [dips], items, 3)[0].text).toBe('nach deinem Rezept'); // reicht nicht für alle
    expect(ownComboSteps(side, [], items, 1)).toEqual([]);
    // gleich für morgen mitkochen: vorgekocht zählt nur, wenn es für beide reicht
    const entry = ownSidesOf(side)[0].entry;
    expect(ownComboSteps(side, [dips], items, 1, { entry, portions: 1 })[0]).toMatchObject({ ready: true });
    expect(ownComboSteps(side, [dips], items, 1, { entry, portions: 2 })[0]).toMatchObject({ text: 'nach deinem Rezept' });
    expect(ownComboSteps(side, [dips], items, 1, { entry, portions: 2 })[0].ready).toBeUndefined();
  });
});

describe('Kochstil im Baukasten (Julia: mehr Abwechslung in den Schritten)', () => {
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const allClosed = (s: CravingState) => STAGES.reduce((acc, k) => closeStep(acc, k), s);
  const taco = allClosed(pick(pick(pick(chooseDirection(EMPTY_CRAVING, 'taco'), 'carb', 'tortillas'), 'protein', 'haehnchen'), 'veg', 'paprika'));
  const textOf = (s: CravingState, id: string, hh?: Parameters<typeof cravingSteps>[2]) => cravingSteps(s, [], hh).find((x) => x.ids.includes(id))!.text;

  it('Würz-Chip: gewählt geht vor, „ohne“ würzt nicht', () => {
    expect(textOf(taco, 'haehnchen')).toContain('mit Kreuzkümmel');
    expect(textOf({ ...taco, spice: 'indisch' }, 'haehnchen')).toContain('mit Garam Masala');
    expect(textOf({ ...taco, spice: 'ohne' }, 'haehnchen')).not.toContain('würzen');
    // „Anrichten“ endet mit dem Handgriff der Würze
    expect(cravingSteps(taco).at(-1)).toMatchObject({ id: 'anrichten', text: expect.stringMatching(/– Limettenspalten dazu$/) });
  });

  it('Zubereitung umschalten: roh kommt nicht in die Pfanne; die Chips stehen am Schritt', () => {
    const steps = cravingSteps(taco);
    expect(steps.find((x) => x.ids.includes('paprika'))!.ids).toEqual(['haehnchen', 'paprika']); // eine Pfanne
    expect(steps.find((x) => x.ids.includes('paprika'))!.options?.find((o) => o.id === 'paprika')).toMatchObject({ chosen: 'pfanne' });
    const roh = cravingSteps({ ...taco, ways: { paprika: 'roh' } });
    expect(roh.find((x) => x.ids.includes('paprika'))).toMatchObject({ ids: ['paprika'], text: 'in feine Streifen schneiden' });
  });

  it('dein Standard aus den Einstellungen geht vor den Vorschlag der Richtung – als Chip „deine“', () => {
    const ofen = allClosed(pick(chooseDirection(EMPTY_CRAVING, 'ofen'), 'veg', 'brokkoli'));
    const hh = { sidePrep: { brokkoli: { text: 'in Röschen kurz blanchieren', minutes: 4 } } };
    expect(textOf(ofen, 'brokkoli')).toContain('im Ofen rösten');
    const mine = cravingSteps(ofen, [], hh).find((x) => x.ids.includes('brokkoli'))!;
    expect(mine.text).toBe('in Röschen kurz blanchieren');
    expect(mine.options?.[0]).toMatchObject({ chosen: 'eigen', ways: expect.arrayContaining([expect.objectContaining({ id: 'eigen', label: 'deine' })]) });
    expect(textOf({ ...ofen, ways: { brokkoli: 'gedaempft' } }, 'brokkoli', hh)).toBe('in Röschen dämpfen');
  });

  it('Würfel: würfelt Würze und Zubereitung mit, deine Wahl bleibt; „Nochmal“ nimmt nur Gewürfeltes heraus', () => {
    const rolled = rollCraving(chooseDirection(EMPTY_CRAVING, 'ofen'), { rng: seeded(7) });
    expect(rolled.spice).toBeTruthy();
    expect(rolled.rolled?.spice).toBe(rolled.spice);
    const mine = rollCraving({ ...chooseDirection(EMPTY_CRAVING, 'ofen'), spice: 'mexikanisch', ways: { brokkoli: 'gedaempft' } }, { rng: seeded(7) });
    expect(mine.spice).toBe('mexikanisch');
    expect(mine.ways?.brokkoli).toBe('gedaempft');
    expect(mine.rolled?.spice).toBeUndefined();
    // über viele Würfe kommen verschiedene Würzen und Zubereitungen vor – die der Richtung am häufigsten
    const spices = Array.from({ length: 60 }, (_, i) => rollCraving(chooseDirection(EMPTY_CRAVING, 'taco'), { rng: seeded(i + 1) }).spice);
    expect(new Set(spices).size).toBeGreaterThan(2);
    const count = (id: string) => spices.filter((x) => x === id).length;
    expect(count('mexikanisch')).toBeGreaterThan(count('indisch'));
  });
});

describe('Kochstil im Wochenplan (weekCookSteps)', () => {
  const bolo = recipe('bo', 'Testbolo', [{ kind: 'protein', also: ['sauce'], directions: ['pasta'] }]);
  const texts = (side: string, opts: Parameters<typeof weekCookSteps>[2] = {}) => weekCookSteps(side, bolo, opts).map((s) => `${s.name}: ${s.text}`);

  it('mit Richtung: Würze, Zubereitung nach Richtung, Anrichten – „drüberreiben“ steckt im Anrichten', () => {
    expect(texts('pasta,brokkoli,parmesan,richtung:pasta')).toEqual([
      'Testbolo: aufwärmen',
      'Pasta: in Salzwasser kochen; die letzten 3 Min. die Brokkoli-Röschen mitkochen',
      'Anrichten: Pasta abgießen, Testbolo und Brokkoli unterheben, mit Parmesan servieren – mit etwas Olivenöl beträufeln',
    ]);
  });

  it('die Grundlage ist eine Sauce: „in der Sauce“ gart darin – am Kochtag nicht (sie wird erst gekocht)', () => {
    const steps = weekCookSteps('reis,haehnchen,weg:haehnchen:sauce', bolo);
    expect(steps[0]).toMatchObject({ ids: ['grundlage', 'haehnchen'], text: 'aufwärmen; die Hähnchenwürfel kurz anbraten und darin fertig garen', minutes: 12 });
    expect(texts('reis,haehnchen,weg:haehnchen:sauce', { basePot: false })).toContain('Hähnchenbrust: in Streifen schneiden und braten');
  });

  it('alter Abend ohne Stil: nicht gewürzt, allgemein angerichtet', () => {
    expect(texts('reis,haehnchen')).toEqual([
      'Testbolo: aufwärmen', 'Reis: mit doppelter Menge Wasser köcheln', 'Hähnchenbrust: in Streifen schneiden und braten',
      'Anrichten: Alles auf die Teller verteilen',
    ]);
  });

  it('nur bei dieser Grundlage geht vor den Vorschlag der Richtung – als Chip „deine“, mit „nur hier“', () => {
    const own = { ...bolo, blockPrep: { brokkoli: { text: 'in Röschen blanchieren', minutes: 4 } } };
    const [, brokkoli] = weekCookSteps('brokkoli,richtung:ofen', own);
    expect(brokkoli).toMatchObject({ text: 'in Röschen blanchieren', source: 'grundlage' });
    expect(brokkoli.options?.[0]).toMatchObject({ chosen: 'eigen' });
    expect(weekCookSteps('brokkoli,richtung:ofen,weg:brokkoli:ofen', own)[1].text).toContain('im Ofen rösten');
  });
});

describe('Garfamilien im Baukasten (Julia: Zubereitungswege für alle Bausteine)', () => {
  it('Gnocchi zum Umschalten; dein Kürbis bekommt eine Zubereitung statt keiner; deine Wahl für Unbekanntes zählt', () => {
    const s: CravingState = { picks: { carb: ['gnocchi'], veg: ['eigen:veg:Kürbis', 'eigen:veg:Romanesco'] }, closed: [...STAGES] };
    const steps = cravingSteps(s); // eigene Bausteine erkennt Mashi an der id – dafür braucht es den Haushalt nicht
    const at = (name: string) => steps.find((x) => x.name === name || x.ids.some((id) => id.endsWith(name)));
    expect(at('Gnocchi')?.options?.[0].ways.map((w) => w.label)).toEqual(['gekocht', 'knusprig', 'im Ofen']);
    expect(at('Kürbis')).toMatchObject({ text: 'in Stücke schneiden, mit Öl im Ofen rösten', minutes: 25 });
    expect(at('Romanesco')?.text).toBeUndefined(); // Mashi kennt ihn nicht – die Oberfläche fragt
    const asked = cravingSteps(s, [], { sideFamily: { 'eigen:veg:Romanesco': 'zart' } });
    expect(asked.find((x) => x.ids.includes('eigen:veg:Romanesco'))?.text).toBe('in Stücke schneiden und kurz braten');
  });
});

describe('Deine Schritte in der Zeitleiste (Julia: Weg B – „die Kochschritte bleiben“)', () => {
  // erfunden: eine Bowl mit zwei Teilen als Bausteine, ein Ofengemüse als ganzes Rezept
  const bowlContent: RecipeContent = {
    ...content('Testbowl'),
    ingredients: [
      ing('h', 'Hähnchenbrust', 'Knuspriges Hähnchen'), ing('st', 'Speisestärke', 'Knuspriges Hähnchen'),
      ing('e', 'Erdnussbutter', 'Sauce'), ing('so', 'Sojasauce', 'Sauce'), ing('r', 'Reis'),
    ],
    steps: [
      { id: 's1', text: 'Hähnchenbrust in Speisestärke wenden.' },
      { id: 's2', text: 'Hähnchenbrust knusprig braten.', timerMinutes: 8 },
      { id: 's3', text: 'Erdnussbutter mit Sojasauce glatt rühren.' },
      { id: 's4', text: 'Reis kochen.', timerMinutes: 15 },
      { id: 's5', text: 'Alles in Schalen anrichten.', part: FINISH },
      { id: 's6', text: '  ' },
    ],
  };
  const bowl: Recipe = {
    ...recipe('tb', 'Testbowl', [{ part: 'Knuspriges Hähnchen', kind: 'protein', directions: [] }, { part: 'Sauce', kind: 'sauce', directions: [] }]),
    versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: bowlContent }],
  };
  const ofen: Recipe = {
    ...recipe('tg', 'Testofengemüse', [{ kind: 'veg', directions: [] }], [ing('k', 'Kürbis')]),
    versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...content('Testofengemüse', [ing('k', 'Kürbis')]), steps: [
      { id: 'o1', text: 'Kürbis würfeln.' }, { id: 'o2', text: 'Kürbis im Ofen rösten.', timerMinutes: 25 },
    ] } }],
  };
  const all = [bowl, ofen];
  const own = recipeChoices(all);
  const s: CravingState = {
    picks: { carb: ['reis'], protein: ['rezept:tb:Knuspriges Hähnchen'], sauce: ['rezept:tb:Sauce'], veg: ['rezept:tg'] },
    closed: [...STAGES],
  };

  it('ein Teil: nur seine Schritte – ohne „Zum Schluss“ und leere; ein ganzes Rezept: alle', () => {
    expect(ownSteps(bowl, 'Knuspriges Hähnchen')).toEqual([
      { text: 'Hähnchenbrust in Speisestärke wenden.' }, { text: 'Hähnchenbrust knusprig braten.', timerMinutes: 8 },
    ]);
    expect(ownSteps(bowl, 'Sauce')).toEqual([{ text: 'Erdnussbutter mit Sojasauce glatt rühren.' }]);
    expect(ownSteps(ofen, undefined).map((x) => x.text)).toEqual(['Kürbis würfeln.', 'Kürbis im Ofen rösten.']);
  });

  it('ganzes Rezept: so, wie es gekocht wird – getauscht steht Tofu drin, wie auf der Einkaufsliste', () => {
    const swapped = { ...bowl, swaps: { h: swapFor('tofu')! } };
    expect(ownSteps(swapped, undefined)[1].text).toMatch(/^Tofu knusprig braten\./);
  });

  it('„So geht’s“: deine Schritte statt „nach deinem Rezept“, bei Teilen mit Herkunft', () => {
    const steps = cravingSteps(s, own);
    const chicken = steps.find((x) => x.name === 'Knuspriges Hähnchen')!;
    expect(chicken).toMatchObject({ from: 'Testbowl', minutes: 8 });
    expect(chicken.text).toBeUndefined();
    expect(chicken.steps?.map((x) => x.text)).toEqual(['Hähnchenbrust in Speisestärke wenden.', 'Hähnchenbrust knusprig braten.']);
    expect(steps.find((x) => x.name === 'Testofengemüse')).toMatchObject({ steps: [{ text: 'Kürbis würfeln.' }, { text: 'Kürbis im Ofen rösten.', timerMinutes: 25 }] });
    expect(steps.find((x) => x.name === 'Testofengemüse')?.from).toBeUndefined();
    expect(steps.some((x) => x.text === 'nach deinem Rezept')).toBe(false);
  });

  it('Zeitleiste: an deinen Schritten erkannt – der Ofen läuft allein, das Hähnchen braucht dich', () => {
    const t = cravingTimeline(cravingSteps(s, own));
    const at = (name: string) => t.steps.find((x) => x.name === name)!;
    expect(t.total).toBe(25);
    expect(at('Testofengemüse')).toMatchObject({ alone: true, start: 0 });
    expect(at('Reis')).toMatchObject({ alone: true, start: 10 });
    expect(at('Knuspriges Hähnchen')).toMatchObject({ alone: false, start: 17 });
    expect(startLabel(at('Sauce'))).toBe('zum Schluss');
  });

  it('allein nur, wenn jeder deiner Schritte mit Uhr allein läuft; ein Text geht vor', () => {
    const one = (x: { minutes: number; text?: string; steps?: { text: string; timerMinutes?: number }[] }) => cravingTimeline([x]).steps[0].alone;
    expect(one({ minutes: 15, steps: [{ text: 'Reis waschen.' }, { text: 'Reis köcheln.', timerMinutes: 15 }] })).toBe(true);
    expect(one({ minutes: 25, steps: [{ text: 'Kartoffeln kochen.', timerMinutes: 20 }, { text: 'In der Pfanne braten.', timerMinutes: 5 }] })).toBe(false);
    expect(one({ minutes: 5, steps: [{ text: 'Kürbis würfeln.' }] })).toBe(false); // ohne Uhr: deine Hände
    expect(one({ minutes: 5, text: 'aus dem Kühlschrank aufwärmen', steps: [{ text: 'braten', timerMinutes: 5 }] })).toBe(true);
  });

  it('das gespeicherte Gericht ordnet genauso – Kochmodus und „So geht’s“ sagen dasselbe', () => {
    let n = 0;
    const c = cravingContent(s, { own, recipes: all, servings: 2, title: '', newId: () => `x${++n}` });
    const texts = c.steps.map((x) => x.text);
    // ein ganzes Rezept bringt seine Schritte an ihrer Stelle mit (Rundgang: früher Platzhalter + doppelt)
    expect(texts[0]).toBe('Sofort – Kürbis würfeln.');
    expect(texts[1]).toBe('Kürbis im Ofen rösten.');
    expect(texts[2]).toMatch(/^Nach 10 Min\. – Reis: /);
    expect(texts[3]).toBe('Nach 17 Min. – Hähnchenbrust in Speisestärke wenden.');
    expect(texts[4]).toBe('Hähnchenbrust knusprig braten.');
    expect(texts.some((x) => x.includes('nach deinem Rezept'))).toBe(false);
    expect(texts).toContain('Zum Schluss – Erdnussbutter mit Sojasauce glatt rühren.');
    expect(texts.some((x) => x.includes('Alles in Schalen anrichten'))).toBe(false); // „Zum Schluss“ der Bowl: Mashis Anrichten
    // Anrichten nennt alles beim Namen – aber keine Zutaten darüber (Rundgang)
    expect(c.steps.find((x) => x.text.includes('Anrichten'))?.ingredientIds).toEqual([]);
  });

  it('gekocht (cookingContent): ein ganzes Rezept nur einmal – Zutaten aufgelöst, Schritte an ihrer Stelle mit seinen Zutaten', () => {
    let n = 0;
    const content = cravingContent(s, { own, recipes: all, servings: 2, title: 'Testgericht', newId: () => `x${++n}` });
    const dish: Recipe = { ...recipe('d', 'Testgericht'), versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content }] };
    const c = cookingContent(dish, all);
    const kuerbis = c.steps.filter((x) => x.text.includes('Kürbis'));
    expect(kuerbis.map((x) => x.text)).toEqual(['Sofort – Kürbis würfeln.', 'Kürbis im Ofen rösten.']); // nicht doppelt
    expect(kuerbis.every((x) => x.part === 'Testofengemüse')).toBe(true); // nicht „Zum Schluss“
    const kIng = c.ingredients.find((i) => i.name === 'Kürbis')!;
    expect(kIng).toMatchObject({ part: 'Testofengemüse' });
    expect(kuerbis[0].ingredientIds).toEqual([kIng.id]);
    expect(c.ingredients.some((i) => i.recipeId)).toBe(false); // aufgelöst – Einkauf und Vorrat sehen den Kürbis
  });

  it('Wochenplan: deine Schritte am Abend; vorgekocht nur aus dem Kühlschrank; ohne Schritte wie bisher', () => {
    const side = cravingCombo(s, own)!;
    const week = ownComboSteps(side, all, [], 2);
    expect(week.find((x) => x.name === 'Knuspriges Hähnchen')).toMatchObject({ from: 'Testbowl', steps: [{ text: 'Hähnchenbrust in Speisestärke wenden.' }, { timerMinutes: 8 }] });
    expect(week.find((x) => x.name === 'Knuspriges Hähnchen')?.text).toBeUndefined();
    const items: PantryItem[] = [{ id: 'p', name: 'Sauce', amount: 2, unit: 'Stück', addedAt: '', recipeId: 'tb', part: 'Sauce' }];
    const ready = ownComboSteps(side, all, items, 2).find((x) => x.name === 'Sauce')!;
    expect(ready).toMatchObject({ ready: true, text: 'aus dem Kühlschrank, bei Bedarf erwärmen' });
    expect(ready.steps).toBeUndefined();
    const base = recipe('gl', 'Testgrundlage');
    expect(weekCookSteps(side, base, { recipes: all, portions: 2 }).find((x) => x.name === 'Testofengemüse')?.steps).toHaveLength(2);
  });
});
