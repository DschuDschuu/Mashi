import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { localFoodTable } from './nutrition/localFoods';
import type { PriceRow } from './leafletPrices';
import { flyersFromOverview, ingredientsInLeaflet, ingredientsWithPrices, overviewUrl, pageValidity, wantedIngredients, weekFlyers, type WantedIngredient } from './leaflets';
import type { Recipe, RecipeContent } from './types';

// Aufbau wie beim Prospekt-Dienst, Inhalt erfunden
const pdf = (n: string) => `https://assets.leaflets.schwarz/leaflets/pdfs/test/${n}.pdf`;
const overview = {
  success: true,
  categories: [
    {
      subcategories: [
        {
          name: 'Unsere Aktionsprospekte',
          flyers: [
            { name: 'Aktionsprospekt', offerStartDate: '2026-11-23', offerEndDate: '2026-11-28', pdfUrl: pdf('a') },
            { name: 'Aktionsprospekt', offerStartDate: '2026-11-30', offerEndDate: '2026-12-05', pdfUrl: pdf('b') },
            { name: 'fremdes PDF', offerStartDate: '2026-11-23', offerEndDate: '2026-11-28', pdfUrl: 'https://example.test/x.pdf' },
            { name: 'kaputt', offerStartDate: 'bald', offerEndDate: '2026-12-05', pdfUrl: pdf('c') },
          ],
        },
        { name: 'Sonderprospekte', flyers: [{ name: 'Spielwaren', offerStartDate: '2026-11-01', offerEndDate: '2026-12-24', pdfUrl: pdf('s') }] },
      ],
    },
    'Unsinn',
  ],
};
const week = { start: '2026-11-23', end: '2026-11-28' };

describe('Prospekt-Dienst lesen', () => {
  it('feste Adresse – mit Filiale nur store_id', () => {
    expect(overviewUrl('lidl')).toBe('https://endpoints.leaflets.schwarz/v4/overview/?region_id=0&client_locale=lidl/de-DE');
    expect(overviewUrl('kaufland', '99 1')).toBe('https://endpoints.leaflets.schwarz/v4/overview/?store_id=99%201&client_locale=kaufland/de-DE');
  });

  it('Übersicht: nur mit Gültigkeit und PDF vom Prospekt-Dienst – ein fremdes PDF wird nie geöffnet', () => {
    expect(flyersFromOverview(overview).map((f) => f.pdfUrl)).toEqual([pdf('a'), pdf('b'), pdf('s')]);
    expect(flyersFromOverview(null)).toEqual([]);
  });

  it('Wochenprospekt für den Einkaufstag – sonntags schon der nächste, lange Magazine nicht', () => {
    const flyers = flyersFromOverview(overview);
    expect(weekFlyers(flyers, '2026-11-28').map((f) => f.pdfUrl)).toEqual([pdf('a')]);
    expect(weekFlyers(flyers, '2026-12-05').map((f) => f.pdfUrl)).toEqual([pdf('b')]);
    expect(weekFlyers(flyers, '2027-01-02')).toEqual([]);
  });
});

describe('Gültigkeit je Seite', () => {
  it('„Ab Mo.“/„Ab Do. … bis Sa.“, Seiten ohne Angabe gehören zum Abschnitt davor, mehrere: das späteste', () => {
    const v = pageValidity([
      'Titelseite ohne Datum',
      'Ab Mo. 23.11. bis Sa. 28.11. Obst',
      'Noch mehr Obst',
      'AB DO. 26.11. Fleisch',
      'ab Mo. 23.11. … ab Do. 26.11. … ab Fr. 27.11. gemischt',
      'Ab Mo. 16.11. (alter Coupon, zählt nicht)',
    ], week);
    expect(v.map((x) => x.from)).toEqual(['2026-11-23', '2026-11-23', '2026-11-23', '2026-11-26', '2026-11-27', '2026-11-27']);
    expect(v.every((x) => x.until === '2026-11-28')).toBe(true);
  });

  it('Kaufland-Schreibweise und Jahreswechsel', () => {
    expect(pageValidity(['AB MONTAG, 23.11.'], week)[0].from).toBe('2026-11-23');
    expect(pageValidity(['Ab Sa. 2.1.'], { start: '2026-12-28', end: '2027-01-02' })[0].from).toBe('2027-01-02');
  });
});

