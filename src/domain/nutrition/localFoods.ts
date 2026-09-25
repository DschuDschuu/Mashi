import type { FoodRef } from '../types';
import type { FoodEntry, FoodKind, FoodTable, Nutrients } from './types';

/**
 * Kleine lokale Lebensmitteltabelle für den Prototyp.
 * Werte je 100 g, gerundete Richtwerte (roh, sofern nicht anders angegeben).
 * Wird in Phase 7 durch Open Food Facts / USDA ergänzt – das Format bleibt gleich.
 */
type Row = [id: string, aliases: string[], kcal: number, protein: number, carbs: number, fat: number, extra?: Partial<Omit<FoodEntry, 'ref' | 'name' | 'per100g'>>];

const ROWS: Row[] = [
  ['haehnchenhack', ['hähnchenhack', 'hühnerhack', 'hähnchen-hackfleisch'], 143, 17.4, 0, 8.1],
  ['haehnchenbrust', ['hähnchenbrust', 'hähnchenbrustfilet', 'hähnchen'], 110, 23, 0, 1.5],
  ['rinderhack', ['rinderhack', 'hackfleisch', 'gemischtes hackfleisch'], 250, 18, 0, 20],
  ['reis', ['reis', 'basmatireis', 'jasminreis', 'sushireis', 'langkornreis'], 350, 7.5, 78, 0.6],
  ['reis-gekocht', ['gekochter reis', 'reis gekocht', 'reis vom vortag'], 130, 2.7, 28, 0.3],
  ['paprika', ['paprika', 'paprikaschote', 'rote paprika', 'gelbe paprika'], 30, 1, 6, 0.3, { portions: { Stück: 150 } }],
  ['avocado', ['avocado'], 160, 2, 8.5, 14.7, { portions: { Stück: 150 } }],
  ['gochujang', ['gochujang'], 220, 5, 45, 1.5, { portions: { EL: 18, TL: 6 } }],
  ['sojasauce', ['sojasauce', 'sojasoße', 'sojasoße hell'], 53, 8, 5, 0.6, { density: 1.1 }],
  ['sesamoel', ['sesamöl', 'geröstetes sesamöl'], 884, 0, 0, 100, { density: 0.92 }],
  ['knoblauch', ['knoblauch', 'knoblauchzehe', 'knoblauchzehen'], 149, 6.4, 33, 0.5, { portions: { Zehe: 4, Stück: 4 } }],
  ['reisessig', ['reisessig'], 18, 0, 4, 0],
  ['fruehlingszwiebel', ['frühlingszwiebel', 'frühlingszwiebeln', 'lauchzwiebel'], 32, 1.8, 7, 0.2, { portions: { Stück: 15 } }],
  ['sesam', ['sesam', 'sesamsaat', 'sesamkörner'], 573, 17.7, 23, 49.7, { portions: { EL: 9, TL: 3 } }],
  ['olivenoel', ['olivenöl'], 884, 0, 0, 100, { density: 0.92 }],
  ['rapsoel', ['rapsöl', 'öl', 'pflanzenöl', 'neutrales öl'], 884, 0, 0, 100, { density: 0.92 }],
  ['pasta', ['pasta', 'nudeln', 'spaghetti', 'penne', 'fusilli', 'linguine', 'hörnchennudeln', 'makkaroni', 'farfalle', 'rigatoni'], 355, 12.5, 71, 1.5],
  ['lasagneplatten', ['lasagneplatten', 'lasagneblätter'], 355, 12, 71, 1.5],
  ['parmesan', ['parmesan', 'parmigiano', 'parmigiano reggiano'], 392, 35, 3.2, 26, { portions: { EL: 6 } }],
  ['zitronensaft', ['zitronensaft', 'zitrone', 'limettensaft', 'limette'], 25, 0.4, 7, 0.2, { portions: { Stück: 45 } }],
  ['basilikum', ['basilikum', 'basilikumblättchen', 'basilikumblätter'], 23, 3, 2.7, 0.6, { portions: { Handvoll: 10, Bund: 20 } }],
  ['haferflocken', ['haferflocken', 'zarte haferflocken'], 370, 13.5, 58.7, 7],
  ['ei', ['ei', 'eier'], 143, 12.6, 0.7, 9.5, { portions: { Stück: 55 } }],
  ['banane', ['banane'], 89, 1.1, 23, 0.3, { portions: { Stück: 120 } }],
  ['magerquark', ['magerquark', 'quark'], 67, 12, 4, 0.2],
  ['proteinpulver', ['proteinpulver', 'whey', 'eiweißpulver'], 380, 75, 8, 5, { portions: { Messlöffel: 30, EL: 10 } }],
  ['milch', ['milch', 'vollmilch'], 64, 3.4, 4.8, 3.5, { density: 1.03 }],
  ['hafermilch', ['hafermilch', 'haferdrink'], 45, 1, 6.5, 1.5, { density: 1.03 }],
  ['heidelbeeren', ['heidelbeeren', 'blaubeeren', 'beeren'], 57, 0.7, 14, 0.3, { portions: { Handvoll: 60 } }],
  ['ahornsirup', ['ahornsirup'], 260, 0, 67, 0, { portions: { EL: 20, TL: 7 } }],
  ['honig', ['honig'], 304, 0.3, 82, 0, { portions: { EL: 21, TL: 7, Glas: 500 } }],
  ['rote-linsen', ['rote linsen', 'linsen'], 340, 24, 48, 1.5],
  ['gehackte-tomaten', ['gehackte tomaten', 'stückige tomaten', 'tomaten aus der dose'], 21, 1.1, 3.5, 0.2, { portions: { Dose: 400 } }],
  ['passierte-tomaten', ['passierte tomaten', 'passata'], 30, 1.5, 5, 0.2],
  ['kokosmilch', ['kokosmilch'], 180, 1.8, 3, 18, { portions: { Dose: 400 } }],
  ['zwiebel', ['zwiebel', 'zwiebeln', 'rote zwiebel'], 40, 1.1, 9, 0.1, { portions: { Stück: 80 } }],
  ['currypaste', ['currypaste', 'rote currypaste'], 120, 2.5, 12, 7, { portions: { EL: 16, TL: 5 } }],
  ['currypulver', ['currypulver', 'curry'], 325, 14, 55, 14, { portions: { TL: 2.5, EL: 7 } }],
  ['ingwer', ['ingwer', 'frischer ingwer'], 80, 1.8, 18, 0.8, { portions: { cm: 5, Stück: 10 } }],
  ['spinat', ['spinat', 'babyspinat', 'blattspinat'], 23, 2.9, 3.6, 0.4, { portions: { Handvoll: 30 } }],
  ['panko', ['panko', 'paniermehl', 'semmelbrösel'], 380, 12, 72, 4],
  ['mehl', ['mehl', 'weizenmehl'], 350, 10, 72, 1],
  ['paprikapulver', ['paprikapulver', 'geräuchertes paprikapulver'], 282, 14, 54, 13, { portions: { TL: 2.3, EL: 7 } }],
  ['griech-joghurt', ['griechischer joghurt', 'joghurt'], 125, 4.5, 4, 10],
  ['mozzarella', ['mozzarella', 'geriebener mozzarella', 'mini-mozzarella', 'mozzarella-kugeln'], 254, 18, 1.5, 19],
  ['butter', ['butter'], 741, 0.7, 0.6, 83, { portions: { EL: 12, TL: 4 } }],
  ['karotte', ['karotte', 'karotten', 'möhre', 'möhren'], 36, 0.9, 7.5, 0.2, { portions: { Stück: 80 } }],
  ['hokkaido', ['hokkaido', 'hokkaidokürbis', 'kürbis'], 40, 1.7, 8, 0.2, { portions: { Stück: 1000 } }],
  ['gemuesebruehe', ['gemüsebrühe', 'brühe', 'hühnerbrühe', 'geflügelbrühe'], 5, 0.2, 0.5, 0.2],
  ['mango', ['mango'], 60, 0.8, 15, 0.4, { portions: { Stück: 300 } }],
  ['chiasamen', ['chiasamen', 'chia'], 486, 17, 42, 31, { portions: { EL: 12, TL: 4 } }],
  ['erbsen', ['erbsen', 'tk-erbsen'], 81, 5.4, 14, 0.4],
  // Milchprodukte (Hüttenkäse: Variante mit 2 % Fett)
  ['huettenkaese', ['hüttenkäse', 'körniger frischkäse', 'cottage cheese'], 82, 11, 3.5, 2.3],
  ['frischkaese-light', ['light-frischkäse', 'frischkäse light', 'light frischkäse'], 150, 7.5, 4.6, 11, { portions: { EL: 20, TL: 7 } }],
  ['frischkaese', ['frischkäse', 'doppelrahmfrischkäse'], 240, 5.5, 3.5, 23, { portions: { EL: 20, TL: 7 } }],
  ['cheddar', ['cheddar'], 403, 25, 1.3, 33],
  ['magermilch', ['magermilch', 'entrahmte milch'], 35, 3.4, 4.9, 0.1, { density: 1.03 }],
  ['milch-fettarm', ['fettarme milch', 'milch fettarm', 'teilentrahmte milch'], 47, 3.4, 4.9, 1.5, { density: 1.03 }],
  // Frisches Gemüse
  ['kirschtomaten', ['kirschtomaten', 'cherrytomaten', 'cocktailtomaten', 'tomaten', 'tomate'], 18, 0.9, 2.6, 0.2, { portions: { Stück: 15 } }],
  // Fleisch – roh gewogen; knusprig gebacken tropft ein Teil des Fetts ab
  ['bacon', ['bacon', 'frühstücksspeck', 'speck', 'speckwürfel', 'bauchspeck'], 400, 13, 1, 38, { portions: { Stück: 17 } }],
  // Saucen & Würzen
  ['chilisauce', ['chilisauce', 'chili-sauce'], 100, 1, 22, 0.3],
  ['apfelessig', ['apfelessig', 'essig', 'weißweinessig'], 21, 0, 0.9, 0],
  ['worcestershire', ['worcestershiresauce', 'worcestersauce', 'worcestershire-sauce'], 78, 0, 19.5, 0],
  // Pulver ≠ fertige Brühe: 240 statt ~5 kcal. Deshalb nur mit „Pulver“ im Namen.
  ['huehnerbruehe-pulver', ['hühnerbrühe-pulver', 'brühpulver', 'hühnerbrühpulver'], 240, 10, 30, 9, { portions: { TL: 5, EL: 12 } }],
  // Monsieur-Cuisine-Rezepte (Kühlregal- und Vorratsprodukte, Richtwerte)
  ['tomatenmark', ['tomatenmark'], 90, 4.5, 15, 0.5, { portions: { EL: 17, TL: 6 } }],
  ['sahne', ['sahne', 'schlagsahne'], 292, 2.4, 3.2, 30, { density: 1.0 }],
  // Kochsahne hat meist 15 % Fett – nicht wie Schlagsahne (30 %) rechnen
  ['kochsahne', ['kochsahne', 'kochcreme', 'cremefine'], 160, 3, 4, 15, { density: 1.0 }],
  ['gruyere', ['gruyère', 'gruyere', 'greyerzer'], 413, 29.8, 0.4, 32.3],
  ['tteokbokki', ['tteokbokki-reiskuchen', 'tteokbokki', 'tteok', 'reiskuchen', 'koreanische reiskuchen'], 230, 4, 50, 0.5],
  ['spaetzle', ['spätzle', 'eierspätzle', 'frische spätzle'], 190, 7, 36, 2.4], // frisch aus dem Kühlregal
  ['rindersteak', ['rinder-minutensteak', 'minutensteak', 'rindersteak', 'steak', 'rumpsteak', 'hüftsteak', 'steakstreifen'], 121, 22, 0, 3.5],
  ['fruehstuecksfleisch', ['frühstücksfleisch', 'spam', 'luncheon meat'], 300, 13, 3, 27],
  ['doenerfleisch', ['dönerfleisch', 'döner', 'hähnchen-döner', 'kebabfleisch'], 220, 17, 3, 15],
  ['brioche', ['brioche-toast-törtchen', 'brioche', 'brioche-brötchen', 'brioche-toast', 'burgerbrötchen', 'burger-brötchen'], 330, 8.5, 55, 8, { portions: { Stück: 45 } }],
  ['pak-choi', ['pak choi', 'pak-choi', 'pakchoi', 'bok choy'], 13, 1.5, 2.2, 0.2, { portions: { Stück: 200 } }],
  ['gurke', ['gurke', 'salatgurke', 'gurken'], 12, 0.6, 1.8, 0.2, { portions: { Stück: 400 } }],
  ['rotkohl', ['rotkohl', 'blaukraut', 'rotkraut', 'eingelegter rotkohl'], 29, 1.5, 5, 0.2],
  ['eisbergsalat', ['eisbergsalat', 'eisberg'], 14, 0.9, 2, 0.2],
  ['salat', ['salat', 'blattsalat', 'römersalat', 'romanasalat', 'salatmix', 'kopfsalat', 'feldsalat', 'rucola'], 15, 1.3, 1.8, 0.2],
  ['mayo', ['mayonnaise', 'mayo', 'salatmayonnaise'], 680, 1.1, 1.5, 75, { portions: { EL: 14, TL: 5 } }],
  ['senf', ['senf', 'mittelscharfer senf', 'dijonsenf', 'dijon-senf'], 100, 6, 4, 5, { portions: { EL: 15, TL: 5, Glas: 250 } }],
  ['pesto', ['pesto', 'grünes pesto', 'pesto genovese', 'pesto alla genovese', 'basilikumpesto', 'basilikum-pesto'], 470, 5, 6, 47, { portions: { EL: 15, TL: 5, Glas: 190 } }],
  ['pesto-rosso', ['rotes pesto', 'pesto rosso', 'tomatenpesto'], 360, 4, 9, 34, { portions: { EL: 15, TL: 5, Glas: 190 } }],
  ['miso', ['miso', 'misopaste', 'miso-paste', 'helles miso'], 200, 12, 26, 6, { portions: { EL: 18, TL: 6 } }],
  ['buldak', ['buldak-gewürz', 'buldak gewürz', 'buldak'], 0, 0, 0, 0, { negligible: true }],
  ['kreuzkuemmel', ['kreuzkümmel', 'cumin', 'kreuzkümmel gemahlen'], 0, 0, 0, 0, { negligible: true }],
  ['creme-fraiche', ['crème fraîche', 'creme fraiche', 'crème fraiche'], 290, 2.3, 2.6, 30, { portions: { EL: 15 } }],
  ['schupfnudeln', ['schupfnudeln'], 160, 4, 33, 1.2],
  ['gnocchi', ['gnocchi'], 150, 3.5, 32, 0.4],
  ['getrocknete-tomaten', ['getrocknete tomaten', 'getrocknete tomaten in öl'], 210, 5, 23, 13, { portions: { Stück: 8 } }],
  ['speisestaerke', ['stärke', 'speisestärke', 'maisstärke'], 350, 0.3, 86, 0.1, { portions: { TL: 3, EL: 9 } }],
  ['mais', ['mais', 'mais aus der dose'], 80, 2.5, 14, 1.2],
  ['gemuese-gewuerzpaste', ['gemüse-gewürzpaste', 'gewürzpaste'], 70, 1.5, 8, 3, { portions: { TL: 6, EL: 18 } }],
  ['ital-kraeuter', ['italienische kräuter', 'getrocknete italienische kräuter', 'kräuter der provence', 'oregano'], 0, 0, 0, 0, { negligible: true }],
  ['thymian', ['thymian', 'thymianblättchen'], 0, 0, 0, 0, { negligible: true }],
  ['wasser', ['wasser', 'kochendes wasser'], 0, 0, 0, 0, { negligible: true }],
  ['salz', ['salz', 'meersalz'], 0, 0, 0, 0, { negligible: true, portions: { TL: 6, Prise: 0.4 } }],
  ['pfeffer', ['pfeffer', 'schwarzer pfeffer', 'salz und pfeffer', 'salz & pfeffer'], 0, 0, 0, 0, { negligible: true }],
  ['muskat', ['muskat', 'muskatnuss', 'muskatnuss gerieben'], 0, 0, 0, 0, { negligible: true, portions: { Prise: 0.2 } }],
  ['chiliflocken', ['chiliflocken', 'chili', 'gochugaru'], 280, 12, 50, 14, { negligible: true, portions: { TL: 2, Prise: 0.3 } }],
];

