import { normalizeName } from './localFoods';
import { fatGroupOf, fatLevel, sameLevel } from './fatLevels';
import { averageNutrients } from './variants';
import type { FoodEntry, FoodTable, Nutrients } from './types';

/**
 * „Meine Produkte“: Lebensmittel, die du immer in einer bestimmten Sorte kaufst.
 * Ein Produkt ERSETZT beim Rechnen allgemeine Einträge der Lebensmitteltabelle –
 * z. B. rechnet jede Milch (Vollmilch, fettarm, Magermilch) mit deiner 0,1-%-Milch.
 *
 * Die Rezepte bleiben dabei unverändert: Wechselst du die Marke, änderst du nur
 * das Produkt, und alle Rezepte rechnen neu.
 *
 * Die Liste ist persönlich und liegt deshalb in deiner Datenbank, nicht im Code.
 */
export interface MyProduct {
  id: string;
  /** wie auf der Packung, z. B. „Milch 0,1 % (Hausmarke)“ */
  name: string;
  /** IDs aus der allgemeinen Tabelle, die dieses Produkt ersetzt, z. B. ['milch', 'magermilch'] */
  replaces: string[];
  /**
   * Zutatennamen, für die dieses Produkt gilt – für Lebensmittel, die die allgemeine Tabelle
   * gar nicht kennt (z. B. „kimchi“). Normalisiert gespeichert (siehe normalizeName).
   */
  names?: string[];
  /** Werte vom Etikett, pro 100 g bzw. 100 ml */
  per100g: Nutrients;
  /** Packungsgröße, z. B. 125 g – füllt beim Kassenbon die Menge je Stück aus */
  packageAmount?: number;
  packageUnit?: 'g' | 'ml' | 'Stück';
  /** weitere Packungsgrößen derselben Sorte (Julia: Hähnchen gibt es in mehreren Größen) – gleiche Einheit */
  packageSizes?: number[];
  /** Preis je Packung in Euro (von Hand; Preise vom Kassenbon kommen automatisch) */
  packagePrice?: number;
  /** Barcode (EAN), falls per Scan angelegt – erkennt das Produkt beim nächsten Scan wieder */
  ean?: string;
  /** hält ab Kauf so viele Tage (von dir) – leer = Mashi schätzt */
  shelfDays?: number;
  /**
   * Marke („K-Classic“, „Milbona“) – optional. Früher stand sie in Klammern im Namen;
   * solche Namen werden beim Anzeigen getrennt (siehe splitBrand), gespeichert erst beim nächsten Bearbeiten.
   */
  brand?: string;
  /** Zusatz zur Sorte (Julia: „leicht“ beim Rinderhack) – steht neben der Marke, auch ohne Marke */
  detail?: string;
  /**
   * Ausnahmen: Schreibweisen der ersetzten Einträge, für die dieses Produkt NICHT gilt
   * (normalisiert, z. B. „vollmilch“ – deine 0,1-%-Milch soll nicht für Vollmilch rechnen).
   */
  excludes?: string[];
  /**
   * Favorit unter mehreren Sorten derselben Zutat (★): Rezepte rechnen dann mit dieser Sorte statt
   * mit dem Durchschnitt, und liegt sie im Vorrat, nimmt Mashi sie beim Planen ohne Nachfrage.
   */
  favorite?: boolean;
  updatedAt: string;
}

export const MY_PRODUCTS_PROVIDER = 'mashi-meine-produkte';

/**
 * „Pesto verde (K-Classic)“ → Name „Pesto verde“ + Marke „K-Classic“.
 * Nur, wenn die Klammer nach einer Marke aussieht: großer Anfangsbuchstabe, keine Zahlen,
 * kein „z. B.“ – „Joghurt (fettarm)“ oder „Milch (1,5 %)“ bleiben, wie sie sind.
 */
