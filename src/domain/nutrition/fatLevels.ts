/**
 * Fettstufen bei Milch, Joghurt und Quark: „Milch 3,5 %“, „Milch (1,5 %)“, „Vollmilch“, „Sahnequark“ …
 * Steht eine Stufe da, zählt genau sie – steht keine da („Milch“), gilt der Standard: dein eigenes
 * Produkt, sonst der Eintrag der Tabelle. Im Rezept soll es EINE Schreibweise geben: „Milch 3,5 %“
 * statt „Vollmilch“; die niedrigste Stufe heißt schlicht „Milch“ / „Joghurt“ / „Quark“.
 */
export interface FatLevel {
  /** Eintrag der Tabelle */
  id: string;
  /** einheitliche Schreibweise im Rezept */
  label: string;
}

interface Level extends FatLevel { max: number; words: RegExp }

const LEVELS: { base: RegExp; exclude?: RegExp; levels: Level[] }[] = [
  {
    // auch zusammengesetzt (Weidemilch, Frischmilch) – aber keine Pflanzendrinks, Buttermilch & Co.
    base: /milch\b/,
    exclude: /(kokos|hafer|butter|mandel|soja|reis|dinkel|erbsen|cashew|kondens|dosen|kaffee)milch/,
    levels: [
      { id: 'magermilch', label: 'Milch', max: 0.5, words: /\b(magermilch|entrahmte milch)\b/ },
      { id: 'milch-fettarm', label: 'Milch 1,5 %', max: 2.5, words: /\b(fettarme milch|milch fettarm|teilentrahmte milch)\b/ },
      { id: 'milch', label: 'Milch 3,5 %', max: Infinity, words: /\bvollmilch\b/ },
    ],
  },
  {
    base: /joghurt\b/,
    // griechischer Joghurt, Skyr, Pflanzenjoghurt & Co. sind eigene Lebensmittel
    exclude: /griechisch|skyr|dressing|soße|sauce|(soja|kokos|hafer|mandel)joghurt/,
    levels: [
      { id: 'joghurt-01', label: 'Joghurt', max: 0.5, words: /\b(magerjoghurt|joghurt mager)\b/ },
      { id: 'joghurt-15', label: 'Joghurt 1,5 %', max: 2.5, words: /\b(fettarmer joghurt|joghurt fettarm)\b/ },
      { id: 'joghurt-35', label: 'Joghurt 3,5 %', max: Infinity, words: /\bvollmilchjoghurt\b/ },
    ],
  },
  {
    base: /quark\b/,
    levels: [
      { id: 'magerquark', label: 'Quark', max: 10, words: /\b(magerquark|magerstufe)\b/ },
      { id: 'quark-20', label: 'Quark 20 %', max: 30, words: /\b(halbfettquark|halbfettstufe)\b/ },
      { id: 'quark-40', label: 'Quark 40 %', max: Infinity, words: /\b(sahnequark|rahmquark|sahnestufe)\b/ },
    ],
  },
];

/**
 * Welche Fettstufe steht im Namen? undefined, wenn es kein Milch-/Joghurt-/Quarkprodukt ist
 * oder keine Stufe dasteht (dann gilt der Standard).
 */
export function fatLevel(name: string): FatLevel | undefined {
  const n = name.toLocaleLowerCase('de-DE');
  for (const g of LEVELS) {
    if (!g.base.test(n) || g.exclude?.test(n)) continue;
    const pct = n.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pct) {
      const v = Number(pct[1].replace(',', '.'));
      const hit = g.levels.find((l) => v <= l.max);
      return hit && { id: hit.id, label: hit.label };
    }
    const byWord = g.levels.find((l) => l.words.test(n));
    return byWord && { id: byWord.id, label: byWord.label };
  }
  return undefined;
}

/** Standard einer Gruppe (niedrigste Stufe: „Milch“) – für einen Tabellen-Eintrag mit Fettstufen */
export function defaultLevelOf(foodId: string): string | undefined {
  return LEVELS.find((g) => g.levels.some((l) => l.id === foodId))?.levels[0].label;
}

/**
 * Gilt ein eigenes Produkt für diese Zutat? Nur für seine eigene Fettstufe: „Milch 0,1 %“ nicht für
 * „Milch 3,5 %“. Steht im Produktnamen keine Stufe, ist es dein Standard (die niedrigste Stufe).
 * undefined = der Eintrag hat keine Fettstufen, dann spielt es keine Rolle.
 */
export function sameLevel(productName: string, ingredientName: string, foodId: string): boolean | undefined {
  const std = defaultLevelOf(foodId);
  if (!std) return undefined;
  return (fatLevel(productName)?.label ?? std) === (fatLevel(ingredientName)?.label ?? std);
}

/** Alle Einträge derselben Gruppe (Milch: 0,1 / 1,5 / 3,5 %) und der schlichte Name („Milch“) */
export function fatGroupOf(foodId: string): { ids: string[]; plain: string } | undefined {
  const g = LEVELS.find((x) => x.levels.some((l) => l.id === foodId));
  return g && { ids: g.levels.map((l) => l.id), plain: g.levels[0].label };
}

/** Für welche Einträge gilt ein Produkt dieser Stufe? Nur für den Eintrag seiner Stufe (Milch 0,1 % → Magermilch-Eintrag). */
export function levelEntryOf(productName: string, foodId: string): string | undefined {
  const g = LEVELS.find((x) => x.levels.some((l) => l.id === foodId));
  if (!g) return undefined;
  const label = fatLevel(productName)?.label ?? g.levels[0].label;
  return g.levels.find((l) => l.label === label)?.id;
}