const PROVIDER = 'mashi-lokal';

/** Art je Lebensmittel. Nicht aufgeführt = keine feste Art (Soßen, Pasten, Hülsenfrüchte, Nüsse …). */
const KINDS: Record<FoodKind, string[]> = {
  protein: ['haehnchenhack', 'haehnchenbrust', 'rinderhack', 'bacon', 'rindersteak', 'fruehstuecksfleisch', 'doenerfleisch'],
  staple: ['reis', 'reis-gekocht', 'pasta', 'lasagneplatten', 'schupfnudeln', 'gnocchi', 'haferflocken', 'tteokbokki', 'spaetzle'],
  dairy: [
    'parmesan', 'magerquark', 'milch', 'milch-fettarm', 'magermilch', 'hafermilch', 'griech-joghurt', 'mozzarella',
    'huettenkaese', 'frischkaese', 'frischkaese-light', 'cheddar', 'sahne', 'creme-fraiche', 'kochsahne', 'gruyere',
  ],
  egg: ['ei'],
  bread: ['brioche'],
  vegetable: [
    'paprika', 'avocado', 'knoblauch', 'fruehlingszwiebel', 'zwiebel', 'ingwer', 'spinat', 'karotte', 'hokkaido',
    'erbsen', 'kirschtomaten', 'mais', 'pak-choi', 'gurke', 'rotkohl', 'eisbergsalat', 'salat',
  ],
  fruit: ['banane', 'heidelbeeren', 'mango', 'zitronensaft'],
};
const kindOf = new Map<string, FoodKind>();
for (const [kind, ids] of Object.entries(KINDS) as [FoodKind, string[]][]) ids.forEach((id) => kindOf.set(id, kind));

