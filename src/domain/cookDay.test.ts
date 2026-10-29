import { describe, expect, it } from 'vitest';
import { alongMeals, cookDayMeal, cookStart, freshFor, TODAY } from './cookDay';
import { weekItems, weekSideNeeds, weekView } from './week';
import { sideContent } from './mix';
import type { Week } from './mealplan';
import type { Ingredient, Recipe, RecipeContent } from './types';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const recipe = (id: string, title: string, content: Partial<RecipeContent> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(title), ingredients: [], steps: [], ...content } }],
});
const ing = (id: string, name: string, amount: number, extra: Partial<Ingredient> = {}): Ingredient => ({ id, name, amount, unit: 'g', ...extra });

const bolo = recipe('bolo', 'Testbolo', { servings: 4, ingredients: [ing('b1', 'Testhack', 400)], steps: [{ id: 'bs', text: 'Testhack anbraten.' }] });
const spag = recipe('spag', 'Testspaghetti mit Bolo', {
  servings: 2,
  ingredients: [ing('s0', 'Testbolo', 2, { unit: 'Portion', recipeId: 'bolo' }), ing('s1', 'Testnudeln', 200)],
  steps: [{ id: 'ss', text: 'Testnudeln kochen.', ingredientIds: ['s1'], timerMinutes: 9 }, { id: 'sx', text: 'Mit der Testbolo mischen.', ingredientIds: ['s0', 's1'] }],
});
const all = [bolo, spag];
const hh = { portions: 2, lunchDays: [] };
const SO = 6, MO = 0, DI = 1, MI = 2, DO = 3;

