import type { Household } from './mealplan';
import { methodOf, waysOf } from './cookStyle';
import { SIDE_KINDS, foodOf, sideGrams, sideOf, sidesOfKind, type Side, type SideKind, type SidePrep } from './sides';
import { stepIngredients } from './stepIngredients';
import type { Ingredient, RecipeContent, Unit } from './types';

/**
 * Tauschen im Rezept (Julia: „die Rezepte anpassen, dass das Baukasten-System reingeht und ich dort Dinge austauschen
 * kann, aber die Kochschritte damit bleiben“): Zutaten, die ein Baustein sind (Hähnchenbrust, Basmatireis …), lassen
 * sich gegen einen anderen derselben Stufe tauschen – Tofu statt Hähnchen. Die Zutat bekommt Name und Menge des
 * Bausteins, deine Schritte bleiben und nennen den neuen Namen. Gemerkt am Rezept wie die gewählte Variante
 * (Recipe.swaps) – Einkauf, Nährwerte, Kochmodus und Abbuchen lesen alle über choices.ts: chosenContent und rechnen
 * deshalb ohne Sonderweg mit. Jede Stufe tauscht nur in sich (Julia: „alles innerhalb jeder Stufe“) – so bleibt der Teller
 * vollständig; Brokkoli statt Zucchini, Feta statt Parmesan. Was nur so heißt wie ein Baustein (Dosentomaten, Schmand in
 * der Sauce, Ei in der Panade), tauscht nicht.
 */

/** gespeichert, wie es zum Zeitpunkt des Tauschs galt – so braucht das Rezept später keinen Haushalt mehr */
export interface IngredientSwap {
  /** Baustein-id (sides.ts) oder Zutat einer Austauschgruppe („zutat:frischkaese“) */
  side: string;
  /** wie es im Laden heißt (sides.ts: foodOf) – für Einkauf, Nährwerte und Vorrat */
  name: string;
  /** Menge pro Portion (deine Menge aus den Einstellungen, sonst Mashis) – fehlt bei `same` */
  grams?: number;
  unit?: 'Stück';
  /** Menge der Zutat behalten (Milchprodukte: 200 g Schmand → 200 g Frischkäse, bei Milch 200 ml) */
  same?: true;
}

/** Wogegen sich tauschen lässt: ein Baustein (sides.ts) – oder eine Zutat aus einer Austauschgruppe */
export interface SwapTarget {
  id: string;
  name: string;
  /** Baukasten-Stufe – nur Bausteine */
  kind?: SideKind;
  /** Austauschgruppe – nur Zutaten wie Schmand („milch“) */
  group?: string;
  prep?: SidePrep;
  /** flüssig – Gramm werden Milliliter */
  liquid?: boolean;
}

/**
 * Austauschgruppen (Julia: „Schmand kann gerne mit Frischkäse, Joghurt oder Milch getauscht werden“): Zutaten, die keine
 * Baukasten-Bausteine sind, aber im Rezept dieselbe Rolle spielen – untereinander tauschbar, die Menge bleibt.
 */
const GROUPS: readonly (SwapTarget & { words: readonly string[] })[] = [
  { id: 'zutat:schmand', name: 'Schmand', group: 'milch', words: ['Schmand'] },
  { id: 'zutat:frischkaese', name: 'Frischkäse', group: 'milch', words: ['Frischkäse'] },
  { id: 'zutat:joghurt', name: 'Joghurt', group: 'milch', words: ['griechischer Joghurt', 'Joghurt'] },
  { id: 'zutat:milch', name: 'Milch', group: 'milch', liquid: true, words: ['Vollmilch', 'Milch'] },
  { id: 'zutat:sahne', name: 'Sahne', group: 'milch', liquid: true, words: ['Schlagsahne', 'Kochsahne', 'Sahne'] },
  { id: 'zutat:sauresahne', name: 'saure Sahne', group: 'milch', words: ['saure Sahne', 'Sauerrahm'] },
  { id: 'zutat:cremefraiche', name: 'Crème fraîche', group: 'milch', words: ['Crème fraîche', 'Creme fraiche', 'Crème fraiche'] },
];

/** ein Baustein oder eine Zutat einer Austauschgruppe – zu ihrer id */
export const swapTargetOf = (id: string): SwapTarget | undefined => sideOf(id) ?? GROUPS.find((g) => g.id === id);

