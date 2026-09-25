import type { FoodEntry, FoodKind, FoodTable } from './nutrition/types';
import { toGrams } from './nutrition/units';
import { normalizeName } from './nutrition/localFoods';
import { MY_PRODUCTS_PROVIDER } from './nutrition/myProducts';
import { currentContent } from './recipe';
import { formatAmount, formatUnitAmount } from './scaling';
import type { Ingredient, Recipe, Unit } from './types';
import type { Pantry, PantryItem } from './pantry';

/** Der Wochenplan: eine Liste „Diese Woche“ – ohne feste Tage, passend zu Meal Prep. */
export interface PlanItem {
  recipeId: string;
  servings: number;
}

export interface MealPlan {
  items: PlanItem[];
  /** abgehakte Einträge der Einkaufsliste (ShoppingItem.key) */
  checked: string[];
  /** diese Woche schon gekochte Gerichte (recipeId) – bleiben bis „Neue Woche“ im Plan */
  cooked: string[];
  /** Einkaufsliste: trotz Vorrat ganz kaufen (ShoppingItem.key) – „Doch kaufen“ */
  buy?: string[];
  updatedAt: string;
}

export const emptyPlan = (): MealPlan => ({ items: [], checked: [], cooked: [], updatedAt: new Date(0).toISOString() });

/** Ältere Pläne (vor „Gekocht“) haben kein cooked-Feld – auffüllen statt abstürzen. */
export const normalizePlan = (p: Partial<MealPlan>): MealPlan => ({ ...emptyPlan(), ...p, cooked: p.cooked ?? [] });

/** „Gekocht“ umschalten – nur für Gerichte, die im Plan stehen. */
export function toggleCooked(plan: MealPlan, recipeId: string, cooked = !plan.cooked.includes(recipeId)): MealPlan {
  if (!plan.items.some((i) => i.recipeId === recipeId)) return plan;
  const rest = plan.cooked.filter((id) => id !== recipeId);
  return { ...plan, cooked: cooked ? [...rest, recipeId] : rest };
}

/**
 * Grundvorrat: hat man meist zu Hause. Zählt nicht für Vorschläge und steht nicht
 * auf der Einkaufsliste (einblendbar). Dazu kommen alle „vernachlässigbaren“ Lebensmittel
 * der Tabelle (Salz, Pfeffer, Kräuter, Wasser …).
 */
const PANTRY = new Set([
  'rapsoel', 'olivenoel', 'sesamoel', 'currypulver', 'paprikapulver', 'huehnerbruehe-pulver',
  'gemuesebruehe', 'speisestaerke', 'mehl', 'apfelessig', 'reisessig',
]);

/**
 * „Immer im Haus“: was du selbst als Vorrat im Schrank führst (Pasta, Reis, Saucen …). Anders als der
 * Grundvorrat oben zählt es bei Vorschlägen weiter mit – es landet nur auf der Einkaufsliste unter
 * „Basics“ und wird nie als „fehlt“ gemeldet. Einstellbar in der Speisekammer (Pantry.basics).
 */
export const DEFAULT_BASICS = ['Pasta', 'Reis', 'Gochujang', 'Miso', 'Sesam', 'Sojasauce'];

/** Schlüssel der „Immer im Haus“-Zutaten (fehlt die Liste: die Vorbelegung). */
export function basicsKeys(pantry: Pick<Pantry, 'basics'> | undefined, table: FoodTable): Set<string> {
  const names = pantry?.basics ?? DEFAULT_BASICS;
  return new Set(names.map((name) => resolveIngredient({ id: name, name }, 1, table)?.key).filter((k): k is string => !!k));
}

/**
 * Wie wichtig eine gemeinsame Zutat für Meal Prep ist. Hähnchen, Pasta, Milchprodukte,
 * Eier und Brot bestimmen den Einkauf – Gemüse und Obst sind eher austauschbar.
 * Alles ohne feste Art (Soßen, Pasten, Hülsenfrüchte …) zählt normal.
 */
