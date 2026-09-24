import type { ImageMotif, Ingredient, Recipe, RecipeContent, RecipeStatus, RecipeSource, Step, TestFeedback, Unit, VersionAuthor } from '../domain/types';

/** Beispieldaten für den Prototyp. Kompakte Schreibweise: [Menge, Einheit, Name, optional?] */
type I = [number | undefined, Unit | undefined, string, boolean?];
/** [Text, Timer-Minuten?, feste Zutaten als Positionen in der Zutatenliste?] */
type S = [string, number?, number[]?];

interface Spec {
  id: string;
  status: RecipeStatus;
  source: RecipeSource;
  favorite?: boolean;
  motif: ImageMotif;
  hue: number;
  daysAgo: number;
  cookedDaysAgo?: number;
  notes?: string;
  content: Omit<RecipeContent, 'ingredients' | 'steps'> & { ingredients: I[]; steps: S[] };
  /** weitere Versionen: nur geänderte Mengen (per Zutatenposition) */
  changes?: { author: VersionAuthor; label: string; amounts: Record<number, number>; daysAgo: number }[];
  feedback?: { rating: 1 | 2 | 3 | 4 | 5; note: string; onVersion: number; daysAgo: number }[];
}

const day = 86_400_000;
const iso = (daysAgo: number, now: number) => new Date(now - daysAgo * day).toISOString();

function build(spec: Spec, now: number): Recipe {
  const ingredients: Ingredient[] = spec.content.ingredients.map(([amount, unit, name, optional], i) => ({
    id: `${spec.id}-i${i}`, name, amount, unit, ...(optional ? { optional } : {}),
  }));
  const steps: Step[] = spec.content.steps.map(([text, timerMinutes, fixed], i) => ({
    id: `${spec.id}-s${i}`, text, timerMinutes,
    ...(fixed ? { ingredientIds: fixed.map((n) => `${spec.id}-i${n}`) } : {}),
  }));
  const base: RecipeContent = { ...spec.content, ingredients, steps };

  const firstAuthor: VersionAuthor = spec.source === 'ki' ? 'ki' : spec.source === 'import' ? 'import' : 'nutzer';
  const versions = [{
    id: `${spec.id}-v1`, number: 1, createdAt: iso(spec.daysAgo, now), author: firstAuthor,
    label: spec.source === 'ki' ? 'KI-Vorschlag' : spec.source === 'import' ? 'Import' : 'Erste Fassung',
    content: base,
  }];
  let content = base;
  spec.changes?.forEach((ch, n) => {
    content = {
      ...content,
      ingredients: content.ingredients.map((ing, i) => (ch.amounts[i] !== undefined ? { ...ing, amount: ch.amounts[i] } : ing)),
    };
    versions.push({ id: `${spec.id}-v${n + 2}`, number: n + 2, createdAt: iso(ch.daysAgo, now), author: ch.author, label: ch.label, content });
  });

  const feedback: TestFeedback[] = (spec.feedback ?? []).map((f, i) => ({
    id: `${spec.id}-f${i}`, versionId: `${spec.id}-v${f.onVersion}`, createdAt: iso(f.daysAgo, now), rating: f.rating, note: f.note,
  }));

  return {
    id: spec.id,
    createdAt: iso(spec.daysAgo, now),
    updatedAt: versions[versions.length - 1].createdAt,
    status: spec.status,
    source: spec.source,
    favorite: spec.favorite ?? false,
    image: { kind: 'placeholder', motif: spec.motif, hue: spec.hue },
    notes: spec.notes ?? '',
    lastCookedAt: spec.cookedDaysAgo !== undefined ? iso(spec.cookedDaysAgo, now) : undefined,
    currentVersionId: versions[versions.length - 1].id,
    versions,
    feedback,
  };
}

