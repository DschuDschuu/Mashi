import { resolveName } from './mealplan';
import { normalizeName, PROVIDER } from './nutrition/localFoods';
import type { FoodKind, FoodTable } from './nutrition/types';

/**
 * Kategorien wie im Laden (Julia: „feiner“) – überall gleich: Meine Lebensmittel, Speisekammer, Einkaufsliste.
 * Mashi ordnet selbst zu (Tabelle, sonst am Namen); je Lebensmittel lässt sich das ändern (Pantry.categories).
 */
export type FoodCategory =
  | 'obst-gemuese' | 'fleisch-fisch' | 'milch-eier' | 'nudeln-reis-brot' | 'muesli-nuesse' | 'konserven'
  | 'saucen' | 'backen' | 'tiefkuehl' | 'getraenke' | 'sonstiges';

/** Reihenfolge = Reihenfolge der Gruppen */
export const CATEGORIES: readonly { id: FoodCategory; title: string }[] = [
  { id: 'obst-gemuese', title: 'Obst & Gemüse' },
  { id: 'fleisch-fisch', title: 'Fleisch & Fisch' },
  { id: 'milch-eier', title: 'Milchprodukte & Eier' },
  { id: 'nudeln-reis-brot', title: 'Nudeln, Reis & Brot' },
  // Julia: eigene Abteilung wie im Laden – Haferflocken, Müsli, Nüsse, Saaten
  { id: 'muesli-nuesse', title: 'Müsli, Nüsse & Kerne' },
  { id: 'konserven', title: 'Konserven & Gläser' },
  { id: 'saucen', title: 'Saucen & Würzen' },
  { id: 'backen', title: 'Backen & Süßes' },
  { id: 'tiefkuehl', title: 'Tiefkühl' },
  { id: 'getraenke', title: 'Getränke' },
  { id: 'sonstiges', title: 'Sonstiges' },
];

export const categoryTitle = (c: FoodCategory) => CATEGORIES.find((x) => x.id === c)?.title ?? 'Sonstiges';
export const isCategory = (v: unknown): v is FoodCategory => CATEGORIES.some((c) => c.id === v);

/** Einträge der eingebauten Tabelle, die nicht schon ihre Art verrät (Art → Kategorie siehe BY_KIND) */
const BY_FOOD: Record<string, FoodCategory> = {
  // Dose, Glas, Tube
  'gehackte-tomaten': 'konserven', 'passierte-tomaten': 'konserven', kokosmilch: 'konserven', tomatenmark: 'konserven',
  mais: 'konserven', 'getrocknete-tomaten': 'konserven', pesto: 'konserven', 'pesto-rosso': 'konserven', fruehstuecksfleisch: 'konserven',
  // Saucen, Öle, Brühe, Gewürze
  gochujang: 'saucen', sojasauce: 'saucen', sesamoel: 'saucen', reisessig: 'saucen', olivenoel: 'saucen', rapsoel: 'saucen',
  currypaste: 'saucen', currypulver: 'saucen', paprikapulver: 'saucen', chilisauce: 'saucen', apfelessig: 'saucen',
  worcestershire: 'saucen', gemuesebruehe: 'saucen', 'huehnerbruehe-pulver': 'saucen', mayo: 'saucen', ketchup: 'saucen',
  tahini: 'saucen', senf: 'saucen', miso: 'saucen', 'gemuese-gewuerzpaste': 'saucen', buldak: 'saucen', kreuzkuemmel: 'saucen',
  'ital-kraeuter': 'saucen', thymian: 'saucen', salz: 'saucen', pfeffer: 'saucen', muskat: 'saucen', chiliflocken: 'saucen',
  // Backregal und Süßes
  mehl: 'backen', panko: 'backen', speisestaerke: 'backen', ahornsirup: 'backen', honig: 'backen',
  // Müsli, Nüsse & Kerne
  haferflocken: 'muesli-nuesse', chiasamen: 'muesli-nuesse', sesam: 'muesli-nuesse',
  'rote-linsen': 'nudeln-reis-brot',
  erbsen: 'tiefkuehl',
  wasser: 'getraenke',
  basilikum: 'obst-gemuese',
  // ohne Art in der Tabelle
  butter: 'milch-eier',
  // „…saft“ – aber zum Kochen, aus der Obstabteilung
  zitronensaft: 'obst-gemuese',
};

const BY_KIND: Record<FoodKind, FoodCategory> = {
  vegetable: 'obst-gemuese', fruit: 'obst-gemuese', protein: 'fleisch-fisch', dairy: 'milch-eier', egg: 'milch-eier',
  staple: 'nudeln-reis-brot', bread: 'nudeln-reis-brot',
};

/**
 * Steht es im Namen, gilt es immer – auch wenn die Tabelle das Lebensmittel kennt: „TK-Spinat“ ist Spinat,
 * liegt aber im Tiefkühler; „Orangensaft“ ist ein Getränk, kein Obst.
 */
