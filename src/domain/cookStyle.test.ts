import { describe, expect, it } from 'vitest';
import { SPICES, WAYS, chosenWays, composeSteps, coveredByServing, forgetWays, learnWays, learnedFor, servingText, spiceOf, wayOf, waysOf, type StyleStep, guessFamily, needsFamily, familyOf, type WayContext } from './cookStyle';
import { sideOf } from './sides';

const step = (id: string, kind: StyleStep['kind'], name: string, text: string, minutes: number, extra: Partial<StyleStep> = {}): StyleStep =>
  ({ ids: [id], kind, name, text, minutes, fixed: true, ...extra });
const mex = SPICES.find((s) => s.id === 'mexikanisch')!;

describe('Kochstil: Würze und Zubereitung (Julia: „die Kochschritte sind pro Baustein immer sehr identisch“)', () => {
  it('der erste Weg jedes Bausteins ist Mashis bisheriger Standard – nichts ändert sich, ohne dass etwas passt', () => {
    for (const [id, ways] of Object.entries(WAYS)) {
      const side = sideOf(id);
      expect(side, id).toBeTruthy();
      expect({ text: ways[0].text, minutes: ways[0].minutes }, id).toEqual(side!.prep);
      for (const w of ways) if (w.into) expect(w.joined, `${id}/${w.id}`).toBeTruthy();
    }
  });

  it('Würze: die der Richtung, gewählt geht vor, „ohne“ ist keine', () => {
    expect(spiceOf(undefined, 'taco')?.id).toBe('mexikanisch');
    expect(spiceOf('indisch', 'taco')?.id).toBe('indisch');
    expect(spiceOf('ohne', 'taco')).toBeUndefined();
    expect(spiceOf(undefined, undefined)).toBeUndefined();
  });

  it('Zubereitung: deine Wahl → dein Standard → Vorschlag der Richtung → Mashis Standard; „in der Sauce“ nur mit köchelnder Sauce', () => {
    const ctx = { direction: 'ofen', sauceSimmers: false, pastaBoils: false };
    expect(wayOf('brokkoli', ctx)?.id).toBe('ofen');
    expect(wayOf('brokkoli', { ...ctx, direction: 'bowl' })?.id).toBe('gedaempft');
    expect(wayOf('brokkoli', ctx, 'gedaempft')?.id).toBe('gedaempft');
    expect(wayOf('brokkoli', ctx, undefined, true)).toBeUndefined(); // dein eigener Text gilt
    expect(waysOf('brokkoli', ctx).map((w) => w.id)).toEqual(['gedaempft', 'ofen']);
    expect(waysOf('brokkoli', { ...ctx, sauceSimmers: true, pastaBoils: true }).map((w) => w.id)).toEqual(['gedaempft', 'ofen', 'nudeln', 'sauce']);
    // Curry ohne köchelnde Sauce: der Vorschlag „in der Sauce“ fällt weg → Standard
    expect(wayOf('haehnchen', { direction: 'curry', sauceSimmers: false, pastaBoils: false })?.id).toBe('pfanne');
  });

  it('wie letztes Mal (Julia: „das Letzte gilt, je Richtung“): nach deinem Standard, vor dem Vorschlag der Richtung', () => {
    const ctx = { direction: 'ofen', sauceSimmers: false, pastaBoils: false };
    const last = learnWays(undefined, 'ofen', { brokkoli: 'gedaempft' });
    expect(last).toEqual({ 'ofen:brokkoli': 'gedaempft' });
    expect(wayOf('brokkoli', { ...ctx, learned: learnedFor(last, 'ofen') })?.id).toBe('gedaempft'); // statt „im Ofen“
    expect(learnedFor(last, 'bowl')).toEqual({}); // andere Richtung: nichts gelernt
    // deine Wahl am Gericht und dein Standard gehen vor
    expect(wayOf('brokkoli', { ...ctx, learned: { brokkoli: 'gedaempft' } }, 'ofen')?.id).toBe('ofen');
    expect(wayOf('brokkoli', { ...ctx, learned: { brokkoli: 'gedaempft' } }, undefined, true)).toBeUndefined();
    // geht heute nicht („mit den Nudeln“ ohne Nudeln): zählt nicht
    expect(wayOf('brokkoli', { ...ctx, direction: 'pasta', learned: { brokkoli: 'nudeln' } })?.id).toBe(wayOf('brokkoli', { ...ctx, direction: 'pasta' })?.id);
    // das Letzte gilt; nichts Neues → dasselbe Objekt (nichts zu speichern)
    const again = learnWays(last, 'ofen', { brokkoli: 'ofen' });
    expect(again).toEqual({ 'ofen:brokkoli': 'ofen' });
    expect(learnWays(again, 'ofen', { brokkoli: 'ofen' })).toBe(again);
    // ohne Richtung ein eigener Topf; eigene Bausteine (mit Doppelpunkt in der id) gehen auch
    expect(learnedFor(learnWays(undefined, undefined, { 'eigen:veg:Kürbis': 'ofen' }), undefined)).toEqual({ 'eigen:veg:Kürbis': 'ofen' });
    // aus den Schritten – auch aus der gemeinsamen Pfanne; deine eigene Zubereitung nicht, die gilt ohnehin
    expect(chosenWays([{ options: [{ id: 'brokkoli', name: 'Brokkoli', ways: [], chosen: 'ofen' }, { id: 'paprika', name: 'Paprika', ways: [], chosen: 'eigen' }] }, {}]))
      .toEqual({ brokkoli: 'ofen' });
  });

  it('doch nicht gekocht: vergessen, was dieses Gericht gemerkt hat – nur, wo seither nichts anderes gemerkt ist', () => {
    const last = { 'bowl:brokkoli': 'ofen', 'bowl:paprika': 'pfanne', 'pasta:brokkoli': 'nudeln' };
    expect(forgetWays(last, 'bowl', { brokkoli: 'ofen', paprika: 'ofen' })).toEqual({ 'bowl:paprika': 'pfanne', 'pasta:brokkoli': 'nudeln' });
    expect(forgetWays(last, 'bowl', { brokkoli: 'gedaempft' })).toBe(last); // nichts davon gemerkt → dasselbe Objekt
    expect(forgetWays({ 'bowl:brokkoli': 'ofen' }, 'bowl', { brokkoli: 'ofen' })).toBeUndefined();
  });
});

