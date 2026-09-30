import { describe, expect, it } from 'vitest';
import { buildRecipePrompt, parseRecipeReply, RecipeReplyError } from './aiRecipe';

const good = {
  title: 'Paprika-Feta-Pfanne', description: 'Schnell und bunt.', servings: 2, prepMinutes: 10, cookMinutes: 15, difficulty: 1,
  categories: ['hauptgericht', 'erfunden'], tags: ['Schnell'], devices: ['herd', 'thermomix'],
  imagePrompt: 'Skillet with bell peppers and feta',
  ingredients: [{ name: 'Paprika', amount: 2, unit: 'Stück' }, { name: 'Feta', amount: '200', unit: 'Gramm' }, { name: 'Salz' }],
  steps: [{ text: 'Paprika schneiden.' }, { text: 'Anbraten.', timerMinutes: 8 }],
};

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
