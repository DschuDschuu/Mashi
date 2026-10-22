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

/** Unbekannte (später ergänzte) Geräte bekommen ein neutrales Icon statt eines Fehlers. */
export const deviceIcon = (id: string): IconName => DEVICE_ICONS[id] ?? 'stove';

/** Mix & Match (Julia: „zu jeder Sache ein Icon“): erstes passendes Wort im Namen gewinnt */
const MIX_WORD_ICONS: [RegExp, IconName][] = [
  [/gnocchi|schupfnudel|spätzle|spaetzle|knödel|klöße/, 'gnocchi'],
  [/pasta|nudel|spaghetti|penne|fusilli|tagliatelle|makkaroni|maccheroni|farfalle|linguine|ramen|udon/, 'pasta'],
  [/reis|risotto|couscous|bulgur|quinoa|hirse/, 'rice'],
  [/kartoffel|pommes|püree|puree|rösti|wedges/, 'potato'],
  [/brot|baguette|fladen|naan|ciabatta/, 'bread'],
  [/tomat|arrabbiata|bolognese|napoli|passata/, 'tomato'],
  [/pesto|kräuter|basilikum|spinat|grün/, 'leaf'],
  [/curry|eintopf|chili|gulasch|ragout/, 'pot'],
];

/** Was nichts erkennt, bekommt das Icon seiner Rolle – Soße: Kelle, Beilage: Besteck */
const MIX_ROLE_ICONS: Record<string, IconName> = { sosse: 'ladle', beilage: 'cutlery' };

export function mixIcon(title: string, role: string): IconName {
  const t = title.toLocaleLowerCase('de-DE');
  return MIX_WORD_ICONS.find(([re]) => re.test(t))?.[1] ?? MIX_ROLE_ICONS[role] ?? 'cutlery';
}
