import { describe, expect, it } from 'vitest';
import {
  ADVENT_TAG, adventHint, canOpen, doorNotes, emptyAdvent, fillAdvent, isAdventCalendar, markOpened, markSaved,
  merge3Advent, needsFilling, parseAdventJson, unionAdvent, type AdventCalendar,
} from './advent';
import { createBackup, parseBackup } from './backup';
import { ADVENT_DEMO } from '../data/adventDemo';

// Erfundene Rezepte – nur zum Testen
const recipe = (tag: number, extra: Record<string, unknown> = {}) => ({
  tag,
  titel: `Testgebäck ${tag}`,
  portionen: 12,
  vorbereitung: 20,
  backzeit: 12,
  zutaten: [{ name: 'Mehl', menge: 200, einheit: 'g' }, { name: 'Zucker', menge: 1.5, einheit: 'EL' }],
  schritte: ['Alles verkneten.', 'Bei 180 °C ca. 12 Min. backen.'],
  ...extra,
});
const all24 = () => Array.from({ length: 24 }, (_, i) => recipe(i + 1));
const parse = (data: unknown) => parseAdventJson(JSON.stringify(data));

/** Ortszeit, wie das Handy sie sieht */
const on = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);

const filled = (now = on(2026, 11, 20)): AdventCalendar => fillAdvent(emptyAdvent(), parse(all24()).doors, now);