describe('Kochstil: zusammenführen und würzen', () => {
  it('eine Pfanne: Gemüse zum gebratenen Protein, gewürzt; die Wahl-Chips wandern mit', () => {
    const out = composeSteps([
      step('haehnchen', 'protein', 'Hähnchenbrust', 'in Streifen schneiden und braten', 8),
      step('paprika', 'veg', 'Paprika', 'in Streifen schneiden, kurz anbraten', 5, { options: [{ id: 'paprika', name: 'Paprika', ways: WAYS.paprika, chosen: 'pfanne' }] }),
      step('salsa', 'sauce', 'Tomatensalsa', 'Tomaten und Zwiebel würfeln, mit Limette mischen', 5),
    ], mex);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      ids: ['haehnchen', 'paprika'], minutes: 8,
      text: 'in Streifen schneiden und braten – vorher mit Kreuzkümmel, Paprikapulver und Salz würzen; nach 3 Min. Paprika (in Streifen schneiden) in dieselbe Pfanne geben',
    });
    expect(out[0].options?.map((o) => o.id)).toEqual(['paprika']);
    expect(out[1].text).toBe('Tomaten und Zwiebel würfeln, mit Limette mischen'); // Salsa: nicht gewürzt
  });

  it('zwei gebratene Proteine: keine gemeinsame Pfanne – jedes für sich gewürzt', () => {
    const out = composeSteps([
      step('haehnchen', 'protein', 'Hähnchenbrust', 'in Streifen schneiden und braten', 8),
      step('halloumi', 'protein', 'Halloumi', 'in Scheiben goldbraun braten', 6),
      step('zucchini', 'veg', 'Zucchini', 'in Scheiben anbraten', 6),
    ], mex);
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.text!.includes('vorher mit Kreuzkümmel'))).toBe(true);
  });

  it('ein Blech: das Längste zuerst, der Rest kommt später dazu; einzeln im Ofen bleibt es ein eigener Schritt', () => {
    const out = composeSteps([
      step('kartoffeln', 'carb', 'Kartoffeln', 'in Spalten schneiden, im Ofen rösten', 35),
      step('brokkoli', 'veg', 'Brokkoli', 'in Röschen mit Öl im Ofen rösten', 20),
      step('halloumi', 'protein', 'Halloumi', 'in Scheiben im Ofen backen', 12),
    ]);
    expect(out).toEqual([expect.objectContaining({
      name: 'Aufs Blech', minutes: 35, ids: ['kartoffeln', 'brokkoli', 'halloumi'],
      text: 'Kartoffeln (in Spalten schneiden), im Ofen rösten; nach 15 Min. Brokkoli (in Röschen) dazu; nach 23 Min. Halloumi (in Scheiben) dazu',
    })]);
    expect(composeSteps([step('kartoffeln', 'carb', 'Kartoffeln', 'in Spalten schneiden, im Ofen rösten', 35)])[0].name).toBe('Kartoffeln');
  });

  it('in der Sauce und mit den Nudeln: gart im Schritt der Sauce bzw. der Pasta mit', () => {
    const [sauce] = composeSteps([
      step('kokoscurry', 'sauce', 'Kokos-Currysauce', 'Currypaste anrösten, Kokosmilch dazu, köcheln', 10),
      step('haehnchen', 'protein', 'Hähnchenbrust', 'würfeln, anbraten und in der Sauce fertig garen', 12, { way: WAYS.haehnchen[2] }),
    ], mex);
    expect(sauce).toMatchObject({ ids: ['kokoscurry', 'haehnchen'], minutes: 12, text: 'Currypaste anrösten, Kokosmilch dazu, köcheln; die Hähnchenwürfel kurz anbraten und darin fertig garen' });
    const [pasta] = composeSteps([
      step('pasta', 'carb', 'Pasta', 'in Salzwasser kochen', 10),
      step('brokkoli', 'veg', 'Brokkoli', 'in Röschen die letzten 3 Min. mit den Nudeln kochen', 3, { way: WAYS.brokkoli[2] }),
    ]);
    expect(pasta.text).toBe('in Salzwasser kochen; die letzten 3 Min. die Brokkoli-Röschen mitkochen');
  });

  it('deine Rezepte und Vorgekochtes bleiben, wie sie sind – nicht gewürzt, nicht in die Pfanne', () => {
    const out = composeSteps([
      { ids: ['rezept:r1'], kind: 'protein', name: 'Knusprige Teststreifen', text: 'nach deinem Rezept', minutes: 20 },
      step('paprika', 'veg', 'Paprika', 'in Streifen schneiden, kurz anbraten', 5),
    ], mex);
    expect(out.map((s) => s.ids)).toEqual([['rezept:r1'], ['paprika']]);
    expect(out[0].text).toBe('nach deinem Rezept');
  });
});

