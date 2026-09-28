import { useEffect, useMemo, useState } from 'react';
import { resolveName } from '../../domain/mealplan';
import { recipesFromPantry, type PantryItem, type PantryUnit } from '../../domain/pantry';
import { suggestPantryUnit } from '../../domain/packs';
import { daysLabel, daysLeft, frozenSince, specialDays, useByOf } from '../../domain/shelfLife';
import { formatAmount } from '../../domain/scaling';
import {
  eatPreparedPortions,
  openPantryItem,
  addPantryItem, answerPantryCheck, assignPantrySorts, currentPantry, currentProducts, forgetReceiptRule, freezePantryItem, removePantryItem, thawPantryItem, updatePantryItem,
  saveProducts, useFoodTable, usePantry, usePlan, useProducts, useRecipe, useRecipes,
} from '../../data/store';
import { currentContent } from '../../domain/recipe';
import { DishNutrition } from '../components/DishNutrition';
import { navigate, useRoute } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { CartButton } from '../components/CartButton';
import { StagePicker } from '../components/StagePicker';
import { PantryTabs, usePantrySwipe } from '../components/PlanTabs';
import { IngredientNames } from '../components/IngredientNames';
import { groupByKind } from '../foodGroups';
import { useUseUp } from '../useUseUp';
import { PantryMatchList, RecipeIdeaPanel } from '../components/PantryMatches';
import { ShelfSettings } from '../components/ShelfSettings';
import { ProductsLink } from '../components/ProductsLink';
import { TileSummary } from '../components/TileSummary';
import { toast } from '../toast';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { SortPicker, useSortOptions } from '../components/SortPicker';
import { BrandNames } from '../components/BrandNames';
import { NutritionQuickForm } from '../components/NutritionQuickForm';
import type { FoodEntry } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { productLabel, type MyProduct } from '../../domain/nutrition/myProducts';
import { FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück', 'Glas'];


import { quantityLabel } from '../format';
import { packLabel } from '../../domain/pantryLabel';
export { quantityLabel }; // auch von hier erreichbar (Reste-Ansicht)

/** Zahl aus einem Eingabefeld: „0,5“ und „0.5“, leer = keine Menge. */
export const parseAmount = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function PantryScreen() {
  const swipe = usePantrySwipe('pantry');
  const pantry = usePantry();
  const recipes = useRecipes();
  const products = useProducts();
  /** Sorte eines Vorrats (vom Bon oder Barcode), z. B. „Pesto verde (K-Classic)“ */
  const sortName = (id: string) => { const p = products.find((x) => x.id === id); return p && productLabel(p); };
  const plan = usePlan();
  const [adding, setAdding] = useState(false);
  // Plus-Menü → „Vorrat eintragen“ öffnet das Formular – auch wenn du schon hier bist.
  // Danach die Adresse zurücksetzen, damit ein zweites Antippen wieder wirkt.
  const wantsNew = useRoute().query.get('neu') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    setAdding(true);
    navigate('/speisekammer', { replace: true });
  }, [wantsNew]);
  const [editing, setEditing] = useState<string | null>(null);
  const table = useFoodTable();

  const kindOf = (item: PantryItem) => resolveName(item.name, table)?.kind;
  const toCheck = pantry.items.filter((i) => i.check);
  // Nur was nach dem Wochenplan übrig bleibt – bald Ablaufendes zuerst; Eingeplantes nicht noch einmal vorschlagen
  const { rest, keys, idea, planned } = useUseUp();
  // Oben nur, was frei ist – Verplantes steht in „Für den Wochenplan“ (abgezogen wird erst beim Kochen)
  const freeOf = (item: PantryItem): PantryItem | null => {
    const p = planned.get(item.id);
    if (p === undefined) return item;
    if (p === 'all' || item.amount === undefined) return null;
    return { ...item, amount: Math.round((item.amount - p) * 10) / 10 };
  };
  const reservedLabel = (item: PantryItem) => {
    const p = planned.get(item.id);
    if (p === undefined) return undefined;
    return p === 'all' ? 'Alles davon ist für den Wochenplan reserviert.' : `Davon ${quantityLabel({ amount: p, unit: item.unit, pack: item.pack })} für den Wochenplan reserviert.`;
  };
  const matches = useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.recipeId));
    return recipesFromPantry(rest, recipes.filter((r) => !planned.has(r.id)), table, 8, keys);
  }, [rest, keys, plan, recipes, table]);
  const shelfLabel = (item: PantryItem) => {
    const d = useByOf(item, table, pantry.shelfDays);
    if (!d) return null;
    const left = daysLeft(d);
    if (item.frozenAt) {
      // Gefroren: Datum des Einfrierens – erst nach Monaten ein Hinweis
      const since = frozenSince(item.frozenAt);
      return left <= 2
        ? { text: `seit ${since} eingefroren`, urgent: true, alarm: false }
        : { text: `eingefroren ${new Date(item.frozenAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`, urgent: false, alarm: false };
    }
    // heute, morgen oder schon drüber → zusätzlich eine rote Uhr am Namen
    return { text: left <= 2 ? daysLabel(left) : `bis ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`, urgent: left <= 2, alarm: left <= 1 };
  };
  const remove = (item: PantryItem) => {
    const undo = removePantryItem(item.id);
    toast(`„${item.name}“ entfernt`, { label: 'Rückgängig', run: undo });
  };
  // gleicher Name: das Angebrochene zuerst – „Joghurt 200 g offen“ direkt über „Joghurt 3 × 500 g“
  const sorted = [...pantry.items].sort((a, b) => a.name.localeCompare(b.name, 'de') || Number(!a.openedAt) - Number(!b.openedAt));
  // Gefrorenes als eigene Gruppe am Ende – es hält ganz anders als der Rest seiner Art
  // Ganz Verplantes fällt oben weg; Bearbeiten zeigt aber immer den echten Vorrat
  const shown = sorted.filter((i) => freeOf(i) !== null);
  const prepared = shown.filter((i) => i.recipeId && !i.frozenAt);
  const groups = [
    // Vorgekochtes zuerst – es hält am kürzesten und will gegessen werden
    ...(prepared.length ? [{ title: 'Vorgekocht', items: prepared }] : []),
    ...groupByKind(shown.filter((i) => !i.frozenAt && !i.recipeId), kindOf),
    ...(shown.some((i) => i.frozenAt) ? [{ title: 'Gefroren', items: shown.filter((i) => i.frozenAt) }] : []),
  ];
  // Eine Zeile je Lebensmittel: „Joghurt · 4 × 500 g + 400 g offen“ – antippen klappt die Teile auf
  const [expanded, setExpanded] = useState<string | null>(null);
  const clusters = (items: PantryItem[]) => {
    const out: PantryItem[][] = [];
    for (const i of items) {
      const last = out[out.length - 1];
      if (last && !i.frozenAt && normalizeName(last[0].name) === normalizeName(i.name)) last.push(i);
      else out.push([i]);
    }
    return out;
  };
  const row = (i: PantryItem, part = false) => editing === i.id
    ? <EditRow key={i.id} item={i} estimate={useByOf({ ...i, useBy: undefined }, table, pantry.shelfDays)} reserved={reservedLabel(i)} onDone={() => setEditing(null)} />
    : (
      <li key={i.id} className={`pantry__item${part ? ' pantry__item--part' : ''}`}>
        <button className="pantry__hit" onClick={() => setEditing(i.id)} aria-label={`${i.name} bearbeiten`}>
          {/* links nur der Name (groß), rechts die freie Menge mit dem Datum darunter */}
          <span className="pantry__name">
            {part ? (i.openedAt ? `angebrochen ${new Date(i.openedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : 'geschlossen') : i.name}
            {shelfLabel(i)?.alarm && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={14} /></span>}
            {i.reduced && !i.frozenAt && <span className="badge tint-peach pantry__mhd">MHD</span>}
            {/* nur, wenn es etwas Neues sagt (Marke, Sorte) – nicht „Milch“ unter „Milch“ */}
            {i.productId && sortName(i.productId) && normalizeName(sortName(i.productId)!) !== normalizeName(i.name) && <span className="pantry__sort">{sortName(i.productId)}</span>}
          </span>
          <span className="pantry__qty pantry__qty--stack">
            {/* in der Teilzeile sagt links schon „angebrochen“ */}
            {quantityLabel(part ? { ...(freeOf(i) ?? i), openedAt: undefined } : freeOf(i) ?? i)}
            {shelfLabel(i) && <span className={`pantry__shelf${shelfLabel(i)!.urgent ? ' is-urgent' : ''}`}>{shelfLabel(i)!.text}</span>}
          </span>
        </button>
        <button className="iconbtn iconbtn--sm" aria-label={`${i.name} entfernen`} onClick={() => remove(i)}>
          <Icon name="close" size={16} />
        </button>
      </li>
    );
  const clusterRow = (parts: PantryItem[]) => {
    if (parts.length === 1) return row(parts[0]);
    const k = `${normalizeName(parts[0].name)}|${parts[0].id}`;
    const open = expanded === k || parts.some((p) => p.id === editing);
    // das früheste Datum zählt – das Offene muss zuerst weg
    const first = [...parts].sort((a, b) => (useByOf(a, table, pantry.shelfDays)?.getTime() ?? Infinity) - (useByOf(b, table, pantry.shelfDays)?.getTime() ?? Infinity))[0];
    const shelf = shelfLabel(first);
    return [
      <li key={k} className="pantry__item pantry__item--group">
        <button className="pantry__hit" onClick={() => setExpanded(open ? null : k)} aria-expanded={open} aria-label={`${parts[0].name}: ${parts.length} Teile`}>
          <span className="pantry__name">
            {parts[0].name}
            {parts.some((p) => shelfLabel(p)?.alarm) && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={14} /></span>}
          </span>
          <span className="pantry__qty pantry__qty--stack">
            {/* Offenes vorne und zusammengefasst („1,2 l offen + 7 × 1 l“) – aufgeklappt stehen die Teile einzeln */}
            <span className="pantry__parts">
              {clusterLabels(parts.map((p) => freeOf(p) ?? p)).map((l, n) => <span key={n} className="pantry__part">{n ? `+ ${l}` : l}</span>)}
            </span>
            {shelf && <span className={`pantry__shelf${shelf.urgent ? ' is-urgent' : ''}`}>{shelf.text}</span>}
          </span>
        </button>
        <span className={`pantry__chev${open ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>
      </li>,
      ...(open ? parts.map((p) => row(p, true)) : []),
    ];
  };

  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Speisekammer</h1><CartButton /></header>
      <PantryTabs active="pantry" />
      <IngredientNames />

      {/* Tablet: links die Vorräte, rechts Vorschläge, „Was kann ich kochen?“ und „Verwalten“ */}
      <div className="split">
        <div className="split__main">
          {adding && <AddForm onDone={() => setAdding(false)} />}

          {toCheck.length > 0 && (
            <Section icon="info" title="Noch da?">
              <p className="muted small">Beim Kochen verwendet – ohne Menge weiß Mashi nicht, ob noch etwas übrig ist.</p>
              <ul className="list">
                {toCheck.map((i) => (
                  <li key={i.id} className="list__item pantry-check">
                    <span className="list__title">{i.name}</span>
                    <button className="btn btn--soft btn--sm" onClick={() => answerPantryCheck(i.id, true)}>Noch da</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => {
                      const undo = answerPantryCheck(i.id, false);
                      if (undo) toast(`„${i.name}“ aufgebraucht`, { label: 'Rückgängig', run: undo });
                    }}>Aufgebraucht</button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {pantry.items.length === 0 ? (
            <Empty icon="archive">Noch leer. Tippe auf ＋ – „Kassenbon importieren“ oder „Vorrat eintragen“. Mashi zeigt dir dann, was du damit kochen kannst.</Empty>
          ) : (
            groups.map(({ title, items }) => {
              return (
                <Section key={title} title={`${title} (${clusters(items).length})`}>
                  <ul className="pantry">
                    {clusters(items).flatMap(clusterRow)}
                  </ul>
                </Section>
              );
            })
          )}

        </div>
        <div className="split__side">

          <RecipeIdeaPanel idea={idea} />

          {matches.length > 0 && (
            <Section icon="sparkles" title="Was kann ich kochen?">
              <PantryMatchList matches={matches} />
            </Section>
          )}

          {/* Abgesetzt: das sind Einstellungen, keine Vorräte – eigener Kopf, zurückhaltender Stil */}
          <section className="manage" aria-labelledby="manage-title">
            <h2 className="manage__title" id="manage-title">Verwalten</h2>
            <ProductsLink />
            {/* wann du willst – kein Rhythmus */}
            <button className="panel link-row" onClick={() => navigate('/speisekammer/inventur')}>
              <Icon name="list" size={20} />
              <span className="link-row__text">
                <strong>Inventur</strong>
                <small className="muted">Speisekammer, Keller, Tiefkühler und Gewürze durchgehen</small>
              </span>
              <Icon name="chevron" size={18} />
            </button>
            <ShelfSettings />

            {pantry.rules.length > 0 && (
              <details className="panel fold learned">
                <TileSummary icon="clipboard" title={`Gelernte Bon-Artikel (${pantry.rules.length})`} text="So übersetzt Mashi deine Kassenbons" />
                <p className="muted small">Falsch gelernt? „Vergessen“ – beim nächsten Bon fragt Mashi wieder.</p>
                <ul className="learned__list">
                  {[...pantry.rules].sort((a, b) => a.key.localeCompare(b.key, 'de')).map((r) => (
                    <li key={r.key}>
                      <span className="learned__bon">{r.key}</span>
                      <span className="small muted">{r.skip ? 'wird übersprungen' : `→ ${r.name}${r.amount ? ` · ${formatAmount(r.amount, 'g')} ${r.unit} je Stück` : ''}`}</span>
                      <button className="link link--muted" onClick={() => forgetReceiptRule(r.key)}>Vergessen</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function AmountFields({ amount, unit, onAmount, onUnit }: { amount: string; unit: PantryUnit; onAmount: (v: string) => void; onUnit: (u: PantryUnit) => void }) {
  return (
    <div className="pantry-amount">
      <input inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="Menge" aria-label="Menge (leer = vorhanden)" />
      <select value={unit} onChange={(e) => onUnit(e.target.value as PantryUnit)} aria-label="Einheit">
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<PantryUnit>('g');
  /** Einheit selbst gewählt? Dann springt sie nicht mehr automatisch um */
  const [unitTouched, setUnitTouched] = useState(false);
  const products = useProducts();
  /** per Barcode erkannte oder angetippte Sorte („Mein Produkt“) – undefined = Vorschlag (bei nur einem: dieses) */
  const [product, setProduct] = useState<MyProduct | null | undefined>(undefined);
  const options = useSortOptions(name);
  const chosen = product === undefined ? (options.length === 1 ? products.find((p) => p.id === options[0].id) ?? null : null) : product;
  /** Marke für etwas, das noch nicht unter „Meine Lebensmittel“ steht */
  const [brand, setBrand] = useState('');
  const [otherBrand, setOtherBrand] = useState(false);
  const askBrand = !chosen && (options.length === 0 || otherBrand);
  // Einheit passend zur Zutat/Marke: Pesto → Glas, Eier → Stück, Milch → ml
  const unitTable = useFoodTable();
  const suggestedUnit = suggestPantryUnit(name.trim() ? unitTable.matchName(name)?.food : undefined, chosen ?? undefined, name.trim() ? foodTable.matchName(name)?.food : undefined);
  /** Packungsgröße des Produkts – bei Stück/Glas hängt Mashi sie im Hintergrund an */
  const packHint = chosen?.packageAmount && chosen.packageUnit !== 'Stück' && (unit === 'Stück' || unit === 'Glas')
    ? packLabel({ amount: chosen.packageAmount, unit: chosen.packageUnit === 'ml' ? 'ml' : 'g' }) : undefined;
  useEffect(() => { if (!unitTouched) setUnit(suggestedUnit); }, [suggestedUnit, unitTouched]);
  /** Nach dem Eintragen: „… zu Meine Lebensmittel hinzufügen?“ */
  const [offer, setOffer] = useState<{ name: string; brand: string } | null>(null);
  const [withValues, setWithValues] = useState(false);
  const [scanning, setScanning] = useState(false);
  const onCode = (code: string) => {
    setScanning(false);
    const p = products.find((x) => x.ean === code);
    if (!p) {
      toast('Diesen Barcode kennt Mashi noch nicht – leg das Produkt unter „Meine Lebensmittel“ an, dann klappt es beim nächsten Mal.');
      return;
    }
    setProduct(p);
    // Name wie in Rezepten („grünes pesto“), nicht wie auf der Packung – so findet das Rezept den Vorrat
    const n = p.names?.[0] ?? (p.replaces[0] ? FOOD_CHOICES.find((f) => f.id === p.replaces[0])?.name : undefined) ?? p.name;
    // Schreibweise wie beim vorhandenen Vorrat, sonst mit großem Anfangsbuchstaben
    const known = currentPantry().items.find((it) => normalizeName(it.name) === normalizeName(n))?.name;
    if (!name.trim()) setName(known ?? n.charAt(0).toLocaleUpperCase('de-DE') + n.slice(1));
    // Barcode: eine Packung – „1 Stück“ (die Größe hängt Mashi an); bei „10er“-Packungen die Stückzahl
    if (!amount && p.packageAmount && p.packageUnit) {
      setAmount(p.packageUnit === 'Stück' ? String(p.packageAmount) : '1');
      setUnit('Stück');
      setUnitTouched(true);
    }
  };
  // Richtwert der Tabelle fürs Angebot – kennt sie die Zutat nicht, geht nur „Mit Nährwerten“
  const offerTable = offer ? foodTable.matchName(offer.name)?.food : undefined;
  /** Produkt speichern und dem gerade eingetragenen Vorrat die Sorte geben */
  const adopt = (p: MyProduct) => {
    saveProducts([...currentProducts(), p]);
    const ids = currentPantry().items.filter((it) => !it.productId && normalizeName(it.name) === normalizeName(offer!.name)).map((it) => it.id);
    assignPantrySorts([{ itemIds: ids, productId: p.id }]);
    toast(`„${offer!.name} · ${offer!.brand}“ steht jetzt unter „Meine Lebensmittel“`);
    setOffer(null);
  };
  const submit = () => {
    if (!name.trim()) return;
    const a = parseAmount(amount);
    addPantryItem(name, a, a === undefined ? undefined : unit, chosen?.id);
    toast(`„${name.trim()}“ in der Speisekammer`);
    // Marke eingetragen, aber noch kein Produkt → anbieten, es aufzunehmen
    if (askBrand && brand.trim()) setOffer({ name: name.trim(), brand: brand.trim() });
    setName('');
    setAmount('');
    setProduct(undefined);
    setBrand('');
    setOtherBrand(false);
    setUnitTouched(false);
  };
  if (offer && withValues) {
    return (
      <NutritionQuickForm ingredient={offer.name} initialBrand={offer.brand} onCancel={() => { setOffer(null); setWithValues(false); }}
        onSave={(p) => { adopt(p); setWithValues(false); }} />
    );
  }
  return (
    <div className="panel stack">
      {offer && (
        <div className="pantry-offer" role="status">
          <p className="small"><strong>„{offer.name} · {offer.brand}“</strong> zu „Meine Lebensmittel“ hinzufügen? Dann kennt Mashi die Marke beim nächsten Mal.</p>
          <div className="row-gap">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setWithValues(true)}>Mit Nährwerten</button>
            {offerTable && <button type="button" className="btn btn--soft btn--sm" onClick={() => adopt(fromTable(offer, offerTable))}>Nur hinzufügen, Nährwerte später</button>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOffer(null)}>Nein</button>
          </div>
        </div>
      )}
      <label className="field"><span>Was?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="z. B. Hähnchenbrust" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={(u) => { setUnit(u); setUnitTouched(true); }} />
      {packHint && <p className="small muted">Packung à {packHint} – aus „Meine Lebensmittel“</p>}
      <SortPicker options={options} value={chosen?.id} onChange={(id) => setProduct(products.find((p) => p.id === id) ?? null)}
        onOther={() => { setProduct(null); setOtherBrand(true); }} />
      {askBrand && name.trim() && (
        <label className="field"><span>Marke (optional)</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} list="brand-names" placeholder="z. B. K-Classic" />
          <BrandNames />
        </label>
      )}
      <p className="small muted">Menge leer lassen = einfach „vorhanden“.</p>
      <div className="row-gap">
        <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>Hinzufügen</button>
        <button type="button" className="btn btn--soft" onClick={() => setScanning(true)}><Icon name="camera" size={16} /> Barcode</button>
        <button className="btn btn--ghost" onClick={onDone}>Fertig</button>
      </div>
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
    </div>
  );
}

/** Datum für <input type="date"> (Ortszeit) */
const dateField = (d?: Date) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

function EditRow({ item, estimate, reserved, onDone }: { item: PantryItem; estimate?: Date; reserved?: string; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  // Eigenes Datum oder die Schätzung vorausgefüllt – gespeichert wird nur, wenn du es änderst
  const initialDate = dateField(item.useBy ? new Date(item.useBy) : estimate);
  const [useBy, setUseBy] = useState(initialDate);
  const [amount, setAmount] = useState(item.amount === undefined ? '' : String(item.amount).replace('.', ','));
  const [unit, setUnit] = useState<PantryUnit>(item.unit ?? 'g');
  const [reduced, setReduced] = useState(!!item.reduced);
  /** Sorte („Mein Produkt“) – nachträglich wählbar, z. B. für von Hand eingetragenes Pesto */
  const [productId, setProductId] = useState(item.productId);
  const editOptions = useSortOptions(name);
  /** Einfrieren: null = zu, sonst die Menge (vorausgefüllt: alles) */
  const [freezing, setFreezing] = useState<string | null>(null);
  const pantry = usePantry();
  const save = () => {
    const a = parseAmount(amount);
    const changedDate = useBy !== initialDate;
    updatePantryItem(item.id, {
      name: name.trim() || item.name, amount: a, unit: a === undefined ? undefined : unit, reduced: reduced || undefined, productId,
      ...(changedDate ? { useBy: useBy ? new Date(`${useBy}T12:00:00`).toISOString() : undefined } : {}),
    });
    onDone();
  };
  const freeze = () => {
    const part = freezing ? parseAmount(freezing) : undefined;
    freezePantryItem(item.id, part);
    toast(part !== undefined && item.amount !== undefined && part < item.amount
      ? `${quantityLabel({ amount: part, unit: item.unit, recipeId: item.recipeId })} ${item.name} eingefroren`
      : `„${item.name}“ eingefroren`);
    onDone();
  };
  /** Anbrechen: null = zu, sonst wie viel du gleich herausnimmst (leer = nur öffnen) */
  const [opening, setOpening] = useState<string | null>(null);
  const openUnit = item.pack && (item.unit === 'Stück' || item.unit === 'Glas') ? item.pack.unit : item.unit;
  // Mengenfrage nur, wo sie eindeutig ist: Packung mit Größe oder Vorrat in g/ml
  const canTake = !!item.pack || item.unit === 'g' || item.unit === 'ml';
  /** höchstens so viel, wie da ist: eine Packung bzw. der ganze Eintrag */
  const maxTake = item.pack ? item.pack.amount : item.amount;
  const takeValue = opening ? parseAmount(opening) : undefined;
  const tooMuch = takeValue !== undefined && maxTake !== undefined && takeValue > maxTake;
  const open = () => {
    const take = canTake ? takeValue : undefined;
    if (tooMuch) return;
    openPantryItem(item.id, take);
    const what = item.pack ? `${packLabel(item.pack)} ${item.name}` : `„${item.name}“`;
    toast(take ? `${formatAmount(take, 'g')} ${openUnit} ${item.name} herausgenommen – der Rest ist offen` : `${what} angebrochen – hält offen kürzer`);
    onDone();
  };
  const prep = !!item.recipeId;
  const recipe = useRecipe(item.recipeId);
  const eat = () => {
    const undo = eatPreparedPortions(item.id, 1);
    const left = (item.amount ?? 0) - 1;
    toast(left > 0 ? `Guten Appetit! Noch ${quantityLabel({ ...item, amount: left })} ${item.name}` : `„${item.name}“ aufgegessen`, { label: 'Rückgängig', run: undo });
    onDone();
  };
  const thaw = () => {
    thawPantryItem(item.id);
    const d = specialDays('thawed', pantry.shelfDays);
    toast(`„${item.name}“ aufgetaut – hält noch ${d === 1 ? 'einen Tag' : `${d} Tage`}`);
    onDone();
  };
  return (
    <li className="pantry__item pantry__item--edit">
      <input value={name} onChange={(e) => setName(e.target.value)} list={prep ? undefined : 'ingredient-names'} aria-label="Name" />
      {reserved && <p className="small muted pantry-reserved">{reserved} Hier steht der ganze Vorrat.</p>}
      {prep ? (
        <label className="pantry-amount pantry-portions">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Portionen" />
          <span className="small">Portionen</span>
        </label>
      ) : <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />}
      {/* was eine Portion bringt – dieselbe Zeile wie im Plan */}
      {recipe && <DishNutrition content={currentContent(recipe)} own={undefined} full className="pantry-nutri" />}
      {item.pack && (unit === 'Stück' || unit === 'Glas') && <p className="small muted">Packungen à {packLabel(item.pack)}</p>}
      {item.openedAt && <p className="small muted">Angebrochen am {new Date(item.openedAt).toLocaleDateString('de-DE')} – hält offen kürzer.</p>}
      {!prep && <SortPicker options={editOptions} value={productId} onChange={setProductId} />}
      {/* wie unter „Meine Lebensmittel“: normal · immer im Haus · nachkaufen unter X */}
      {!prep && <StagePicker name={item.name} />}
      {item.frozenAt ? (
        <p className="small muted pantry-frozen">Eingefroren am {new Date(item.frozenAt).toLocaleDateString('de-DE')}</p>
      ) : (
        <>
          <label className="pantry-date">
            <span className="small muted">{prep ? 'Essen bis' : item.useBy ? 'Verbrauchen bis' : estimate ? 'Verbrauchen bis (geschätzt)' : 'Verbrauchen bis (optional)'}</span>
            <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
          </label>
          {!prep && (
            <label className="pantry-mhd">
              <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
              <span className="small">MHD-Ware (reduziert)</span>
            </label>
          )}
        </>
      )}
      <div className="pantry-actions">
        <button className="btn btn--primary btn--sm" onClick={save}>OK</button>
        {prep && !item.frozenAt && <button className="eat-pill" onClick={eat}>1 gegessen</button>}
        {item.frozenAt
          ? <button className="btn btn--soft btn--sm" onClick={thaw}>Auftauen</button>
          : freezing === null && (
            <button className="btn btn--soft btn--sm" onClick={() => setFreezing(item.amount === undefined ? '' : String(item.amount).replace('.', ','))}>Einfrieren</button>
          )}
        {!prep && !item.frozenAt && !item.openedAt && freezing === null && opening === null && (
          <button className="btn btn--soft btn--sm" onClick={() => (canTake ? setOpening('') : open())}>{(item.pack || !canTake) && (item.amount ?? 0) > 1 ? 'Eine anbrechen' : 'Angebrochen'}</button>
        )}
      </div>
      {opening !== null && (
        <div className="pantry-freeze">
          <label className="small">Wie viel nimmst du raus?
            <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder={item.pack ? `von ${packLabel(item.pack)}` : 'nichts'} aria-label="Menge, die du herausnimmst" autoFocus /> {openUnit}
          </label>
          <button className="btn btn--primary btn--sm" onClick={open} disabled={tooMuch}>Anbrechen</button>
          <button className="link link--muted" onClick={() => setOpening(null)}>Abbrechen</button>
          {tooMuch
            ? <p className="small pantry-warn" role="alert">{item.pack ? `Eine Packung hat nur ${packLabel(item.pack)}.` : `Es sind nur ${quantityLabel(item)} da.`}</p>
            : <p className="small muted">Leer lassen = nur geöffnet.</p>}
        </div>
      )}
      {freezing !== null && (
        <div className="pantry-freeze">
          {item.amount !== undefined && (
            <label className="small">Wie viel?
              <input inputMode="decimal" value={freezing} onChange={(e) => setFreezing(e.target.value)} aria-label="Menge zum Einfrieren" /> {prep ? 'Portionen' : item.unit}
            </label>
          )}
          <button className="btn btn--primary btn--sm" onClick={freeze}>Einfrieren</button>
          <button className="link link--muted" onClick={() => setFreezing(null)}>Abbrechen</button>
        </div>
      )}
    </li>
  );
}

/** Neues Produkt mit Name + Marke und dem Richtwert der Tabelle – Nährwerte lassen sich später verfeinern */
function fromTable(offer: { name: string; brand: string }, food: FoodEntry): MyProduct {
  return { id: newId('p'), name: offer.name, brand: offer.brand, replaces: [], names: [normalizeName(offer.name)], per100g: food.per100g, updatedAt: new Date().toISOString() };
}

/** Teile einer Zeile: erst das Offene (je Einheit zusammengezählt), dann die Packungen und der Rest */
function clusterLabels(parts: PantryItem[]): string[] {
  const opened = parts.filter((p) => p.openedAt && p.amount !== undefined && (p.unit === 'g' || p.unit === 'ml'));
  const units = [...new Set(opened.map((p) => p.unit))];
  const openLabels = units.map((u) => quantityLabel({ amount: opened.filter((p) => p.unit === u).reduce((n, p) => n + p.amount!, 0), unit: u, openedAt: 'offen' }));
  return [...openLabels, ...parts.filter((p) => !opened.includes(p)).map((p) => quantityLabel(p))];
}
