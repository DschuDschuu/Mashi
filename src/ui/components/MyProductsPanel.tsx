import { useState, type ReactNode } from 'react';
import { FOOD_CHOICES, guessMatch } from '../../domain/nutrition/localFoods';
import { levelNameFromFat } from '../../domain/nutrition/fatLevels';
import { brandOf, nameOf, type MyProduct, type SharedMatch } from '../../domain/nutrition/myProducts';
import { MatchChips, visibleExcludes, type Match } from './MatchChips';
import { newId } from '../../domain/recipe';
import { shelfDaysForFood } from '../../domain/shelfLife';
import { usePantry, useProducts } from '../../data/store';
import type { ScannedProduct } from '../../domain/nutrition/openFoodFacts';
import { barcodeLookup } from '../../services';
import { BarcodeScanner } from './BarcodeScanner';
import { Icon } from './Icon';
import { BrandNames } from './BrandNames';
import { parseNum, toField, type Values } from './productFields';
import { purchasesOf } from '../../domain/bons';

/** Was Mashi ohne Angabe schätzt – vom ersetzten Lebensmittel (Mozzarella 7 Tage) */
export function shelfEstimate(replaces: string[], custom: Parameters<typeof shelfDaysForFood>[2]): string {
  const id = replaces[0];
  const days = id ? shelfDaysForFood(id, FOOD_CHOICES.find((f) => f.id === id)?.kind, custom) : undefined;
  if (!id) return 'leer = Mashi schätzt';
  return days ? `leer = geschätzt ${days} Tage` : 'leer = hält lange';
}
const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/**
 * Ein Formular für eigene Produkte – neu, als weitere Sorte, zum Bearbeiten und aus der Bon-Prüfung.
 * Reihenfolge: Name → „Barcode scannen“ / „Open Food Facts“ → Werte, Packung, Haltbarkeit, „gilt für“.
 * Bei neuen Produkten füllt sich „gilt für“ aus dem Namen („Milch“ → der 0,1-%-Eintrag), bis du selbst
 * an den Chips etwas änderst.
 * @param shared ein Produkt, das schon in „Meine Lebensmittel“ steht: Name, „gilt für“ und Haltbarkeit
 *   stellst du direkt in der Kachel ein (gemeinsam für alle Sorten) – hier nur Marke, Werte, Packung
 * @param afterName unter dem Namen – z. B. „gibt es schon, weitere Sorte?“ und die Stufen-Chips
 * @param nameOnly nur der Name (Gewürz: keine Nährwerte), „Hinzufügen“ ruft onNameOnly
 * @param onNoValues ohne Werte speichern ist erlaubt (Immer im Haus: dann nur die Stufe)
 */