export function splitBrand(name: string): { name: string; brand?: string } {
  const m = name.match(/^(.*\S)\s*\(([^()]+)\)\s*$/u);
  if (!m) return { name };
  const brand = m[2].trim();
  if (!/^\p{Lu}/u.test(brand) || /[\d%]/.test(brand) || brand.length > 25 || /^(z\.\s?B|ca\.|bzw)/i.test(brand)) return { name };
  return { name: m[1], brand };
}

/** Marke eines Produkts – eingetragen oder (bei älteren) aus dem Namen */
export const brandOf = (p: Pick<MyProduct, 'name' | 'brand'>): string | undefined => p.brand || splitBrand(p.name).brand;
/** Name ohne Marke */
export const nameOf = (p: Pick<MyProduct, 'name' | 'brand'>): string => (p.brand ? p.name : splitBrand(p.name).name);
/**
 * Was bei mehreren Sorten einer Zutat für alle gilt – nur gemeinsam einstellbar: der Name (die Sorten
 * unterscheiden sich durch die Marke), „gilt für“ (ersetzte Einträge, weitere Namen, Ausnahmen) und
 * wie lange es ab Kauf hält – Milch hält gleich lang, egal von welcher Marke.
 */
export interface SharedMatch { name: string; replaces: string[]; names: string[]; excludes: string[]; shelfDays?: number }

/**
 * Das Gemeinsame einer Sortengruppe. Weichen alte Sorten voneinander ab: Name vom Favoriten (sonst der
 * ersten), ersetzte Einträge und Namen zusammengelegt (nichts, was schon erkannt wurde, fällt weg),
 * Ausnahmen nur, wo alle Sorten sie haben.
 */
export function sharedOf(ps: readonly MyProduct[]): SharedMatch {
  const first = ps.find((p) => p.favorite) ?? ps[0];
  const uniq = (xs: string[]) => [...new Set(xs)];
  // vom Favoriten, sonst von der ersten Sorte, die eine hat – nichts Eingetragenes geht verloren
  const shelfDays = first?.shelfDays ?? ps.find((p) => p.shelfDays)?.shelfDays;
  return {
    name: first ? nameOf(first) : '',
    replaces: uniq(ps.flatMap((p) => p.replaces)),
    names: uniq(ps.flatMap((p) => p.names ?? [])),
    excludes: (first?.excludes ?? []).filter((x) => ps.every((p) => p.excludes?.includes(x))),
    ...(shelfDays ? { shelfDays } : {}),
  };
}

/** Das Gemeinsame auf eine Sorte schreiben – die Marke bleibt; steckte sie im Namen („Milch (Weihenstephan)“), kommt sie ins Markenfeld */
export function withShared(p: MyProduct, s: SharedMatch, now = new Date().toISOString()): MyProduct {
  const brand = brandOf(p);
  const { names: _n, excludes: _e, shelfDays: _d, ...rest } = p;
  return {
    ...rest, name: s.name, ...(brand ? { brand } : {}), replaces: s.replaces,
    ...(s.names.length ? { names: s.names } : {}), ...(s.excludes.length ? { excludes: s.excludes } : {}),
    ...(s.shelfDays ? { shelfDays: s.shelfDays } : {}),
    updatedAt: now,
  };
}

/** Alle Packungsgrößen einer Sorte – die erste ist die übliche (packageAmount) */
export const packSizesOf = (p: Pick<MyProduct, 'packageAmount' | 'packageSizes'>): number[] =>
  [...new Set([p.packageAmount, ...(p.packageSizes ?? [])].filter((n): n is number => !!n && n > 0))];

/** Für Listen und Auswahl: „Pesto verde · K-Classic“, „Rinderhack · leicht · K-Classic“ */
export const productLabel = (p: Pick<MyProduct, 'name' | 'brand' | 'detail'>): string =>
  [nameOf(p), p.detail, brandOf(p)].filter(Boolean).join(' · ');

/** Was eine Sorte von den anderen unterscheidet – Zusatz und Marke („leicht · K-Classic“) */
export const sortTags = (p: Pick<MyProduct, 'name' | 'brand' | 'detail'>): string[] => [p.detail, brandOf(p)].filter((x): x is string => !!x);

