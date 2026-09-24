import { describe, expect, it } from 'vitest';
import { parseIngredientLine, parseRecipeText } from './importText';

const brief = (t: string) => {
  const i = parseIngredientLine(t);
  return [i.amount, i.unit, i.name, i.note].filter((x) => x !== undefined).join(' | ');
};

describe('Zutatenzeilen', () => {
  it('liest das zaubermix-Format mit angeklebter Einheit', () => {
    expect(brief('* 3 ELÖl')).toBe('3 | EL | Öl');
    expect(brief('* 1000 gSchupfnudeln (Kühlregal)')).toBe('1000 | g | Schupfnudeln (Kühlregal)');
    expect(brief('* 1Zwiebel, halbiert')).toBe('1 | Zwiebel | halbiert');
    expect(brief('* 20 g[Tomatenmark](https://www.zaubermix.de/rezepte/tomatenmark.html)')).toBe('20 | g | Tomatenmark');
    expect(brief('* 3 PrisenPfeffer')).toBe('3 | Prise | Pfeffer');
    expect(brief('* 0,5 TLSalz')).toBe('0.5 | TL | Salz');
  });

  it('verwechselt „1 gelbe Paprika“ nicht mit Gramm', () => {
    expect(brief('1 gelbe Paprika')).toBe('1 | gelbe Paprika');
    expect(brief('2 große Zwiebeln')).toBe('2 | große Zwiebeln');
  });

  it('liest „Name: Menge“ und klassische Listen', () => {
    expect(brief('Paprika: 6 Stück (~440 g)')).toBe('6 | Stück | (~440 g) Paprika');
    expect(brief('Hüttenkäse 2 %: 360 g')).toBe('360 | g | Hüttenkäse 2 %');
    expect(brief('350 g Hähnchenbrust')).toBe('350 | g | Hähnchenbrust');
    expect(brief('2 EL Frischkäse')).toBe('2 | EL | Frischkäse');
    expect(brief('½ TL Knoblauchpulver')).toBe('0.5 | TL | Knoblauchpulver');
    expect(brief('Salz, Pfeffer, Muskat')).toBe('Salz | Pfeffer, Muskat');
  });

  it('merkt sich „optional“', () => {
    const i = parseIngredientLine('1 TL Reisessig (optional)');
    expect(i).toMatchObject({ amount: 1, unit: 'TL', name: 'Reisessig', optional: true });
  });
});

describe('Ganze Rezepte', () => {
  it('zaubermix: Zutaten, Schritte mit Nummer in eigener Zeile, Zeit, Schwierigkeit, Gerät', () => {
    // Erfundenes Rezept im Format der Rezeptseiten für Küchenmaschinen (Nummer in eigener Zeile)
    const text = `* 1Zwiebel, halbiert
* 2Knoblauchzehen
* 3 ELÖl
* 400 gstückige Tomaten (Dose)
* 500 gGnocchi (Kühlregal)

* Zwiebel und Knoblauch in den Mixtopf geben und 5 Sek. | Stufe 8 hacken.
* 2
1 EL Öl dazugeben und 2 Min. | Stufe 1 | 120 °C dünsten.
* 3
Restliches Öl in einer Pfanne erhitzen, Gnocchi goldbraun braten und mit der Soße mischen.

Zeit gesamt
15 Min.
Schwierigkeit
Leicht`;
    const r = parseRecipeText(text);
    expect(r.content.ingredients.map((i) => i.name)).toEqual(['Zwiebel', 'Knoblauchzehen', 'Öl', 'stückige Tomaten (Dose)', 'Gnocchi (Kühlregal)']);
    expect(r.content.steps).toHaveLength(3);
    expect(r.content.steps[1]).toMatchObject({ timerMinutes: 2 });
    expect(r.content.prepMinutes + r.content.cookMinutes).toBe(15);
    expect(r.content.difficulty).toBe(1);
    expect(r.content.devices).toEqual(['monsieur-cuisine']);
    expect(r.warnings).toContain('Keine Portionen gefunden – 2 angenommen, bitte prüfen.');
  });

  it('klassisches Format mit Titel, „Zutaten:“/„Zubereitung:“ und Tipp', () => {
    const text = `3️⃣ Linsen-Gemüse-Pfanne mit Feta

Zutaten:
250 g Linsen
150 g Reis
200 g Möhren, gewürfelt
Salz, Pfeffer, Muskat

Zubereitung:
Reis kochen.
Linsen garen.
Möhren anbraten, Linsen dazugeben, Feta darüberbröseln.

💡 Tipp: Zitrone erst ganz zum Schluss darüberträufeln.`;
    const r = parseRecipeText(text);
    expect(r.content.title).toBe('Linsen-Gemüse-Pfanne mit Feta');
    expect(r.content.ingredients.map((i) => `${i.amount ?? ''} ${i.unit ?? ''} ${i.name}`.trim())).toEqual([
      '250 g Linsen', '150 g Reis', '200 g Möhren', 'Salz',
    ]);
    expect(r.content.steps.map((s) => s.text)).toEqual(['Reis kochen.', 'Linsen garen.', 'Möhren anbraten, Linsen dazugeben, Feta darüberbröseln.']);
    expect(r.notes).toContain('Zitrone erst ganz zum Schluss');
  });

  it('erkennt Portionen und nummerierte Schritte', () => {
    const r = parseRecipeText(`Name: Testsuppe\n6 Portionen\nZutaten\n1 kg Kartoffeln\nZubereitung\n1. Kartoffeln schälen.\n2. 20 Min. kochen.`);
    expect(r.content).toMatchObject({ title: 'Testsuppe', servings: 6 });
    expect(r.content.steps.map((s) => s.timerMinutes)).toEqual([undefined, 20]);
    expect(r.warnings).toEqual([]);
  });
});
