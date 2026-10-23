import { describe, expect, it } from 'vitest';
import { sideContent } from './mix';
import type { Week } from './mealplan';
import type { Ingredient, Recipe } from './types';
import { buildShoppingList, emptyPlan } from './mealplan';
import { localFoodTable } from './nutrition/localFoods';
import { addBase, addToBase, choicesOf, mhdFinds, weekStarted, withCookDays } from './week';
import type { PantryItem } from './pantry';
import { baseIdOf, canSwap, mealPortions, weekItems, withoutBases, earlierCookDay, moveBase, setExtra, shiftFrom, sortCookDays, suggestWeek, swapDays, toggleLunch, transformsOf, weekdayOf, weekOrder, weekView } from './week';

// erfundene Rezepte – keine echten (das Repo ist öffentlich)
const recipe = (id: string, title: string, ingredients: Ingredient[] = [], extra: Partial<Recipe> = {}): Recipe => ({
  id, createdAt: '', updatedAt: '', status: 'kochbuch', source: 'selbst', favorite: false, notes: '',
  currentVersionId: 'v', feedback: [],
  versions: [{ id: 'v', number: 1, createdAt: '', author: 'nutzer', content: { ...sideContent(title), ingredients } }],
  ...extra,
});
const uses = (baseId: string, name: string): Ingredient => ({ id: `i-${baseId}`, name, amount: 1, unit: 'Portion' as Ingredient['unit'], recipeId: baseId });

const bolo = recipe('bolo', 'Testbolognese', [], { keepsDays: 3, freezable: true });
const spag = recipe('spag', 'Testspaghetti mit Bolo', [uses('bolo', 'Testbolognese')], { togo: true });
const wraps = recipe('wraps', 'Testwraps mit Bolo', [uses('bolo', 'Testbolognese')], { togo: true });
const ofen = recipe('ofen', 'Testofenkartoffel mit Bolo', [uses('bolo', 'Testbolognese')]);
const chili = recipe('chili', 'Testchili', [], { keepsDays: 4, freezable: true });
const chiliReis = recipe('chilireis', 'Testchili mit Reis', [uses('chili', 'Testchili')], { togo: true });
const bowl = recipe('bowl', 'Testburritobowl', [uses('chili', 'Testchili')], { togo: true });
const salat = recipe('salat', 'Testlinsensalat', [], { keepsDays: 2 }); // weder einfrierbar noch Verwandlungen
const all = [bolo, spag, wraps, ofen, chili, chiliReis, bowl, salat];

const MO = 0, DI = 1, MI = 2, DO = 3, FR = 4, SA = 5, SO = 6;
let n = 0;
const newId = () => `m${++n}`;
/** Beispielwoche aus dem Entwurf: Bolo am Sonntag (So, Mo, Di), Chili am Mittwoch (Mi, Do) */
const example = (): Week => suggestWeek([MI, SO], [
  { baseId: 'bolo', meals: ['spag', 'wraps', 'ofen'] },
  { baseId: 'chili', meals: ['chilireis', 'bowl'] },
], newId);
const plan = (w: Week) => w.meals.map((m) => `${m.day}:${m.recipeId}`).sort();