/** 1 Glas = Packungsgröße des Produkts (in g; ml über die Dichte des ersetzten Eintrags) */
function glassOf(p: MyProduct, replaced?: FoodEntry): number | undefined {
  if (!p.packageAmount) return undefined;
  if (p.packageUnit === 'g' || p.packageUnit === undefined) return p.packageAmount;
  if (p.packageUnit === 'ml') return p.packageAmount * (replaced?.density ?? 1);
  return undefined;
}

/**
 * 1 Stück = eine Packung (Milch 1000 ml, Mozzarella 125 g, Joghurt 500 g) – damit „3 Stück“ im Vorrat
 * gegen „250 ml“ im Rezept rechnet. Kennt die Tabelle ein eigenes Stückgewicht (Paprika 150 g), bleibt das:
 * ein 500-g-Netz Paprika heißt nicht, dass eine Paprika 500 g wiegt.
 */
function pieceOf(p: MyProduct, replaced?: FoodEntry): number | undefined {
  return replaced?.portions?.Stück ? undefined : glassOf(p, replaced);
}

/** Ein Produkt als Tabelleneintrag. Umrechnungen (Dichte, Stückgewicht) erbt es vom ersetzten Eintrag. */
function asEntry(p: MyProduct, replaced?: FoodEntry): FoodEntry {
  // „1 Glas = Packung“ nur, wo es wirklich ein Glas ist (Pesto, Senf) oder die Tabelle es nicht kennt –
  // sonst hielte offener Joghurt „wie ein Glas“ 14 statt 3 Tage (siehe openedDaysOf)
  const glass = replaced && !replaced.portions?.Glas ? undefined : glassOf(p, replaced);
  const piece = pieceOf(p, replaced);
  return {
    ref: { provider: MY_PRODUCTS_PROVIDER, foodId: p.id },
    name: productLabel(p),
    per100g: p.per100g,
    ...(replaced?.density !== undefined ? { density: replaced.density } : {}),
    ...(replaced?.portions || glass || piece ? { portions: { ...replaced?.portions, ...(glass ? { Glas: glass } : {}), ...(piece ? { Stück: piece } : {}) } } : {}),
    ...(replaced?.kind ? { kind: replaced.kind } : {}),
    ...(replaced ? { baseId: replaced.ref.foodId } : {}),
    ...(p.shelfDays ? { shelfDays: p.shelfDays } : {}),
  };
}

/**
 * Mehrere Produkte für dieselbe Zutat: Durchschnitt als Wert, die einzelnen als Sorten.
 * Die ID hängt an der Zutat (nicht an den Produkten), damit Vorrat und Rezept denselben
 * Schlüssel bekommen – auch wenn später eine dritte Sorte dazukommt.
 */
