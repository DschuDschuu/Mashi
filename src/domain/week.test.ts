import { describe, expect, it } from 'vitest';
import { sideContent } from './mix';
import { comboOf, comboSteps, customSideId, prepOf, sideOf, sidesOfKind } from './sides';
import type { Week } from './mealplan';
import type { Ingredient, Recipe } from './types';
import { buildShoppingList, emptyPlan } from './mealplan';
import { localFoodTable } from './nutrition/localFoods';
import { backToFridge, defaultCookDay, fridgeOf, potOf, potWeek, setCookDay, carbCarry, groupMeals, mixedBases, yieldChecks, swapCookDays, putPrepared, extrasOf, addBase, addToBase, byEffort, canLessPortions, choicesOf, fillEvenings, mealKey, putMeal, servingsOf, setMealPortions, stepPortions, mealTitle, mhdFinds, removeMeal, scheduleMeal, splitMealKey, weekSideNeeds, weekStarted, withCookDays } from './week';
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

describe('Mit Beilage (Julia: „Bolognese mit Spätzle“ ohne eigenes Rezept) und nach Aufwand sortiert', () => {
  const sideWeek = (meals: string[]) => suggestWeek([SO], [{ baseId: 'bolo', meals }], newId);

  it('„bolo+spaetzle“ wird ein Abend der Grundlage mit Beilage – und lässt sich zurücklesen', () => {
    expect(splitMealKey(mealKey('bolo', 'spaetzle'))).toEqual({ recipeId: 'bolo', side: 'spaetzle' });
    expect(splitMealKey('wraps')).toEqual({ recipeId: 'wraps' });
    const w = sideWeek(['bolo+spaetzle', 'wraps', 'bolo+reis']);
    expect(w.meals.map((m) => [m.day, m.recipeId, m.side])).toEqual([[SO, 'bolo', 'spaetzle'], [MO, 'wraps', undefined], [DI, 'bolo', 'reis']]);
    expect(choicesOf(w)).toEqual([{ baseId: 'bolo', meals: ['bolo+spaetzle', 'wraps', 'bolo+reis'] }]);
  });

  it('Titel mit Beilage; unbekannte Beilage fällt still weg', () => {
    expect(mealTitle({ side: 'spaetzle' }, bolo)).toBe('Testbolognese mit Spätzle');
    expect(mealTitle({}, bolo)).toBe('Testbolognese');
    expect(mealTitle({ side: 'quinoa' }, bolo)).toBe('Testbolognese');
  });

  it('Einkauf: je Beilage zusammengezählt, feste Menge pro Portion, eigene Menge aus dem Haushalt', () => {
    const w = sideWeek(['bolo+spaetzle', 'wraps', 'bolo+reis', 'bolo+spaetzle']);
    expect(weekSideNeeds(w, all).map((i) => [i.name, i.amount, i.unit])).toEqual([['Spätzle', 500, 'g'], ['Reis', 75, 'g']]);
    expect(weekSideNeeds(w, all, { portions: 2, lunchDays: [], sides: { reis: 100 } }).map((i) => i.amount)).toEqual([1000, 200]);
    // Gegessenes zählt nicht mehr
    const eaten = { ...w, meals: w.meals.map((m) => (m.side === 'reis' ? { ...m, done: true } : m)) };
    expect(weekSideNeeds(eaten, all).map((i) => i.name)).toEqual(['Spätzle']);
    expect(weekSideNeeds(undefined, all)).toEqual([]);
  });

  it('Rest für den Mittag: lässt sich die Grundlage mitnehmen, kommt die Beilage doppelt', () => {
    const togoBolo = { ...bolo, togo: true };
    const w = sideWeek(['bolo+spaetzle']);
    expect(weekSideNeeds(w, [togoBolo, ...all.filter((r) => r.id !== 'bolo')], { portions: 1, lunchDays: [MO] })[0].amount).toBe(500);
    expect(weekView(w, [togoBolo], { portions: 1, lunchDays: [MO] }).days.find((d) => d.day === MO)!.lunch).toMatchObject({ kind: 'rest', side: 'spaetzle' });
  });

  it('auf der Einkaufsliste – mit der Beilage, ohne „1 Portion Bolognese“', () => {
    const w = sideWeek(['bolo+spaetzle']);
    const list = buildShoppingList({ ...emptyPlan(), week: w }, all, localFoodTable, undefined, weekSideNeeds(w, all));
    expect(list.map((x) => [x.name, x.quantity, x.from])).toEqual([['Spätzle', '250 g', ['Beilage']]]);
  });

  it('nach Aufwand: die Grundlage (nur aufwärmen) vorne, dann wenig Zeit, dann einfach, dann nach Name', () => {
    const timed = (id: string, prepMinutes: number, difficulty: 1 | 2 | 3): Recipe => {
      const r = recipe(id, id);
      return { ...r, versions: [{ ...r.versions[0], content: { ...r.versions[0].content, prepMinutes, cookMinutes: 5, difficulty } }] };
    };
    const list = [timed('lasagne', 30, 2), timed('wraps', 5, 1), timed('auflauf', 30, 1), timed('bolo', 60, 2), timed('bowl', 5, 1)];
    expect(byEffort(list, 'bolo').map((r) => r.id)).toEqual(['bolo', 'bowl', 'wraps', 'auflauf', 'lasagne']);
  });
});