describe('Deine Zutaten im Prospekt (ohne KI)', () => {
  const content = (names: string[]): RecipeContent => ({
    title: 'T', description: '', servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
    ingredients: names.map((name, i) => ({ id: `i${i}`, name, amount: 100, unit: 'g' })), steps: [], categories: [], tags: [], devices: [],
  });
  const base = createMockRecipes()[0];
  const recipe = (id: string, names: string[]): Recipe => ({ ...structuredClone(base), id, status: 'kochbuch', versions: [{ ...base.versions[0], id: `${id}-v`, content: content(names) }], currentVersionId: `${id}-v` });

  it('gesucht wird nach deinen Zutaten samt bekannter Schreibweisen – Grundvorrat (Salz) nicht', () => {
    const wanted = wantedIngredients([recipe('r', ['Hähnchenbrust', 'Testkohl', 'Salz'])], localFoodTable);
    const chicken = wanted.find((w) => w.name === 'Hähnchenbrust');
    expect(chicken?.words).toContain('hähnchenbrustfilet');
    expect(wanted.some((w) => w.name === 'Testkohl')).toBe(true);
    expect(wanted.some((w) => /salz/i.test(w.name))).toBe(false);
  });

  const want = (name: string, ...words: string[]): WantedIngredient => ({ key: `name:${name.toLowerCase()}`, name, words: [name.toLowerCase(), ...words] });

  it('Kopfwort zählt: Rispentomaten ja, Salat-Sauce und Honig-Lebkuchenteig nicht; Trennstriche am Zeilenende zusammen', () => {
    const pages = [
      'Ab Mo. 23.11. bis Sa. 28.11.\nMarokk. Rispentomaten 500 g 0.99\nBRASCH Salat-Sauce 1.29\nHonig-\nLebkuchenteig',
      'AB DO. 26.11. Frische Hähnchen-\nbrustfilets 4.99 Rinderhack-\nfleisch 3.49',
    ];
    const drafts = ingredientsInLeaflet(pages, week, [want('Tomate'), want('Salat'), want('Honig'), want('Hähnchenbrust', 'hähnchenbrustfilet'), want('Hackfleisch')]);
    expect(drafts).toEqual([
      { name: 'Rispentomaten', food: 'Tomate', from: '2026-11-23', until: '2026-11-28' },
      { name: 'Hähnchenbrustfilets', food: 'Hähnchenbrust', from: '2026-11-26', until: '2026-11-28' },
      { name: 'Rinderhackfleisch', food: 'Hackfleisch', from: '2026-11-26', until: '2026-11-28' },
    ]);
  });

  it('mehrfach im Prospekt: die Seite, die am frühesten gilt; mehrwortige Namen als Ganzes', () => {
    const pages = ['AB DO. 26.11. Rote Linsen 1.19 Zucchini', 'Ab Mo. 23.11. Zucchini, Stück 0.79'];
    const drafts = ingredientsInLeaflet(pages, week, [want('Zucchini'), { key: 'name:rote linsen', name: 'Rote Linsen', words: ['rote linsen'] }]);
    // Zucchini zuerst auf der Donnerstag-Seite gefunden, dann durch die frühere Montag-Seite ersetzt
    expect(drafts).toEqual([
      { name: 'Zucchini', food: 'Zucchini', from: '2026-11-23', until: '2026-11-28' },
      { name: 'Rote Linsen', food: 'Rote Linsen', from: '2026-11-26', until: '2026-11-28' },
    ]);
  });

  it('nichts Falsches: „Ei“ nicht in „Eis“, „Reise(n)“ ist kein Reis, „Automaten“ keine Tomaten (echte Fehlgriffe)', () => {
    const wanted = [{ key: 'food:ei', name: 'Ei', words: ['ei'] }, want('Reis'), want('Tomaten')];
    expect(ingredientsInLeaflet(['Eis am Stiel. Lidl Reisen nach Mallorca. Deine Reise, Städtereise. Kaffee-Vollautomaten'], week, wanted)).toEqual([]);
    // echter Reis wird weiter gefunden
    expect(ingredientsInLeaflet(['Reis 1 kg'], week, wanted).map((d) => d.name)).toEqual(['Reis']);
    // Süßes und Zahnpflege, die auf eine Zutat enden (Kaufland) – auch mit Bindestrich; Schokolade selbst schon
    const sweet = [want('Pasta'), want('Linsen'), want('Kartoffeln'), want('Schokolade')];
    expect(ingredientsInLeaflet(['Zahnpasta, Schokolinsen, Schoko-Linsen, Marzipankartoffeln'], week, sweet)).toEqual([]);
    expect(ingredientsInLeaflet(['Vollmilch-Schokolade, Bratkartoffeln'], week, sweet).map((d) => d.name)).toEqual(['Bratkartoffeln', 'Vollmilch-Schokolade']);
    // kurze Zutaten (Reis) nur als ganzes Wort – sonst wäre jeder „Normalpreis“ Reis; „Basmatireis“ über deine Schreibweise
    expect(ingredientsInLeaflet(['Normalpreis 2.99, Basmatireis, Romatomaten'], week, wanted).map((d) => d.name)).toEqual(['Romatomaten']);
    expect(ingredientsInLeaflet(['Basmatireis'], week, [want('Reis', 'basmatireis')]).map((d) => d.name)).toEqual(['Basmatireis']);
  });
});