export const KIND_WEIGHT: Record<FoodKind, number> = {
  protein: 3, staple: 3, dairy: 3, egg: 3, bread: 3, vegetable: 0.3, fruit: 0.3,
};

/**
 * Für Zutaten, die die Tabelle nicht kennt (oder ohne Art): grob am Namen erkennen.
 * Nur fürs Gewichten – Nährwerte werden daraus nie abgeleitet.
 */
const KIND_BY_NAME: [FoodKind, RegExp][] = [
  ['bread', /brot|brötchen|toast|wrap|tortilla|fladen|baguette|pita|bagel/],
  // „hack“ nur am Wortende (Rinderhack, Hackfleisch) – nicht „gehackte Mandeln“
  // Nicht: Brühe, Fond, Saucen, Konserven – „Rinderbrühe“ und „Fischsauce“ sind kein Frischfleisch; Thunfisch meist aus der Dose
  ['protein', /^(?!.*(brühe|fond|sauce|soße|dose|konserve|pulver|würze|gewürz|paste|chips|thunfisch(?!steak|filet)))(?=.*(hähnchen|huhn|hühner|pute|rind|schwein|lachs|fisch|garnele|shrimp|tofu|tempeh|hack(fleisch)?\b|steak|filet))/],
  // „reis“ nur am Wortanfang/-ende (Basmatireis, Reisnudeln) – nicht „Preiselbeeren“
  ['staple', /nudel|pasta|spaghetti|penne|(^|[\s-])reis|reis($|[\s-])|kartoffel|couscous|bulgur|quinoa|gnocchi|spätzle/],
  ['dairy', /^(?!.*(kondensmilch|milchpulver|kokos|hafer|soja|mandel))(?=.*(käse|joghurt|quark|milch|sahne|skyr|feta|ricotta|mascarpone))/],
  ['egg', /(^|\s)eier?(\s|$)/],
  // Frisches Obst und Gemüse – aber nicht aus Dose, Glas oder Tube (Tomatenmark, Apfelmus, Orangensaft …)
  ['vegetable', /^(?!.*(mark|passiert|gehackt|stückig|dose|getrocknet|eingelegt|pesto|soße|sauce|brühe|chips|kerne|samen))(?=.*(zucchini|brokkoli|blumenkohl|aubergine|lauch|porree|sellerie|champignon|pilz|kohl|salat|rucola|radieschen|rettich|tomate|gurke|möhre|karotte|paprika|spinat|mangold|kürbis|fenchel|spargel|rote bete|zuckerschote|grüne bohnen))/],
  ['fruit', /^(?!.*(saft|mus\b|konfitüre|marmelade|essig|getrocknet|dose|sirup|preiselbeer))(?=.*(apfel|äpfel|birne|beere|kirsche|traube|orange|mandarine|clementine|zitrone|limette|pfirsich|nektarine|pflaume|aprikose|melone|ananas|kiwi|granatapfel|feige))/],
];

function kindFor(food: FoodEntry | undefined, name: string): FoodKind | undefined {
  if (food?.kind) return food.kind;
  // Die Tabelle kennt es und gibt ihm bewusst keine Art (Kokosmilch, gehackte Tomaten, Brühe) → so lassen.
  // Nur Unbekanntes und eigene Produkte ohne ersetzten Eintrag werden am Namen eingeordnet.
  if (food && food.ref.provider !== MY_PRODUCTS_PROVIDER) return undefined;
  const n = normalizeName(name);
  return KIND_BY_NAME.find(([, re]) => re.test(n))?.[0];
}

export interface Resolved {
  /** gleiche Lebensmittel → gleicher Schlüssel, auch bei verschiedenen Namen („Pasta“/„Nudeln“) */
  key: string;
  name: string;
  pantry: boolean;
  /** Wichtigkeit für Vorschläge (siehe KIND_WEIGHT), 1 = normal */
  weight: number;
  /** Art (Gemüse, Milchprodukt …) – für Gruppen in Einkaufsliste und Speisekammer */
  kind?: FoodKind;
  /** das zugeordnete Lebensmittel (für Umrechnungen), fehlt bei unbekannten Zutaten */
  food?: FoodEntry;
  grams?: number;
  amount?: number;
  unit?: Unit;
}