describe('Abend rausnehmen (Julia: „simple Gerichte aus dem Wochenplan entfernen“)', () => {
  it('der Abend fällt weg, die Grundlage bleibt mit weniger Portionen; Gegessenes bleibt', () => {
    const w = suggestWeek([SO], [{ baseId: 'bolo', meals: ['spag', 'wraps'] }], newId);
    const wrapsMeal = w.meals.find((m) => m.recipeId === 'wraps')!;
    const out = removeMeal(w, wrapsMeal.id);
    expect(out.meals.map((m) => m.recipeId)).toEqual(['spag']);
    expect(weekView(out, all).bases[0].portions).toBe(1);
    const eaten = { ...w, meals: w.meals.map((m) => (m.id === wrapsMeal.id ? { ...m, done: true } : m)) };
    expect(removeMeal(eaten, wrapsMeal.id)).toBe(eaten);
    expect(removeMeal(w, 'gibt-es-nicht')).toBe(w);
  });

  it('letzter Abend aus einer Grundlage: ihr Kochtag fällt mit weg – außer mit Extra-Portionen oder schon gekocht', () => {
    const w = suggestWeek([SO, MI], [{ baseId: 'bolo', meals: ['spag'] }, { baseId: 'salat', meals: ['salat'] }], newId);
    const salatMeal = w.meals.find((m) => m.recipeId === 'salat')!;
    expect(removeMeal(w, salatMeal.id).bases.map((b) => b.recipeId)).toEqual(['bolo']);
    const extra = { ...w, bases: w.bases.map((b) => (b.recipeId === 'salat' ? { ...b, extra: 2 } : b)) };
    expect(removeMeal(extra, salatMeal.id).bases.map((b) => b.recipeId)).toEqual(['bolo', 'salat']);
    const cooked = { ...w, bases: w.bases.map((b) => (b.recipeId === 'salat' ? { ...b, cooked: true } : b)) };
    expect(removeMeal(cooked, salatMeal.id).bases).toHaveLength(2);
  });
});

describe('Gericht auf einen Tag legen (Julia: „ein Plan“ – aus dem Kochbuch oder von „irgendwann“)', () => {
  const hh = { portions: 1, lunchDays: [] };

  it('ohne Woche: eine entsteht – das Gericht wird an dem Tag gekocht, mehr Portionen füllen freie Abende, solange es hält', () => {
    // Salat hält 2 Tage: Mi + Do, die dritte Portion bleibt Vorrat (Freitag wäre zu alt)
    const w = scheduleMeal(undefined, salat, MI, 3, hh, newId, all);
    expect(w.cookDays).toEqual([MI]);
    expect(w.bases).toEqual([{ recipeId: 'salat', day: MI, extra: 1 }]);
    expect(w.meals.map((m) => [m.day, m.recipeId, m.baseId])).toEqual([[MI, 'salat', 'salat'], [DO, 'salat', 'salat']]);
  });

  it('Verwandlung: isst von der Grundlage der Woche; fehlt sie, wird sie an dem Tag gekocht', () => {
    const w = suggestWeek([SO], [{ baseId: 'bolo', meals: ['spag'] }], newId);
    const mit = scheduleMeal(w, wraps, MI, 1, hh, newId);
    expect(mit.bases.map((b) => b.recipeId)).toEqual(['bolo']);
    expect(mit.meals.find((m) => m.day === MI)).toMatchObject({ recipeId: 'wraps', baseId: 'bolo' });
    const ohne = scheduleMeal(undefined, wraps, DO, 1, hh, newId);
    expect(ohne.bases).toEqual([{ recipeId: 'bolo', day: DO }]);
  });

  it('belegter Abend: unverändert; neuer Kochtag kommt dazu', () => {
    const w = scheduleMeal(undefined, salat, MI, 1, hh, newId);
    expect(scheduleMeal(w, chili, MI, 1, hh, newId)).toBe(w);
    expect(scheduleMeal(w, chili, FR, 1, hh, newId).cookDays).toEqual([MI, FR]);
  });
});

