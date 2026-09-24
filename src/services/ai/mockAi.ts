import { newId } from '../../domain/recipe';
import type { Ingredient, Step, Unit } from '../../domain/types';
import type { RecipeAiProvider, RecipeDraft, RecipeRequest } from './types';

/**
 * Platzhalter-KI für den Prototyp: wählt anhand von Stichworten eine Vorlage.
 * Kein Netzwerk, keine Kosten. Wird in Phase 5 durch einen Edge-Function-Provider ersetzt.
 */

type Tpl = Omit<RecipeDraft, 'ingredients' | 'steps'> & {
  keywords: string[];
  ingredients: [number | undefined, Unit | undefined, string][];
  steps: [string, number?][];
};

const TEMPLATES: Tpl[] = [
  {
    keywords: ['korea', 'koreanisch', 'gochujang', 'bowl', 'hähnchenhack', 'reis'],
    title: 'Würzige Gochujang-Hähnchen-Bowl',
    description: 'Schnelle koreanisch inspirierte Bowl mit krümeligem Hähnchenhack, knackiger Paprika und cremiger Avocado.',
    servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
    categories: ['salat-bowl'], tags: ['Koreanisch', 'Proteinreich', 'Schnell'], devices: ['herd'],
    imagePrompt: 'Korean gochujang chicken rice bowl with crumbled chicken mince, diced red bell pepper, sliced avocado, spring onions and sesame seeds',
    ingredients: [
      [300, 'g', 'Hähnchenhack'], [150, 'g', 'Reis'], [1, 'Stück', 'Paprika'], [1, 'Stück', 'Avocado'],
      [2, 'EL', 'Gochujang'], [1, 'EL', 'Sojasauce'], [1, 'TL', 'Sesamöl'], [1, 'Zehe', 'Knoblauch'],
      [2, 'Stück', 'Frühlingszwiebeln'], [1, 'TL', 'Sesam'],
    ],
    steps: [
      ['Reis nach Packungsanleitung garen.', 15],
      ['Paprika würfeln, Knoblauch fein hacken, Frühlingszwiebeln in Ringe schneiden.'],
      ['Sesamöl in einer Pfanne erhitzen, Hähnchenhack krümelig anbraten. Paprika und Knoblauch kurz mitbraten.', 6],
      ['Gochujang und Sojasauce einrühren und 2–3 Minuten köcheln lassen.', 3],
      ['Reis in Schüsseln geben, Hähnchen darauf anrichten, mit Avocado, Frühlingszwiebeln und Sesam toppen.'],
    ],
  },
  {
    keywords: ['airfryer', 'knusprig', 'crispy', 'hähnchenbrust', 'hähnchen'],
    title: 'Knusprige Airfryer-Hähnchenstreifen',
    description: 'Außen crunchy, innen saftig – mit Panko und geräuchertem Paprika, ganz ohne Frittieröl.',
    servings: 2, prepMinutes: 10, cookMinutes: 14, difficulty: 1,
    categories: ['hauptgericht'], tags: ['Airfryer', 'Proteinreich', 'Schnell'], devices: ['airfryer'],
    imagePrompt: 'Crispy panko-crusted chicken strips from the air fryer with a small bowl of yogurt dip',
    ingredients: [
      [400, 'g', 'Hähnchenbrust'], [60, 'g', 'Panko'], [1, 'Stück', 'Ei'], [1, 'TL', 'Paprikapulver'],
      [1, 'EL', 'Olivenöl'], [150, 'g', 'Griechischer Joghurt'], [undefined, undefined, 'Salz & Pfeffer'],
    ],
    steps: [
      ['Hähnchenbrust in fingerdicke Streifen schneiden und mit Salz, Pfeffer und Paprikapulver würzen.'],
      ['Ei verquirlen. Streifen erst durchs Ei ziehen, dann rundum in Panko wälzen.'],
      ['Mit Öl besprühen und im Airfryer bei 190 °C garen, nach der Hälfte wenden.', 14],
      ['Joghurt mit einer Prise Salz verrühren und als Dip dazu servieren.'],
    ],
  },
  {
    keywords: ['frühstück', 'pancake', 'pfannkuchen', 'süß', 'haferflocken', 'protein'],
    title: 'Fluffige Protein-Pancakes',
    description: 'Schnelle Pancakes aus Haferflocken, Banane und Quark – sättigend und nicht zu süß.',
    servings: 2, prepMinutes: 5, cookMinutes: 12, difficulty: 1,
    categories: ['fruehstueck'], tags: ['Proteinreich', 'Vegetarisch', 'Schnell'], devices: ['herd'],
    imagePrompt: 'Stack of fluffy oat protein pancakes topped with fresh blueberries and a drizzle of maple syrup',
    ingredients: [
      [80, 'g', 'Haferflocken'], [1, 'Stück', 'Banane'], [2, 'Stück', 'Eier'], [150, 'g', 'Magerquark'],
      [1, 'TL', 'Rapsöl'], [100, 'g', 'Heidelbeeren'], [1, 'EL', 'Ahornsirup'],
    ],
    steps: [
      ['Haferflocken, Banane, Eier und Quark zu einem dicken Teig pürieren. 5 Minuten quellen lassen.', 5],
      ['Pfanne mit wenig Öl erhitzen, kleine Pancakes ausbacken, bis sich Bläschen bilden, dann wenden.', 3],
      ['Mit Heidelbeeren und Ahornsirup servieren.'],
    ],
  },
  {
    keywords: ['vegetarisch', 'linsen', 'curry', 'eintopf', 'suppe', 'monsieur'],
    title: 'Cremiges Rote-Linsen-Curry',
    description: 'Wärmendes Curry mit roten Linsen, Kokosmilch und Spinat – perfekt zum Vorkochen.',
    servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
    categories: ['hauptgericht'], tags: ['Vegetarisch', 'Meal Prep', 'Comfort Food'], devices: ['herd'],
    imagePrompt: 'Creamy red lentil curry with coconut milk and wilted spinach in a ceramic bowl',
    ingredients: [
      [150, 'g', 'Rote Linsen'], [1, 'Dose', 'Gehackte Tomaten'], [200, 'ml', 'Kokosmilch'], [1, 'Stück', 'Zwiebel'],
      [1, 'EL', 'Currypaste'], [2, 'Handvoll', 'Spinat'], [1, 'TL', 'Rapsöl'],
    ],
    steps: [
      ['Zwiebel würfeln und im Öl glasig anschwitzen.', 3],
      ['Currypaste kurz mitrösten, dann Linsen, Tomaten und Kokosmilch zugeben.'],
      ['Bei mittlerer Hitze köcheln lassen, bis die Linsen weich sind.', 15],
      ['Spinat unterheben und abschmecken.'],
    ],
  },
];

