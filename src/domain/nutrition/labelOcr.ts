import type { Nutrients } from './types';

/**
 * Nährwerttabelle vom Foto (Texterkennung) → Werte pro 100 g / 100 ml.
 *
 * Typisches Etikett:
 *   Brennwert 1046 kJ / 250 kcal
 *   Fett 9,5 g
 *   davon gesättigte Fettsäuren 3,2 g
 *   Kohlenhydrate 30 g
 *   davon Zucker 2,1 g
 *   Eiweiß 8,0 g
 *   Salz 1,2 g
 *
 * Hat die Tabelle zwei Spalten (pro 100 g | pro Portion), steht 100 g fast immer vorne –
 * deshalb gilt die erste Zahl einer Zeile. Was nicht sicher erkannt wird, bleibt leer:
 * lieber ein leeres Feld zum Abtippen als ein falscher Wert.
 */
export interface LabelValues {
  per100g: Partial<Nutrients>;
  /** welche der vier Hauptwerte fehlen (zum Nachtragen) */
  missing: ('kcal' | 'protein' | 'carbs' | 'fat')[];
}

type Key = keyof Nutrients;

/** Zeilenanfang → Wert. Reihenfolge zählt: „gesättigte Fettsäuren“ vor „Fett“. */
const ROWS: [RegExp, Key][] = [
  [/gesättigt|gesattigt|fettsäuren|fettsauren/, 'satFat'],
  [/^fett\b/, 'fat'],
  [/zucker/, 'sugar'],
  [/^kohlenhydrat/, 'carbs'],
  [/ballaststoff/, 'fiber'],
  [/^(eiwei|protein)/, 'protein'],
  [/^salz\b/, 'salt'],
];

const NUMBER = /(\d+(?:\.\d+)?)/;

export function parseNutritionLabel(text: string): LabelValues {
  const lines = text
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/kcai|kca1/g, 'kcal')
    .split(/\n/)
    .map((l) => l.replace(/^[\s\-–•|:]+/, '').replace(/^davon\s+/, '').trim())
    .filter(Boolean);
  const per100g: Partial<Nutrients> = {};

  const all = lines.join('\n');
  // „1046 kJ / 250 kcal“ – oder „kJ/kcal 1046/250“ – oder nur kJ (dann umrechnen)
  const kcal = all.match(/(\d+(?:\.\d+)?)\s*kcal/)?.[1]
    ?? all.match(/kj\s*\/\s*kcal\D{0,12}\d+(?:\.\d+)?\s*\/\s*(\d+(?:\.\d+)?)/)?.[1];
  const kj = all.match(/(\d+(?:\.\d+)?)\s*kj/)?.[1];
  if (kcal) per100g.kcal = Number(kcal);
  else if (kj) per100g.kcal = Math.round(Number(kj) / 4.184);

  lines.forEach((line, i) => {
    const row = ROWS.find(([re]) => re.test(line));
    if (!row || per100g[row[1]] !== undefined) return;
    // Wert steht in der Zeile – oder (bei spaltenweise gelesenen Tabellen) allein in der nächsten
    const value = line.match(NUMBER)?.[1] ?? (/^<?\s*\d+(?:\.\d+)?\s*g?$/.test(lines[i + 1] ?? '') ? lines[i + 1].match(NUMBER)?.[1] : undefined);
    if (value !== undefined) per100g[row[1]] = Number(value);
  });

  const missing = (['kcal', 'protein', 'carbs', 'fat'] as const).filter((k) => per100g[k] === undefined);
  return { per100g, missing };
}
