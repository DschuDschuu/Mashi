import { describe, expect, it } from 'vitest';
import { createMockRecipes } from '../data/mockRecipes';
import { localFoodTable } from './nutrition/localFoods';
import {
  activeOffers, addOffers, buildOffersPrompt, ingredientKeys, matchOffer, MAX_OFFER_TEXT, offerPackLabel, offerRecipes, offerWeekEnd, parseOffersReply,
  parseOffersText, shopDayHint, OffersReplyError, type Offer,
} from './offers';
import { emptyPantry } from './pantry';
import type { Ingredient, Recipe, RecipeContent } from './types';

// alles erfunden – keine echten Prospekte, Preise oder Rezepte
const TODAY = '2026-11-21'; // ein Samstag
const NOW = '2026-11-21T09:00:00.000Z';
let n = 0;
const id = () => `o${n++}`;

const content = (ingredients: Ingredient[], servings = 2): RecipeContent => ({
  title: 'T', description: '', servings, prepMinutes: 0, cookMinutes: 0, difficulty: 1,
  ingredients, steps: [], categories: [], tags: [], devices: [],
});
const base = createMockRecipes()[0];
const recipe = (rid: string, names: string[], extra: Partial<Recipe> = {}): Recipe => ({
  ...structuredClone(base), id: rid, status: 'kochbuch', favorite: false, feedback: [], lastCookedAt: undefined,
  versions: [{ ...base.versions[0], id: `${rid}-v`, content: content(names.map((name, i) => ({ id: `${rid}-${i}`, name, amount: 200, unit: 'g' }))) }],
  currentVersionId: `${rid}-v`,
  ...extra,
});
const offer = (name: string, extra: Partial<Offer> = {}): Offer => ({ id: id(), store: 'Lidl', name, until: '2026-11-28', addedAt: NOW, ...extra });

describe('Gültigkeit', () => {
  it('ohne Angabe bis Samstag – sonntags schon die nächste Woche', () => {
    expect(offerWeekEnd(new Date(2026, 10, 16))).toBe('2026-11-21'); // Montag
    expect(offerWeekEnd(new Date(2026, 10, 21))).toBe('2026-11-21'); // Samstag
    expect(offerWeekEnd(new Date(2026, 10, 22))).toBe('2026-11-28'); // Sonntag
  });

  it('Einkaufstag samstags: freitags „morgen“, samstags „heute“', () => {
    expect(shopDayHint(new Date(2026, 10, 20))).toBe('morgen');
    expect(shopDayHint(new Date(2026, 10, 21))).toBe('heute');
    expect(shopDayHint(new Date(2026, 10, 18))).toBeNull();
  });
});