/**
 * Eine Zutat einordnen: welches Lebensmittel (Schlüssel), Grundvorrat oder nicht, wie wichtig,
 * wie viel Gramm. Gemeinsam genutzt von Vorschlägen, Einkaufsliste und Speisekammer –
 * so gilt „Nudeln“ = „Pasta“ überall gleich.
 */
export function resolveIngredient(ing: Ingredient, factor: number, table: FoodTable): Resolved | null {
  if (ing.optional) return null;
  const match = ing.foodRef ? { food: table.byRef(ing.foodRef)! } : table.matchName(ing.name);
  const food = match?.food;
  const amount = ing.amount !== undefined ? ing.amount * factor : undefined;
  // Gramm und Kilo lassen sich auch ohne bekanntes Lebensmittel zusammenzählen
  const grams = amount === undefined ? undefined
    : food ? toGrams(amount, ing.unit, food)?.grams
    : ing.unit === 'g' ? amount : ing.unit === 'kg' ? amount * 1000 : undefined;
  const kind = kindFor(food, ing.name);
  return {
    key: food ? `food:${food.ref.foodId}` : `name:${normalizeName(ing.name)}`,
    name: food?.name ?? ing.name,
    pantry: !!food && (!!food.negligible || PANTRY.has(food.ref.foodId)),
    weight: kind ? KIND_WEIGHT[kind] : 1,
    kind,
    food,
    grams,
    amount,
    unit: ing.unit,
  };
}

function resolveRecipe(r: Recipe, servings: number, table: FoodTable): Resolved[] {
  const c = currentContent(r);
  const factor = servings / c.servings;
  return c.ingredients.map((i) => resolveIngredient(i, factor, table)).filter((x): x is Resolved => x !== null);
}

/** Wie viel von einem Vorrat eine Zutat braucht – in der Einheit des Vorrats. undefined = nicht umrechenbar. */
export function needIn(item: Pick<PantryItem, 'unit'>, need: Resolved): number | undefined {
  if (need.amount === undefined) return undefined;
  if (item.unit === 'Stück') {
    // Vom Bon kommt Dosenware als „Stück“ – eine Dose im Rezept ist ein Stück im Vorrat
    if (need.unit === 'Stück' || need.unit === 'Dose' || need.unit === undefined) return need.amount;
    const piece = need.food?.portions?.Stück;
    return need.grams !== undefined && piece ? need.grams / piece : undefined;
  }
  // g und ml: gleich behandelt (für Joghurt, Milch & Co. nah genug)
  return need.grams ?? (need.unit === 'ml' ? need.amount : undefined);
}

// ── Vorschläge ─────────────────────────────────────────────────────

export interface Suggestion {
  recipe: Recipe;
  score: number;
  /** gemeinsame Zutaten, wichtigste zuerst */
  shared: string[];
  /** bald ablaufende Vorräte, die das Rezept aufbraucht */
  useUp: string[];
}

/**
 * Welche Rezepte passen zu dem, was schon geplant ist? Je mehr gemeinsame Zutaten
 * (ohne Grundvorrat), desto besser – gewichtet nach Menge (600 g Hähnchen zählen mehr
 * als eine Zwiebel) UND nach Art (Hähnchen, Pasta, Milchprodukte ×3, Gemüse und Obst ×0,3).
 * Ein kleiner Bonus je gemeinsamer Zutat, damit auch Kleinkram zählt.
 */
/** Bald Ablaufendes aus der Speisekammer zählt wie 400 g einer normalen gemeinsamen Zutat */
const USE_UP_POINTS = 400;

/**
 * @param useUp Schlüssel bald ablaufender Vorräte – Rezepte, die sie aufbrauchen, werden bevorzugt
 */
