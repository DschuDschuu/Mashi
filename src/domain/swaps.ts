import type { Household } from './mealplan';
import { foodOf, sideGrams, sideOf, sidesOfKind, type Side, type SideKind } from './sides';
import { stepIngredients } from './stepIngredients';
import type { Ingredient, RecipeContent, Unit } from './types';

/**
 * Tauschen im Rezept (Julia: „die Rezepte anpassen, dass das Baukasten-System reingeht und ich dort Dinge austauschen
 * kann, aber die Kochschritte damit bleiben“): Zutaten, die ein Baustein sind (Hähnchenbrust, Basmatireis …), lassen
 * sich gegen einen anderen derselben Stufe tauschen – Tofu statt Hähnchen. Die Zutat bekommt Name und Menge des
 * Bausteins, deine Schritte bleiben und nennen den neuen Namen. Gemerkt am Rezept wie die gewählte Variante
 * (Recipe.swaps) – Einkauf, Nährwerte, Kochmodus und Abbuchen lesen alle über choices.ts: chosenContent und rechnen
 * deshalb ohne Sonderweg mit. Nur Kohlenhydrat und Protein: beim Gemüse wären es zu oft Zwiebeln und Tomaten, die nur würzen.
 */

/** gespeichert, wie es zum Zeitpunkt des Tauschs galt – so braucht das Rezept später keinen Haushalt mehr */
export interface IngredientSwap {
  /** Baustein-id (sides.ts) */
  side: string;
  /** wie es im Laden heißt (sides.ts: foodOf) – für Einkauf, Nährwerte und Vorrat */
  name: string;
  /** Menge pro Portion (deine Menge aus den Einstellungen, sonst Mashis) */
  grams: number;
  unit?: 'Stück';
}

const SWAP_KINDS: readonly SideKind[] = ['carb', 'protein'];

/**
 * Woran Mashi eine Zutat als Baustein erkennt – und was in den Schritten ersetzt wird. Ohne Eintrag: der Name des
 * Bausteins. Das längste passende Wort gewinnt („Süßkartoffeln“ ist keine Kartoffel).
 */
const WORDS: Readonly<Record<string, readonly string[]>> = {
  haehnchen: ['Hähnchenbrustfilet', 'Hähnchenbrust', 'Hähnchenfleisch', 'Hähnchen', 'Hühnchen', 'Chicken'],
  hack: ['Hackfleisch', 'Rinderhack', 'Hack'],
  tofu: ['Räuchertofu', 'Tofu'],
  bohnen: ['schwarze Bohnen', 'Kidneybohnen'],
  patty: ['Hack-Patty', 'Patties', 'Patty'],
  pasta: ['Pasta', 'Nudeln', 'Spaghetti', 'Penne', 'Fusilli', 'Tagliatelle', 'Linguine'],
  reis: ['Basmatireis', 'Jasminreis', 'Langkornreis', 'Reis'],
  kartoffeln: ['Kartoffeln', 'Kartoffel'],
  suesskartoffel: ['Süßkartoffeln', 'Süßkartoffel'],
  buns: ['Burgerbrötchen', 'Burger Buns', 'Buns'],
  tortillas: ['Tortillas', 'Tortilla', 'Wraps', 'Wrap'],
  schupfnudeln: ['Schupfnudeln'],
  spaetzle: ['Spätzle'],
};

const wordsOf = (s: Side): readonly string[] => WORDS[s.id] ?? [s.name];
const low = (t: string) => t.toLocaleLowerCase('de-DE');

/** Welcher Baustein ist diese Zutat? Ganzes Wort oder Ende eines Wortes („Basmatireis“), das längste gewinnt */
export function sideOfIngredient(name: string, custom: readonly string[] = []): Side | undefined {
  const n = low(name.trim());
  let best: { side: Side; len: number } | undefined;
  for (const kind of SWAP_KINDS) {
    for (const side of sidesOfKind(kind, custom)) {
      for (const w of wordsOf(side).map(low)) {
        const whole = new RegExp(`(^|[^\\p{L}])${escape(w)}($|[^\\p{L}])`, 'u').test(n);
        const tail = n.endsWith(w) && n.length > w.length;
        if ((whole || tail) && (!best || w.length > best.len)) best = { side, len: w.length };
      }
    }
  }
  return best?.side;
}

// ohne „-“: im u-Modus ist „\-“ außerhalb von […] ein Fehler (Hack-Patty) – und der Bindestrich braucht dort keinen Schutz
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ein Tauschplatz: die Zutat, wie sie im Rezept steht, welcher Baustein sie ist, wogegen sie sich tauschen lässt */
export interface SwapSlot { ingredient: Ingredient; side: Side; options: Side[]; current?: IngredientSwap }