it('Baukasten: feste Reihenfolge, lesbarer Titel, Einkauf je Baustein zusammengezählt', () => {
  expect(comboOf(['parmesan', 'haehnchen', 'pasta'])).toBe('pasta,haehnchen,parmesan');
  expect(comboOf([])).toBeUndefined();
  expect(mealTitle({ side: 'pasta,haehnchen,parmesan' }, bolo)).toBe('Testbolognese mit Pasta, Hähnchenbrust & Parmesan');
  expect(mealTitle({ side: 'pasta' }, bolo)).toBe('Testbolognese mit Pasta'); // alte Abende gelten weiter
  const hh = { portions: 2, lunchDays: [] };
  const w: Week = { cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }], meals: [
    { id: 'a', day: SO, recipeId: 'bolo', baseId: 'bolo', side: 'pasta,haehnchen,ei' },
    { id: 'b', day: MO, recipeId: 'bolo', baseId: 'bolo', side: 'pasta' },
  ] };
  const needs = weekSideNeeds(w, all, hh);
  expect(needs.map((i) => [i.name, i.amount, i.unit])).toEqual([['Pasta', 400, 'g'], ['Hähnchenbrust', 250, 'g'], ['Ei', 2, 'Stück']]);
});

it('eigene Bausteine: Gruppe und Name stecken in der id, Trennzeichen fliegen raus', () => {
  const id = customSideId('veg', ' Cocktail,tomaten+ ')!;
  expect(id).toBe('eigen:veg:Cocktail tomaten');
  expect(sideOf(id)).toMatchObject({ name: 'Cocktail tomaten', kind: 'veg', grams: 100 });
  expect(comboOf(['parmesan', id, 'pasta'])).toBe(`pasta,${id},parmesan`);
  expect(sidesOfKind('veg', [id]).map((s) => s.name)).toContain('Cocktail tomaten');
  expect(customSideId('veg', ' , ')).toBeUndefined();
});

it('Zubereitung: nur hier > eigener Standard > Mashis Standard; Schritte das Längste zuerst, Topping zum Schluss', () => {
  const tomaten = customSideId('veg', 'Tomaten')!;
  const hh = { portions: 1, lunchDays: [], sidePrep: { [tomaten]: { text: 'halbieren, mitbraten', minutes: 3 } } };
  const kuerbis = { blockPrep: { [tomaten]: { text: 'im Ofen rösten', minutes: 15 } } };
  expect(prepOf(tomaten, hh, kuerbis)?.text).toBe('im Ofen rösten');
  expect(prepOf(tomaten, hh)?.text).toBe('halbieren, mitbraten');
  expect(prepOf('pasta', hh)).toEqual({ text: 'in Salzwasser kochen', minutes: 10 });
  expect(prepOf(customSideId('veg', 'Mais')!, hh)).toBeUndefined();
  const steps = comboSteps(`pasta,${tomaten},parmesan`, 'Testkürbissauce', hh, kuerbis);
  expect(steps.map((s) => [s.name, s.minutes, s.source])).toEqual([
    ['Tomaten', 15, 'grundlage'], ['Pasta', 10, 'standard'], ['Testkürbissauce', 5, 'standard'], ['Parmesan', 0, 'standard'],
  ]);
});

