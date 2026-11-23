import { useMemo, useState } from 'react';
import { addToPlan, removeFromPlan, removeOffer, saveOffers, setOfferFood, useFoodTable, usePantry, usePlan, useRecipes } from '../../data/store';
import { localDay } from '../../domain/dates';
import {
  activeOffers, ingredientKeys, matchOffer, MAX_OFFER_TEXT, offerFoods, offerFromLabel, offerPackLabel, offerRecipes, offerWeekEnd, parseOffersText, shopDayHint,
  STORES, type Offer, type OfferDraft, type OfferMatch,
} from '../../domain/offers';
import { currentContent } from '../../domain/recipe';
import { ingredientsInLeaflet, ingredientsWithPrices, wantedIngredients, type LeafletClient } from '../../domain/leaflets';
import { priceRows } from '../../domain/leafletPrices';
import { navigate } from '../../router';
import { LeafletError, loadWeekFlyers, offersAi, readLeaflet } from '../../services';
import { KiError } from '../../services/ai/serverAi';
import { ChipSelect, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { IngredientNames } from '../components/IngredientNames';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';
import { euro } from '../format';
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

/** „Sa., 28.11.“ */
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });

/** „ab Do. · 400 g · statt 5,39 €“ – was unter dem Namen steht */
const details = (o: Pick<Offer, 'amount' | 'unit' | 'regular' | 'from'>) =>
  [offerFromLabel(o, localDay()), offerPackLabel(o), o.regular !== undefined ? `statt ${euro(o.regular)}` : ''].filter(Boolean);

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
   * Wochenprospekt holen (Lidl, Kaufland) – ohne KI (Julia: „was braucht weniger KI“): die Prospekte der Woche, ihr
   * Text per pdf.js, darin deine Zutaten (domain/leaflets.ts). Geht ohne Server, auch in der Demo.
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
        const priced = layout ? ingredientsWithPrices(priceRows(layout), flyer, wanted) : [];
        // jede Zutat nur einmal – Angebote mit Preis vor reinen Textfunden, sonst die erste Fundstelle
        for (const d of [...priced, ...ingredientsInLeaflet(pages, flyer, wanted)]) if (!drafts.some((x) => x.food === d.food)) drafts.push(d);
      }
      if (!drafts.length) throw new LeafletError(`Im ${store}-Prospekt steht diese Woche keine deiner Zutaten.`);
      const end = flyers.map((f) => f.end).sort().pop()!;
      const withPrice = drafts.filter((d) => d.price != null).length;
      const prices = withPrice === drafts.length ? '' : withPrice ? ', nicht überall mit Preis' : ', ohne Preise';
      setPreview({ rows: rowsOf(drafts), unread: [], until: end, source: 'prospekt', note: `Deine Zutaten im ${store}-Prospekt bis ${dayLabel(end)}${prices}.` });
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
          <p className="small muted center">oder Text einfügen:</p>
        </div>
      )}
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

      {preview && (
        <div className="offer-preview">
          {preview.note && <p className="small muted">{preview.note}</p>}
          {preview.rows.length > 0 && (
            <ul className="shopping">
              {preview.rows.map((r, i) => {
                // was die KI als Zutat erkannt hat, zeigt sie auch, wenn es in keinem Rezept steht
                const food = matchOffer(r.food ?? r.name, table, keys)?.name ?? r.food;
                return (
                  <li key={`${r.name}${i}`} className="shopping__item">
                    <label>
                      <input type="checkbox" checked={r.on} onChange={() => setPreview({ ...preview, rows: preview.rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} />
                      <span className="shopping__text">
                        <span className="shopping__name">{r.name}</span>
                        <span className="shopping__from">{[...details(r), food ? `→ ${food}` : 'nicht zugeordnet'].join(' · ')}</span>
                      </span>
                      {r.price !== undefined && <span className="shopping__qty">{euro(r.price)}</span>}
                    </label>
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
      )}
    </div>
  );
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
  // deine Märkte in deiner Reihenfolge, andere dahinter; darin nach Name
  const rank = (s: string) => (STORES.includes(s) ? STORES.indexOf(s) : STORES.length);
  const stores = [...new Set(offers.map((o) => o.store))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'de'));
  return (
    <Section title={`Angebote (${offers.length})`} icon="bag">
      <IngredientNames />
      {stores.map((s) => (
        <div key={s} className="offer-group">
          <h3 className="small muted">{s}</h3>
          <ul className="shopping panel">
            {offers.filter((o) => o.store === s).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((o) => (
              <OfferRow key={o.id} offer={o} food={foods.get(o.id)?.name} />
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function OfferRow({ offer, food }: { offer: Offer; food?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(offer.food ?? food ?? '');
  const save = () => {
    setEditing(false);
    if (value.trim() === (offer.food ?? '')) return;
    const undo = setOfferFood(offer.id, value);
    toast(`„${offer.name}“ zugeordnet`, { label: 'Rückgängig', run: undo });
  };
  return (
    <li className="shopping__item">
      <div className="shopping__row">
        <span className="shopping__text">
          <span className="shopping__name">{offer.name}</span>
          <span className="shopping__from">{[...details(offer), `bis ${dayLabel(offer.until)}`].join(' · ')}</span>
          {editing ? (
            <form className="offer-food" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <input value={value} onChange={(e) => setValue(e.target.value)} list="ingredient-names" placeholder="z. B. Hähnchenbrust" aria-label={`Lebensmittel für ${offer.name}`} autoFocus />
              <button type="submit" className="btn btn--soft btn--sm">OK</button>
            </form>
          ) : (
            <button className="link small offer-food__link" onClick={() => setEditing(true)}>{food || offer.food ? `→ ${food ?? offer.food}` : 'Lebensmittel zuordnen'}</button>
          )}
        </span>
        {offer.price !== undefined && <span className="shopping__qty">{euro(offer.price)}</span>}
        <button className="iconbtn iconbtn--sm" aria-label={`${offer.name} entfernen`} onClick={() => {
          const undo = removeOffer(offer.id);
          toast(`„${offer.name}“ entfernt`, { label: 'Rückgängig', run: undo });
        }}><Icon name="close" size={16} /></button>
      </div>
    </li>
  );
}