const FOODS: FoodEntry[] = ROWS.map(([id, aliases, kcal, protein, carbs, fat, extra]) => ({
  ref: { provider: PROVIDER, foodId: id },
  // Anzeigename: jedes Wort groß, auch nach Bindestrich – „Griechischer Joghurt“, „Hühnerbrühe-Pulver“
  name: aliases[0].replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase()),
  per100g: { kcal, protein, carbs, fat } satisfies Nutrients,
  ...(kindOf.has(id) ? { kind: kindOf.get(id) } : {}),
  ...extra,
}));

/** Alle allgemeinen Lebensmittel (für „Meine Produkte“: was soll ein Produkt ersetzen?). */
export const FOOD_CHOICES: { id: string; name: string; kind?: FoodKind }[] = FOODS.filter((f) => !f.negligible)
  .map((f) => ({ id: f.ref.foodId, name: f.name, ...(f.kind ? { kind: f.kind } : {}) }));

/** Klammern und Zusätze entfernen: „Paprika (rot oder bunt)“ → „paprika“ */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/,.*$/, ' ')
    .replace(/\b(frisch|frische|frischer|tk|bio|optional)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const byAlias = new Map<string, FoodEntry>();
FOODS.forEach((f, i) => ROWS[i][1].forEach((a) => byAlias.set(a, f)));

/** Längere Aliase zuerst prüfen, damit „paprikapulver“ vor „paprika“ gewinnt. */
const aliasesByLength = [...byAlias.keys()].sort((a, b) => b.length - a.length);

export const localFoodTable: FoodTable = {
  byRef(ref: FoodRef) {
    return FOODS.find((f) => f.ref.provider === ref.provider && f.ref.foodId === ref.foodId);
  },
  matchName(name: string) {
    const n = normalizeName(name);
    const exact = byAlias.get(n);
    if (exact) return { food: exact, quality: 'exact' };
    // Mehrzahl, wie sie auf Kassenbons steht: „Bananen“ → „Banane“, „Avocados“ → „Avocado“
    for (const singular of [n.replace(/n$/, ''), n.replace(/en$/, ''), n.replace(/s$/, ''), n.replace(/e$/, '')]) {
      const hit = singular !== n && byAlias.get(singular);
      if (hit) return { food: hit, quality: 'exact' };
    }
    // Alias als ganzes Wort im Namen: „kleine rote Zwiebel“ → Zwiebel (nur ungefähr)
    for (const alias of aliasesByLength) {
      const re = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(n)) return { food: byAlias.get(alias)!, quality: 'approx' };
    }
    return undefined;
  },
};
