import { describe, expect, it } from 'vitest';
import { buildRecipePrompt, parseRecipeReply, RecipeReplyError } from './aiRecipe';

const good = {
  title: 'Paprika-Feta-Pfanne', description: 'Schnell und bunt.', servings: 2, prepMinutes: 10, cookMinutes: 15, difficulty: 1,
  categories: ['hauptgericht', 'erfunden'], tags: ['Schnell'], devices: ['herd', 'thermomix'],
  imagePrompt: 'Skillet with bell peppers and feta',
  ingredients: [{ name: 'Paprika', amount: 2, unit: 'Stück' }, { name: 'Feta', amount: '200', unit: 'Gramm' }, { name: 'Salz' }],
  steps: [{ text: 'Paprika schneiden.' }, { text: 'Anbraten.', timerMinutes: 8 }],
};

describe('Makro-Ziel in der KI-Anfrage', () => {
  it('geht mit, wenn gesetzt – sonst nicht', () => {
    expect(buildRecipePrompt({ prompt: 'Pasta', kitchen: { macros: { carbs: 40, protein: 30, fat: 30 } } }))
      .toContain('Makro-Ziel (Anteil an den Kalorien): Kohlenhydrate 40 %, Eiweiß 30 %, Fett 30 %');
    expect(buildRecipePrompt({ prompt: 'Pasta' })).not.toContain('Makro-Ziel');
  });
});

describe('KI-Auftrag', () => {
  it('enthält Wunsch, Rahmen und was bald weg muss – und das Antwortformat', () => {
    const p = buildRecipePrompt({
      prompt: 'Lust auf was mit Feta', servings: 3, maxMinutes: 30, devices: ['airfryer'], wishes: ['Vegetarisch'],
      kitchen: { useUp: ['Joghurt', 'Spinat', 'Joghurt'], pantry: ['Reis'], basics: ['Olivenöl'] },
    });
    for (const s of ['Lust auf was mit Feta', 'Portionen: 3', 'Höchstens 30 Minuten', 'airfryer', 'Vegetarisch', 'Joghurt, Spinat', 'Reis', 'Olivenöl', 'NUR mit einem JSON-Objekt', 'hauptgericht', 'Keine Nährwertangaben']) {
      expect(p).toContain(s);
    }
    // doppelt Genanntes nur einmal
    expect(p.match(/Joghurt/g)).toHaveLength(1);
  });

  it('lässt Leeres weg', () => {
    const p = buildRecipePrompt({ prompt: '  ' });
    expect(p).not.toContain('Wunsch:');
    expect(p).not.toContain('bald aufgebraucht');
  });
});