function pickTemplate(text: string): Tpl {
  const t = text.toLowerCase();
  let best = TEMPLATES[0];
  let bestScore = -1;
  for (const tpl of TEMPLATES) {
    const score = tpl.keywords.filter((k) => t.includes(k)).length;
    if (score > bestScore) { best = tpl; bestScore = score; }
  }
  return best;
}

const WORD_NUMBERS: Record<string, number> = { eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6 };

function servingsFrom(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d+|eine|einen|zwei|drei|vier|fünf|sechs)\s*(personen|portionen|leute)/);
  if (!m) return undefined;
  return WORD_NUMBERS[m[1]] ?? Number(m[1]);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockRecipeAi: RecipeAiProvider = {
  id: 'mock',
  async generateRecipe(req: RecipeRequest): Promise<RecipeDraft> {
    await delay(1400);
    const text = [req.prompt, ...(req.devices ?? []), ...(req.wishes ?? [])].join(' ');
    const tpl = pickTemplate(text);
    const { keywords: _k, ingredients, steps, ...rest } = tpl;
    const servings = req.servings ?? servingsFrom(req.prompt) ?? tpl.servings;
    const factor = servings / tpl.servings;

    const ing: Ingredient[] = ingredients.map(([amount, unit, name]) => ({
      id: newId('i'), name, unit, amount: amount === undefined ? undefined : amount * factor,
    }));
    const st: Step[] = steps.map(([text, timerMinutes]) => ({ id: newId('s'), text, timerMinutes }));
    const devices = req.devices?.length ? req.devices : rest.devices;

    return { ...rest, servings, devices, ingredients: ing, steps: st };
  },
};
