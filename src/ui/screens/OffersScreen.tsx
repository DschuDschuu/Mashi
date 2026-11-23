import { useMemo, useState, type ReactNode } from 'react';
import { addToPlan, removeFromPlan, removeOffer, saveOffers, setOfferFood, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { localDay } from '../../domain/dates';
import {
  activeOffers, commonFrom, commonPeriod, compareToLast, ingredientKeys, lastPaid, latestPrices, matchOffer, MAX_OFFER_TEXT, offerFoods, offerPackLabel, offerRecipes, offerStartLabel,
  offerUnitPrice, offerWeekEnd, parseOffersText, shopDayHint, STORES, type LastPaid, type Offer, type OfferDraft, type OfferMatch,
} from '../../domain/offers';
import { usePricing } from '../useCosts';
import { currentContent } from '../../domain/recipe';
import { ingredientsInFlyer, wantedIngredients, type LeafletClient } from '../../domain/leaflets';
import { priceRows } from '../../domain/leafletPrices';
import { navigate } from '../../router';
import { LeafletError, loadWeekFlyers, offersAi, readLeaflet } from '../../services';
import { KiError } from '../../services/ai/serverAi';
import { ChipSelect, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { IngredientNames } from '../components/IngredientNames';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';
import { arrowOf, euro, percent } from '../format';
import { toast } from '../toast';
import { useUseUp } from '../useUseUp';

/** zuletzt gewählter Markt – nur Komfort auf diesem Gerät */
const STORE_KEY = 'mashi-offer-store';
const OTHER = '__anderer';

function lastStore(): string {
  try {
    return localStorage.getItem(STORE_KEY) || STORES[0];
  } catch {
    return STORES[0];
  }
}
function rememberStore(store: string) {
  try {
    localStorage.setItem(STORE_KEY, store);
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
}

/**
 * „500 g · → Pasta“, davor nur ein abweichender Anfang („ab Do. 26.11.“) – der Zeitraum steht oben (Julia: „nur das
 * ab-Datum ist relevant“).
 */
const metaLine = (o: Pick<Offer, 'amount' | 'unit' | 'from'>, commonStart: string | undefined, food: string) =>
  [offerStartLabel(o, commonStart), offerPackLabel(o), food].filter(Boolean).join(' · ');

/**
 * Unter dem Namen zwei Zeilen, links und rechts auf gleicher Höhe (Julia: „links und rechts verzogen, ich hätte das
 * gerne gleich“) – ein Raster statt zweier Spalten:
 *   500 g · → Pasta                ▼ −8,5 %  1,19 €
 *   zuletzt 1,30 € · 2,60 €/kg              2,38 €/kg
 * So steht der alte Kilopreis direkt neben dem neuen. Neben dem Preis genau EIN Vergleich: die Pille gegen deinen
 * letzten Einkauf wie auf der Preise-Seite (▼ grün günstiger, ▲ rosa teurer) – nur ohne eigenen Preis der Prospekt als
 * gestricheltes Schild „statt 4,99 €“ bzw. der gedruckte Rabatt (Julia: dein bezahlter Preis zählt mehr als Lidls
 * Statt-Preis; ausgerechnet wird nichts). „zuletzt“ = Packung und alter Kilopreis aus Bons und Preisen von Hand, ohne
 * Datum; passt die Einheit nicht, nur „zuletzt 0,30 €/Stück“; ohne Preis von dir „noch kein Kaufpreis“ (nicht „nie
 * gekauft“ – vielleicht nur ohne Bon).
 */
function OfferLines({ o, paid, meta }: { o: Pick<Offer, 'price' | 'amount' | 'unit' | 'regular' | 'discount'>; paid?: LastPaid; meta: ReactNode }) {
  if (o.price === undefined) return <span className="shopping__from">{meta}</span>;
  const unit = offerUnitPrice(o);
  const cmp = compareToLast(o, paid);
  const printed = o.regular !== undefined ? `statt ${euro(o.regular)}` : o.discount ? `−${o.discount} %` : '';
  const last = !paid ? 'noch kein Kaufpreis'
    : `zuletzt ${[cmp && paid.pack !== undefined ? euro(paid.pack) : '', `${euro(paid.unitPrice.value)}/${paid.unitPrice.per}`].filter(Boolean).join(' · ')}`;
  return (
    <span className="offer-lines">
      <span className="shopping__from">{meta}</span>
      <span className="offer-lines__price">
        {cmp ? (
          <span className={`price-card__change is-${cmp.direction}`}>
            <span aria-hidden="true">{arrowOf(cmp.direction)}</span> {percent(cmp.change)}
          </span>
        ) : printed ? <span className="offer-price__tag">{printed}</span> : null}
        <span className="offer-price__now">{euro(o.price)}</span>
      </span>
      <span className="offer-last">{last}</span>
      <span className="offer-price__unit">{unit ? `${euro(unit.value)}/${unit.per}` : ''}</span>
    </span>
  );
}

/**
 * Einkauf planen (Julia: „samstags einkaufen, freitags oder morgens mit den Prospekten planen“):
 * Angebote einfügen → passende Rezepte aus dem Kochbuch → in den Wochenplan; die Einkaufsliste zeigt dann den
 * Angebotspreis. Neue Ideen macht die KI aus Angeboten und Vorlieben.
 */
export function OffersScreen() {
  const pantry = usePantry();
  const offers = activeOffers(pantry.offers, localDay());
  const hint = shopDayHint(new Date());
  return (
    <main className="screen screen--tabbed">
      <TopBar title="Einkauf planen" backTo="/plan" intro="angebote" />
      {hint && <p className="muted small">{hint === 'morgen' ? 'Morgen ist Einkaufstag.' : 'Heute ist Einkaufstag.'}</p>}
      {/* sind schon Angebote da, steht das Ergebnis vorn – Einfügen klappt auf */}
      <AddOffers key={offers.length ? 'zu' : 'auf'} startOpen={!offers.length} />
      {offers.length > 0 && <OfferMatches offers={offers} />}
      {offers.length > 0 && <OfferList offers={offers} />}
    </main>
  );
}

type Row = OfferDraft & { on: boolean };
interface Preview { rows: Row[]; unread: string[]; until: string; source: 'text' | 'ki' | 'prospekt'; note?: string }

/** Märkte, deren Prospekt Mashi selbst holen kann (domain/leaflets.ts) */
const LEAFLET_CLIENT: Partial<Record<string, LeafletClient>> = { Lidl: 'lidl', Kaufland: 'kaufland' };
/** deine Kaufland-Filiale – nur auf diesem Gerät, nie im Code (das Repo ist öffentlich) */
const FILIALE_KEY = 'mashi-kaufland-filiale';

function readFiliale(): string {
  try {
    return localStorage.getItem(FILIALE_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveFiliale(id: string) {
  try {
    localStorage.setItem(FILIALE_KEY, id);
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
}

/** Markt wählen, Text einfügen, lesen – erst Mashi selbst, nur auf Tipp die KI (Julia) */
function AddOffers({ startOpen }: { startOpen: boolean }) {
  const table = useFoodTable();
  const recipes = useRecipes();
  // was in deinen Rezepten vorkommt, zählt auch ohne Eintrag in der Tabelle (Brokkoli)
  const keys = useMemo(() => ingredientKeys(recipes, table), [recipes, table]);
  const [open, setOpen] = useState(startOpen);
  const [store, setStore] = useState(lastStore);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = !STORES.includes(store);
  const client = LEAFLET_CLIENT[store];
  const [filiale, setFiliale] = useState(readFiliale);
  const [progress, setProgress] = useState<string | null>(null);
  // Text einfügen: bei Lidl/Kaufland unten eingeklappt (Julia: „wichtig ist der Import“), sonst der einzige Weg – offen
  const [textWanted, setTextWanted] = useState(false);
  const textOpen = !client || textWanted || !!text;
  const { prices } = usePricing();
  const paidByKey = useMemo(() => latestPrices(prices, table), [prices, table]);
  // vorausgewählt, was Mashi einem Lebensmittel zuordnen kann – oder was die KI als Kochzutat erkannt hat (food), auch
  // wenn es in keinem Rezept steht (Schweinefilet). Werkzeug und Deko aus dem Prospekt nicht.
  const rowsOf = (drafts: OfferDraft[]): Row[] => drafts.map((d) => ({ ...d, on: !!d.food || !!matchOffer(d.name, table, keys) }));

  if (!open) {
    return (
      <button className="btn btn--soft btn--block offer-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> Angebote holen oder einfügen
      </button>
    );
  }

  /**
   * Wochenprospekt holen (Lidl, Kaufland) – ohne KI (Julia: „was braucht weniger KI“): die Prospekte der Woche, ihren
   * Text liest dein Server (bei Lidl mit Lage auf der Seite → Preise), darin deine Zutaten (domain/leaflets.ts).
   * Braucht die Verbindung zum Server – die Demo sagt das.
   */
  const fetchLeaflets = async () => {
    if (!client) return;
    setError(null);
    setPreview(null);
    const storeId = client === 'kaufland' ? filiale.trim() : undefined;
    if (client === 'kaufland' && !storeId) {
      setError('Bitte zuerst deine Kaufland-Filialnummer eintragen.');
      return;
    }
    if (storeId) saveFiliale(storeId);
    setProgress(`Hole den ${store}-Prospekt …`);
    try {
      const flyers = await loadWeekFlyers(client, offerWeekEnd(new Date()), { storeId });
      const wanted = wantedIngredients(recipes, table);
      if (!wanted.length) throw new LeafletError('In deinen Rezepten stehen noch keine Zutaten, nach denen Mashi suchen kann.');
      const drafts: OfferDraft[] = [];
      for (const [n, flyer] of flyers.entries()) {
        // das PDF liest dein Server – je Prospekt ein paar Sekunden bis eine halbe Minute
        setProgress(`Lese ${flyers.length > 1 ? `Prospekt ${n + 1} von ${flyers.length}` : 'den Prospekt'} …`);
        // Lidl: mit Lage auf der Seite – daraus kommen die Preise (Kaufland ist anders aufgebaut)
        const { pages, layout } = await readLeaflet(flyer.pdfUrl, { layout: client === 'lidl' });
        // Lidl: nur echte Angebote mit Preis – der Text nur, wenn die Preiserkennung nichts lesen konnte (domain/leaflets.ts)
        const found = ingredientsInFlyer(pages, layout ? priceRows(layout) : [], flyer, wanted);
        // jede Zutat nur einmal – die erste Fundstelle gilt (Prospekte derselben Woche)
        for (const d of found) if (!drafts.some((x) => x.food === d.food)) drafts.push(d);
      }
      if (!drafts.length) throw new LeafletError(`Im ${store}-Prospekt steht diese Woche keine deiner Zutaten.`);
      const end = flyers.map((f) => f.end).sort().pop()!;
      const withPrice = drafts.filter((d) => d.price != null).length;
      const prices = withPrice === drafts.length ? '' : withPrice ? ', nicht überall mit Preis' : ', ohne Preise';
      setPreview({ rows: rowsOf(drafts), unread: [], until: end, source: 'prospekt', note: `Deine Zutaten im ${store}-Prospekt${prices}.` });
    } catch (e) {
      setError(e instanceof LeafletError ? e.message : 'Das hat gerade nicht geklappt. Versuch es bitte noch einmal.');
    }
    setProgress(null);
  };

  const read = () => {
    const r = parseOffersText(text, localDay());
    setError(null);
    setPreview({ rows: rowsOf(r.offers), unread: r.unread, until: r.until ?? offerWeekEnd(new Date()), source: 'text' });
  };

  const readWithKi = async () => {
    setBusy(true);
    setError(null);
    try {
      const drafts = await offersAi.readOffers(text, store, localDay());
      setPreview((p) => ({ rows: rowsOf(drafts), unread: [], until: p?.until ?? offerWeekEnd(new Date()), source: 'ki' }));
    } catch (e) {
      setError(e instanceof KiError ? e.message : 'Das hat gerade nicht geklappt. Versuch es bitte noch einmal.');
    }
    setBusy(false);
  };

  const take = () => {
    if (!preview) return;
    const chosen = preview.rows.filter((r) => r.on).map(({ on: _on, ...d }) => d);
    const name = store.trim();
    const undo = saveOffers(chosen, name, preview.until, preview.source);
    rememberStore(name);
    toast(`${chosen.length} ${chosen.length === 1 ? 'Angebot' : 'Angebote'} von ${name} übernommen`, { label: 'Rückgängig', run: undo });
    setText('');
    setPreview(null);
  };

  const chosen = preview?.rows.filter((r) => r.on).length ?? 0;
  return (
    <div className="panel offer-add">
      <h3 className="small muted">Markt</h3>
      <ChipSelect
        single
        options={[...STORES.map((s) => ({ value: s, label: s })), { value: OTHER, label: 'Anderer' }]}
        selected={[custom ? OTHER : store]}
        onChange={(next) => { setStore(next[0] === OTHER ? '' : next[0] ?? store); setError(null); }}
      />
      {custom && (
        <label className="field">
          <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Name des Markts" aria-label="Anderer Markt" />
        </label>
      )}
      {client && (
        <div className="offer-fetch">
          {client === 'kaufland' && (
            <label className="field">
              <span className="small muted">Deine Kaufland-Filialnummer</span>
              <input inputMode="numeric" value={filiale} onChange={(e) => setFiliale(e.target.value.replace(/[^\dA-Za-z]/g, ''))} placeholder="z. B. 1234" />
            </label>
          )}
          <button className="btn btn--soft btn--block" disabled={!!progress || busy} onClick={() => void fetchLeaflets()}>
            <Icon name="refresh" size={18} /> {progress ?? `${store}-Angebote holen`}
          </button>
          {/* ohne Vorschau gehört die Meldung hierher (Holen schlug fehl) – mit Vorschau steht sie dort beim KI-Knopf */}
          {error && !preview && <p className="error">{error}</p>}
        </div>
      )}
      {/* geholte Angebote direkt unter dem Knopf, gelesener Text unter dem Textfeld – das Ergebnis steht da, wo du tippst */}
      {preview?.source === 'prospekt' && previewBlock(preview)}

      {textOpen ? (
        <>
          <label className="field">
            <span className="small muted">Text aus dem Prospekt oder von der Markt-Seite</span>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => { setText(e.target.value); setPreview(null); }}
              placeholder={'einfügen – oder kurz tippen:\nHähnchenbrust 1 kg 6,99\nBrokkoli 500 g 1,19'}
            />
          </label>
          <button className="btn btn--primary btn--block" disabled={!text.trim() || !store.trim()} onClick={read}>Lesen</button>
        </>
      ) : (
        <p className="center"><button className="link small" onClick={() => setTextWanted(true)}>Oder Text einfügen</button></p>
      )}
      {preview && preview.source !== 'prospekt' && previewBlock(preview)}
    </div>
  );

  /** Vorschau: ankreuzen, was übernommen wird */
  function previewBlock(preview: Preview) {
    const withUntil = preview.rows.map((r) => ({ ...r, until: r.until ?? preview.until }));
    // der Zeitraum, den die meisten haben, steht einmal oben (Julia: „ab wann ein Angebot gilt“); an der Zeile nur
    // ein abweichender Anfang
    const common = commonPeriod(withUntil);
    const start = commonFrom(withUntil);
    return (
        <div className="offer-preview">
          {preview.note && <p className="small muted">{preview.note}</p>}
          {common && preview.rows.length > 0 && <p className="small offer-period">Gilt {common}</p>}
          {preview.rows.length > 0 && (
            <ul className="shopping">
              {withUntil.map((r, i) => {
                // was die KI als Zutat erkannt hat, zeigt sie auch, wenn es in keinem Rezept steht
                const match = matchOffer(r.food ?? r.name, table, keys);
                const food = match?.name ?? r.food;
                const paid = lastPaid(match?.key, r, paidByKey);
                return (
                  // wie die Angebotsliste: Häkchen und Name oben, darunter das Raster über die ganze Breite
                  <li key={`${r.name}${i}`} className="shopping__item offer-row">
                    <label className="offer-row__head offer-row__check">
                      <input type="checkbox" checked={r.on} onChange={() => setPreview({ ...preview, rows: preview.rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} />
                      <span className="shopping__name">{r.name}</span>
                    </label>
                    <OfferLines o={r} paid={paid} meta={metaLine(r, start, food ? `→ ${food}` : 'nicht zugeordnet')} />
                  </li>
                );
              })}
            </ul>
          )}
          {(preview.unread.length > 0 || !preview.rows.length) && (
            <div className="offer-unread">
              <p className="small">
                {preview.rows.length
                  ? `${preview.unread.length} ${preview.unread.length === 1 ? 'Zeile' : 'Zeilen'} nicht verstanden`
                  : 'Darin hat Mashi keine Angebote gefunden.'}
                {preview.unread.length > 0 && <span className="muted"> – {preview.unread.slice(0, 3).join(' · ')}{preview.unread.length > 3 ? ' …' : ''}</span>}
              </p>
              {text.length > MAX_OFFER_TEXT && <p className="small muted">Der Text ist lang – die KI liest nur den Anfang.</p>}
              <button className="btn btn--soft btn--sm" disabled={busy} onClick={() => void readWithKi()}>
                <Icon name="sparkles" size={16} /> {busy ? 'Die KI liest …' : 'Mit KI lesen'}
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {preview.rows.length > 0 && (
            <>
              <label className="field offer-until">
                <span className="small muted">Gültig bis</span>
                <input type="date" value={preview.until} min={localDay()} onChange={(e) => e.target.value && setPreview({ ...preview, until: e.target.value })} />
              </label>
              <button className="btn btn--primary btn--block" disabled={!chosen} onClick={take}>
                {chosen === 1 ? '1 Angebot übernehmen' : `${chosen} Angebote übernehmen`}
              </button>
            </>
          )}
        </div>
    );
  }
}

/** Rezepte aus dem Kochbuch, deren Zutaten gerade im Angebot sind – mit „In den Plan“ */
function OfferMatches({ offers }: { offers: Offer[] }) {
  const recipes = useRecipes();
  const table = useFoodTable();
  const pantry = usePantry();
  const plan = usePlan();
  const { keys } = useUseUp();
  // Geplantes bleibt stehen (mit „im Plan“) – sonst verschwände eine Karte unter dem Finger
  const matches = useMemo(() => offerRecipes(recipes, offers, table, { today: localDay(), pantry, useUp: keys }), [recipes, offers, table, pantry, keys]);
  return (
    <Section title="Passt zu den Angeboten" icon="sparkles">
      <div className="offer-matches">
        {matches.length === 0
          ? <p className="muted small">Noch nutzt kein Rezept aus deinem Kochbuch diese Angebote.</p>
          : <ul className="list">{matches.map((m) => <MatchRow key={m.recipe.id} match={m} inPlan={plan.items.some((i) => i.recipeId === m.recipe.id)} />)}</ul>}
        <button className="btn btn--soft btn--block" onClick={() => navigate('/neu/ki?angebote=1')}>
          <Icon name="sparkles" size={18} /> Neue Idee mit den Angeboten
        </button>
        <p className="center"><button className="link" onClick={() => navigate('/einkauf')}>Zur Einkaufsliste</button></p>
      </div>
    </Section>
  );
}

function MatchRow({ match: m, inPlan }: { match: OfferMatch; inPlan: boolean }) {
  const title = currentContent(m.recipe).title;
  const rest = [
    m.useUp.length ? `braucht auf: ${m.useUp.join(', ')}` : '',
    m.have.length ? `da: ${m.have.slice(0, 3).join(', ')}` : '',
    m.missing.length ? `fehlt: ${m.missing.slice(0, 3).join(', ')}${m.missing.length > 3 ? ' …' : ''}` : 'sonst alles da',
  ].filter(Boolean).join(' · ');
  return (
    <li className="list__item suggestion">
      <button className="plan-list__hit" onClick={() => navigate(`/rezept/${m.recipe.id}`)}>
        <RecipeImage image={m.recipe.image} size="sm" />
        <span className="suggestion__text">
          <span className="list__title">{title}</span>
          <span className="small offer-hit">
            <Icon name="bag" size={12} /> {m.onOffer.map((o) => `${o.name} (${o.offer.store}${o.offer.price !== undefined ? ` ${euro(o.offer.price)}` : ''})`).join(', ')}
          </span>
          <span className="small muted">{rest}</span>
        </span>
      </button>
      {inPlan ? (
        <span className="small muted suggestion__plan"><Icon name="check" size={14} /> Im Wochenplan</span>
      ) : (
        <button className="btn btn--soft btn--sm suggestion__plan" aria-label={`${title} zum Wochenplan hinzufügen`} onClick={() => {
          if (addToPlan(m.recipe.id)) toast(`„${title}“ eingeplant`, { label: 'Rückgängig', run: () => { removeFromPlan(m.recipe.id); } });
        }}>
          <Icon name="plus" size={16} /> Zum Wochenplan hinzufügen
        </button>
      )}
    </li>
  );
}

/** Die übernommenen Angebote je Markt – Zuordnung korrigieren, einzeln entfernen */
function OfferList({ offers }: { offers: Offer[] }) {
  const table = useFoodTable();
  const recipes = useRecipes();
  const foods = useMemo(() => offerFoods(offers, table, ingredientKeys(recipes, table)), [offers, table, recipes]);
  const { prices } = usePricing();
  const paidByKey = useMemo(() => latestPrices(prices, table), [prices, table]);
  // deine Märkte in deiner Reihenfolge, andere dahinter; darin nach Name
  const rank = (s: string) => (STORES.includes(s) ? STORES.indexOf(s) : STORES.length);
  const stores = [...new Set(offers.map((o) => o.store))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'de'));
  return (
    <Section title={`Angebote (${offers.length})`} icon="bag">
      <IngredientNames />
      {stores.map((s) => {
        const list = offers.filter((o) => o.store === s).sort((a, b) => a.name.localeCompare(b.name, 'de'));
        // je Markt der Zeitraum, den die meisten haben, einmal oben – an der Zeile nur ein abweichender Anfang
        const common = commonPeriod(list);
        const start = commonFrom(list);
        return (
          <div key={s} className="offer-group">
            <h3 className="small muted">{s}{common ? ` · ${common}` : ''}</h3>
            <ul className="shopping panel">
              {list.map((o) => (
                <OfferRow key={o.id} offer={o} start={start} food={foods.get(o.id)?.name} paid={lastPaid(foods.get(o.id)?.key, o, paidByKey)} />
              ))}
            </ul>
          </div>
        );
      })}
    </Section>
  );
}

function OfferRow({ offer, food, paid, start }: { offer: Offer; food?: string; paid?: LastPaid; start?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(offer.food ?? food ?? '');
  const save = () => {
    setEditing(false);
    if (value.trim() === (offer.food ?? '')) return;
    const undo = setOfferFood(offer.id, value);
    toast(`„${offer.name}“ zugeordnet`, { label: 'Rückgängig', run: undo });
  };
  const meta = metaLine(offer, start, '');
  // Julia: „links zu viele Zeilen“, „das mit dem Pfeil in eine Zeile“, „das ✕ oben rechts neben die Überschrift“ –
  // der Name hat die ganze Breite mit dem ✕, darunter zwei Zeilen links und rechts auf gleicher Höhe (OfferLines)
  return (
    <li className="shopping__item offer-row">
      <div className="offer-row__head">
        <span className="shopping__name">{offer.name}</span>
        <button className="iconbtn iconbtn--sm" aria-label={`${offer.name} entfernen`} onClick={() => {
          const undo = removeOffer(offer.id);
          toast(`„${offer.name}“ entfernt`, { label: 'Rückgängig', run: undo });
        }}><Icon name="close" size={16} /></button>
      </div>
      {editing && (
        <form className="offer-food" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} list="ingredient-names" placeholder="z. B. Hähnchenbrust" aria-label={`Lebensmittel für ${offer.name}`} autoFocus />
          <button type="submit" className="btn btn--soft btn--sm">OK</button>
        </form>
      )}
      <OfferLines o={offer} paid={paid} meta={<>
        {meta && `${meta} · `}
        <button className="link offer-food__link" onClick={() => setEditing(true)}>{food || offer.food ? `→ ${food ?? offer.food}` : 'Lebensmittel zuordnen'}</button>
      </>} />
    </li>
  );
}
