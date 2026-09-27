import { normalizeName } from './nutrition/localFoods';
import { fatLevel } from './nutrition/fatLevels';
import type { Ingredient, RecipeContent } from './types';

/**
 * Einheitliche Zutatennamen: „Sojasoße“ heißt überall „Sojasauce“, „Möhren“ heißen „Karotten“.
 * Das hilft Einkaufsliste (eine Zeile statt zwei), Vorrat und eigenen Produkten.
 *
 * Bewusst NUR echte Synonyme und Schreibweisen – die Nährwert-Tabelle fasst auch Ähnliches
 * zusammen (Tomaten ~ Kirschtomaten, Limette ~ Zitronensaft), das wäre als Umbenennung falsch.
 * Dazu Julias Zusammenfassungen (Reis-, Nudelsorten, Frischkäse), die Sorte ist egal.
 * Milch, Joghurt, Quark: EINE Schreibweise je Fettstufe (siehe fatLevels.ts) – „Vollmilch“ → „Milch 3,5 %“,
 * „Magermilch“ → „Milch“ (die niedrigste Stufe ist der Standard).
 * Wer das anders sieht, blendet einzelne Vorschläge aus („Nicht mehr vorschlagen“, je Datenbank).
 * Es wird nie automatisch umbenannt – immer nur vorgeschlagen.
 */
const RENAMES: [to: string, from: string[]][] = [
  ['Hähnchenhack', ['hühnerhack', 'hähnchen-hackfleisch']],
  ['Hähnchenbrust', ['hähnchenbrustfilet']],
  ['Gekochter Reis', ['reis gekocht']],
  ['Reis', ['basmatireis', 'jasminreis', 'sushireis', 'langkornreis']],
  ['Pasta', ['nudeln', 'spaghetti', 'penne', 'fusilli', 'linguine', 'hörnchennudeln', 'makkaroni', 'farfalle', 'rigatoni']],
  ['Paprika', ['paprikaschote']],
  ['Sojasauce', ['sojasoße']],
  ['Frühlingszwiebel', ['lauchzwiebel']],
  ['Frühlingszwiebeln', ['lauchzwiebeln']],
  ['Sesam', ['sesamsaat', 'sesamkörner']],
  ['Lasagneplatten', ['lasagneblätter']],
  ['Parmesan', ['parmigiano', 'parmigiano reggiano']],
  ['Basilikum', ['basilikumblätter', 'basilikumblättchen']],
  ['Proteinpulver', ['eiweißpulver']],
  ['Joghurt', ['naturjoghurt']],
  ['Quark', ['speisequark']],
  ['Hafermilch', ['haferdrink']],
  ['Heidelbeeren', ['blaubeeren']],
  ['Gehackte Tomaten', ['stückige tomaten']],
  ['Passierte Tomaten', ['passata']],
  ['Currypulver', ['curry']],
  ['Karotte', ['möhre']],
  ['Karotten', ['möhren']],
  ['Hokkaido', ['hokkaidokürbis']],
  ['Chiasamen', ['chia']],
  ['Hüttenkäse', ['körniger frischkäse', 'cottage cheese']],
  ['Frischkäse', ['light-frischkäse', 'frischkäse light', 'light frischkäse', 'doppelrahmfrischkäse']],
  ['Kirschtomaten', ['cherrytomaten', 'cocktailtomaten']],
  ['Bacon', ['frühstücksspeck']],
  ['Chilisauce', ['chili-sauce']],
  ['Worcestershiresauce', ['worcestersauce', 'worcestershire-sauce']],
  ['Hühnerbrühe-Pulver', ['hühnerbrühpulver']],
  ['Sahne', ['schlagsahne']],
  ['Kochsahne', ['kochcreme', 'cremefine']],
  ['Gruyère', ['gruyere', 'greyerzer']],
  ['Frühstücksfleisch', ['spam', 'luncheon meat']],
  ['Pak Choi', ['pak-choi', 'pakchoi', 'bok choy']],
  ['Gurke', ['salatgurke']],
  ['Rotkohl', ['blaukraut', 'rotkraut']],
  ['Eisbergsalat', ['eisberg']],
  ['Mayonnaise', ['mayo']],
  ['Rotes Pesto', ['pesto rosso', 'tomatenpesto']],
  ['Miso', ['misopaste', 'miso-paste']],
  ['Kreuzkümmel', ['cumin', 'kreuzkümmel gemahlen']],
  ['Crème fraîche', ['creme fraiche', 'crème fraiche']],
  ['Thymian', ['thymianblättchen']],
  ['Muskat', ['muskatnuss', 'muskatnuss gerieben']],
];