export function ProductForm({ initial, onSave, onCancel, shared, afterName, nameOnly, onNameOnly, onNoValues }: {
  initial?: Partial<MyProduct>; onSave: (p: MyProduct) => void; onCancel: () => void; shared?: SharedMatch;
  afterName?: (name: string) => ReactNode; nameOnly?: boolean; onNameOnly?: (name: string) => void; onNoValues?: (name: string) => void;
}) {
  const products = useProducts();
  const sortOnly = !!shared;
  // Ältere Namen mit Marke in Klammern: getrennt anzeigen – gespeichert wird es beim Speichern
  const [name, setName] = useState(shared?.name ?? (initial?.name ? nameOf({ name: initial.name, brand: initial.brand }) : ''));
  const [brand, setBrand] = useState(initial?.name ? brandOf({ name: initial.name, brand: initial.brand }) ?? '' : '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [ean, setEan] = useState(initial?.ean);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Zusatzwerte vom Scan (Zucker, Salz …) – das Formular zeigt nur die vier Hauptwerte */
  const [extra, setExtra] = useState<Partial<MyProduct['per100g']>>({});
  /** Bei bestehenden Produkten: gefundene Werte als Angebot, nicht automatisch */
  const [offer, setOffer] = useState<ScannedProduct | null>(null);
  /** Suche bei Open Food Facts (per Name) – offen, Suchwort, Treffer */
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ScannedProduct[] | null>(null);
  // ohne eigene Werte gespeichert: Felder leer (nicht „0“)
  const own = initial?.noValues ? undefined : initial?.per100g;
  const [values, setValues] = useState<Values>({
    kcal: toField(own?.kcal),
    protein: toField(own?.protein),
    carbs: toField(own?.carbs),
    fat: toField(own?.fat),
  });
  /** neu und noch nichts festgelegt: „gilt für“ folgt dem Namen (null), bis du an den Chips etwas änderst */
  const follows = !initial?.id && !sortOnly && !initial?.replaces?.length;
  const [ownMatch, setOwnMatch] = useState<Match | null>(follows ? null : shared ?? { replaces: initial?.replaces ?? [], names: initial?.names ?? [], excludes: initial?.excludes ?? [] });
  const match = ownMatch ?? guessMatch(name);
  const [packAmount, setPackAmount] = useState(toField(initial?.packageAmount));
  const [packUnit, setPackUnit] = useState<'g' | 'ml' | 'Stück'>(initial?.packageUnit ?? 'g');
  const [packPrice, setPackPrice] = useState(toField(initial?.packagePrice));
  /** weitere Größen als Liste („1000, 1400“) */
  /** weitere Größen derselben Sorte – je eine Zeile (Julia: statt „1000; 1400“ in einem Feld) */
  const [moreSizes, setMoreSizes] = useState<string[]>((initial?.packageSizes ?? []).map((n) => toField(n)));
  const [shelf, setShelf] = useState(toField(initial?.shelfDays));
  const pantry = usePantry();
  const shelfCustom = pantry.shelfDays;
  /** diese Sorte gibt es schon vom Kassenbon – dann gilt dessen Preis */
  const bought = !!initial?.id && purchasesOf(pantry.bons, (l) => l.productId === initial.id).length > 0;
  const [error, setError] = useState<string | null>(null);
  // „Milch“ mit 3,5 g Fett: Stufe in den Namen? (nur Vorschlag – die Rezepte ordnen über den Namen zu)
  const levelName = sortOnly ? undefined : levelNameFromFat(name, parseNum(values.fat));

  const submit = () => {
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    if (nameOnly) return onNameOnly?.(name.trim());
    const kcal = parseNum(values.kcal);
    const protein = parseNum(values.protein);
    const carbs = parseNum(values.carbs);
    const fat = parseNum(values.fat);
    // Immer im Haus ohne Werte: nur die Stufe, kein Produkt
    const empty = [values.kcal, values.protein, values.carbs, values.fat].every((v) => !v.trim());
    if (onNoValues && !ean && empty) return onNoValues(name.trim());
    // alle leer: ohne eigene Werte – Mashi rechnet mit der Tabelle (Julia: „Meine Lebensmittel“ auch ohne Etikett)
    if (!empty && (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined)) {
      return setError('Bitte alle vier Werte vom Etikett eintragen (pro 100 g) – oder alle leer lassen, dann rechnet Mashi mit der Tabelle.');
    }
    const amount = parseNum(packAmount);
    const price = parseNum(packPrice);
    if (price !== undefined && !amount) return setError('Für den Preis braucht Mashi die Packungsgröße.');
    // getrennt mit „;“, Leerzeichen oder „, “ – ein Komma ohne Leerzeichen ist das Dezimalkomma (1,5)
    const typed = moreSizes.filter((x) => x.trim());
    if (typed.some((x) => !(parseNum(x)! > 0))) return setError('Weitere Größe bitte als Zahl, z. B. 1000 – oder die Zeile entfernen.');
    const sizes = typed.map((x) => parseNum(x)!).filter((n) => n !== amount);
    if (sizes.length && !amount) return setError('Für weitere Größen braucht Mashi zuerst die übliche Packungsgröße.');
    const shelfDays = parseNum(shelf);
    if (!sortOnly && shelf.trim() && (!shelfDays || shelfDays > 365 || !Number.isInteger(shelfDays))) return setError('Haltbarkeit bitte in ganzen Tagen (1 bis 365).');
    const ex = visibleExcludes(name, match);
    onSave({
      id: initial?.id ?? newId('p'),
      name: name.trim(),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(detail.trim() ? { detail: detail.trim() } : {}),
      replaces: match.replaces,
      ...(match.names.length ? { names: match.names } : {}),
      ...(ex.length ? { excludes: ex } : {}),
      // Zusatzwerte vom Etikett (Zucker, Salz …) behalten – das Formular zeigt nur die vier Hauptwerte
      ...(empty
        ? { per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, noValues: true }
        : { per100g: { ...own, ...extra, kcal: kcal!, protein: protein!, carbs: carbs!, fat: fat! } }),
      ...(ean ? { ean } : {}),
      ...(amount ? { packageAmount: amount, packageUnit: packUnit } : {}),
      ...(amount && sizes.length ? { packageSizes: [...new Set(sizes)] } : {}),
      ...(amount && price !== undefined ? { packagePrice: price } : {}),
      // Sorte: die Haltbarkeit kommt aus der Kachel (gemeinsam), siehe withShared
      ...(sortOnly ? (shared?.shelfDays ? { shelfDays: shared.shelfDays } : {}) : shelfDays ? { shelfDays } : {}),
      updatedAt: new Date().toISOString(),
    });
  };

  const numField = (key: keyof Values, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input inputMode="decimal" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
    </label>
  );

  /** Werte von Open Food Facts ins Formular übernehmen (bei bestehenden Produkten nur auf Wunsch) */
  const applyScan = (found: ScannedProduct, note = 'Werte von Open Food Facts (von der Community gepflegt) – bitte kurz mit dem Etikett vergleichen.') => {
    const { kcal, protein, carbs, fat, ...rest } = found.per100g;
    // weitere Sorte: der Name gilt für alle Sorten – von Open Food Facts nur die Marke
    if (!sortOnly) setName(found.name);
    if (found.brand) setBrand(found.brand);
    setValues({ kcal: toField(kcal), protein: toField(protein), carbs: toField(carbs), fat: toField(fat) });
    setExtra(rest);
    if (found.packageAmount) {
      setPackAmount(toField(found.packageAmount));
      setPackUnit(found.packageUnit ?? 'g');
    }
    // gefunden per Suche: den Barcode gleich mitmerken (wenn du ihn nicht schon bei einem anderen Produkt hast)
    if (found.ean && !ean && !products.some((p) => p.ean === found.ean && p.id !== initial?.id)) setEan(found.ean);
    setOffer(null);
    setHits(null);
    setSearching(false);
    setScanNote(note);
  };

  /**
   * Barcode gelesen. Neues Produkt: bei Open Food Facts nachschlagen und vorausfüllen.
   * Bestehendes Produkt: NUR den Barcode merken – deine Werte vom Etikett bleiben, übernehmen nur auf Wunsch.
   */
  const onCode = async (code: string) => {
    setScanning(false);
    const known = products.find((p) => p.ean === code && p.id !== initial?.id);
    if (known) {
      setScanNote(`Diesen Barcode hast du schon: „${known.name}“.`);
      return;
    }
    setEan(code);
    const existing = !!own;
    setScanNote(existing ? 'Barcode hinterlegt – deine Werte bleiben, wie sie sind.' : 'Suche bei Open Food Facts …');
    try {
      const found = await barcodeLookup.find(code);
      if (!found) {
        if (!existing) setScanNote('Bei Open Food Facts nicht gefunden – bitte die Werte vom Etikett abtippen. Der Barcode wird gemerkt.');
        return;
      }
      if (existing) setOffer(found);
      else applyScan(found);
    } catch {
      if (!existing) setScanNote('Open Food Facts ist gerade nicht erreichbar (offline?). Du kannst die Werte auch abtippen.');
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setScanNote('Suche bei Open Food Facts …');
    try {
      setHits(await barcodeLookup.search(q));
      setScanNote(null);
    } catch {
      setScanNote('Open Food Facts ist gerade nicht erreichbar (offline?). Du kannst die Werte auch abtippen.');
    }
  };

  return (
    <div className="product-form stack">
      {/* zuerst Werte holen – ein Scan oder Treffer bringt den Namen gleich mit */}
      {!nameOnly && (
        <>
          {ean ? (
            <div className="row-between small">
              <span>Barcode: <strong className="ean">{ean}</strong></span>
              <span className="row-gap">
                <button type="button" className="link" onClick={() => setScanning(true)}>Neu scannen</button>
                <button type="button" className="link link--muted" onClick={() => { setEan(undefined); setOffer(null); setScanNote(null); }}>Entfernen</button>
              </span>
            </div>
          ) : (
            // Knöpfe (hellpetrol) statt Chips: die grauen Stufen-Chips wählen etwas aus, diese holen Werte
            <div className="lookup">
              <div className="lookup__ways">
                <button type="button" className="btn btn--soft btn--sm" onClick={() => setScanning(true)}>
                  {/* kurz – das Kamera-Symbol sagt „scannen“; so passen beide am Handy in eine Zeile */}
                  <Icon name="camera" size={16} /> {own ? 'Barcode hinterlegen' : 'Barcode'}
                </button>
                <button type="button" className={`btn btn--soft btn--sm${searching ? ' is-on' : ''}`} aria-expanded={searching}
                  onClick={() => { setSearching(!searching); if (!query) setQuery(name); }}>
                  <Icon name="search" size={16} /> Open Food Facts
                </button>
              </div>
            </div>
          )}
          {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
          {searching && (
            <div className="stack stack--tight">
              <div className="quicknut__search">
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()}
                  aria-label="Bei Open Food Facts suchen" placeholder="z. B. Kimchi" autoFocus />
                <button type="button" className="btn btn--primary btn--sm" disabled={!query.trim()} onClick={() => void search()}>Suchen</button>
              </div>
              {hits && hits.length === 0 && <p className="small muted">Nichts mit vollständigen Nährwerten gefunden. Anderes Wort probieren – oder abtippen.</p>}
              {hits && hits.length > 0 && (
                <ul className="quicknut__hits">
                  {hits.map((h) => (
                    <li key={h.ean}>
                      <button type="button" onClick={() => applyScan(h, 'Werte von Open Food Facts (von der Community gepflegt) – passt die Sorte? Sonst anderen Treffer wählen.')}>
                        <span>{h.name}{h.brand ? ` · ${h.brand}` : ''}</span>
                        <span className="small muted">{Math.round(h.per100g.kcal)} kcal · {fmt(h.per100g.protein)} g Eiweiß</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {scanNote && <p className="scan-note" role="status">{scanNote}</p>}
          {offer && (
            <div className="scan-note">
              <p>Open Food Facts kennt das Produkt: <strong>{offer.name}</strong> · {fmt(offer.per100g.kcal)} kcal · {fmt(offer.per100g.protein)} g Eiweiß je 100 g.</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => applyScan(offer)}>Werte von Open Food Facts übernehmen</button>
            </div>
          )}
        </>
      )}
      {/* schon in „Meine Lebensmittel“: den Namen änderst du oben in der Kachel (für alle Sorten) */}
      {!sortOnly && (
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="z. B. Milch" autoFocus={!initial?.id} />
        </label>
      )}
      {afterName?.(name.trim())}

      {!nameOnly && (
        <>
          <label className="field">
            <span>Marke{sortOnly ? '' : ' (optional)'}</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} list="brand-names" placeholder="z. B. Milbona" />
          </label>
          <BrandNames />
          {/* Rinderhack leicht und normal = zwei Sorten eines Lebensmittels (Julia) – der Zusatz steht neben der Marke */}
          <label className="field">
            <span>Zusatz (optional)</span>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="z. B. leicht" />
          </label>
          <p className="small muted">Werte vom Etikett, pro 100 g bzw. 100 ml – oder leer lassen{onNoValues ? '' : ', dann rechnet Mashi mit der Tabelle'}:</p>
          <div className="row-2">{numField('kcal', 'kcal')}{numField('carbs', 'Kohlenhydrate (g)')}</div>
          <div className="row-2">{numField('protein', 'Eiweiß (g)')}{numField('fat', 'Fett (g)')}</div>
          {levelName && (
            <div className="scan-note">
              <p>{fmt(parseNum(values.fat) ?? 0)} g Fett – klingt nach <strong>{levelName}</strong>. „{name.trim()}“ allein rechnet Mashi als niedrigste Stufe.</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setName(levelName)}>Name anpassen</button>
            </div>
          )}

          <p className="small muted">Packung (optional) – füllt beim Kassenbon die Menge aus und rechnet Kosten:</p>
          <div className="row-2 product-form__pack">
            <label className="field"><span>Packungsgröße</span>
              <span className="pantry-amount">
                <input inputMode="decimal" value={packAmount} onChange={(e) => setPackAmount(e.target.value)} placeholder="z. B. 125" />
                <select value={packUnit} onChange={(e) => setPackUnit(e.target.value as 'g' | 'ml' | 'Stück')} aria-label="Einheit">
                  <option value="g">g</option><option value="ml">ml</option><option value="Stück">Stück</option>
                </select>
              </span>
            </label>
            {/* schon vom Bon gekauft: der echte Preis steht in der Kachel („Zuletzt gekauft“) – das Feld braucht es dann nicht */}
            {bought ? (
              <div className="field"><span>Preis</span><span className="small muted product-form__bought">kommt vom Bon – siehe „Zuletzt gekauft“</span></div>
            ) : (
              <label className="field"><span>Preis je Packung (€)</span>
                <input inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} placeholder="z. B. 1,99" />
              </label>
            )}
          </div>
          {/* je weitere Größe eine Zeile (Julia: Hähnchen gibt es in 400 g und 1 kg) – gleiche Einheit wie oben */}
          {moreSizes.map((x, i) => (
            <div key={i} className="product-form__size">
              <label className="field"><span>Weitere Größe</span>
                <span className="pantry-amount">
                  <input inputMode="decimal" value={x} onChange={(e) => setMoreSizes(moreSizes.map((y, n) => (n === i ? e.target.value : y)))}
                    placeholder="z. B. 1000" autoFocus={!x} />
                  <span className="product-form__unit">{packUnit}</span>
                </span>
              </label>
              <button type="button" className="iconbtn iconbtn--sm iconbtn--danger" aria-label="Größe entfernen" onClick={() => setMoreSizes(moreSizes.filter((_, n) => n !== i))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {parseNum(packAmount) ? (
            <button type="button" className="link small bonedit__add" onClick={() => setMoreSizes([...moreSizes, ''])}>
              <Icon name="plus" size={14} /> Weitere Größe
            </button>
          ) : null}
          {/* Sorte: Haltbarkeit gilt für alle Sorten – steht in der Kachel */}
          {!sortOnly && (
            <label className="field"><span>Hält ab Kauf (Tage, optional)</span>
              <input inputMode="numeric" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder={shelfEstimate(match.replaces, shelfCustom)} />
            </label>
          )}

          {sortOnly
            ? <p className="small muted">Name (Stift oben), Haltbarkeit und „gilt für“ (unten) stellst du direkt in der Kachel ein – für alle Sorten.</p>
            : <MatchChips name={name || initial?.name || ''} value={match} onChange={setOwnMatch} />}
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-gap">
        <button className="btn btn--primary" onClick={submit}>{nameOnly ? 'Hinzufügen' : 'Speichern'}</button>
        <button className="btn btn--ghost" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