const SWAP_KINDS: readonly SideKind[] = SIDE_KINDS.map((k) => k.kind);

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
  brokkoli: ['Brokkoli', 'Broccoli'],
  paprika: ['Paprikaschoten', 'Paprikaschote', 'Paprika'],
  karotten: ['Karotten', 'Karotte', 'Möhren', 'Möhre'],
  spinat: ['Babyspinat', 'Blattspinat', 'Spinat'],
  tomaten: ['Kirschtomaten', 'Cherrytomaten', 'Tomaten', 'Tomate'],
  zwiebeln: ['rote Zwiebeln', 'rote Zwiebel'],
  gurke: ['Salatgurke', 'Gurke'],
  avocado: ['Avocados', 'Avocado'],
  salat: ['Blattsalat', 'Kopfsalat', 'Salat'],
  tomatensauce: ['Tomatensauce', 'Tomatensoße'],
  sahnesauce: ['Sahnesauce', 'Sahnesoße'],
  salsa: ['Tomatensalsa', 'Salsa'],
  joghurt: ['Joghurt-Dip', 'Joghurtdip'],
  erdnuss: ['Erdnusssauce', 'Erdnuss-Sauce', 'Erdnusssoße'],
  kokoscurry: ['Kokos-Currysauce', 'Kokoscurrysauce'],
  kraeuter: ['frische Kräuter', 'Kräuter'],
  sesam: ['Sesamsaat', 'Sesam'],
  kaese: ['geriebener Käse', 'Reibekäse'],
  feta: ['Feta', 'Hirtenkäse'],
  jalapenos: ['Jalapeños', 'Jalapeño', 'Jalapenos'],
  cashews: ['Cashewkerne', 'Cashews'],
};

/** nie tauschen: meist eine Zutat in etwas anderem – Schmand in der Sauce, Ei in der Panade */
const NEVER: ReadonlySet<string> = new Set(['schmand', 'ei']);

/** passt das Wort, ist es trotzdem kein Baustein: Dosentomaten sind eine Saucenbasis, gemahlener Koriander ein Gewürz */
const EXCEPT: Readonly<Record<string, RegExp>> = {
  tomaten: /passiert|gehackt|st(ü|ue)ckig|dose|konserv|getrocknet|p(ü|ue)ree|polpa/i,
  koriander: /gemahlen|samen|saat|pulver/i,
  kraeuter: /provence|getrocknet/i,
  'zutat:milch': /kokos|kondens/i,
};

const wordsOf = (s: SwapTarget): readonly string[] => WORDS[s.id] ?? GROUPS.find((g) => g.id === s.id)?.words ?? [s.name];
const low = (t: string) => t.toLocaleLowerCase('de-DE');

/**
 * Welcher Baustein ist diese Zutat? Ganzes Wort oder Ende eines Wortes („Basmatireis“), das längste gewinnt. `kinds`:
 * nur diese Stufen (blockHints.ts fragt nur nach Kohlenhydrat und Protein).
 */
export function sideOfIngredient(name: string, custom: readonly string[] = [], kinds: readonly SideKind[] = SWAP_KINDS): Side | undefined {
  return bestMatch(name, kinds.flatMap((kind) => sidesOfKind(kind, custom)));
}

/** Wofür steht diese Zutat beim Tauschen – ein Baustein jeder Stufe oder eine Zutat einer Austauschgruppe (Schmand)? */
export const swapTargetOfIngredient = (name: string, custom: readonly string[] = []): SwapTarget | undefined =>
  bestMatch(name, [...SWAP_KINDS.flatMap((kind) => sidesOfKind(kind, custom)), ...GROUPS]);

/** das längste passende Wort gewinnt – ganzes Wort oder Wortende; Schutzregeln (NEVER, EXCEPT) zuerst */
function bestMatch<T extends SwapTarget>(name: string, targets: readonly T[]): T | undefined {
  const n = low(name.trim());
  let best: { target: T; len: number } | undefined;
  for (const target of targets) {
    if (NEVER.has(target.id) || EXCEPT[target.id]?.test(n)) continue;
    for (const w of wordsOf(target).map(low)) {
      const whole = new RegExp(`(^|[^\\p{L}])${escape(w)}($|[^\\p{L}])`, 'u').test(n);
      const tail = n.endsWith(w) && n.length > w.length;
      if ((whole || tail) && (!best || w.length > best.len)) best = { target, len: w.length };
    }
  }
  return best?.target;
}