function asGroup(ps: MyProduct[], key: string, replaced?: FoodEntry): FoodEntry {
  if (ps.length === 1) return asEntry(ps[0], replaced);
  const days = ps.map((p) => p.shelfDays).filter((d): d is number => d !== undefined);
  // Favorit: dessen Werte statt des Durchschnitts (Schlüssel bleibt – Vorrat und Rezept finden sich weiter)
  const fav = ps.find((p) => p.favorite);
  return {
    ...asEntry(fav ?? ps[0], replaced),
    ref: { provider: MY_PRODUCTS_PROVIDER, foodId: `sorten:${key}` },
    name: replaced?.name ?? key.charAt(0).toLocaleUpperCase('de-DE') + key.slice(1),
    per100g: fav ? fav.per100g : averageNutrients(ps.map((p) => p.per100g)),
    ...(days.length === ps.length ? { shelfDays: Math.min(...days) } : { shelfDays: undefined }),
    variants: ps.map((p) => ({ id: p.id, name: productLabel(p), per100g: p.per100g, ...(p.favorite ? { favorite: true } : {}) })),
    ...(fav ? { favoriteId: fav.id } : {}),
  };
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

/**
 * Legt „Meine Produkte“ über eine Lebensmitteltabelle. Die Zuordnung „Name → Lebensmittel“
 * bleibt die der allgemeinen Tabelle – nur die Werte kommen dann von deinem Produkt.
 * So bleibt die Genauigkeit (berechnet/geschätzt) dieselbe wie vorher.
 */
let lastTable: { base: FoodTable; products: readonly MyProduct[]; table: FoodTable } | undefined;

/**
 * Wie buildTable – aber gleiche Eingaben liefern dieselbe Tabelle, und jede Tabelle merkt sich ihre
 * Namenssuche. Liste, Wagen-Zahl, Speisekammer und Nachkaufen fragen tausendfach „was ist Passata?“ –
 * die Antwort hängt nur an Tabelle und Produkten, also darf sie zwischengespeichert werden.
 */
export function withMyProducts(base: FoodTable, products: MyProduct[]): FoodTable {
  if (!products.length) return base; // ohne Produkte genau die alte Tabelle
  if (lastTable && lastTable.base === base && lastTable.products === products) return lastTable.table;
  const table = memoMatch(buildTable(base, products));
  lastTable = { base, products, table };
  return table;
}

type Match = ReturnType<FoodTable['matchName']>;

function memoMatch(t: FoodTable): FoodTable {
  const seen = new Map<string, Match>();
  return {
    ...t,
    byRef: (ref) => t.byRef(ref),
    matchName(name) {
      if (!seen.has(name)) seen.set(name, t.matchName(name));
      return seen.get(name);
    },
  };
}

function buildTable(base: FoodTable, products: MyProduct[]): FoodTable {
  if (!products.length) return base;
  // Mehrere Produkte für dasselbe = Sorten (siehe asGroup)
  const byReplaced = new Map<string, MyProduct[]>();
  for (const p of products) for (const r of p.replaces) push(byReplaced, r, p);
  const byName = new Map<string, MyProduct[]>();
  for (const p of products) for (const n of new Set((p.names ?? []).map(normalizeName))) push(byName, n, p);
  // Ein Produkt passt immer auch auf seinen eigenen Namen („Frischkäse Balance“)
  // Sorten heißen gleich („Rinderhack“ + Zusatz „leicht“) – darum je Name ALLE Produkte, nicht nur das letzte
  // (Julia: Sortenwahl fehlte, das Rezept rechnete mit irgendeiner Sorte)
  const byOwnName = new Map<string, MyProduct[]>();
  for (const p of products) for (const n of new Set([normalizeName(p.name), normalizeName(nameOf(p))])) push(byOwnName, n, p);
  /** Eigene Produkte statt des Tabelleneintrags – ohne die, die diese Schreibweise ausnehmen */
  const swap = (food: FoodEntry, alias?: string, raw?: string, name?: string): FoodEntry => {
    const ps = byReplaced.get(food.ref.foodId)?.filter((p) => !p.excludes?.some((x) => x === alias || x === raw)
      // Fettstufen: „Milch 0,1 %“ ersetzt nicht „Milch 3,5 %“ (siehe fatLevels.ts)
      && (name === undefined || sameLevel(nameOf(p), name, food.ref.foodId) !== false));
    return ps?.length ? asGroup(ps, food.ref.foodId, food) : food;
  };
  return {
    byRef(ref) {
      if (ref.provider === MY_PRODUCTS_PROVIDER) {
        if (ref.foodId.startsWith('sorten:')) {
          const key = ref.foodId.slice('sorten:'.length);
          const ps = byName.get(key) ?? byReplaced.get(key);
          const exact = base.matchName(key);
          return ps && asGroup(ps, key, byReplaced.has(key) ? base.byRef({ provider: ref.provider, foodId: key }) : exact?.quality === 'exact' ? exact.food : undefined);
        }
        const p = products.find((x) => x.id === ref.foodId);
        return p ? asEntry(p) : undefined;
      }
      const food = base.byRef(ref);
      return food && swap(food);
    },
    matchName(name) {
      // Eigene Namen zuerst: Du hast das Produkt ausdrücklich für diese Zutat angelegt.
      const n = normalizeName(name);
      const own = byName.get(n);
      const m = base.matchName(name);
      // Milch, Joghurt, Quark: Ein Produkt gilt für ALLE Einträge seiner Fettstufe – dein „Milch“ also auch für
      // „Milch 0,1 %“ und „Magermilch“, aber nie für „Milch 3,5 %“ (siehe fatLevels.ts)
      const group = m && fatGroupOf(m.food.ref.foodId);
      if (m && group) {
        const linked = [...new Set([
          ...group.ids.flatMap((id) => byReplaced.get(id) ?? []),
          ...(byName.get(normalizeName(group.plain)) ?? []),
          ...(own ?? []),
        ])];
        const fit = linked.filter((p) => !p.excludes?.some((x) => x === m.alias || x === n)
          && sameLevel(nameOf(p), name, m.food.ref.foodId) !== false);
        const level = normalizeName(fatLevel(name)?.label ?? group.plain);
        const extra = { ...(m.alias ? { alias: m.alias } : {}), ...(m.specific ? { specific: true } : {}) };
        return fit.length ? { food: asGroup(fit, level, m.food), quality: m.quality, ...extra } : { ...m, ...extra };
      }
      // Kennt die Tabelle den Namen genau (Pesto), übernimmt das Produkt deren Umrechnungen
      // (1 Glas, 1 EL, Dichte) – falls du selbst keine Packungsgröße eingetragen hast
      // „Milch (1,5 %)“ normalisiert zu „milch“ – die Stufe entscheidet, nicht dein Standard-Produkt „Milch“
      const otherLevel = !!m?.specific && m.alias !== n;
      if (own && !otherLevel) return { food: asGroup(own, n, m?.quality === 'exact' ? m.food : undefined), quality: 'exact' };
      const selves = otherLevel ? undefined : byOwnName.get(n);
      if (selves?.length) {
        // Umrechnungen (Dichte, Stückgewicht) vom ersetzten Eintrag behalten, wenn der Name dorthin führt
        const replaced = m && selves.every((x) => x.replaces.includes(m.food.ref.foodId)) ? m.food : undefined;
        // mehrere Sorten: als Gruppe (Sortenwahl, Durchschnitt oder Favorit) – Schlüssel wie über die Tabelle
        if (selves.length > 1) return { food: asGroup(selves, replaced?.ref.foodId ?? n, replaced), quality: 'exact' };
        return { food: asEntry(selves[0], replaced), quality: 'exact' };
      }
      return m && { food: swap(m.food, m.alias ?? n, n, name), quality: m.quality, ...(m.alias ? { alias: m.alias } : {}), ...(m.specific ? { specific: true } : {}) };
    },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Prüft einen Eintrag (z. B. aus einer Sicherungsdatei). */
export function isValidProduct(v: unknown): v is MyProduct {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  const n = p.per100g as Record<string, unknown> | undefined;
  return typeof p.id === 'string' && !!p.id && typeof p.name === 'string' && !!p.name.trim()
    && Array.isArray(p.replaces) && p.replaces.every((r) => typeof r === 'string')
    && (p.names === undefined || (Array.isArray(p.names) && p.names.every((r) => typeof r === 'string')))
    && typeof p.updatedAt === 'string'
    && (p.packageAmount === undefined || isNum(p.packageAmount))
    && (p.packagePrice === undefined || isNum(p.packagePrice))
    && (p.packageUnit === undefined || ['g', 'ml', 'Stück'].includes(p.packageUnit as string))
    && (p.packageSizes === undefined || (Array.isArray(p.packageSizes) && p.packageSizes.every(isNum)))
    && (p.ean === undefined || typeof p.ean === 'string')
    && (p.shelfDays === undefined || isNum(p.shelfDays))
    && (p.brand === undefined || typeof p.brand === 'string')
    && (p.detail === undefined || typeof p.detail === 'string')
    && (p.excludes === undefined || (Array.isArray(p.excludes) && p.excludes.every((x) => typeof x === 'string')))
    && !!n && isNum(n.kcal) && isNum(n.protein) && isNum(n.carbs) && isNum(n.fat);
}
