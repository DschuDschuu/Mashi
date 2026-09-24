import type { Ingredient, RecipeContent, Unit } from './types';

/** Einheiten, die man in Brüchen denkt (½ EL) statt in Dezimalzahlen. */
const COUNT_UNITS: ReadonlySet<Unit> = new Set(['EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Bund', 'Handvoll', 'cm', 'Messlöffel']);

/** Skaliert die Zutatenmengen auf eine neue Portionszahl. Rundet NICHT – das macht erst die Anzeige. */
export function scaleIngredients(content: RecipeContent, servings: number): Ingredient[] {
  const factor = servings / content.servings;
  return content.ingredients.map((ing) =>
    ing.amount === undefined ? ing : { ...ing, amount: ing.amount * factor },
  );
}

const FRACTIONS: [number, string][] = [
  [0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, ''],
];

function formatDecimal(value: number, maxDigits: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: maxDigits });
}

/**
 * Menge so darstellen, wie man sie in einer Küche liest:
 * 1,5 EL → „1½“, 337,5 g → „340“, 0,3 TL → „¼“.
 */
export function formatAmount(amount: number, unit?: Unit): string {
  if (amount <= 0) return '0';

  if (unit && COUNT_UNITS.has(unit)) {
    const whole = Math.floor(amount);
    const rest = amount - whole;
    let best = FRACTIONS[0];
    for (const f of FRACTIONS) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
    const w = best[0] === 1 ? whole + 1 : whole;
    if (w === 0 && best[1] === '') return '¼'; // nie „0 TL“ anzeigen
    return `${w > 0 ? w : ''}${best[1]}`;
  }

  if (unit === 'kg' || unit === 'l') return formatDecimal(Math.round(amount * 100) / 100, 2);
  if (amount < 10) return formatDecimal(Math.round(amount * 10) / 10, 1);
  if (amount < 100) return formatDecimal(Math.round(amount), 0);
  return formatDecimal(Math.round(amount / 5) * 5, 0);
}

export function formatQuantity(ing: Ingredient): string {
  if (ing.amount === undefined) return '';
  const amount = formatAmount(ing.amount, ing.unit);
  return ing.unit ? `${amount} ${ing.unit}` : amount;
}