// ohne „-“: im u-Modus ist „\-“ außerhalb von […] ein Fehler (Hack-Patty) – und der Bindestrich braucht dort keinen Schutz
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ein Tauschplatz: die Zutat, wie sie im Rezept steht, wofür sie steht, wogegen sie sich tauschen lässt */
export interface SwapSlot { ingredient: Ingredient; side: SwapTarget; options: SwapTarget[]; current?: IngredientSwap }

/**
 * Gemüse gegart oder roh (Julia: „Brokkoli mit Salat tauschen ergibt keinen Sinn“): Brokkoli und Zucchini nur gegart,
 * Salat, Gurke, Avocado nur roh – was beides kann (Paprika, Karotten, Tomaten …), richtet sich nach deinem Rezept.
 */
const COOKED_ONLY: ReadonlySet<string> = new Set(['brokkoli', 'zucchini']);
const RAW_ONLY: ReadonlySet<string> = new Set(['salat', 'gurke', 'avocado']);
type VegUse = 'gar' | 'roh';
const usesOf = (id: string): VegUse[] => (COOKED_ONLY.has(id) ? ['gar'] : RAW_ONLY.has(id) ? ['roh'] : ['gar', 'roh']);
/** geht roh – für den Beilagensalat (sideSalad.ts) */
export const canBeRaw = (id: string): boolean => usesOf(id).includes('roh');

/** Ersetzt in den Schritten: der Name der Zutat und die Wörter, an denen Mashi sie erkannt hat – längste zuerst */
const wordPattern = (ingredient: Ingredient, from?: SwapTarget) =>
  [...new Set([ingredient.name, ...(from ? wordsOf(from) : [])])].sort((a, b) => b.length - a.length).map(escape).join('|');

/** Wie dein Rezept das Gemüse nutzt: gart ein Schritt, der es nennt – gegart; nennen es nur Schritte ohne Garart – roh */
function vegUse(c: RecipeContent, ingredient: Ingredient, from: SwapTarget): VegUse | undefined {
  const re = new RegExp(`(^|[^\\p{L}])(${wordPattern(ingredient, from)})(?![\\p{L}])`, 'iu');
  const named = c.steps.filter((st) => re.test(st.text));
  if (!named.length) return undefined;
  return named.some((st) => methodOf(st.text)) ? 'gar' : 'roh';
}

/**
 * Die Tauschplätze eines Rezepts – an der Fassung ohne Tausch (sonst wäre der Tofu sein eigener Platz). Zur Wahl steht
 * nicht, was schon im Rezept liegt (getauscht oder nicht) – sonst gäbe es die Avocado doppelt.
 */
export function swapSlots(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> = {}, custom: readonly string[] = []): SwapSlot[] {
  const found = c.ingredients.flatMap((ingredient) => {
    if (ingredient.recipeId) return []; // verknüpftes Rezept (die Bolognese) – kein Baustein
    const side = swapTargetOfIngredient(ingredient.name, custom);
    return side ? [{ ingredient, side, current: swaps[ingredient.id] }] : [];
  });
  return found.map(({ ingredient, side, current }) => {
    const taken = new Set(found.filter((x) => x.ingredient.id !== ingredient.id).map((x) => x.current?.side ?? x.side.id));
    const same: SwapTarget[] = side.kind ? sidesOfKind(side.kind, custom) : GROUPS.filter((g) => g.group === side.group);
    // Gemüse: nur, was so genutzt werden kann wie hier (gegart oder roh) – weiß Mashi es nicht, was mit ihm etwas teilt
    const use = side.kind === 'veg' ? vegUse(c, ingredient, side) : undefined;
    const fits = (x: SwapTarget) => side.kind !== 'veg' || (use ? usesOf(x.id).includes(use) : usesOf(x.id).some((u) => usesOf(side.id).includes(u)));
    const options = same.filter((x) => x.id !== side.id && !taken.has(x.id) && fits(x));
    return { ingredient, side, options, ...(current ? { current } : {}) };
  });
}