describe('Vorkoch-Woche (Julia: eine Bolo kochen, daraus Nudeln, Wraps …)', () => {
  it('Woche beginnt am Wochenend-Kochtag – Samstag vor Sonntag vor Montag', () => {
    expect(sortCookDays([MI, SO])).toEqual([SO, MI]);
    expect(sortCookDays([MI, SA, SO])).toEqual([SA, SO, MI]);
    expect(weekOrder({ cookDays: [MI, SO] })).toEqual([SO, MO, DI, MI, DO, FR, SA]);
    expect(weekdayOf(new Date('2026-10-26T12:00:00'))).toBe(MO); // ein Montag
  });

  it('Grundlage eines Gerichts: sie selbst oder die Zutat, die auf sie zeigt; Verwandlungen finden', () => {
    expect(baseIdOf(wraps, ['bolo', 'chili'])).toBe('bolo');
    expect(baseIdOf(salat, ['salat'])).toBe('salat'); // ganzes Gericht = seine eigene Grundlage
    expect(baseIdOf(wraps, ['chili'])).toBeUndefined();
    expect(transformsOf('bolo', all).map((r) => r.id)).toEqual(['spag', 'wraps', 'ofen']);
  });

  it('Vorschlag: erste Grundlage am ersten Kochtag, Abende ab dem Kochtag', () => {
    const w = example();
    expect(w.bases).toEqual([{ recipeId: 'bolo', day: SO }, { recipeId: 'chili', day: MI }]);
    expect(plan(w)).toEqual([`${MO}:wraps`, `${DI}:ofen`, `${MI}:chilireis`, `${DO}:bowl`, `${SO}:spag`].sort());
  });

  it('Alter und Einfrieren: was über die Haltbarkeit hinaus geht, wird eingefroren – oder ist zu alt', () => {
    const w = suggestWeek([SO], [{ baseId: 'bolo', meals: ['spag', 'wraps', 'ofen', 'spag'] }], newId);
    const v = weekView(w, all);
    const mi = v.days.find((d) => d.day === MI)!.meal!;
    expect([mi.age, mi.frost, mi.tooOld]).toEqual([3, true, false]); // Sonntag gekocht, hält 3 Tage → Mittwoch einfrieren
    expect(v.days.find((d) => d.day === DI)!.meal!.frost).toBe(false);

    const s = weekView(suggestWeek([SO], [{ baseId: 'salat', meals: ['salat', 'salat', 'salat'] }], newId), all);
    expect(s.days.find((d) => d.day === DI)!.meal).toMatchObject({ age: 2, frost: false, tooOld: true }); // nicht einfrierbar
  });

  it('Mittagessen: Rest vom Vorabend – sonst eine Box aus der Grundlage; abwählbar', () => {
    const w = example();
    const v = weekView(w, all, { portions: 1, lunchDays: [MO, DI, MI, DO, FR] });
    const lunch = (d: number) => v.days.find((x) => x.day === d)!.lunch!;
    expect(lunch(MO)).toMatchObject({ kind: 'rest', recipe: { id: 'spag' } }); // Spaghetti vom Sonntag
    // Dienstag Ofenkartoffel lässt sich schlecht mitnehmen → Mittwoch eine Box aus der Bolognese (erste mitnehmbare Verwandlung)
    expect(lunch(MI)).toMatchObject({ kind: 'box', baseId: 'bolo', recipe: { id: 'spag' }, reason: 'nicht-mitnehmbar', frost: true });
    expect(lunch(FR)).toMatchObject({ kind: 'rest', recipe: { id: 'bowl' } });
    expect(v.days.find((x) => x.day === SA)!.lunch).toBeUndefined(); // Samstag kein Mittagstag

    const off = weekView(toggleLunch(w, DI), all, { portions: 1, lunchDays: [MO, DI] });
    expect(off.days.find((x) => x.day === DI)).toMatchObject({ noLunch: true });
    expect(off.days.find((x) => x.day === DI)!.lunch).toBeUndefined();
    expect(toggleLunch(toggleLunch(w, DI), DI).noLunch).toEqual([]);
  });

  it('Mittag vor dem ersten Kochtag: nichts da', () => {
    const v = weekView(example(), all, { portions: 1, lunchDays: [SO] });
    expect(v.days.find((x) => x.day === SO)!.lunch).toEqual({ day: SO, kind: 'none', reason: 'nichts-gekocht' });
  });

  it('Portionen je Grundlage: (Abende + Mittage) × Portionen + Extra; Extra kommt ins Gefrierfach', () => {
    const w = setExtra(example(), 'bolo', 2);
    const v = weekView(w, all, { portions: 1, lunchDays: [MO, DI, MI, DO, FR] });
    const b = v.bases.find((x) => x.base.recipeId === 'bolo')!;
    expect([b.evenings, b.lunches, b.portions]).toEqual([3, 3, 8]); // Mo, Di, Mi mittags aus der Bolo
    expect(b.frozen).toBe(3); // Mittwochsbox + 2 Extra
    expect(setExtra(w, 'bolo', -5).bases[0].extra).toBeUndefined();
    const two = weekView(example(), all, { portions: 2, lunchDays: [] });
    expect(two.bases.map((x) => x.portions)).toEqual([6, 4]);
  });

  it('Tauschen: nie vor den Kochtag der Grundlage – mit freiem Abend geht es auch', () => {
    const w = example();
    expect(canSwap(w, MO, DI)).toBe(true);
    expect(canSwap(w, DI, MI)).toBe(false); // Chili (Mi gekocht) dürfte nicht auf Dienstag
    expect(canSwap(w, FR, SA)).toBe(false); // zwei freie Abende
    expect(plan(swapDays(w, MO, DI))).toContain(`${MO}:ofen`);
    expect(swapDays(w, DI, MI)).toBe(w);
    expect(plan(swapDays(w, DO, FR))).toContain(`${FR}:bowl`);
  });

  it('Heute auswärts: rückt bis zum nächsten freien Abend nach – sonst null', () => {
    const w = example();
    const d = shiftFrom(w, DO)!;
    expect(d.to).toBe(FR);
    expect(plan(d.week)).toContain(`${FR}:bowl`);
    const m = shiftFrom(w, MO)!; // Mo → Di → Mi → Do → Fr: alles rückt einen Tag
    expect(plan(m.week)).toEqual([`${DI}:wraps`, `${MI}:ofen`, `${DO}:chilireis`, `${FR}:bowl`, `${SO}:spag`].sort());
    expect(shiftFrom(w, FR)).toBeNull(); // Freitag ist frei
    const voll = suggestWeek([SO], [{ baseId: 'bolo', meals: ['spag', 'spag', 'spag', 'spag', 'spag', 'spag', 'spag'] }], newId);
    expect(shiftFrom(voll, MO)).toBeNull(); // kein freier Abend mehr
  });

  it('„Lässt sich auch am Sonntag vorbereiten“: wenn es hält oder sich einfrieren lässt', () => {
    const w = example();
    expect(earlierCookDay(w, 'chili', all)).toEqual({ day: SO, needsFreeze: true }); // Do = 4 Tage nach Sonntag
    expect(earlierCookDay(w, 'bolo', all)).toBeUndefined(); // ist schon am Sonntag
    const moved = moveBase(w, 'chili', SO);
    expect(moved.bases[1].day).toBe(SO);
    expect(moveBase(moved, 'chili', MI).bases[1].day).toBe(MI); // zurück geht: gegessen wird es erst ab Mittwoch
    expect(moveBase(w, 'bolo', MI)).toBe(w); // die Bolo-Spaghetti sind schon Sonntag dran – nicht erst Mittwoch kochen
    expect(moveBase(w, 'chili', FR)).toBe(w); // Freitag ist kein Kochtag
  });

  it('Woche als Plan-Einträge: Grundlage mit allen Portionen, Gerichte mit ihren Abenden (+ Rest für den Mittag)', () => {
    const w = example();
    const hh = { portions: 1, lunchDays: [MO, DI, MI, DO, FR] };
    const items = Object.fromEntries(weekItems(w, all, hh).map((i) => [i.recipeId, i.servings]));
    // Bolo: 3 Abende + 3 Mittage; Spaghetti So + Rest Mo-Mittag = 2; Ofenkartoffel ohne Rest; Mi-Box = Spaghetti
    expect(items).toEqual({ bolo: 6, chili: 4, spag: 3, wraps: 2, ofen: 1, chilireis: 2, bowl: 2 });
    expect(mealPortions(weekView(w, all, hh), SO, hh)).toBe(2);
    // gekocht und gegessen fällt raus
    const later = { ...w, bases: w.bases.map((b) => (b.recipeId === 'bolo' ? { ...b, cooked: true } : b)), meals: w.meals.map((m) => (m.recipeId === 'spag' ? { ...m, done: true } : m)) };
    const rest = Object.fromEntries(weekItems(later, all, hh).map((i) => [i.recipeId, i.servings]));
    expect(rest.bolo).toBeUndefined();
    expect(rest.spag).toBe(1); // nur noch die Mittwochsbox
  });

  it('Einkaufsliste kauft die Grundlage nicht doppelt – „1 Bolognese“ kommt aus dem Vorgekochten', () => {
    const pasta = recipe('pasta', 'Testpasta mit Bolo', [uses('bolo', 'Testbolognese'), { id: 'n', name: 'Spaghetti', amount: 100, unit: 'g' }]);
    const sauce = recipe('bolo', 'Testbolognese', [{ id: 'h', name: 'Hackfleisch', amount: 125, unit: 'g' }], { keepsDays: 3 });
    const w = suggestWeek([SO], [{ baseId: 'bolo', meals: ['pasta'] }], newId);
    const list = buildShoppingList({ ...emptyPlan(), week: w, items: weekItems(w, [sauce, pasta]) }, [sauce, pasta], localFoodTable);
    const names = list.map((x) => x.name.toLowerCase());
    expect(names.some((x) => x.includes('hack'))).toBe(true);
    expect(names).toContain('pasta'); // Spaghetti stehen auf der Liste als Pasta
    expect(names.some((x) => x.includes('testbolognese'))).toBe(false);
    expect(withoutBases(sauce.versions[0].content, ['bolo']).ingredients).toHaveLength(1); // die Grundlage selbst bleibt ganz
  });

  it('Kochtage ändern: neu verteilt, Extra-Portionen bleiben; nach dem ersten Kochen gesperrt', () => {
    const w = setExtra(example(), 'bolo', 1);
    expect(choicesOf(w)).toEqual([{ baseId: 'bolo', meals: ['spag', 'wraps', 'ofen'] }, { baseId: 'chili', meals: ['chilireis', 'bowl'] }]);
    const sa = withCookDays(w, [SA, MI], newId);
    expect(sa.bases).toEqual([{ recipeId: 'bolo', day: SA, extra: 1 }, { recipeId: 'chili', day: MI }]);
    expect(plan(sa)).toContain(`${SA}:spag`);
    expect(weekStarted(w)).toBe(false);
    expect(weekStarted({ ...w, meals: w.meals.map((m, i) => (i === 0 ? { ...m, done: true } : m)) })).toBe(true);
  });

  it('Grundlage nachträglich dazu: am ersten Kochtag, ihr Gericht auf den ersten freien Abend', () => {
    const w = addBase(example(), 'salat', newId);
    expect(w.bases[2]).toEqual({ recipeId: 'salat', day: SO });
    expect(plan(w)).toContain(`${FR}:salat`);
    expect(addBase(w, 'salat', newId)).toBe(w);
    expect(addToBase(w, 'bolo', 'Zucchini').bases[0].adds).toEqual(['Zucchini']);
  });

  it('MHD-Funde: frisch reduziert gekauft – steckt schon drin, passt zu einem Rezept oder ist frei', () => {
    const now = new Date('2026-10-25T12:00:00');
    const item = (name: string, extra: Partial<PantryItem> = {}): PantryItem => ({ id: name, name, amount: 1, unit: 'Stück', addedAt: '2026-10-25T09:00:00', boughtAt: '2026-10-25T09:00:00', reduced: true, ...extra });
    const sauce = recipe('bolo', 'Testbolognese', [{ id: 'h', name: 'Hackfleisch', amount: 500, unit: 'g' }]);
    const huhn = recipe('huhn', 'Testpulled', [{ id: 'c', name: 'Hähnchenbrust', amount: 500, unit: 'g' }]);
    const w = suggestWeek([SO], [{ baseId: 'bolo', meals: ['bolo'] }], newId);
    const finds = mhdFinds([
      item('Hackfleisch'), item('Hähnchenbrust'), item('Testquatsch'),
      item('Zucchini', { reduced: false }), item('Lachs', { boughtAt: '2026-10-10T09:00:00' }), item('Erbsen', { frozenAt: '2026-10-25T10:00:00' }),
    ], w, [sauce, huhn], localFoodTable, now);
    expect(finds.map((f) => `${f.item.name}:${f.kind}`)).toEqual(['Hackfleisch:covered', 'Hähnchenbrust:match', 'Testquatsch:free']);
    expect(mhdFinds([item('Testquatsch')], addToBase(w, 'bolo', 'Testquatsch'), [sauce], localFoodTable, now)).toEqual([]); // schon zugeordnet
  });
});
