import type { Unit } from '../types';
import { normalizeName } from './localFoods';
import type { FoodEntry, FoodTable } from './types';

/**
 * „Ohne Nährwerte“ (in der App: „Gewürze“): Gewürze & Co., die du nicht mitzählen willst – ein TL Paprikapulver ist
 * nicht der Rede wert. Einstellbar in der Speisekammer (Pantry.noNutrition); fehlt die Liste,
 * gilt diese Vorbelegung.
 */
export const DEFAULT_NO_NUTRITION = ['Paprikapulver', 'Currypulver', 'Kreuzkümmel', 'Zimt', 'Chiliflocken', 'Kurkuma', 'Oregano', 'Muskat'];
/** „Gewürze“ – nie eingestellt (keine Liste) = die Vorbelegung, eine leere Liste bleibt leer */
export const zeroOf = (pantry: { noNutrition?: string[] } | undefined): string[] => pantry?.noNutrition ?? DEFAULT_NO_NUTRITION;

const PROVIDER = 'mashi-ohne-naehrwerte';
/** die getrocknete Form eines Lebensmittels, das es auch frisch gibt („Petersilie getrocknet“ neben dem Bund) */
const DRIED_PROVIDER = 'mashi-getrocknet';

const words = (alternatives: string) => new RegExp(`(^|[^\\p{L}])(${alternatives})(?=$|[^\\p{L}])`, 'giu');
const DRIED = words('getrocknet|getrocknete|getrockneter|getrocknetes|getr\\.|gerebelt|gerebelte|gerebelter|gerebeltes|gemahlen|gemahlene|gemahlener|gemahlenes');
const FRESH = words('frisch|frische|frischer|frisches');
const has = (re: RegExp, name: string) => { re.lastIndex = 0; return re.test(name); };

/** „getrocknete Petersilie“, „Petersilie (getr.)“, „Oregano, gerebelt“ – VOR normalizeName prüfen, das streicht Klammern und alles nach dem Komma */
export const isDried = (name: string) => has(DRIED, name);
/** ausdrücklich frisch („frische Petersilie“) */
export const isFresh = (name: string) => has(FRESH, name);
/** das Lebensmittel ohne Form: „getrocknete Petersilie“ → „petersilie“ */
const baseOf = (name: string) => normalizeName(name.replace(DRIED, '$1 '));
/** so heißt die getrocknete Form: „Petersilie“ → „Petersilie getrocknet“ (steht „getrocknet“ schon drin, bleibt es) */
const driedName = (name: string) => (isDried(name) ? name.trim() : `${name.trim()} getrocknet`);

/**
 * Was es frisch UND getrocknet gibt – nur dann bekommt ein Gewürz eine eigene getrocknete Form. Paprikapulver,
 * Zimt & Co. SIND das Gewürz; da bleibt alles wie bisher.
 */
const HERBS = new Set(['petersilie', 'basilikum', 'schnittlauch', 'dill', 'koriander', 'thymian', 'rosmarin', 'oregano', 'minze',
  'salbei', 'majoran', 'estragon', 'kerbel', 'liebstöckel', 'bärlauch', 'zitronengras', 'ingwer', 'chili']);
const isHerb = (base: string) => base.split(' ').some((w) => HERBS.has(w));

/** Getrocknete Kräuter wiegen wenig – ein TL sind eher 1 g als 5 g (sonst wäre der Gewürz-Preis im Rezept viel zu hoch) */
const DRIED_PORTIONS: Partial<Record<Unit, number>> = { TL: 1, EL: 3, Prise: 0.2 };
const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

interface Spice {
  /** die frische Form (Bund, Tabelle oder eigenes Produkt) – nur dann gibt es eine eigene getrocknete */
  fresh?: FoodEntry;
  dried?: FoodEntry;
}

/**
 * Deine Gewürze in der Tabelle (Julia: „getrocknete Petersilie bei Gewürze, Bund Petersilie bei Lebensmittel –
 * momentan überschreibt es gleichnamige“):
 * - Gibt es das Gewürz auch frisch (Petersilie, Basilikum …), bekommt die getrocknete Form einen eigenen Eintrag –
 *   „Petersilie“ bleibt der Bund, „getrocknete Petersilie“ ist das Gewürz. Welche ein Rezept nimmt: matchIngredient.
 * - Sonst wie bisher: das Gewürz ist der Eintrag der Tabelle (Kreuzkümmel) – Schlüssel bleiben gleich.
 * @param zero für die Nährwerte: Gewürze zählen nicht mit (wie Salz) – für Schlüssel, Preise und Vorrat nicht
 * @param stock Namen im Vorrat – „frisch im Haus“ (Julia: dann lieber die frische)
 */