describe('Kochstil: Anrichten je Richtung', () => {
  it('füllt die Vorlage mit deinen Bausteinen, zum Schluss der Handgriff der Würze', () => {
    expect(servingText('taco', { carb: ['Tortillas'], protein: ['Hähnchenbrust'], veg: ['Paprika'], sauce: ['Tomatensalsa'], topping: ['Koriander'] }, mex))
      .toBe('Tortillas mit Hähnchenbrust und Paprika füllen, Tomatensalsa darauf, Koriander darüber – Limettenspalten dazu');
    expect(servingText('burger', { carb: ['Burgerbrötchen'], protein: ['Hack-Patty'], sauce: ['Burgersauce'], veg: ['Salat', 'Tomaten'], topping: ['Cheddar'] }))
      .toBe('Burgerbrötchen belegen: unten Burgersauce, dann Salat und Tomaten, darauf Hack-Patty mit Cheddar, Deckel drauf');
    expect(servingText('pasta', { carb: ['Pasta'], sauce: ['Pesto'], topping: ['Parmesan'] })).toBe('Pasta abgießen und mit Pesto vermengen, mit Parmesan servieren');
    // Nudeln von gestern (Julia: am Aufwärmtag nichts abgießen)
    expect(servingText('pasta', { carb: ['Pasta'], sauce: ['Pesto'], veg: ['Brokkoli'], topping: ['Parmesan'] }, undefined, { warm: true })).toBe('Pasta mit Pesto vermengen, Brokkoli unterheben, mit Parmesan servieren');
    expect(servingText('pasta', { carb: ['Pasta'], protein: ['Testhack'], veg: ['Brokkoli'] }, undefined, { warm: true })).toBe('Pasta mit Testhack und Brokkoli mischen');
    expect(servingText('pasta', { carb: ['Pasta'], topping: ['Parmesan'] }, undefined, { warm: true })).toBe('Pasta auf die Teller, mit Parmesan servieren');
    expect(servingText(undefined, { carb: ['Reis'], topping: ['Sesam'] })).toBe('Alles auf die Teller verteilen, mit Sesam bestreuen');
    expect(servingText('bowl', { carb: ['Reis'] })).toBeUndefined(); // nur ein Baustein: nichts anzurichten
  });

  it('was beim Anrichten ohnehin passiert, braucht keinen eigenen Schritt – anderes bleibt', () => {
    for (const t of ['frisch drüberreiben', 'drüberstreuen', 'drüberbröseln', 'unter die heißen Nudeln heben']) expect(coveredByServing(t), t).toBe(true);
    for (const t of ['grob zupfen', 'hacken und drüberstreuen', 'in Ringe schneiden', undefined]) expect(coveredByServing(t), t).toBe(false);
  });
});