it('carbCarry: zweimal Pasta höchstens 2 Tage auseinander → einmal kochen; paarweise; Reis und Abstand 3 Tage nicht', () => {
  const hh = { portions: 2, lunchDays: [] };
  const meal = (id: string, day: number, side: string) => ({ id, day: day as Week['cookDays'][number], recipeId: 'chili', baseId: 'chili', side });
  const w: Week = { cookDays: [SO], bases: [{ recipeId: 'chili', day: SO, extra: 0 }], meals: [
    meal('a', SO, 'pasta,parmesan'), meal('b', DI, 'pasta'), meal('c', MI, 'pasta'), meal('d', DO, 'reis'), meal('e', SA, 'pasta'),
  ] };
  const c = carbCarry(weekView(w, all, hh), hh);
  expect(c.get(SO)).toEqual({ side: 'pasta', with: DI, portions: 2 }); // So → Di: 2 Tage
  expect(c.get(DI)).toEqual({ side: 'pasta', from: SO });
  expect(c.has(MI)).toBe(false); // Di ist schon vergeben, Sa ist 3 Tage weg
  expect(c.has(DO)).toBe(false);
  expect(c.has(SA)).toBe(false);
});

it('swapCookDays: Sonntag ↔ Mittwoch – Grundlagen tauschen, Abende rücken ab dem neuen Kochtag nach', () => {
  const w = example(); // Bolo So (So, Mo, Di), Chili Mi (Mi, Do)
  const t = swapCookDays(w, SO, MI);
  expect(t.bases.map((b) => [b.recipeId, b.day])).toEqual([['bolo', MI], ['chili', SO]]);
  expect(plan(t)).toEqual([`${SO}:chilireis`, `${MO}:bowl`, `${MI}:spag`, `${DO}:wraps`, `${FR}:ofen`].sort());
  const gegessen: Week = { ...w, meals: w.meals.map((m, i) => (i === 0 ? { ...m, done: true } : m)) };
  expect(swapCookDays(gegessen, SO, MI)).toBe(gegessen);
});

it('yieldChecks: was das Rezept ergibt gegen das, was die Woche isst – nur „zu wenig verplant“ zählt', () => {
  const hh = { portions: 1, lunchDays: [] };
  const lasagne = recipe('las', 'Testlasagne', [], { keepsDays: 3 }); // sideContent: 1 Portion – unten auf 4 gesetzt
  lasagne.versions[0].content.servings = 4;
  const w: Week = { cookDays: [SO], bases: [{ recipeId: 'las', day: SO }], meals: [
    { id: 'a', day: SO, recipeId: 'las', baseId: 'las', portions: 2 }, { id: 'b', day: MO, recipeId: 'las', baseId: 'las' },
    { id: 'c', day: DI, recipeId: 'las', baseId: 'las' }, { id: 'd', day: MI, recipeId: 'las', baseId: 'las' },
  ] };
  expect(yieldChecks(weekView(w, [lasagne], hh)).get('las')).toEqual({ yields: 4, planned: 5, left: 0 });
  const zwei: Week = { ...w, meals: w.meals.slice(1, 3) };
  expect(yieldChecks(weekView(zwei, [lasagne], hh)).get('las')).toEqual({ yields: 4, planned: 2, left: 2 });
});

it('groupMeals: Gerichte im Wechsel → hintereinander auf denselben Tagen; schon gruppiert oder gegessen: unverändert', () => {
  const m = (id: string, day: number, recipeId: string, side?: string) => ({ id, day: day as Week['cookDays'][number], recipeId, baseId: 'bolo', ...(side ? { side } : {}) });
  const w: Week = { cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }], meals: [m('a', SO, 'bolo', 'pasta'), m('b', MO, 'spag'), m('c', DI, 'bolo', 'pasta'), m('d', MI, 'spag')] };
  expect(mixedBases(w)).toEqual(['bolo']);
  const g = groupMeals(w, 'bolo');
  expect(plan(g)).toEqual([`${SO}:bolo`, `${MO}:bolo`, `${DI}:spag`, `${MI}:spag`].sort());
  expect(groupMeals(g, 'bolo')).toBe(g);
  expect(mixedBases(g)).toEqual([]);
  const gegessen: Week = { ...w, meals: w.meals.map((x, i) => (i === 0 ? { ...x, done: true } : x)) };
  expect(groupMeals(gegessen, 'bolo')).toBe(gegessen);
});