export function suggestRecipes(plan: MealPlan, all: Recipe[], table: FoodTable, limit = 5, useUp: ReadonlySet<string> = new Set()): Suggestion[] {
  const planned = new Set(plan.items.map((i) => i.recipeId));
  if (!planned.size) return [];

  const have = new Map<string, number>(); // Schlüssel → Gramm (oder 1 ohne Gewicht)
  for (const item of plan.items) {
    const r = all.find((x) => x.id === item.recipeId);
    if (!r) continue;
    for (const x of resolveRecipe(r, item.servings, table)) {
      if (!x.pantry) have.set(x.key, (have.get(x.key) ?? 0) + (x.grams ?? 1));
    }
  }

  return all
    .filter((r) => !planned.has(r.id) && !r.archivedAt && r.status !== 'ki_entwurf')
    .map((r) => {
      const byKey = new Map<string, { name: string; grams: number; weight: number }>();
      const usedUp = new Map<string, string>();
      for (const x of resolveRecipe(r, currentContent(r).servings, table)) {
        if (!x.pantry && useUp.has(x.key)) usedUp.set(x.key, x.name);
        if (x.pantry || !have.has(x.key)) continue;
        const prev = byKey.get(x.key);
        byKey.set(x.key, { name: x.name, grams: (prev?.grams ?? 0) + (x.grams ?? 1), weight: x.weight });
      }
      const sharedList = [...byKey.entries()]
        .map(([key, v]) => ({ name: v.name, points: v.weight * (Math.min(v.grams, have.get(key)!) + 25) }))
        .sort((a, b) => b.points - a.points);
      const score = sharedList.reduce((s, x) => s + x.points, 0) + usedUp.size * USE_UP_POINTS;
      return { recipe: r, score, shared: sharedList.map((x) => x.name), useUp: [...usedUp.values()] };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Einkaufsliste ──────────────────────────────────────────────────

export interface ShoppingItem {
  /** stabil, damit Haken erhalten bleiben, wenn sich Mengen ändern */
  key: string;
  name: string;
  /** z. B. „950 g“, „3 Stück“, „2 Stück + 150 g“ */
  quantity: string;
  pantry: boolean;
  /** aus welchen Rezepten */
  from: string[];
  /** Art des Lebensmittels – die Liste wird danach gruppiert wie im Laden */
  kind?: FoodKind;
  /** was davon in der Speisekammer ist, z. B. „500 g“ oder „vorhanden“ */
  have?: string;
  /** reicht der Vorrat ganz – dann „Hast du schon“ statt einkaufen */
  covered?: boolean;
}

/**
 * Fasst alle Zutaten der geplanten Rezepte zusammen (auf die geplanten Portionen umgerechnet).
 * Gleiche Einheit → addieren. Verschiedene Einheiten → in Gramm, wo möglich.
 * Was sich nicht umrechnen lässt, steht getrennt da – nie falsch zusammengezählt.
 * Schon Gekochtes fällt weg. Mit Speisekammer: Vorrat wird abgezogen (600 g geplant, 500 g da →
 * „100 g“ mit „500 g vorrätig“); reicht er ganz, ist der Eintrag „covered“.
 */
export function buildShoppingList(plan: MealPlan, all: Recipe[], table: FoodTable, pantry?: Pantry): ShoppingItem[] {
  const groups = new Map<string, { name: string; pantry: boolean; kind?: FoodKind; parts: Resolved[]; from: Set<string> }>();
  for (const item of plan.items) {
    if (plan.cooked.includes(item.recipeId)) continue; // schon gekocht → nichts mehr einzukaufen
    const r = all.find((x) => x.id === item.recipeId);
    if (!r) continue;
    const title = currentContent(r).title;
    for (const x of resolveRecipe(r, item.servings, table)) {
      const g = groups.get(x.key) ?? { name: x.name, pantry: x.pantry, kind: x.kind, parts: [], from: new Set<string>() };
      g.parts.push(x);
      g.from.add(title);
      groups.set(x.key, g);
    }
  }

  // „Immer im Haus“ → auf der Liste unter „Basics“
  const basics = basicsKeys(pantry, table);
  for (const [key, g] of groups) if (basics.has(key)) g.pantry = true;

  const stock = (pantry?.items ?? [])
    .filter((it) => (it.amount ?? 1) > 0)
    .map((it) => ({ it, key: resolveIngredient({ id: it.id, name: it.name }, 1, table)?.key }));

  return [...groups.entries()]
    .map(([key, g]): ShoppingItem => {
      const base: ShoppingItem = { key, name: g.name, quantity: quantityOf(g.parts), pantry: g.pantry, from: [...g.from], ...(g.kind ? { kind: g.kind } : {}) };
      const mine = stock.filter((s) => s.key === key).map((s) => s.it);
      if (!mine.length) return base;
      // „Doch kaufen“: volle Menge, der Vorrat steht nur als Hinweis dabei
      if (plan.buy?.includes(key)) return { ...base, have: mine.map(stockLabel).join(' + ') };
      const { open, used } = coverFromStock(mine, g.parts);
      const have = used.map(stockLabel).join(' + ') || 'vorhanden';
      if (open < 0.02) return { ...base, have, covered: true };
      return { ...base, have, ...(open < 1 ? { quantity: quantityOf(scaleParts(g.parts, open)) } : {}) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Wie viel des Bedarfs der Vorrat deckt: open = noch offener Anteil (1 = nichts da, 0 = reicht).
 * Vorräte ohne Menge zählen nicht (Hinweis „vorhanden“, einkaufen musst du selbst entscheiden) –
 * außer das Rezept nennt selbst keine Menge (Salz, „etwas Petersilie“).
 */
function coverFromStock(items: PantryItem[], parts: Resolved[]): { open: number; used: PantryItem[] } {
  const measured = parts.filter((p) => p.amount !== undefined);
  if (!measured.length) return { open: 0, used: items };
  let open = 1;
  const used: PantryItem[] = [];
  for (const it of items) {
    if (open < 1e-6) break;
    used.push(it);
    if (it.amount === undefined) continue;
    const needs = measured.map((p) => needIn(it, p));
    // nicht umrechenbar (z. B. „1 Stück“ gegen „200 g“ ohne bekanntes Stückgewicht): gilt als vorhanden –
    // wie beim Kochen, wo dafür „Noch da?“ gefragt wird
    if (needs.some((n) => n === undefined)) {
      open = 0;
      break;
    }
    const full = needs.reduce((s: number, n) => s + n!, 0);
    if (full <= 0) continue;
    open -= Math.min(it.amount, full * open) / full;
  }
  return { open: Math.max(0, open), used };
}

const scaleParts = (parts: Resolved[], f: number): Resolved[] => parts.map((p) => ({
  ...p, ...(p.amount !== undefined ? { amount: p.amount * f } : {}), ...(p.grams !== undefined ? { grams: p.grams * f } : {}),
}));

const stockLabel = (it: PantryItem) => (it.amount === undefined
  ? 'vorhanden'
  : `${formatAmount(it.amount, it.unit === 'Stück' ? 'Stück' : 'g')} ${it.unit ?? ''}`.trim() + (it.frozenAt ? ' (gefroren)' : ''));

function quantityOf(parts: Resolved[]): string {
  const withAmount = parts.filter((p) => p.amount !== undefined);
  if (!withAmount.length) return '';
  const units = new Set(withAmount.map((p) => p.unit ?? ''));
  // Alle in derselben Einheit → einfach addieren („3 Stück“, „2 EL“)
  if (units.size === 1) {
    const unit = withAmount[0].unit;
    const sum = withAmount.reduce((s, p) => s + p.amount!, 0);
    return formatUnitAmount(sum, unit);
  }
  // Gemischt → umrechenbare in Gramm, Rest einzeln
  const grams = withAmount.filter((p) => p.grams !== undefined).reduce((s, p) => s + p.grams!, 0);
  const rest = withAmount.filter((p) => p.grams === undefined).map((p) => formatUnitAmount(p.amount!, p.unit));
  return [...(grams ? [`${formatAmount(grams, 'g')} g`] : []), ...rest].join(' + ');
}