describe('Garfamilien (Julia: Zubereitungswege für alle Bausteine, pflegeleicht)', () => {
  const ctx = { sauceSimmers: true, pastaBoils: false };
  const ids = (id: string, c: WayContext = ctx) => waysOf(id, c).map((w) => `${w.id}:${w.label}`);

  it('Mashis Standard vorn – an der Stelle seiner Garart; die Familie bringt den Rest', () => {
    // Gnocchi (schon gar): Standard „in Salzwasser garen“ passt zu keinem Familienweg → eigener Chip „gekocht“
    expect(ids('gnocchi')).toEqual(['standard:gekocht', 'pfanne:knusprig', 'sauce:in der Sauce', 'ofen:im Ofen']);
    expect(waysOf('gnocchi', ctx)[0]).toMatchObject({ text: 'in Salzwasser garen, bis sie oben schwimmen', minutes: 4 });
    // Süßkartoffel (fest): Standard „im Ofen rösten“ ersetzt den Ofen-Weg
    expect(ids('suesskartoffel')).toEqual(['ofen:geröstet', 'pfanne:gebraten', 'gedaempft:gedämpft']);
    expect(waysOf('suesskartoffel', ctx)[0].text).toBe('würfeln und im Ofen rösten');
    // Tomaten (roh gut): „würfeln“ ist roh
    expect(ids('tomaten')).toEqual(['roh:roh', 'pfanne:angebraten', 'ofen:geröstet']);
    expect(ids('linsen')).toEqual(['koecheln:gekocht', 'sauce:in der Sauce']);
  });

  it('„in der Sauce“ nur, wenn eine köchelt – wie bei den eigenen Wegen', () => {
    expect(ids('gnocchi', { sauceSimmers: false, pastaBoils: false })).not.toContain('sauce:in der Sauce');
  });

  it('eigene Wege (WAYS) gehen vor; ohne Familie bleibt es bei einem Satz', () => {
    expect(ids('brokkoli')[0]).toBe('gedaempft:gedämpft');
    expect(waysOf('pasta', ctx)).toEqual([]);
    expect(waysOf('gurke', ctx)).toEqual([]); // roh – nichts zu wählen
    expect(waysOf('parmesan', ctx)).toEqual([]);
  });

  it('eigene Bausteine: am Namen geraten, sonst deine Wahl – sonst keine (dann fragt Mashi)', () => {
    expect(guessFamily('Kürbis')).toBe('fest');
    expect(guessFamily('Champignons')).toBe('zart');
    expect(guessFamily('grüne Bohnen')).toBe('zart');
    expect(guessFamily('Kichererbsen aus der Dose')).toBe('gar');
    expect(guessFamily('Romanesco')).toBeUndefined();
    expect(ids('eigen:veg:Kürbis')).toEqual(['ofen:geröstet', 'pfanne:gebraten', 'gedaempft:gedämpft']);
    expect(waysOf('eigen:veg:Romanesco', ctx)).toEqual([]);
    expect(needsFamily({ id: 'eigen:veg:Romanesco', name: 'Romanesco', kind: 'veg' })).toBe(true);
    const mine = { ...ctx, families: { 'eigen:veg:Romanesco': 'zart' as const } };
    expect(ids('eigen:veg:Romanesco', mine)[0]).toBe('pfanne:gebraten');
    expect(needsFamily({ id: 'eigen:veg:Romanesco', name: 'Romanesco', kind: 'veg' }, mine.families)).toBe(false);
    // Saucen und Toppings brauchen keine
    expect(needsFamily({ id: 'eigen:topping:Kresse', name: 'Kresse', kind: 'topping' })).toBe(false);
    expect(familyOf({ id: 'eigen:sauce:Kürbispüree', name: 'Kürbispüree', kind: 'sauce' })).toBeUndefined();
  });

  it('deine Wahl schlägt Mashis Familie – auch bei festen Bausteinen', () => {
    expect(familyOf({ id: 'gnocchi', name: 'Gnocchi', kind: 'carb', family: 'gar' }, { gnocchi: 'zart' })).toBe('zart');
  });
});