it('extrasOf: was zur Grundlage dazukommt, ohne die Grundlage selbst', () => {
  const pasta = recipe('kp', 'Testkürbispasta', [uses('bolo', 'Testbolognese'), { id: 'x', name: 'Cocktailtomaten', amount: 100, unit: 'g' }, { id: 'y', name: 'Pasta', amount: 80, unit: 'g' }, { id: 'z', name: 'Olivenöl', amount: 1, unit: 'EL' }, { id: 's', name: 'Salz & Pfeffer', amount: 1, unit: 'Prise' }, { id: 'k', name: 'Knoblauchzehe', amount: 1, unit: 'Stück' }]);
  expect(extrasOf(pasta, 'bolo')).toEqual(['Cocktailtomaten', 'Pasta']);
});

describe('Wochenanfang und Vorrat', () => {
  const hh = { portions: 1, lunchDays: [] };
  it('neuer Kochtag am Samstag rutscht nicht vor Mittwoch; neue Woche beginnt heute', () => {
    const w = scheduleMeal(undefined, salat, MI, 1, hh, newId, all, undefined, MO);
    expect(weekOrder(w)[0]).toBe(MO);
    const sa = scheduleMeal(scheduleMeal(undefined, salat, MI, 1, hh, newId, all), chili, SA, 1, hh, newId, all);
    expect(weekOrder(sa).indexOf(MI)).toBeLessThan(weekOrder(sa).indexOf(SA));
  });
  it('Vorgekochtes auf einen Abend: als gekochte Grundlage, nichts einzukaufen', () => {
    const w = putPrepared({ cookDays: [SO], bases: [], meals: [] }, DI, 'chili', hh, newId);
    expect(w.bases).toEqual([{ recipeId: 'chili', day: DI, cooked: true }]);
    expect(w.meals.find((m) => m.day === DI)).toMatchObject({ recipeId: 'chili', baseId: 'chili' });
    expect(weekItems(w, all, hh)).toEqual([]);
  });
});