export function withSpices(base: FoodTable, names: readonly string[], { zero = false, stock = [] }: { zero?: boolean; stock?: readonly string[] } = {}): FoodTable {
  if (!names.length) return base;
  const mark = (food: FoodEntry): FoodEntry => ({ ...food, spice: true, ...(zero ? { negligible: true, userZero: true } : {}) });

  const spices = new Map<string, Spice>();
  for (const z of names) {
    const b = baseOf(z);
    if (!b || spices.has(b)) continue;
    const m = isHerb(b) ? base.matchName(b) : undefined;
    const fresh = m?.quality === 'exact' && !m.food.negligible ? m.food : undefined;
    if (!fresh) { spices.set(b, {}); continue; }
    const name = driedName(z);
    // eigenes Produkt für die getrocknete (Packung, Preis) – sonst ein eigener Eintrag
    const own = base.matchName(name);
    const product = own?.quality === 'exact' && own.food.ref.foodId !== fresh.ref.foodId && normalizeName(own.food.name) === normalizeName(name);
    const dried = product ? own.food
      : { ref: { provider: DRIED_PROVIDER, foodId: normalizeName(name) }, name, per100g: ZERO, portions: DRIED_PORTIONS };
    spices.set(b, { fresh, dried: mark(dried) });
  }

  // Gewürze ohne frische Form: wie bisher – die Namen und was sie in der Tabelle treffen (Oregano → ital. Kräuter)
  const plain = names.filter((z) => !spices.get(baseOf(z))?.dried);
  const listed = new Set(plain.map(normalizeName));
  const ids = new Set(plain.map((n) => base.matchName(n)?.food.ref.foodId).filter((x): x is string => !!x));
  const driedById = new Map([...spices.values()].flatMap((s) => (s.dried ? [[`${s.dried.ref.provider}|${s.dried.ref.foodId}`, s.dried] as const] : [])));
  const inStock = new Set(stock.filter((n) => !isDried(n)).map(baseOf).filter((b) => spices.get(b)?.dried));

  const seen = new Map<string, ReturnType<FoodTable['matchName']>>();
  const match = (name: string): ReturnType<FoodTable['matchName']> => {
    const dried = spices.get(baseOf(name))?.dried;
    // „Petersilie“ = der Bund, „getrocknete Petersilie“ = das Gewürz
    if (dried) return isDried(name) ? { food: dried, quality: 'exact' } : base.matchName(name);
    const m = base.matchName(name);
    const own = listed.has(normalizeName(name));
    if (m && (own || ids.has(m.food.ref.foodId))) return { ...m, food: mark(m.food) };
    // kennt die Tabelle nicht: für die Nährwerte erledigt statt „nicht gefunden“ – Schlüssel bleiben „name:…“
    if (!m && own && zero) {
      return { food: mark({ ref: { provider: PROVIDER, foodId: normalizeName(name) }, name, per100g: ZERO }), quality: 'exact' };
    }
    return m;
  };

  return {
    byRef(ref) {
      const dried = driedById.get(`${ref.provider}|${ref.foodId}`);
      if (dried) return dried;
      const f = base.byRef(ref);
      return f && ids.has(f.ref.foodId) ? mark(f) : f;
    },
    matchName(name) {
      if (!seen.has(name)) seen.set(name, match(name));
      return seen.get(name);
    },
    driedOf: (name) => spices.get(baseOf(name))?.dried,
    freshInStock: (name) => inStock.has(baseOf(name)),
    isSpice: (name) => listed.has(normalizeName(name)) || (!!spices.get(baseOf(name))?.dried && isDried(name)),
  };
}

/**
 * Wie ein Eintrag deiner Gewürze in Mashi heißt: gibt es ihn auch frisch, die getrocknete Form („Petersilie“ →
 * „Petersilie getrocknet“) – sonst wie gespeichert. Damit treffen alle Vergleiche über den Namen das Gewürz, nie den Bund.
 */
export const spiceName = (name: string, table: FoodTable): string => table.driedOf?.(name)?.name ?? name;

/** ein Kraut, das es auch frisch gibt, in seiner frischen Form („Petersilie“, nicht „Petersilie getrocknet“) */
export const isFreshHerb = (name: string) => isHerb(baseOf(name)) && !isDried(name);

/**
 * Tabelle, in der deine Gewürze „nicht mitgerechnet“ werden (wie Salz). Kennt die Tabelle eine
 * Zutat gar nicht, gilt sie trotzdem als erledigt statt als „nicht gefunden“.
 */
export function withoutNutrition(base: FoodTable, names: string[], stock: readonly string[] = []): FoodTable {
  return withSpices(base, names, { zero: true, stock });
}

/** Kleine Mengen: getrocknet (Julia: „bei 1 TL oder so kleinen Mengen wird getrocknet verwendet“) */
const SMALL: ReadonlySet<Unit> = new Set<Unit>(['TL', 'Prise']);

/**
 * Welche Form nimmt ein Rezept, wenn es ein Gewürz auch frisch gibt? (Julia) „getrocknet“ im Namen → getrocknet;
 * „frisch“ im Namen oder frische im Vorrat → frisch; sonst TL und Prise getrocknet, alles andere (EL, Bund,
 * Handvoll, Gramm) frisch. Ohne Gewürz-Tabelle oder ohne frische Form: wie table.matchName.
 */
export function matchIngredient(table: FoodTable, ing: { name: string; unit?: Unit }): ReturnType<FoodTable['matchName']> {
  const m = table.matchName(ing.name);
  const dried = table.driedOf?.(ing.name);
  if (!dried || m?.food === dried || isFresh(ing.name) || table.freshInStock?.(ing.name)) return m;
  return ing.unit && SMALL.has(ing.unit) ? { food: dried, quality: 'exact' } : m;
}