/** Stufen, deren Tausch die Menge aus dem Rezept behält */
const SAME_AMOUNT: ReadonlySet<SideKind> = new Set(['topping', 'sauce']);

/** Der Tausch, wie er am Rezept gespeichert wird – Name und Menge nach deinem Haushalt */
export function swapFor(sideId: string, household?: Pick<Household, 'sides' | 'sideFood'>): IngredientSwap | undefined {
  const food = GROUPS.find((g) => g.id === sideId);
  if (food) return { side: food.id, name: food.name, same: true };
  const side = sideOf(sideId);
  if (!side) return undefined;
  // Toppings und Saucen behalten die Menge deines Rezepts (Julia): die Baustein-Menge meint „das Topping auf dem Teller“ –
  // aus 50 g Parmesan in der Lasagne würden sonst 160 g Feta
  if (SAME_AMOUNT.has(side.kind)) return { side: side.id, name: foodOf(side, household), same: true };
  return { side: side.id, name: foodOf(side, household), grams: sideGrams(side.id, household), ...(side.unit === 'Stück' ? { unit: 'Stück' as const } : {}) };
}

/**
 * Die Zubereitung des neuen Bausteins, die zum Schritt passt: „Brokkoli im Ofen rösten“ → Zucchini geröstet (20 Min.),
 * nicht ihr Standard „anbraten“. Gesucht unter seinem Standard und seinen Wegen (cookStyle.ts: WAYS; die, die in einer
 * Sauce oder im Nudelwasser mitgaren, hängen am Baukasten-Abend und zählen hier nicht). `ok: false` – keine passt.
 */
const NO_CONTEXT = { sauceSimmers: false, pastaBoils: false } as const;

function prepFor(to: SwapTarget, step: string): { prep?: SidePrep; ok: boolean } {
  // Zutaten ohne eigene Zubereitung (Frischkäse statt Schmand): wie es gart, sagt dein Schritt – nichts zu prüfen
  // die Wege des Bausteins – eigene (cookStyle.ts: WAYS) oder die seiner Garfamilie; ohne die, die in einer Sauce oder im
  // Nudelwasser mitgaren (die hängen am Baukasten-Abend)
  const own = waysOf(to.id, NO_CONTEXT);
  if (!to.prep && !own.length) return { ok: true };
  const method = methodOf(step);
  if (!method) return { prep: to.prep, ok: true };
  const ways: SidePrep[] = [...(to.prep ? [to.prep] : []), ...own];
  const fit = ways.find((w) => methodOf(w.text) === method);
  return fit ? { prep: fit, ok: true } : { prep: to.prep, ok: false };
}

/** Gramm ↔ Milliliter, wenn flüssig gegen fest getauscht wird – EL, TL und Stück bleiben */
const sameUnit = (unit: Unit, liquid: boolean): Unit =>
  liquid ? (unit === 'g' ? 'ml' : unit === 'kg' ? 'l' : unit) : (unit === 'ml' ? 'g' : unit === 'l' ? 'kg' : unit);