describe('Portionen füllen freie Abende (Julia: „steht bei Mittwoch statt einfrieren“)', () => {
  const hh = { portions: 2, lunchDays: [] };
  // Chili am So mit einem Abend (So) – Mo, Di … sind frei
  const start = (): Week => ({ cookDays: [SO], bases: [{ recipeId: 'chili', day: SO }], meals: [{ id: 'a', day: SO, recipeId: 'chilireis', baseId: 'chili' }] });
  const portions = (w: Week) => weekView(w, all, hh).bases[0];

  it('„+“: erst Vorrat, sobald es für einen Abend reicht, der nächste freie Abend – mit einer neuen Verwandlung', () => {
    const eins = stepPortions(start(), 'chili', true, all, hh, newId);
    expect(eins.bases[0].extra).toBe(1);
    expect(eins.meals).toHaveLength(1);
    const zwei = stepPortions(eins, 'chili', true, all, hh, newId);
    expect(zwei.bases[0].extra).toBeUndefined();
    expect(zwei.meals.find((m) => m.day === MO)).toMatchObject({ recipeId: 'bowl', baseId: 'chili' });
    expect(portions(zwei)).toMatchObject({ portions: 4, frozen: 0 });
  });

  it('„−“: nimmt erst Vorrat, dann den letzten offenen Abend (bis auf eine Portion); ein Abend bleibt immer', () => {
    const voll = stepPortions(stepPortions(start(), 'chili', true, all, hh, newId), 'chili', true, all, hh, newId);
    const weniger = stepPortions(voll, 'chili', false, all, hh, newId);
    expect(weniger.meals.map((m) => m.day)).toEqual([SO]);
    expect(weniger.bases[0].extra).toBe(1);
    expect(portions(weniger).portions).toBe(3);
    const nurAbend = stepPortions(weniger, 'chili', false, all, hh, newId);
    expect(canLessPortions(nurAbend, 'chili')).toBe(false);
    expect(stepPortions(nurAbend, 'chili', false, all, hh, newId)).toBe(nurAbend);
  });

  it('kein Abend frei oder zu alt: bleibt Vorrat (einfrieren); gekochte Grundlage füllt nichts mehr', () => {
    const salatWoche: Week = { cookDays: [SO], bases: [{ recipeId: 'salat', day: SO, extra: 2 }], meals: [{ id: 's', day: SO, recipeId: 'salat', baseId: 'salat' }, { id: 't', day: MO, recipeId: 'salat', baseId: 'salat' }] };
    // Salat hält 2 Tage: Di wäre zu alt, nicht einfrierbar → nichts gefüllt
    expect(fillEvenings(salatWoche, 'salat', all, hh, newId)).toBe(salatWoche);
    const gekocht: Week = { ...start(), bases: [{ recipeId: 'chili', day: SO, extra: 2, cooked: true }] };
    expect(fillEvenings(gekocht, 'chili', all, hh, newId)).toBe(gekocht);
  });

  it('„Was gibt\'s?“: freier Abend isst zuerst vom Vorrat, mit Beilage nur bei der Grundlage selbst; vor dem Kochtag nicht', () => {
    const w: Week = { ...start(), bases: [{ recipeId: 'chili', day: SO, extra: 3 }] };
    const di = putMeal(w, DI, 'chili', 'chili', hh, newId, 'reis');
    expect(di.meals.find((m) => m.day === DI)).toMatchObject({ recipeId: 'chili', side: 'reis' });
    expect(di.bases[0].extra).toBe(1);
    expect(putMeal(w, DI, 'bowl', 'chili', hh, newId, 'reis').meals.find((m) => m.day === DI)?.side).toBeUndefined();
    const mitte: Week = { cookDays: [SO, MI], bases: [{ recipeId: 'chili', day: MI }], meals: [] };
    expect(putMeal(mitte, MO, 'chili', 'chili', hh, newId)).toBe(mitte);
  });

  it('belegten Abend tauschen: Portionen bleiben, Grundlage ohne Abend fällt weg', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'chili', day: SO }, { recipeId: 'bolo', day: SO }],
      meals: [{ id: 'a', day: SO, recipeId: 'chilireis', baseId: 'chili' }, { id: 'b', day: MO, recipeId: 'spag', baseId: 'bolo', portions: 4 }],
    };
    const neu = putMeal(w, MO, 'bowl', 'chili', hh, newId);
    expect(neu.meals.find((m) => m.day === MO)).toEqual({ id: 'b', day: MO, recipeId: 'bowl', baseId: 'chili', portions: 4 });
    expect(neu.bases.map((b) => b.recipeId)).toEqual(['chili']);
  });

  it('Portionen pro Abend: zählen am Kochtag und beim Essen mit; gleich dem Haushalt = Feld weg', () => {
    const gaeste = setMealPortions(start(), 'a', 5, hh);
    expect(gaeste.meals[0].portions).toBe(5);
    expect(portions(gaeste).portions).toBe(5);
    const view = weekView(gaeste, all, hh);
    expect(mealPortions(view, SO, hh)).toBe(5);
    expect(servingsOf(gaeste.meals[0], hh)).toBe(5);
    expect(setMealPortions(gaeste, 'a', 2, hh).meals[0]).not.toHaveProperty('portions');
  });
});

