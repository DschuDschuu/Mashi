import type { FoodCategory } from '../domain/categories';
import type { SideKind } from '../domain/sides';
import type { RecipeStatus } from '../domain/types';
import type { IconName } from './components/Icon';

/**
 * Welches Linien-Icon zu welchem Katalogeintrag gehört.
 * Liegt bewusst in ui/ und nicht in domain/catalog.ts: Icons sind Darstellung,
 * und die Domäne soll nichts von der Oberfläche wissen.
 */
const DEVICE_ICONS: Record<string, IconName> = {
  herd: 'stove',
  backofen: 'oven',
  airfryer: 'airfryer',
  'monsieur-cuisine': 'mixer',
  mikrowelle: 'microwave',
  'slow-cooker': 'slowcooker',
};

export const STATUS_ICONS: Record<RecipeStatus, IconName> = {
  ki_entwurf: 'sparkles',
  zum_testen: 'flask',
  bewaehrt: 'heart',
  kochbuch: 'book',
};

/** Ladenabteilungen als Abschnitte (Einkaufsliste, Speisekammer) – jeder Abschnitt hat ein Icon (UX-Rundgang) */
export const CATEGORY_ICONS: Record<FoodCategory, IconName> = {
  'obst-gemuese': 'apple',
  'fleisch-fisch': 'drumstick',
  'milch-eier': 'glass',
  'nudeln-reis-brot': 'bread',
  'muesli-nuesse': 'rice',
  konserven: 'archive',
  saucen: 'ladle',
  backen: 'cake',
  tiefkuehl: 'snow',
  getraenke: 'cup',
  sonstiges: 'bag',
};

/** Unbekannte (später ergänzte) Geräte bekommen ein neutrales Icon statt eines Fehlers. */
export const deviceIcon = (id: string): IconName => DEVICE_ICONS[id] ?? 'stove';

/** Bausteine (Julia: „zu jeder Sache ein Icon“), heute für den Teller als Bild: erstes passendes Wort im Namen gewinnt */
const MIX_WORD_ICONS: [RegExp, IconName][] = [
  [/gnocchi|schupfnudel|spätzle|spaetzle|knödel|klöße/, 'gnocchi'],
  [/pasta|nudel|spaghetti|penne|fusilli|tagliatelle|makkaroni|maccheroni|farfalle|linguine|ramen|udon/, 'pasta'],
  [/reis|risotto|couscous|bulgur|quinoa|hirse/, 'rice'],
  [/kartoffel|pommes|püree|puree|rösti|wedges/, 'potato'],
  [/brot|brötchen|baguette|fladen|naan|ciabatta/, 'bread'],
  [/tomat|arrabbiata|bolognese|napoli|passata/, 'tomato'],
  [/pesto|kräuter|basilikum|spinat|grün|koriander|petersilie|schnittlauch/, 'leaf'],
  [/curry|eintopf|chili|gulasch|ragout/, 'pot'],
  [/hähnchen|haehnchen|huhn|chicken|pute/, 'drumstick'],
  [/tortilla|wrap|taco|fajita|burrito|quesadilla/, 'tortilla'],
  // „gehackte Mandeln“ sind kein Hack
  [/hack(?!t)|patty|frikadelle|bulette/, 'patty'],
  [/tofu|tempeh/, 'tofu'],
  [/linse|bohne|erbse|hummus|edamame/, 'legume'],
  [/käse|kaese|parmesan|feta|halloumi|cheddar|mozzarella|gouda|pecorino|ricotta/, 'cheese'],
  // „Ei“ nur als ganzes Wort – sonst wären Reis und Brei Spiegeleier
  [/\bei\b|eier|spiegelei|rührei|ruehrei|omelett/, 'egg'],
];

/** Was nichts erkennt, bekommt das Icon seiner Stufe – aber nur, wo es sicher passt: Kohlenhydrat, Protein und Topping
 *  bleiben dann ohne (ein falsches Icon wäre schlimmer als keins; das Topping bekommt im Bild Streusel) */
const MIX_KIND_ICONS: Partial<Record<SideKind, IconName>> = { sauce: 'ladle', veg: 'leaf' };

export function mixIcon(title: string, kind: SideKind): IconName | undefined {
  const t = title.toLocaleLowerCase('de-DE');
  return MIX_WORD_ICONS.find(([re]) => re.test(t))?.[1] ?? MIX_KIND_ICONS[kind];
}