/** Rezept mit Tausch und je Zutat die Schritte, die man kurz anschauen sollte (die Garart passt nicht) */
function applySwaps(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> | undefined, custom: readonly string[]): { content: RecipeContent; checks: Record<string, string[]> } | undefined {
  const active = Object.entries(swaps ?? {}).flatMap(([id, s]) => {
    const ingredient = c.ingredients.find((i) => i.id === id);
    const to = swapTargetOf(s.side);
    return ingredient && to ? [{ ingredient, s, to, from: swapTargetOfIngredient(ingredient.name, custom) }] : [];
  });
  if (!active.length) return undefined;
  const byId = new Map(active.map((x) => [x.ingredient.id, x]));
  const ingredients = c.ingredients.map((i) => {
    const x = byId.get(i.id);
    if (!x) return i;
    // der feste Verweis aufs Lebensmittel (foodRef) gehörte zum Hähnchen – sonst rechnete der Tofu mit dessen Nährwerten
    const { foodRef: _ref, ...rest } = i;
    // deine Menge bleibt (Milchprodukte, Toppings, Saucen) – nur bei Milchprodukten wechselt flüssig ↔ fest die Einheit
    // (200 g Schmand → 200 ml Milch); 200 ml Kokos-Currysauce bleiben 200 ml Erdnusssauce
    if (x.s.same) return { ...rest, name: x.s.name, ...(i.unit && x.to.group ? { unit: sameUnit(i.unit, !!x.to.liquid) } : {}) };
    return { ...rest, name: x.s.name, amount: Math.round((x.s.grams ?? 0) * c.servings * 10) / 10, unit: (x.s.unit ?? 'g') as Unit };
  });
  let steps = c.steps;
  // Schritt-id → getauschte Zutat → die Zubereitung, die dort passt (für den Timer)
  const hits = new Map<string, Map<string, SidePrep | undefined>>();
  const checks: Record<string, string[]> = {};
  // Tipps erst zum Schluss anhängen – je Schritt einer („Tipp: Tofu …; Zucchini …“) und nicht vom nächsten Tausch umbenannt
  const tips = new Map<string, string[]>();
  for (const x of active) {
    const re = new RegExp(`(^|[^\\p{L}])(?:(?:der|die|das|den|dem|des)\\s+)?(${wordPattern(x.ingredient, x.from)})(?![\\p{L}])`, 'giu');
    let tipped = false;
    steps = steps.map((st) => {
      const text = st.text.replace(re, (_m, before: string) => `${before}${x.to.name}`);
      if (text === st.text) return st;
      const { prep, ok } = prepFor(x.to, st.text);
      if (!ok) (checks[x.ingredient.id] ??= []).push(text);
      // passt die Garart nicht, weiß Mashi die Zeit nicht – dann bleibt dein Timer
      hits.set(st.id, (hits.get(st.id) ?? new Map()).set(x.ingredient.id, ok ? prep : undefined));
      if (!tipped && prep) tips.set(st.id, [...(tips.get(st.id) ?? []), `${x.to.name} ${prep.text}${prep.minutes ? `, ${prep.minutes} Min.` : ''}`]);
      tipped = true;
      return { ...st, text };
    });
  }
  steps = steps.map((st) => (tips.has(st.id) ? { ...st, text: `${st.text} (Tipp: ${tips.get(st.id)!.join('; ')})` } : st));
  // Der Timer eines Schritts, der nur die getauschte Zutat gart („Reis kochen“, 15 Min.), nimmt die Zeit der Zubereitung,
  // die dort passt – sonst lief die Pasta 15 Min. Brät der Schritt noch anderes mit, bleibt dein Timer.
  steps = steps.map((st) => {
    const hit = hits.get(st.id);
    if (!st.timerMinutes || hit?.size !== 1) return st;
    const [[id, prep]] = hit;
    const others = stepIngredients(st, ingredients).some((i) => i.id !== id);
    return prep?.minutes && !others ? { ...st, timerMinutes: prep.minutes } : st;
  });
  return { content: { ...c, ingredients, steps }, checks };
}

/**
 * Das Rezept mit Tausch: die Zutat wird der neue Baustein (Menge pro Portion × Portionen des Rezepts), in den Schritten
 * steht der neue Name – ein Artikel direkt davor fällt weg, damit es passt („die Hähnchenbrust salzen“ → „Tofu
 * salzen“). Am ersten Schritt, der ihn nennt, ein kurzer Tipp, wie der neue Baustein zubereitet wird – so, wie der
 * Schritt gart (prepFor); ein Timer, der nur ihn gart, nimmt dessen Zeit. Unbekanntes (Baustein gelöscht, Zutat nicht
 * mehr da) bleibt, wie es ist.
 */
export function withSwaps(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> | undefined, custom: readonly string[] = []): RecipeContent {
  return applySwaps(c, swaps, custom)?.content ?? c;
}

/**
 * Die Ampel am Tausch (Julia: „das Rezept checkt das“): je getauschter Zutat die Schritte (so, wie sie nach dem Tausch
 * lauten), deren Garart der neue Baustein nicht kann – „Brokkoli dämpfen“ mit Gurke. Leer: passt.
 */
export function swapChecks(c: RecipeContent, swaps: Readonly<Record<string, IngredientSwap>> | undefined, custom: readonly string[] = []): Record<string, string[]> {
  return applySwaps(c, swaps, custom)?.checks ?? {};
}