const STRONG: [FoodCategory, RegExp][] = [
  ['tiefkuehl', /(^|[\s-])tk([\s-]|$)|tiefkühl|gefroren|pommes|fischstäbchen|(^|\s)eis($|\s)|eiscreme/],
  ['getraenke', /saft|(^|\s)wasser|sprudel|cola|limo|schorle|bier|wein($|\s)|kaffee|(^|\s)tee($|\s)|eistee|smoothie/],
];

/** Am Namen – nur für das, was die Tabelle nicht kennt. Reihenfolge zählt: „Hühnerbrühe“ ist eine Würze. */
const BY_NAME: [FoodCategory, RegExp][] = [
  ['konserven', /dose|konserve|passiert|eingelegt|gewürzgurke|essiggurke|cornichon|oliven|kimchi|kichererbse|kidney|bohnen|thunfisch|tomatenmark|kokosmilch|mais($|\s)/],
  ['saucen', /sauce|soße|dressing|senf|ketchup|mayo|essig|öl($|\s)|brühe|fond|paste|gewürz|pfeffer|(^|\s)salz|curry|chili|sambal|sriracha|marinade|würze/],
  // Nüsse nur als Nüsse – nicht „Butternuss-Kürbis“ (Julia: landete unter Backen)
  // Julia: Müsli, Nüsse & Kerne als eigene Abteilung – Aufstriche (Nussmus, Erdnussbutter, Nougatcreme) bleiben beim Süßen
  ['muesli-nuesse', /^(?!.*(creme|butter|mus$|nougat|nutella|milch|drink))(?=.*(müsli|granola|crunchy|cornflakes|flocken|(^|[\s-])n(uss|üsse)($|[\s-])|(hasel|wal|erd|para|pekan|cashew|macadamia)n(uss|üsse)|mandel|pistazie|kerne|saaten|leinsamen|chia|studentenfutter|trockenobst|rosinen))/],
  ['backen', /mehl|zucker|backpulver|hefe|vanille|schoko|kakao|kuvertüre|honig|sirup|marmelade|konfitüre|nutella|(^|[\s-])n(uss|üsse)($|[\s-])|(hasel|wal|erd|para|pekan|cashew)n(uss|üsse)|nussmus|nusscreme|mandel|keks|chips|riegel|gummibär|bonbon/],
];

/** Mashis Vorschlag – ohne deine Änderung */
export function guessCategory(name: string, table: FoodTable): FoodCategory {
  const r = resolveName(name, table);
  const food = r?.food;
  // eigenes Produkt: was es in der Tabelle ersetzt (baseId); mehrere Sorten: „sorten:<ersetzter Eintrag>“
  const id = food ? (food.baseId ?? (food.ref.provider === PROVIDER ? food.ref.foodId : food.ref.foodId.replace(/^sorten:/, ''))) : undefined;
  if (id && BY_FOOD[id]) return BY_FOOD[id];
  const n = normalizeName(name);
  // am Originalnamen – normalizeName streicht „TK“ (für Rezepte ist TK-Spinat einfach Spinat)
  const raw = name.toLocaleLowerCase('de-DE');
  const strong = STRONG.find(([, re]) => re.test(raw));
  if (strong) return strong[0];
  const known = !!id && !!table.byRef({ provider: PROVIDER, foodId: id });
  // getrocknete Kräuter (Petersilie getrocknet) und alles in deinen Gewürzen: zu den Würzen – nicht zu „Sonstiges“
  if (r?.spice && !known) return 'saucen';
  if (!known) {
    const hit = BY_NAME.find(([, re]) => re.test(n));
    if (hit) return hit[0];
  }
  return r?.kind ? BY_KIND[r.kind] : 'sonstiges';
}

/** Schlüssel, unter dem deine Änderung gespeichert wird – „Passata“ und „Passierte Tomaten“ teilen ihn */
export const categoryKey = (name: string, table: FoodTable) => resolveName(name, table)?.key ?? `name:${normalizeName(name)}`;

/** Kategorie eines Lebensmittels: deine Wahl, sonst Mashis Vorschlag */
export function categoryOf(name: string, table: FoodTable, own?: Readonly<Record<string, FoodCategory>>): FoodCategory {
  return own?.[categoryKey(name, table)] ?? guessCategory(name, table);
}

/** Deine Wahl speichern – entspricht sie Mashis Vorschlag, fällt sie weg (dann folgt sie wieder der Tabelle) */
export function withCategory(own: Readonly<Record<string, FoodCategory>> | undefined, name: string, c: FoodCategory, table: FoodTable): Record<string, FoodCategory> | undefined {
  const key = categoryKey(name, table);
  const { [key]: _old, ...rest } = own ?? {};
  const next = c === guessCategory(name, table) ? rest : { ...rest, [key]: c };
  return Object.keys(next).length ? next : undefined;
}

/** Einträge in Gruppen einsortieren – leere Gruppen fallen weg. */
export function groupByCategory<T>(items: readonly T[], categoryOfItem: (item: T) => FoodCategory) {
  const by = new Map<FoodCategory, T[]>();
  for (const i of items) {
    const c = categoryOfItem(i);
    by.set(c, [...(by.get(c) ?? []), i]);
  }
  return CATEGORIES.filter((c) => by.has(c.id)).map((c) => ({ id: c.id, title: c.title, items: by.get(c.id)! }));
}