/** Die Tauschplätze eines Rezepts – an der Fassung ohne Tausch (sonst wäre der Tofu sein eigener Platz) */
export function swapSlots(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> = {}, custom: readonly string[] = []): SwapSlot[] {
  return c.ingredients.flatMap((ingredient) => {
    if (ingredient.recipeId) return []; // verknüpftes Rezept (die Bolognese) – kein Baustein
    const side = sideOfIngredient(ingredient.name, custom);
    if (!side) return [];
    const options = sidesOfKind(side.kind, custom).filter((x) => x.id !== side.id);
    return [{ ingredient, side, options, ...(swaps[ingredient.id] ? { current: swaps[ingredient.id] } : {}) }];
  });
}

/** Der Tausch, wie er am Rezept gespeichert wird – Name und Menge nach deinem Haushalt */
export function swapFor(sideId: string, household?: Pick<Household, 'sides' | 'sideFood'>): IngredientSwap | undefined {
  const side = sideOf(sideId);
  if (!side) return undefined;
  return { side: side.id, name: foodOf(side, household), grams: sideGrams(side.id, household), ...(side.unit === 'Stück' ? { unit: 'Stück' as const } : {}) };
}

/**
 * Das Rezept mit Tausch: die Zutat wird der neue Baustein (Menge pro Portion × Portionen des Rezepts), in den Schritten
 * steht der neue Name – ein Artikel direkt davor fällt weg, damit es passt („die Hähnchenbrust salzen“ → „Tofu
 * salzen“). Am ersten Schritt, der ihn nennt, ein kurzer Tipp, wie der neue Baustein zubereitet wird; ein Timer, der
 * nur ihn gart, nimmt dessen Zeit. Unbekanntes
 * (Baustein gelöscht, Zutat nicht mehr da) bleibt, wie es ist.
 */
export function withSwaps(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> | undefined, custom: readonly string[] = []): RecipeContent {
  const active = Object.entries(swaps ?? {}).flatMap(([id, s]) => {
    const ingredient = c.ingredients.find((i) => i.id === id);
    const to = sideOf(s.side);
    return ingredient && to ? [{ ingredient, s, to, from: sideOfIngredient(ingredient.name, custom) }] : [];
  });
  if (!active.length) return c;
  const byId = new Map(active.map((x) => [x.ingredient.id, x]));
  const ingredients = c.ingredients.map((i) => {
    const x = byId.get(i.id);
    if (!x) return i;
    // der feste Verweis aufs Lebensmittel (foodRef) gehörte zum Hähnchen – sonst rechnete der Tofu mit dessen Nährwerten
    const { foodRef: _ref, ...rest } = i;
    return { ...rest, name: x.s.name, amount: Math.round(x.s.grams * c.servings * 10) / 10, unit: (x.s.unit ?? 'g') as Unit };
  });
  let steps = c.steps;
  const hits = new Map<string, Set<string>>(); // Schritt-id → welche getauschten Zutaten er nennt
  for (const x of active) {
    const words = [...new Set([x.ingredient.name, ...(x.from ? wordsOf(x.from) : [])])].sort((a, b) => b.length - a.length);
    const re = new RegExp(`(^|[^\\p{L}])(?:(?:der|die|das|den|dem|des)\\s+)?(${words.map(escape).join('|')})(?![\\p{L}])`, 'giu');
    let tipped = false;
    steps = steps.map((st) => {
      const text = st.text.replace(re, (_m, before: string) => `${before}${x.to.name}`);
      if (text === st.text) return st;
      hits.set(st.id, (hits.get(st.id) ?? new Set()).add(x.ingredient.id));
      const tip = !tipped && x.to.prep ? ` (Tipp: ${x.to.name} ${x.to.prep.text}${x.to.prep.minutes ? `, ${x.to.prep.minutes} Min.` : ''})` : '';
      tipped = true;
      return { ...st, text: text + tip };
    });
  }
  // Der Timer eines Schritts, der nur die getauschte Zutat gart („Reis kochen“, 15 Min.), nimmt die Zeit des Bausteins –
  // sonst lief die Pasta 15 Min. Brät der Schritt noch anderes mit, bleibt dein Timer.
  steps = steps.map((st) => {
    const hit = hits.get(st.id);
    if (!st.timerMinutes || hit?.size !== 1) return st;
    const [id] = hit;
    const minutes = byId.get(id)?.to.prep?.minutes;
    const others = stepIngredients(st, ingredients).some((i) => i.id !== id);
    return minutes && !others ? { ...st, timerMinutes: minutes } : st;
  });
  return { ...c, ingredients, steps };
}