describe('Adventskalender einlesen', () => {
  it('liest 24 Rezepte im vereinbarten Format – Zeiten, Einheiten, Timer, Schlagwort', () => {
    const res = parse(all24());
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.doors).toHaveLength(24);
    const c = res.doors[0].content;
    expect(c).toMatchObject({ title: 'Testgebäck 1', servings: 12, prepMinutes: 20, cookMinutes: 12, tags: [ADVENT_TAG] });
    expect(c.ingredients[1]).toMatchObject({ name: 'Zucker', amount: 1.5, unit: 'EL' });
    expect(c.steps[1]).toMatchObject({ text: 'Bei 180 °C ca. 12 Min. backen.', timerMinutes: 12 });
  });

  it('sortiert nach Tag, egal in welcher Reihenfolge die Datei sie hat', () => {
    expect(parse(all24().reverse()).doors.map((d) => d.day).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('übernimmt Hinweis, Teil, Beschreibung und Tipp', () => {
    const res = parse([recipe(1, {
      beschreibung: 'Mit Glasur',
      tipp: 'Kühl lagern.',
      zutaten: [{ name: 'Puderzucker', menge: 100, einheit: 'g', teil: 'glasur', hinweis: 'gesiebt' }],
    })]);
    const door = res.doors[0];
    expect(door.content.description).toBe('Mit Glasur');
    expect(door.content.ingredients[0]).toMatchObject({ name: 'Puderzucker', part: 'Glasur', note: 'gesiebt' });
    expect(door.tip).toBe('Kühl lagern.');
    expect(doorNotes(door)).toBe('Tipp: Kühl lagern.');
  });

  it('ist nachsichtig bei Kleinigkeiten: „1,5“ als Text, „Stk.“, unbekannte Einheit als Hinweis', () => {
    const res = parse([recipe(1, {
      zutaten: [
        { name: 'Milch', menge: '1,5', einheit: 'l' },
        { name: 'Eier', menge: 2, einheit: 'Stk.' },
        { name: 'Backpulver', menge: 1, einheit: 'Päckchen' },
        { name: 'Salz', einheit: 'Prise' },
      ],
    })]);
    expect(res.errors).toEqual([]);
    const [milch, eier, backpulver, salz] = res.doors[0].content.ingredients;
    expect(milch).toMatchObject({ amount: 1.5, unit: 'l' });
    expect(eier).toMatchObject({ amount: 2, unit: 'Stück' });
    expect(backpulver).toMatchObject({ amount: 1, note: 'Päckchen' });
    expect(backpulver.unit).toBeUndefined();
    expect(salz).toMatchObject({ unit: 'Prise' });
    expect(salz.amount).toBeUndefined();
    expect(res.warnings.some((w) => w.includes('„Päckchen“'))).toBe(true);
  });

  it('nimmt „kochzeit“ statt „backzeit“ (Punsch, Festessen)', () => {
    const { backzeit: _, ...rest } = recipe(3);
    expect(parse([{ ...rest, kochzeit: 25 }]).doors[0].content.cookMinutes).toBe(25);
  });

  it('meldet fehlende Türchen nur als Hinweis', () => {
    const res = parse([recipe(1), recipe(2)]);
    expect(res.errors).toEqual([]);
    expect(res.warnings[0]).toContain('3, 4, 5');
  });

  it('lehnt ab, was kein Rezept ist – mit verständlicher Meldung je Tag', () => {
    const res = parse([recipe(1, { titel: '' }), recipe(2, { zutaten: [] }), recipe(30), recipe(4, { schritte: [] }), recipe(5, { portionen: 0 })]);
    expect(res.errors).toEqual([
      'Tag 1: „titel“ fehlt.',
      'Tag 2: „zutaten“ fehlen.',
      'Rezept 3: „tag“ muss eine Zahl von 1 bis 24 sein.',
      'Tag 4: „schritte“ fehlen.',
      'Tag 5: „portionen“ muss eine Zahl größer 0 sein.',
    ]);
  });

  it('findet doppelte Tage, Zutaten ohne Namen und kaputtes JSON', () => {
    expect(parse([recipe(1), recipe(1)]).errors).toEqual(['Tag 1 kommt mehrmals vor.']);
    expect(parse([recipe(2, { zutaten: [{ menge: 1 }] })]).errors).toEqual(['Tag 2: Zutat ohne „name“.']);
    expect(parseAdventJson('[{"tag": 1,').errors[0]).toContain('kein gültiges JSON');
    expect(parse({ foo: 1 }).errors).toEqual(['In der Datei steht keine Liste mit Rezepten.']);
  });

  it('die Demo-Rezepte stehen im selben Format – ohne Fehler und Hinweise, alle 24 Türchen', () => {
    const res = parse(ADVENT_DEMO);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.doors.map((d) => d.day)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('nimmt auch eine verpackte Liste { "rezepte": [...] }', () => {
    expect(parse({ rezepte: [recipe(1)] }).doors).toHaveLength(1);
  });
});

describe('Türchen öffnen', () => {
  const cal = filled();

  it('vor dem 1. Dezember ist alles zu', () => {
    expect(canOpen(cal, 1, on(2026, 11, 30, 23))).toBe(false);
  });

  it('am 5. Dezember gehen 1 bis 5 auf, ab Mitternacht (Ortszeit) das nächste', () => {
    expect(canOpen(cal, 5, on(2026, 12, 5, 0))).toBe(true);
    expect(canOpen(cal, 1, on(2026, 12, 5))).toBe(true);
    expect(canOpen(cal, 6, on(2026, 12, 5, 23))).toBe(false);
    expect(canOpen(cal, 6, on(2026, 12, 6, 0))).toBe(true);
  });

  it('nach dem Dezember des Kalenders ist alles offen – Verpasstes nachholen', () => {
    expect(canOpen(cal, 24, on(2027, 1, 3))).toBe(true);
  });

  it('ein leerer Kalender geht nie auf', () => {
    expect(canOpen(emptyAdvent(), 1, on(2026, 12, 24))).toBe(false);
  });

  it('merkt sich den ersten Öffnungszeitpunkt', () => {
    const once = markOpened(cal, 3, on(2026, 12, 3));
    expect(markOpened(once, 3, on(2026, 12, 4)).opened['3']).toBe(once.opened['3']);
  });
});

describe('Befüllen und Speichern', () => {
  it('neu befüllen im selben Jahr behält Geöffnetes und Gespeichertes', () => {
    const used = markSaved(markOpened(filled(), 2, on(2026, 12, 2)), 2, 'r1');
    const again = fillAdvent(used, parse(all24()).doors, on(2026, 12, 3));
    expect(again.opened['2']).toBeDefined();
    expect(again.saved).toEqual({ 2: 'r1' });
  });

  it('ein neues Jahr fängt von vorn an', () => {
    const used = markOpened(filled(), 2, on(2026, 12, 2));
    const next = fillAdvent(used, parse(all24()).doors, on(2027, 11, 20));
    expect(next.year).toBe(2027);
    expect(next.opened).toEqual({});
  });

  it('Rückgängig nimmt das gespeicherte Rezept wieder vom Türchen', () => {
    const saved = markSaved(filled(), 4, 'r9');
    expect(markSaved(saved, 4, undefined).saved).toEqual({});
  });
});

describe('Hinweis auf der Startseite', () => {
  it('ab 15. November: befüllen, wenn leer oder vom letzten Jahr', () => {
    expect(adventHint(emptyAdvent(), on(2026, 11, 14))).toBeUndefined();
    expect(adventHint(emptyAdvent(), on(2026, 11, 15))).toEqual({ kind: 'fill' });
    expect(adventHint(filled(on(2025, 11, 20)), on(2026, 11, 20))).toEqual({ kind: 'fill' });
    expect(needsFilling(filled(), on(2026, 11, 20))).toBe(false);
  });

  it('befüllt im November: noch kein Türchen', () => {
    expect(adventHint(filled(), on(2026, 11, 28))).toBeUndefined();
  });

  it('1. bis 24. Dezember: das Türchen des Tages, danach nichts mehr', () => {
    const cal = markOpened(filled(), 5, on(2026, 12, 5));
    expect(adventHint(cal, on(2026, 12, 4))).toEqual({ kind: 'door', day: 4, opened: false });
    expect(adventHint(cal, on(2026, 12, 5))).toEqual({ kind: 'door', day: 5, opened: true });
    expect(adventHint(cal, on(2026, 12, 25))).toBeUndefined();
  });
});

describe('Abgleich zwischen zwei Geräten', () => {
  const base = filled();

  it('Handy öffnet Türchen 1, Laptop speichert Türchen 2 – beides bleibt', () => {
    const phone = { ...markOpened(base, 1, on(2026, 12, 1)), updatedAt: 'b' };
    const laptop = { ...markSaved(markOpened(base, 2, on(2026, 12, 2)), 2, 'r2'), updatedAt: 'a' };
    const m = merge3Advent(base, phone, laptop);
    expect(Object.keys(m.opened).sort()).toEqual(['1', '2']);
    expect(m.saved).toEqual({ 2: 'r2' });
  });

  it('Rückgängig auf einem Gerät nimmt das Gespeicherte auch beim Zusammenführen weg', () => {
    const withSave = markSaved(base, 3, 'r3');
    const undone = markSaved(withSave, 3, undefined);
    const other = markOpened(withSave, 7, on(2026, 12, 7));
    expect(merge3Advent(withSave, undone, other).saved).toEqual({});
  });

  it('neu befüllt schlägt ein bloß geöffnetes Türchen nicht kaputt', () => {
    const refilled = fillAdvent(base, parse([recipe(1, { titel: 'Neu' })]).doors, on(2026, 11, 25));
    const opened = markOpened(base, 1, on(2026, 12, 1));
    const m = merge3Advent(base, opened, refilled);
    expect(m.doors[0].content.title).toBe('Neu');
    expect(m.opened['1']).toBeDefined();
  });

  it('ohne gemeinsamen Stand: neuere Befüllung, Merklisten vereint', () => {
    const a = markOpened(base, 1, on(2026, 12, 1));
    const b = markOpened(fillAdvent(base, parse([recipe(1, { titel: 'Neu' })]).doors, on(2026, 11, 25)), 2, on(2026, 12, 2));
    const u = unionAdvent(a, b);
    expect(u.doors[0].content.title).toBe('Neu');
    expect(Object.keys(u.opened).sort()).toEqual(['1', '2']);
  });
});

describe('Sicherungsdatei', () => {
  it('nimmt einen befüllten Kalender mit und liest ihn wieder ein', () => {
    const cal = markOpened(filled(), 1, on(2026, 12, 1));
    const file = JSON.parse(JSON.stringify(createBackup([], [], 'x', undefined, undefined, cal)));
    expect(parseBackup(file).advent).toEqual(cal);
  });

  it('lässt einen leeren oder kaputten Kalender weg – der Rest der Sicherung bleibt', () => {
    expect(createBackup([], [], 'x', undefined, undefined, emptyAdvent()).advent).toBeUndefined();
    const res = parseBackup({ app: 'mashi', recipes: [], advent: { year: 2026, doors: 'kaputt' } });
    expect(res.advent).toBeUndefined();
    expect(res.recipes).toEqual([]);
  });
});

describe('Kalender aus Datei oder Datenbank prüfen', () => {
  it('erkennt einen echten Kalender und lehnt Kaputtes ab', () => {
    expect(isAdventCalendar(filled())).toBe(true);
    expect(isAdventCalendar(emptyAdvent())).toBe(true);
    expect(isAdventCalendar({ year: 2026, doors: [{ day: 1 }], opened: {}, saved: {}, filledAt: '', updatedAt: '' })).toBe(false);
    // eine einzige kaputte Zutat reicht, um später beim Anzeigen abzustürzen
    const cal = filled();
    const broken = structuredClone(cal);
    (broken.doors[3].content.ingredients as unknown[]).push('Mehl');
    expect(isAdventCalendar(broken)).toBe(false);
    expect(isAdventCalendar({ ...cal, saved: { 1: 42 } })).toBe(false);
    expect(isAdventCalendar('kalender')).toBe(false);
  });
});