describe('Topf + Kühlschrank (Julia: „ich koche X Portionen und verteile sie“)', () => {
  const hh = { portions: 1, lunchDays: [] };

  it('Topf → Woche: alles am Sonntag, jede Portion im Kühlschrank; der bisherige erste Kochtag bleibt Standard', () => {
    const w = potWeek([{ recipeId: 'bolo', portions: 4 }, { recipeId: 'salat', portions: 2 }], hh);
    expect(w).toEqual({ cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO, extra: 4 }, { recipeId: 'salat', day: SO, extra: 2 }], meals: [] });
    expect(defaultCookDay({ cookDays: [MI, SA], bases: [], meals: [] })).toBe(SA);
    // die Einkaufsliste rechnet die Kühlschrank-Portionen mit
    expect(weekItems(w, all, hh)).toEqual(expect.arrayContaining([{ recipeId: 'bolo', servings: 4, fromWeek: true }]));
  });

  it('neu planen: verteilte Abende bleiben, so weit die Portionen reichen – Topf aus der Woche zurückgelesen', () => {
    const alt: Week = { cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO, extra: 1 }], meals: [{ id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' }, { id: 'b', day: MO, recipeId: 'wraps', baseId: 'bolo' }], noLunch: [MO] };
    expect(potOf(alt, hh)).toEqual([{ recipeId: 'bolo', portions: 3 }]);
    const weniger = potWeek([{ recipeId: 'bolo', portions: 1 }, { recipeId: 'chili', portions: 2 }], hh, alt);
    expect(weniger.meals.map((m) => m.id)).toEqual(['a']);
    expect(weniger.bases).toEqual([{ recipeId: 'bolo', day: SO }, { recipeId: 'chili', day: SO, extra: 2 }]);
    expect(weniger.noLunch).toEqual([MO]);
    // schon gekocht: neue Woche, nichts übernommen
    const begonnen: Week = { ...alt, bases: [{ ...alt.bases[0], cooked: true }] };
    expect(potWeek([{ recipeId: 'bolo', portions: 3 }], hh, begonnen).meals).toEqual([]);
  });

  it('Kühlschrank: übrig, frisch bis, Kärtchen je Abend; Vorschlag nur, wenn es nicht bis zum letzten Abend hält', () => {
    const w = potWeek([{ recipeId: 'bolo', portions: 4 }, { recipeId: 'salat', portions: 4 }], hh);
    const [b, s] = fridgeOf(w, all, hh);
    expect(b).toMatchObject({ left: 4, cards: 4, freshUntil: DI, short: false }); // hält 3 Tage, einfrierbar
    expect(s).toMatchObject({ left: 4, freshUntil: MO, short: true }); // hält 2 Tage, nicht einfrierbar: So, Mo reichen nicht für 4
    expect(fridgeOf(w, all, { portions: 2, lunchDays: [] })[0].cards).toBe(2);
    // schon gekocht: was in der Speisekammer steht, ohne die offenen Abende
    const gekocht: Week = { cookDays: [SO], bases: [{ recipeId: 'chili', day: SO, cooked: true }], meals: [{ id: 'c', day: SO, recipeId: 'chili', baseId: 'chili' }] };
    expect(fridgeOf(gekocht, all, hh, undefined, new Map([['chili', 3]]))[0].left).toBe(2);
  });

  it('Kärtchen auf einen Abend: nimmt eine Portion aus dem Kühlschrank; zu alt = einfrieren (weekView sagt frost)', () => {
    const w = potWeek([{ recipeId: 'bolo', portions: 2 }], hh);
    const mi = putMeal(w, MI, 'bolo', 'bolo', hh, newId);
    expect(mi.bases[0].extra).toBe(1);
    expect(weekView(mi, all, hh).days.find((d) => d.day === MI)?.meal).toMatchObject({ age: 3, frost: true });
  });

  it('zurück in den Kühlschrank: Abend frei, Portion wieder übrig, die Grundlage bleibt', () => {
    const w: Week = { cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }], meals: [{ id: 'a', day: MO, recipeId: 'spag', baseId: 'bolo', portions: 2 }] };
    const back = backToFridge(w, 'a', hh);
    expect(back).toEqual({ cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO, extra: 2 }], meals: [] });
    expect(backToFridge({ ...w, meals: [{ ...w.meals[0], done: true }] }, 'a', hh).meals).toHaveLength(1);
  });

  it('Kochtag ändern: Abende rücken nach, was keinen Abend mehr findet, wandert in den Kühlschrank', () => {
    const w: Week = {
      cookDays: [SO], bases: [{ recipeId: 'bolo', day: SO }, { recipeId: 'chili', day: SO, extra: 1 }],
      meals: [{ id: 'a', day: SO, recipeId: 'spag', baseId: 'bolo' }, { id: 'b', day: MO, recipeId: 'wraps', baseId: 'bolo' }, { id: 'c', day: DI, recipeId: 'chilireis', baseId: 'chili' }],
    };
    const mo = setCookDay(w, 'bolo', MO, hh);
    expect(plan(mo)).toEqual([`${MO}:spag`, `${MI}:wraps`, `${DI}:chilireis`].sort());
    expect(mo).toMatchObject({ start: SO, cookDays: [SO, MO] });
    const sa = setCookDay(w, 'bolo', SA, hh);
    expect(plan(sa).filter((x) => x.endsWith('spag') || x.endsWith('wraps'))).toEqual([`${SA}:spag`]);
    expect(sa.bases[0]).toMatchObject({ day: SA, extra: 1 });
    // die Woche dreht sich nicht mit: Sonntag bleibt der erste Tag
    expect(weekOrder(sa)[0]).toBe(SO);
    expect(setCookDay({ ...w, bases: [{ ...w.bases[0], cooked: true }, w.bases[1]] }, 'bolo', MO, hh).bases[0].day).toBe(SO);
  });
});