describe('Text lesen ohne KI', () => {
  it('eine Zeile je Angebot – Packung, Preis, Preis vorher', () => {
    const r = parseOffersText('Hähnchenbrust 1 kg 6,99 €\nRispentomaten 500 g 1,29 statt 1,79\nZucchini 0,79 €/Stück\nEier 10er 2,49', TODAY);
    expect(r.offers).toEqual([
      { name: 'Hähnchenbrust', price: 6.99, amount: 1000, unit: 'g' },
      { name: 'Rispentomaten', price: 1.29, regular: 1.79, amount: 500, unit: 'g' },
      { name: 'Zucchini', price: 0.79 },
      { name: 'Eier', price: 2.49, amount: 10, unit: 'Stück' },
    ]);
    expect(r.unread).toEqual([]);
  });

  it('kopierter Text, Name zuerst: Grundpreis und Prozente zählen nicht als Preis', () => {
    const r = parseOffersText([
      'Hähnchen-Innenbrustfilets', '400-g-Packung', '1 kg = 10,73', '-20%', '5,39', '4,29*',
      'Mini-Gurken', '250 g', '(1 kg = 3,96 €)', '-.99',
    ].join('\n'), TODAY);
    expect(r.offers).toEqual([
      { name: 'Hähnchen-Innenbrustfilets', price: 4.29, regular: 5.39, amount: 400, unit: 'g' },
      { name: 'Mini-Gurken', price: 0.99, amount: 250, unit: 'g' },
    ]);
  });

  it('kopierter Text, Preis zuerst: Preise gehören zum folgenden Namen, die Packung zum vorigen', () => {
    const r = parseOffersText([
      '-30%', '2,49', '1,69*', 'Rinderhackfleisch', '500-g-Packung', '1 kg = 3,38',
      '1,19', 'Brokkoli', 'je 500 g',
    ].join('\n'), TODAY);
    expect(r.offers).toEqual([
      { name: 'Rinderhackfleisch', price: 1.69, regular: 2.49, amount: 500, unit: 'g' },
      { name: 'Brokkoli', price: 1.19, amount: 500, unit: 'g' },
    ]);
  });

  it('Gültigkeit aus dem Text, Datumszeilen sind kein Angebot', () => {
    const r = parseOffersText('Angebote gültig ab Mo. 23.11. bis Sa. 28.11.\nMo. 23.11.\nPaprika 3 Stück 1,49', TODAY);
    expect(r.until).toBe('2026-11-28');
    expect(r.offers).toEqual([{ name: 'Paprika', price: 1.49, amount: 3, unit: 'Stück' }]);
    expect(r.unread).toEqual([]);
  });

  it('ohne Jahr: Ende Dezember gilt „bis 2.1.“ im neuen Jahr', () => {
    expect(parseOffersText('gültig bis 2.1.', '2026-12-28').until).toBe('2027-01-02');
    expect(parseOffersText('24.11. – 29.11.2026', TODAY).until).toBe('2026-11-29');
  });

  it('nicht Verstandenes wird gesammelt – Überschrift ohne Preis, übrig gebliebener Preis', () => {
    const named = parseOffersText('Obst & Gemüse\nÄpfel 2 kg 2,22', TODAY);
    expect(named.offers).toEqual([{ name: 'Äpfel', price: 2.22, amount: 2000, unit: 'g' }]);
    expect(named.unread).toEqual(['Obst & Gemüse']);
    // Preis zuerst: ein Preis am Ende hat keinen Namen mehr
    const priced = parseOffersText('1,19\nBrokkoli\n2,99', TODAY);
    expect(priced.offers).toEqual([{ name: 'Brokkoli', price: 1.19 }]);
    expect(priced.unread).toEqual(['2,99']);
  });

  it('Werbezeilen allein sind kein Name – und nicht „nicht verstanden“', () => {
    const r = parseOffersText('Aktion\nSuper-Knaller\n-20%\nSchmand 200 g 0,69', TODAY);
    expect(r.offers.map((o) => o.name)).toEqual(['Schmand']);
    expect(r.unread).toEqual([]);
  });
});

describe('Zuordnung zu Lebensmitteln', () => {
  const key = (name: string) => matchOffer(name, localFoodTable)?.key;

  it('wie Zutaten, mit Bindestrich und über das Wortende', () => {
    expect(key('Hähnchenbrust')).toBe(matchOffer('Hähnchenbrustfilet', localFoodTable)?.key);
    expect(key('Hähnchen-Innenbrustfilets')).toBe(key('Hähnchenbrust'));
    expect(key('Rispentomaten')).toBe(key('Tomaten'));
    expect(key('Rinderhackfleisch')).toBeDefined();
  });

  it('kein Lebensmittel → nicht zugeordnet', () => {
    expect(key('Akku-Bohrschrauber')).toBeUndefined();
  });

  it('kennt die Tabelle es nicht, heißt eine deiner Zutaten aber genauso: zählt (nur dann)', () => {
    // „Testkohl“ ist erfunden – steht in keiner Tabelle
    const keys = ingredientKeys([recipe('r', ['Testkohl'])], localFoodTable);
    expect(matchOffer('Testkohl', localFoodTable)).toBeUndefined();
    expect(matchOffer('Testkohl', localFoodTable, keys)?.name).toBe('Testkohl');
    expect(matchOffer('Akku-Bohrschrauber', localFoodTable, keys)).toBeUndefined();
    expect(offerRecipes([recipe('r', ['Testkohl'])], [offer('Testkohl')], localFoodTable, { today: TODAY }).map((m) => m.recipe.id)).toEqual(['r']);
  });
});