const RENAME_TO = new Map(RENAMES.flatMap(([to, from]) => from.map((f) => [f, to] as const)));

export interface RenameOptions {
  /** ausgeblendete Vorschläge (normalisierte Schreibweise, je Datenbank) */
  dismissed?: readonly string[];
  /** Namen, an denen eigene Produkte hängen – nicht umbenennen, sonst gilt das Produkt nicht mehr */
  protectedNames?: ReadonlySet<string>;
}

/** Schlüssel zum Ausblenden: die normalisierte Schreibweise („vollmilch“) */
export const renameKey = (name: string) => (fatLevel(name) ? name.trim().toLocaleLowerCase('de-DE') : normalizeName(name));

/**
 * Einheitlicher Name für eine Zutat – oder undefined, wenn sie schon so heißt.
 * Zusätze in Klammern oder nach dem Komma bleiben: „Vollmilch (3,5 %)“ → „Milch (3,5 %)“.
 */
export function renameSuggestion(name: string, opts: RenameOptions = {}): string | undefined {
  const key = renameKey(name);
  // Fettstufe: die einheitliche Schreibweise („Milch 3,5 %“) – Zusätze ohne Prozentangabe bleiben
  const level = fatLevel(name);
  if (level) {
    if (opts.dismissed?.includes(key)) return undefined;
    // Ein Produkt, das ausdrücklich so heißt („Vollmilch“), nicht abhängen. Dein Standard „Milch“
    // blockiert aber nicht: „Milch (1,5 %)“ normalisiert zwar zu „milch“, galt für dein Produkt aber nie.
    const n = normalizeName(name);
    if (opts.protectedNames?.has(n) && fatLevel(n)) return undefined;
    const extras = [...name.matchAll(/\(.*?\)/g)].map((m) => m[0]).filter((x) => !/%/.test(x));
    const to = [level.label, ...extras].join(' ');
    return to !== name.trim() ? to : undefined;
  }
  const to = RENAME_TO.get(key);
  if (!to || opts.dismissed?.includes(key) || opts.protectedNames?.has(key)) return undefined;
  const extras = [...name.matchAll(/\(.*?\)/g)].map((m) => m[0]);
  // Komma nur außerhalb von Klammern – „(3,5 %)“ ist kein Zusatz nach einem Komma
  const comma = name.replace(/\(.*?\)/g, '').match(/,.*$/)?.[0];
  return [to, ...extras].join(' ') + (comma ?? '');
}

export interface Rename { ingredientId: string; from: string; to: string }

/** Alle Vorschläge eines Rezepts */
export function renameSuggestions(content: RecipeContent, opts: RenameOptions = {}): Rename[] {
  return content.ingredients.flatMap((i) => {
    const to = renameSuggestion(i.name, opts);
    return to ? [{ ingredientId: i.id, from: i.name, to }] : [];
  });
}

/** Ausgewählte Vorschläge übernehmen – gibt einen neuen Inhalt zurück (für eine neue Version) */
export function applyRenames(content: RecipeContent, renames: readonly Rename[]): RecipeContent {
  const to = new Map(renames.map((r) => [r.ingredientId, r.to]));
  return { ...content, ingredients: content.ingredients.map((i): Ingredient => (to.has(i.id) ? { ...i, name: to.get(i.id)! } : i)) };
}