describe('Deine Zutaten mit Lidl-Preis', () => {
  const row = (p: Partial<PriceRow>): PriceRow => ({
    page: 1, brand: '', name: '', variant: '', description: '', quantity: '', price: 1, priceFrom: false, plus: false,
    regular: null, uvp: false, discount: '', promo: '', basePrice: '', validFrom: '', check: '', x: 0, y: 0, ...p,
  });
  const want = (name: string, ...words: string[]): WantedIngredient => ({ key: `name:${name.toLowerCase()}`, name, words: [name.toLowerCase(), ...words] });
  const wanted = [want('Pasta', 'bandnudeln', 'nudeln'), want('Lachs'), want('Hackfleisch'), want('Rote Linsen', 'rote linsen')];

  it('Preis, Statt-Preis, Packung und Tag kommen mit; gesucht wird nur im Artikelnamen', () => {
    const drafts = ingredientsWithPrices([
      row({ name: 'Feine Bandnudeln', brand: 'TESTMARKE', quantity: '500 g', price: 1.19, regular: 1.49 }),
      row({ name: 'Lachsfiletportionen XXL', quantity: '5x 120 g', price: 8.99, validFrom: 'Do. 26.11.' }),
      row({ name: 'Rote Linsen', quantity: '1 kg', price: 2.49, regular: 2.49 }),
      // „Pasta“ nur in der Beschreibung – kein Treffer; Preis ohne Artikel auch nicht
      row({ name: 'Pastasauce', description: 'Passt zu Pasta', price: 0.99 }),
      row({ name: '', price: 0.5, check: 'kein Artikel gefunden' }),
    ], week, wanted);
    expect(drafts).toEqual([
      { name: 'Feine Bandnudeln', food: 'Pasta', price: 1.19, regular: 1.49, amount: 500, unit: 'g', from: '2026-11-23', until: '2026-11-28' },
      { name: 'Lachsfiletportionen XXL', food: 'Lachs', price: 8.99, amount: 600, unit: 'g', from: '2026-11-26', until: '2026-11-28' },
      // Statt-Preis nicht höher als der Preis: weggelassen
      { name: 'Rote Linsen', food: 'Rote Linsen', price: 2.49, amount: 1000, unit: 'g', from: '2026-11-23', until: '2026-11-28' },
    ]);
  });

  it('je Zutat ein Angebot: das früheste, am selben Tag das günstigere; Lidl Plus steht im Namen', () => {
    const drafts = ingredientsWithPrices([
      row({ name: 'Rinderhackfleisch', price: 4.99, validFrom: 'Do. 26.11.' }),
      row({ name: 'Gemischtes Hackfleisch', price: 3.99 }),
      row({ name: 'Hackfleisch XXL', price: 3.49, plus: true }),
      // Tag vor dem Prospekt (Kachel „seit So. 15.11.“) zählt wie der Prospektbeginn
      row({ name: 'Bandnudeln', price: 0.89, validFrom: 'seit So. 15.11.' }),
    ], week, wanted);
    expect(drafts.map((d) => [d.food, d.name, d.price, d.from])).toEqual([
      ['Hackfleisch', 'Hackfleisch XXL (Lidl Plus)', 3.49, '2026-11-23'],
      ['Pasta', 'Bandnudeln', 0.89, '2026-11-23'],
    ]);
  });
});

describe('Zuschnitte sind dieselbe Zutat', () => {
  const want = (name: string): WantedIngredient => ({ key: `name:${name.toLowerCase()}`, name, words: [name.toLowerCase()] });
  const week2 = { start: '2026-11-23', end: '2026-11-28' };
  it('Lachsfiletportionen → Lachs, Speckwürfel → Speck – Oberkeulen bleiben keine Brust', () => {
    const found = (text: string, ...names: string[]) => ingredientsInLeaflet([text], week2, names.map(want)).map((d) => `${d.food}:${d.name}`);
    expect(found('Lachsfiletportionen XXL', 'Lachs')).toEqual(['Lachs:Lachsfiletportionen']);
    expect(found('Speckwürfel 2x 100 g', 'Speck')).toEqual(['Speck:Speckwürfel']);
    expect(found('Hähnchen-Oberkeulen', 'Hähnchenbrust')).toEqual([]);
    // „Filet“ allein ist zu kurz für eine Zutat – nichts
    expect(found('Filetstreifen', 'Lachs')).toEqual([]);
  });
});