describe('KI-Antwort prüfen', () => {
  it('sauberes JSON → Rezept; unbekannte Kategorien/Geräte fallen weg, Einheiten werden übersetzt', () => {
    const r = parseRecipeReply(JSON.stringify(good));
    expect(r).toMatchObject({ title: 'Paprika-Feta-Pfanne', servings: 2, prepMinutes: 10, cookMinutes: 15, difficulty: 1, categories: ['hauptgericht'], devices: ['herd'] });
    expect(r.ingredients.map((i) => [i.name, i.amount, i.unit])).toEqual([['Paprika', 2, 'Stück'], ['Feta', 200, 'g'], ['Salz', undefined, undefined]]);
    expect(r.steps.map((s) => s.timerMinutes)).toEqual([undefined, 8]);
    // eigene IDs, eindeutig
    expect(new Set([...r.ingredients, ...r.steps].map((x) => x.id)).size).toBe(5);
  });

  it('Teile (Julia: Sauce getrennt kochen): an Zutaten und Schritten, „Zum Schluss“ bringt sie zusammen', () => {
    const r = parseRecipeReply(JSON.stringify({
      ...good,
      ingredients: [{ name: 'Passata', amount: 500, unit: 'g', part: 'Sauce' }, { name: 'Spaghetti', amount: 200, unit: 'g' }],
      steps: [{ text: 'Passata köcheln.', part: 'Sauce' }, { text: 'Spaghetti kochen.' }, { text: 'Alles mischen.', part: 'zum Schluss' }],
    }));
    expect(r.ingredients.map((i) => i.part)).toEqual(['Sauce', undefined]);
    expect(r.steps.map((s) => s.part)).toEqual(['Sauce', undefined, '*']);
  });

  it('JSON in ```json … ``` oder mit Sätzen drumherum', () => {
    expect(parseRecipeReply('Gern! Hier ist dein Rezept:\n```json\n' + JSON.stringify(good) + '\n```\nGuten Appetit!').title).toBe('Paprika-Feta-Pfanne');
    expect(parseRecipeReply('Klar: ' + JSON.stringify(good) + ' – viel Spaß').title).toBe('Paprika-Feta-Pfanne');
  });

  it('Zahlen als Text, Brüche, Schritte als bloße Texte, Grenzen', () => {
    const r = parseRecipeReply(JSON.stringify({
      ...good, servings: '4', difficulty: 7, prepMinutes: '10 Minuten', cookMinutes: -5,
      ingredients: [{ name: 'Milch', amount: '1,5', unit: 'l' }, { name: 'Zucker', amount: '½', unit: 'EL' }],
      steps: ['Alles verrühren.', ''],
    }));
    expect(r).toMatchObject({ servings: 4, difficulty: 3, prepMinutes: 10, cookMinutes: 0 });
    expect(r.ingredients.map((i) => i.amount)).toEqual([1.5, 0.5]);
    expect(r.steps.map((s) => s.text)).toEqual(['Alles verrühren.']);
  });

  it('kein brauchbares Rezept → verständlicher Fehler statt kaputtem Eintrag', () => {
    expect(() => parseRecipeReply('Tut mir leid, dabei kann ich nicht helfen.')).toThrow(RecipeReplyError);
    expect(() => parseRecipeReply('{"title": "Nur Titel", "ingredients": [], "steps": []}')).toThrow(RecipeReplyError);
    expect(() => parseRecipeReply('{"title": "abgeschnitten", "ingredients": [{"name": "Rei')).toThrow(RecipeReplyError);
  });

  it('ohne Portionen in der Antwort: die gewünschten', () => {
    const { servings: _s, ...noServings } = good;
    expect(parseRecipeReply(JSON.stringify(noServings), { servings: 5 }).servings).toBe(5);
  });
});

describe('KI-Auftrag: lange Vorlieben, Abwechslung, Überraschung', () => {
  // erfunden: ~6000 Zeichen, das Wichtige steht – wie oft – ganz am Ende
  const long = Array.from({ length: 120 }, (_, i) => `- Lieblingszutat Nummer ${i} mit etwas Text dazu`).join('\n') + '\n\nNICHT verwenden: Testfisch';

  it('Vorlieben gehen ganz mit – auch das Ende (früher nach 1500 Zeichen abgeschnitten)', () => {
    expect(long.length).toBeGreaterThan(5000);
    const p = buildRecipePrompt({ prompt: 'Abendessen', kitchen: { tastes: long } });
    expect(p).toContain('NICHT verwenden: Testfisch');
    expect(p).toMatch(/Wechsle ab/);
    // das App-Format geht vor, auch wenn die Vorlieben ein eigenes beschreiben
    expect(p).toMatch(/auch wenn oben ein anderes Format beschrieben ist/);
  });

  it('älterer Server (8000): Vorlieben werden gekürzt, Auftrag und Format bleiben ganz', () => {
    const huge = long + '\n' + 'x'.repeat(4000);
    const p = buildRecipePrompt({ prompt: 'Abendessen mit Paprika', kitchen: { tastes: huge } }, { maxLength: 8000 });
    expect(p.length).toBeLessThanOrEqual(8000);
    expect(p).toContain('Wunsch: Abendessen mit Paprika');
    expect(p).toContain('Lieblingszutat Nummer 0');
    expect(p).toContain(' …');
    expect(p).toContain('Keine Nährwertangaben');
  });

  it('die letzten Ideen gehen als „bitte etwas anderes“ mit; ganz ohne Angaben: Überraschung', () => {
    const p = buildRecipePrompt({ prompt: '', recent: ['Gochujang-Bowl', 'Gochujang-Pasta', 'Gochujang-Bowl'] });
    expect(p).toContain('bitte etwas deutlich anderes');
    expect(p).toContain('Gochujang-Bowl; Gochujang-Pasta');
    expect(p).toMatch(/Überrasche mich/);
    // mit nur einer Zeit ist es keine freie Überraschung mehr
    expect(buildRecipePrompt({ prompt: '', maxMinutes: 20 })).not.toMatch(/Überrasche mich/);
  });
});