const SPECS: Spec[] = [
  {
    id: 'gochujang-bowl', status: 'kochbuch', source: 'ki', favorite: true, motif: 'bowl', hue: 155, daysAgo: 21, cookedDaysAgo: 2,
    notes: 'Mit Kimchi obendrauf noch besser.',
    content: {
      title: 'Gochujang Chicken Bowl',
      description: 'Koreanisch inspirierte Bowl mit krümeligem Hähnchenhack, Paprika und cremiger Avocado.',
      servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 1,
      categories: ['salat-bowl'], tags: ['Koreanisch', 'Proteinreich', 'Schnell'], devices: ['herd'],
      ingredients: [
        [300, 'g', 'Hähnchenhack'], [1, 'Stück', 'Paprika (rot oder bunt)'], [150, 'g', 'Reis (z. B. Basmatireis)'],
        [1, 'Stück', 'Avocado'], [1, 'EL', 'Gochujang'], [1, 'EL', 'Sojasauce'], [1, 'TL', 'Sesamöl'],
        [1, 'Zehe', 'Knoblauch'], [1, 'TL', 'Reisessig', true], [2, 'Stück', 'Frühlingszwiebeln'], [1, 'TL', 'Sesam'],
      ],
      steps: [
        ['Reis nach Packungsanleitung garen.', 15],
        ['Paprika in kleine Würfel schneiden, Knoblauch fein hacken, Frühlingszwiebeln in Ringe schneiden.'],
        // „Hackfleisch“ und „Gemüse“ erkennt die Automatik nicht → fest zugeordnet (Hack, Paprika, Knoblauch)
        ['Öl in einer Pfanne erhitzen, Hackfleisch krümelig anbraten. Gemüse dazugeben und kurz mitbraten.', 6, [0, 1, 7]],
        ['Gochujang, Sojasauce, Sesamöl und optional Reisessig einrühren. Alles gut verrühren und 5 Minuten köcheln lassen.', 5],
        ['Reis in Schüsseln geben, Chicken-Mix darauf anrichten, Avocado in Scheiben dazugeben. Mit Frühlingszwiebeln und Sesam toppen.'],
      ],
    },
    changes: [
      { author: 'nutzer', label: 'Nach Test: mehr Schärfe', amounts: { 0: 350, 4: 2 }, daysAgo: 14 },
      { author: 'nutzer', label: 'Weniger Reis', amounts: { 2: 100 }, daysAgo: 9 },
      { author: 'nutzer', label: 'Meine Kochbuch-Version', amounts: {}, daysAgo: 9 },
    ],
    feedback: [
      { rating: 4, note: 'Lecker, aber zu mild. Mehr Gochujang verwenden.', onVersion: 1, daysAgo: 14 },
      { rating: 5, note: 'Reis war zu viel – 100 g statt 150 g reichen.', onVersion: 2, daysAgo: 9 },
    ],
  },
  {
    id: 'avocado-pasta', status: 'zum_testen', source: 'ki', motif: 'plate', hue: 110, daysAgo: 3,
    content: {
      title: 'Cremige Avocado-Pasta',
      description: 'Pasta mit einer Sauce aus Avocado, Zitrone und Basilikum – fertig in 25 Minuten.',
      servings: 2, prepMinutes: 10, cookMinutes: 15, difficulty: 1,
      categories: ['hauptgericht'], tags: ['Vegetarisch', 'Schnell', 'Sommer'], devices: ['herd'],
      imagePrompt: 'Creamy green avocado pasta with basil and parmesan',
      ingredients: [
        [200, 'g', 'Spaghetti'], [2, 'Stück', 'Avocado'], [1, 'Stück', 'Zitrone'], [1, 'Handvoll', 'Basilikum'],
        [1, 'Zehe', 'Knoblauch'], [2, 'EL', 'Olivenöl'], [30, 'g', 'Parmesan'], [undefined, undefined, 'Salz & Pfeffer'],
      ],
      steps: [
        ['Spaghetti in reichlich Salzwasser al dente kochen. Eine Tasse Nudelwasser aufheben.', 10],
        ['Avocado, Zitronensaft, Basilikum, Knoblauch und Olivenöl fein pürieren.'],
        ['Pasta abgießen, mit der Sauce und etwas Nudelwasser cremig vermengen.'],
        ['Mit Parmesan, Salz und Pfeffer abschmecken und sofort servieren.'],
      ],
    },
  },
  {
    id: 'protein-pancakes', status: 'zum_testen', source: 'ki', motif: 'stack', hue: 40, daysAgo: 1,
    content: {
      title: 'Protein Pancakes',
      description: 'Fluffige Pancakes aus Haferflocken, Banane und Quark.',
      servings: 2, prepMinutes: 5, cookMinutes: 15, difficulty: 1,
      categories: ['fruehstueck'], tags: ['Proteinreich', 'Vegetarisch'], devices: ['herd'],
      ingredients: [
        [80, 'g', 'Haferflocken'], [1, 'Stück', 'Banane'], [2, 'Stück', 'Eier'], [150, 'g', 'Magerquark'],
        [1, 'Messlöffel', 'Proteinpulver'], [100, 'g', 'Heidelbeeren'], [1, 'EL', 'Ahornsirup'],
      ],
      steps: [
        ['Alle Teigzutaten pürieren und 5 Minuten quellen lassen.', 5],
        ['Kleine Pancakes in einer beschichteten Pfanne ausbacken, bis sich Bläschen bilden, dann wenden.', 3],
        ['Mit Heidelbeeren und Ahornsirup servieren.'],
      ],
    },
  },
  {
    id: 'linsen-curry', status: 'kochbuch', source: 'selbst', favorite: true, motif: 'pot', hue: 22, daysAgo: 60, cookedDaysAgo: 5,
    content: {
      title: 'Tomaten-Linsen-Curry',
      description: 'Mein Wohlfühl-Curry mit roten Linsen, Kokosmilch und Spinat.',
      servings: 3, prepMinutes: 10, cookMinutes: 25, difficulty: 1,
      categories: ['hauptgericht'], tags: ['Vegetarisch', 'Meal Prep', 'Comfort Food'], devices: ['herd'],
      ingredients: [
        [200, 'g', 'Rote Linsen'], [1, 'Dose', 'Gehackte Tomaten'], [1, 'Dose', 'Kokosmilch'], [1, 'Stück', 'Zwiebel'],
        [2, 'Zehe', 'Knoblauch'], [2, 'cm', 'Ingwer'], [2, 'TL', 'Currypulver'], [2, 'Handvoll', 'Spinat'], [1, 'EL', 'Rapsöl'],
      ],
      steps: [
        ['Zwiebel, Knoblauch und Ingwer fein würfeln und im Öl glasig dünsten.', 4],
        ['Currypulver kurz mitrösten.'],
        ['Linsen, Tomaten und Kokosmilch zugeben und köcheln lassen, bis die Linsen zerfallen.', 20],
        ['Spinat unterheben, abschmecken.'],
      ],
    },
  },
  {
    id: 'airfryer-chicken', status: 'bewaehrt', source: 'ki', motif: 'plate', hue: 200, daysAgo: 10, cookedDaysAgo: 4,
    content: {
      title: 'Crispy Airfryer Chicken',
      description: 'Knusprige Hähnchenstreifen in Panko mit Joghurt-Dip.',
      servings: 2, prepMinutes: 10, cookMinutes: 14, difficulty: 1,
      categories: ['hauptgericht'], tags: ['Airfryer', 'Proteinreich', 'Schnell'], devices: ['airfryer'],
      ingredients: [
        [400, 'g', 'Hähnchenbrust'], [60, 'g', 'Panko'], [1, 'Stück', 'Ei'], [1, 'TL', 'Paprikapulver'],
        [1, 'EL', 'Olivenöl'], [150, 'g', 'Griechischer Joghurt'], [undefined, undefined, 'Salz & Pfeffer'],
      ],
      steps: [
        ['Hähnchen in Streifen schneiden, würzen.'],
        ['Durch verquirltes Ei ziehen und in Panko wälzen.'],
        ['Mit Öl besprühen, bei 190 °C im Airfryer garen, nach der Hälfte wenden.', 14],
        ['Mit Joghurt-Dip servieren.'],
      ],
    },
    feedback: [{ rating: 5, note: 'Super knusprig! Beim nächsten Mal 2 Minuten länger.', onVersion: 1, daysAgo: 4 }],
  },
  {
    id: 'lasagne', status: 'kochbuch', source: 'import', motif: 'plate', hue: 22, daysAgo: 90, cookedDaysAgo: 30,
    notes: 'Aus Omas Rezeptheft abfotografiert.',
    content: {
      title: 'Omas Lasagne',
      description: 'Klassische Lasagne mit Rinderhack und viel Käse.',
      servings: 4, prepMinutes: 30, cookMinutes: 45, difficulty: 2,
      categories: ['hauptgericht'], tags: ['Comfort Food'], devices: ['herd', 'backofen'],
      ingredients: [
        [500, 'g', 'Rinderhack'], [250, 'g', 'Lasagneplatten'], [700, 'g', 'Passierte Tomaten'], [1, 'Stück', 'Zwiebel'],
        [2, 'Stück', 'Karotten'], [200, 'g', 'Mozzarella'], [50, 'g', 'Parmesan'], [1, 'EL', 'Olivenöl'],
        [250, 'ml', 'Béchamelsauce'],
      ],
      steps: [
        ['Zwiebel und Karotten fein würfeln, im Öl anschwitzen, Hack krümelig braten.', 8],
        ['Passierte Tomaten zugeben und die Sauce köcheln lassen.', 20],
        ['Abwechselnd Sauce, Platten und Béchamel schichten, mit Käse abschließen.'],
        ['Bei 180 °C Umluft backen, bis die Oberfläche goldbraun ist.', 40],
      ],
    },
  },
  {
    id: 'overnight-oats', status: 'kochbuch', source: 'selbst', motif: 'jar', hue: 40, daysAgo: 40, cookedDaysAgo: 1,
    content: {
      title: 'Mango Overnight Oats',
      description: 'Am Abend vorbereitet, morgens sofort fertig.',
      servings: 1, prepMinutes: 5, cookMinutes: 0, difficulty: 1,
      categories: ['fruehstueck'], tags: ['Vegetarisch', 'Meal Prep', 'Schnell'], devices: [],
      ingredients: [
        [50, 'g', 'Haferflocken'], [150, 'ml', 'Hafermilch'], [100, 'g', 'Griechischer Joghurt'],
        [1, 'EL', 'Chiasamen'], [0.5, 'Stück', 'Mango'], [1, 'TL', 'Honig'],
      ],
      steps: [
        ['Haferflocken, Hafermilch, Joghurt und Chiasamen verrühren.'],
        ['Über Nacht abgedeckt im Kühlschrank quellen lassen.'],
        ['Mango würfeln und mit Honig obendrauf geben.'],
      ],
    },
  },
  {
    id: 'kuerbissuppe', status: 'bewaehrt', source: 'selbst', motif: 'pot', hue: 110, daysAgo: 20, cookedDaysAgo: 12,
    content: {
      title: 'Hokkaido-Suppe aus dem Monsieur Cuisine',
      description: 'Samtige Kürbissuppe mit Ingwer und Kokosmilch.',
      servings: 4, prepMinutes: 10, cookMinutes: 25, difficulty: 1,
      categories: ['suppe'], tags: ['Vegetarisch', 'Comfort Food', 'Low Calorie'], devices: ['monsieur-cuisine'],
      ingredients: [
        [800, 'g', 'Hokkaido'], [1, 'Stück', 'Zwiebel'], [2, 'cm', 'Ingwer'], [600, 'ml', 'Gemüsebrühe'],
        [200, 'ml', 'Kokosmilch'], [1, 'EL', 'Rapsöl'],
      ],
      steps: [
        ['Zwiebel und Ingwer in den Mixtopf geben, 5 Sek. / Stufe 5 zerkleinern.'],
        ['Öl zugeben und 3 Min. / 120 °C / Stufe 1 andünsten.', 3],
        ['Kürbis in Stücken und Brühe zugeben, 20 Min. / 100 °C / Stufe 1 garen.', 20],
        ['Kokosmilch zugeben und 1 Min. / Stufe 5–10 langsam ansteigend pürieren.', 1],
      ],
    },
    feedback: [{ rating: 4, note: 'Etwas mehr Ingwer wäre schön.', onVersion: 1, daysAgo: 12 }],
  },
  {
    id: 'kimchi-rice', status: 'ki_entwurf', source: 'ki', motif: 'bowl', hue: 200, daysAgo: 0,
    content: {
      title: 'Kimchi Fried Rice',
      description: 'Resteverwertung auf Koreanisch: gebratener Reis mit Kimchi und Spiegelei.',
      servings: 2, prepMinutes: 5, cookMinutes: 10, difficulty: 1,
      categories: ['hauptgericht'], tags: ['Koreanisch', 'Schnell'], devices: ['herd'],
      ingredients: [
        [400, 'g', 'Reis vom Vortag'], [150, 'g', 'Kimchi'], [2, 'Stück', 'Eier'], [1, 'EL', 'Gochujang'],
        [1, 'EL', 'Sojasauce'], [1, 'TL', 'Sesamöl'], [2, 'Stück', 'Frühlingszwiebeln'],
      ],
      steps: [
        ['Kimchi klein schneiden und in Sesamöl 2 Minuten anbraten.', 2],
        ['Reis, Gochujang und Sojasauce zugeben und alles unter Rühren knusprig braten.', 5],
        ['Spiegeleier braten und auf den Reis setzen, mit Frühlingszwiebeln bestreuen.', 3],
      ],
    },
  },
];

export function createMockRecipes(now = Date.now()): Recipe[] {
  return SPECS.map((s) => build(s, now));
}