describe('Übernehmen', () => {
  it('Abgelaufenes fliegt raus, dasselbe Angebot desselben Markts wird ersetzt', () => {
    const old = [
      offer('Brokkoli', { until: '2026-11-14' }),
      offer('Hähnchenbrust', { price: 6.99 }),
      offer('Hähnchenbrust', { store: 'Rewe', price: 7.49 }),
    ];
    const next = addOffers(old, [{ name: 'hähnchenbrust', price: 5.99 }, { name: 'Paprika', price: 1.49, until: '2026-11-25' }], 'Lidl', '2026-11-28', TODAY, NOW, id);
    expect(next.map((o) => [o.store, o.name, o.price, o.until])).toEqual([
      ['Rewe', 'Hähnchenbrust', 7.49, '2026-11-28'],
      ['Lidl', 'hähnchenbrust', 5.99, '2026-11-28'],
      ['Lidl', 'Paprika', 1.49, '2026-11-25'],
    ]);
  });

  it('Packung zum Anzeigen', () => {
    expect([offerPackLabel({ amount: 400, unit: 'g' }), offerPackLabel({ amount: 1500, unit: 'g' }), offerPackLabel({ amount: 1000, unit: 'ml' }), offerPackLabel({ amount: 10, unit: 'Stück' }), offerPackLabel({})])
      .toEqual(['400 g', '1,5 kg', '1 l', '10 Stück', '']);
  });

  it('nur Gültiges zählt', () => {
    expect(activeOffers([offer('A', { until: '2026-11-20' }), offer('B', { until: TODAY })], TODAY).map((o) => o.name)).toEqual(['B']);
  });
});

describe('Passende Rezepte', () => {
  const recipes = [
    recipe('curry', ['Hähnchenbrust', 'Reis', 'Zucchini']),
    recipe('salat', ['Tomaten', 'Gurke']),
    recipe('pasta', ['Spaghetti', 'Parmesan']),
    recipe('fav', ['Tomaten', 'Gurke'], { favorite: true }),
  ];
  const offers = [offer('Hähnchen-Innenbrustfilets', { price: 4.29 }), offer('Rispentomaten', { store: 'Rewe' })];

  it('Rezepte mit Angebots-Zutaten, Hähnchen wiegt mehr als Gemüse, Favoriten vor Gleichen', () => {
    const m = offerRecipes(recipes, offers, localFoodTable, { today: TODAY });
    expect(m.map((x) => x.recipe.id)).toEqual(['curry', 'fav', 'salat']);
    expect(m[0].onOffer.map((o) => [o.offer.store, o.offer.name])).toEqual([['Lidl', 'Hähnchen-Innenbrustfilets']]);
    expect(m[0].missing.length).toBe(2);
  });

  it('schon Vorrätiges zählt mit und steht als „da“', () => {
    const pantry = { ...emptyPantry(), items: [{ id: 'p1', name: 'Gurke', amount: 1, unit: 'Stück' as const, addedAt: NOW }] };
    const m = offerRecipes(recipes, offers, localFoodTable, { today: TODAY, pantry });
    expect(m.find((x) => x.recipe.id === 'salat')?.have).toEqual(['Gurke']);
  });

  it('Geplantes, gerade Gekochtes und Abgelaufenes', () => {
    const cooked = [...recipes.slice(1), recipe('curry', ['Hähnchenbrust', 'Reis', 'Zucchini'], { lastCookedAt: '2026-11-19T18:00:00.000Z' })];
    const m = offerRecipes(cooked, offers, localFoodTable, { today: TODAY, planned: new Set(['fav']) });
    expect(m.map((x) => x.recipe.id)).toEqual(['salat', 'curry']);
    expect(offerRecipes(recipes, offers.map((o) => ({ ...o, until: '2026-11-20' })), localFoodTable, { today: TODAY })).toEqual([]);
  });
});

describe('KI als Notlösung', () => {
  it('Auftrag mit Markt, Datum und gekürztem Text', () => {
    const p = buildOffersPrompt('x'.repeat(MAX_OFFER_TEXT + 500), 'Lidl', TODAY);
    expect(p).toContain('Prospekt von Lidl');
    expect(p).toContain(TODAY);
    expect(p.length).toBeLessThan(MAX_OFFER_TEXT + 2000);
  });

  it('Antwort lesen: in ```json, abgeschnitten, Unplausibles fällt weg', () => {
    const reply = '```json\n[{"name":"Hähnchen-Innenbrustfilets","food":"Hähnchenbrust","price":4.29,"regular":5.39,"amount":0.4,"unit":"kg","until":"2026-11-28"},'
      + '{"name":"Gurke","price":0,"regular":1,"amount":2,"unit":"Packung"},{"name":"Brok';
    expect(parseOffersReply(reply)).toEqual([
      { name: 'Hähnchen-Innenbrustfilets', food: 'Hähnchenbrust', price: 4.29, regular: 5.39, amount: 400, unit: 'g', until: '2026-11-28' },
      { name: 'Gurke' },
    ]);
  });

  it('nichts Lesbares → Fehler mit Meldung', () => {
    expect(() => parseOffersReply('Leider kann ich das nicht.')).toThrow(OffersReplyError);
  });
});