describe('Kochtag in einem Durchgang (Julia: „vorkochen und heute schon was davon essen“)', () => {
  it('das Essen am Kochtag: abends, noch nicht gegessen, Grundlage noch nicht gekocht', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }],
      meals: [{ id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' }, { id: 'b', day: MO, recipeId: 'bolo', baseId: 'bolo' }],
    };
    expect(cookDayMeal(w, 'bolo')?.id).toBe('a');
    expect(cookDayMeal({ ...w, meals: [{ ...w.meals[0], done: true }, w.meals[1]] }, 'bolo')).toBeUndefined();
    expect(cookDayMeal({ ...w, bases: [{ recipeId: 'bolo', day: SO, cooked: true }] }, 'bolo')).toBeUndefined();
    expect(cookDayMeal(w, 'chili')).toBeUndefined();
  });

  it('frisch dazu: das Gericht ohne Grundlage, für eine Portion – ids mit „heute:“, Schritte zeigen weiter auf ihre Zutaten', () => {
    const f = freshFor({ id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' }, all, hh)!;
    expect(f.servings).toBe(1);
    expect(f.ingredients).toEqual([{ id: `${TODAY}s1`, name: 'Testnudeln', amount: 100, unit: 'g' }]);
    expect(f.steps.map((s) => s.id)).toEqual([`${TODAY}ss`, `${TODAY}sx`]);
    expect(f.steps[0]).toMatchObject({ ingredientIds: [`${TODAY}s1`], timerMinutes: 9 });
    // die Grundlage steht nicht mehr in der Zutatenliste – stepIngredients überspringt sie beim „Mischen“ still
    expect(f.steps[1].ingredientIds).toEqual([`${TODAY}s0`, `${TODAY}s1`]);
  });

  it('Grundlage mit Bausteinen: Beilagen als Zutat und Schritt, das Längste zuerst; nur die Grundlage: nichts frisch', () => {
    const f = freshFor({ id: 'a', day: SO, recipeId: 'bolo', baseId: 'bolo', side: 'pasta,parmesan' }, all, hh)!;
    expect(f.ingredients.map((i) => [i.name, i.amount])).toEqual([['Pasta', 100], ['Parmesan', 15]]);
    expect(f.steps.map((s) => s.text)).toEqual(['Pasta: in Salzwasser kochen', 'Parmesan: frisch drüberreiben']);
    expect(f.steps[0]).toMatchObject({ timerMinutes: 10, ingredientIds: [`${TODAY}beilage:pasta`] });
    expect(freshFor({ id: 'b', day: MO, recipeId: 'bolo', baseId: 'bolo' }, all, hh)).toBeUndefined();
  });

  it('„Kochmodus starten“ im Wochenplan: am Kochtag vorkochen (alle Portionen), danach das Gericht, nur aufwärmen: nichts', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO, extra: 1 }],
      meals: [{ id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo', portions: 3 }, { id: 'b', day: MO, recipeId: 'bolo', baseId: 'bolo' }, { id: 'c', day: DI, recipeId: 'spag', baseId: 'bolo' }],
    };
    const start = (week: Week, id: string) => {
      const view = weekView(week, all, hh);
      return cookStart(view, view.days.flatMap((d) => [d.lunch, d.meal]).find((m) => m?.meal.id === id)!, hh);
    };
    // 3 + 2 + 2 + 1 im Kühlschrank
    expect(start(w, 'a')).toEqual({ prep: true, baseId: 'bolo', portions: 8 });
    expect(start(w, 'c')).toBeUndefined(); // Dienstag: erst nach dem Vorkochen
    const gekocht: Week = { ...w, bases: [{ ...w.bases[0], cooked: true }] };
    expect(start(gekocht, 'c')).toEqual({ prep: false, recipeId: 'spag', mealId: 'c', portions: 2 });
    expect(start(gekocht, 'b')).toBeUndefined();
    // Frisches am Abend vorher mitgekocht: nur noch einpacken
    const mit: Week = { ...gekocht, meals: gekocht.meals.map((m) => (m.id === 'c' ? { ...m, freshCooked: true as const } : m)) };
    expect(start(mit, 'c')).toBeUndefined();
  });

  it('frisch mitkochen für 2 Tage (Julia, wie bei zweimal Nudeln): dasselbe Gericht mittags und abends, noch offen', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }],
      meals: [
        { id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' },
        { id: 'm', day: MO, lunch: true, recipeId: 'spag', baseId: 'bolo' },
        { id: 'b', day: MO, recipeId: 'bolo', baseId: 'bolo' },
        { id: 'c', day: DI, recipeId: 'spag', baseId: 'bolo' },
        { id: 'd', day: MI, lunch: true, recipeId: 'spag', baseId: 'bolo' }, // 3 Tage später – zu alt
      ],
    };
    const ids = (week: Week, id: string, rs = all) => alongMeals(week, week.meals.find((m) => m.id === id)!, rs).meals.map((m) => m.id);
    expect(ids(w, 'a')).toEqual(['m', 'c']);
    // vom Mittag aus: der Abend am selben Tag zählt mit, Mittwoch (2 Tage nach Montag) auch
    expect(ids(w, 'm')).toEqual(['c', 'd']);
    expect(ids(w, 'b')).toEqual([]);
    const schon = { ...w, meals: w.meals.map((m) => (m.id === 'm' ? { ...m, freshCooked: true as const } : m)) };
    expect(ids(schon, 'a')).toEqual(['c']);
    const andereBeilage = { ...w, meals: w.meals.map((m) => (m.id === 'm' ? { ...m, side: 'pasta' } : m)) };
    expect(ids(andereBeilage, 'a')).toEqual(['c']);
  });

  it('hält das Gericht länger oder kürzer, richtet sich das Mitkochen danach (Julia) – „frisch bis“ wie beim Kühlschrank', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }],
      meals: [
        { id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' },
        { id: 'c', day: DI, recipeId: 'spag', baseId: 'bolo' },
        { id: 'd', day: MI, recipeId: 'spag', baseId: 'bolo' },
        { id: 'e', day: DO, recipeId: 'spag', baseId: 'bolo' },
      ],
    };
    const along = (rs: Recipe[], id = 'a') => alongMeals(w, w.meals.find((m) => m.id === id)!, rs);
    expect(along(all)).toEqual({ meals: [w.meals[1]], until: DI }); // ohne Angabe: Vorgekochtes hält 3 Tage → bis Di
    // eigene Einstellung „Vorgekochtes hält 4 Tage“ gilt auch hier – wie der Regler auf der Rezeptseite
    expect(alongMeals(w, w.meals[0], all, 4).until).toBe(MI);
    expect(along([bolo, { ...spag, keepsDays: 4 }])).toEqual({ meals: [w.meals[1], w.meals[2]], until: MI });
    expect(along([bolo, { ...spag, keepsDays: 1 }])).toEqual({ meals: [], until: SO });
    // Grundlage mit Bausteinen: frisch sind nur die Nudeln – wie lange die Bolo hält, zählt nicht
    const combo: Week = { ...w, meals: w.meals.map((m) => ({ ...m, recipeId: 'bolo', side: 'pasta' })) };
    const lang = [{ ...bolo, keepsDays: 5 }, spag];
    expect(alongMeals(combo, combo.meals[0], lang).meals.map((m) => m.id)).toEqual(['c']);
  });

  it('schon Mitgekochtes kauft die Einkaufsliste nicht noch einmal – die Grundlage zählt weiter', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }],
      meals: [
        { id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' },
        { id: 'm', day: MO, lunch: true, recipeId: 'spag', baseId: 'bolo', freshCooked: true },
        { id: 'p', day: MO, recipeId: 'bolo', baseId: 'bolo', side: 'pasta', freshCooked: true },
      ],
    };
    expect(weekItems(w, all, hh)).toEqual([{ recipeId: 'bolo', servings: 6, fromWeek: true }, { recipeId: 'spag', servings: 2, fromWeek: true }]);
    expect(weekSideNeeds(w, all, hh)).toEqual([]);
  });
});
