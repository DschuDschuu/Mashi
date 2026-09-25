import { describe, expect, it } from 'vitest';
import { parseNutritionLabel } from './labelOcr';

// Erfundene Etiketten, so wie die Texterkennung sie liefert (mit typischen Lesefehlern)
describe('Nährwerttabelle vom Foto', () => {
  it('liest das übliche Etikett mit kJ/kcal und „davon“-Zeilen', () => {
    const r = parseNutritionLabel(`Nährwerte pro 100 g
Brennwert 1046 kJ / 250 kcal
Fett 9,5 g
davon gesättigte Fettsäuren 3,2 g
Kohlenhydrate 30 g
davon Zucker 2,1 g
Ballaststoffe 1,5 g
Eiweiß 8,0 g
Salz 1,2 g`);
    expect(r.per100g).toEqual({ kcal: 250, fat: 9.5, satFat: 3.2, carbs: 30, sugar: 2.1, fiber: 1.5, protein: 8, salt: 1.2 });
    expect(r.missing).toEqual([]);
  });

  it('nimmt bei zwei Spalten die erste (pro 100 g) und verzeiht Lesefehler', () => {
    const r = parseNutritionLabel(`pro 100 ml | pro Glas (250 ml)
Energie 190 kJ | 45 kcai 475 kJ | 113 kcal
Fett 1,5 g 3,8 g
Kohlenhydrate 4,8 g 12 g
EiweiB 3,4 g 8,5 g`);
    expect(r.per100g).toMatchObject({ kcal: 45, fat: 1.5, carbs: 4.8, protein: 3.4 });
  });

  it('rechnet kJ um, wenn kcal fehlt, und liest Werte aus der nächsten Zeile', () => {
    const r = parseNutritionLabel(`Brennwert 418 kJ
Fett
2 g
Kohlenhydrate 12 g`);
    expect(r.per100g).toEqual({ kcal: 100, fat: 2, carbs: 12 });
    expect(r.missing).toEqual(['protein']);
  });

  it('liefert leere Werte statt zu raten, wenn nichts passt', () => {
    expect(parseNutritionLabel('Zutaten: Weißkohl, Chili, Knoblauch').missing).toEqual(['kcal', 'protein', 'carbs', 'fat']);
  });
});
