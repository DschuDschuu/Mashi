/** Zahl vom Etikett: akzeptiert „3,4“ und „3.4“. */
export function parseNum(s: string): number | undefined {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Zahl fürs Eingabefeld, mit deutschem Komma */
export const toField = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/** die vier Hauptwerte als Text, so wie sie getippt werden */
export type Values = { kcal: string; protein: string; carbs: string; fat: string };
