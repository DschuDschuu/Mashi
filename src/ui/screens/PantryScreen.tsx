import { useEffect, useMemo, useState } from 'react';
import { resolveIngredient } from '../../domain/mealplan';
import { withMyProducts } from '../../domain/nutrition/myProducts';
import { recipesFromPantry, type PantryItem, type PantryUnit } from '../../domain/pantry';
import { daysLabel, daysLeft, frozenSince, specialDays, useByOf } from '../../domain/shelfLife';
import { formatAmount } from '../../domain/scaling';
import {
  addPantryItem, answerPantryCheck, currentPantry, forgetReceiptRule, freezePantryItem, removePantryItem, thawPantryItem, updatePantryItem,
  usePantry, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { navigate, useRoute } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PantryTabs, usePantrySwipe } from '../components/PlanTabs';
import { IngredientNames } from '../components/IngredientNames';
import { groupByKind } from '../foodGroups';
import { useUseUp } from '../useUseUp';
import { PantryMatchList, RecipeIdeaPanel } from '../components/PantryMatches';
import { ShelfSettings } from '../components/ShelfSettings';
import { BasicsSettings, NoNutritionSettings } from '../components/BasicsSettings';
import { ProductsLink } from '../components/ProductsLink';
import { TileSummary } from '../components/TileSummary';
import { toast } from '../toast';
import { BarcodeScanner } from '../components/BarcodeScanner';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import { FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück', 'Glas'];


import { quantityLabel } from '../format';
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
  const sortName = (id: string) => products.find((p) => p.id === id)?.name;
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
  const table = useMemo(() => withMyProducts(foodTable, products), [products]);

  const kindOf = (item: PantryItem) => resolveIngredient({ id: item.id, name: item.name }, 1, table)?.kind;
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
    return p === 'all' ? 'Alles davon ist für den Wochenplan reserviert.' : `Davon ${quantityLabel({ amount: p, unit: item.unit })} für den Wochenplan reserviert.`;
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
  const sorted = [...pantry.items].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  // Gefrorenes als eigene Gruppe am Ende – es hält ganz anders als der Rest seiner Art
  // Ganz Verplantes fällt oben weg; Bearbeiten zeigt aber immer den echten Vorrat
  const shown = sorted.filter((i) => freeOf(i) !== null);
  const groups = [
    ...groupByKind(shown.filter((i) => !i.frozenAt), kindOf),
    ...(shown.some((i) => i.frozenAt) ? [{ title: 'Gefroren', items: shown.filter((i) => i.frozenAt) }] : []),
  ];

  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Speisekammer</h1></header>
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
            <Empty icon="archive">Noch leer. Tippe unten auf ＋ – „Kassenbon importieren“ oder „Vorrat eintragen“. Mashi zeigt dir dann, was du damit kochen kannst.</Empty>
          ) : (
            groups.map(({ title, items }) => {
              return (
                <Section key={title} title={`${title} (${items.length})`}>
                  <ul className="pantry">
                    {items.map((i) => editing === i.id
                      ? <EditRow key={i.id} item={i} estimate={useByOf({ ...i, useBy: undefined }, table, pantry.shelfDays)} reserved={reservedLabel(i)} onDone={() => setEditing(null)} />
                      : (
                        <li key={i.id} className="pantry__item">
                          <button className="pantry__hit" onClick={() => setEditing(i.id)} aria-label={`${i.name} bearbeiten`}>
                            {/* links nur der Name (groß), rechts die freie Menge mit dem Datum darunter */}
                            <span className="pantry__name">
                              {i.name}
                              {shelfLabel(i)?.alarm && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={14} /></span>}
                              {i.reduced && !i.frozenAt && <span className="badge tint-peach pantry__mhd">MHD</span>}
                              {i.productId && sortName(i.productId) && <span className="pantry__sort">{sortName(i.productId)}</span>}
                            </span>
                            <span className="pantry__qty pantry__qty--stack">
                              {quantityLabel(freeOf(i) ?? i)}
                              {shelfLabel(i) && <span className={`pantry__shelf${shelfLabel(i)!.urgent ? ' is-urgent' : ''}`}>{shelfLabel(i)!.text}</span>}
                            </span>
                          </button>
                          <button className="iconbtn iconbtn--sm" aria-label={`${i.name} entfernen`} onClick={() => remove(i)}>
                            <Icon name="close" size={16} />
                          </button>
                        </li>
                      ))}
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
            <ShelfSettings />
            <BasicsSettings />
            <NoNutritionSettings />

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
  const products = useProducts();
  /** per Barcode erkannte Sorte („Mein Produkt“) – zählt dann beim Planen/Kochen */
  const [product, setProduct] = useState<MyProduct | null>(null);
  const [scanning, setScanning] = useState(false);
  const onCode = (code: string) => {
    setScanning(false);
    const p = products.find((x) => x.ean === code);
    if (!p) {
      toast('Diesen Barcode kennt Mashi noch nicht – leg das Produkt unter „Meine Produkte“ an, dann klappt es beim nächsten Mal.');
      return;
    }
    setProduct(p);
    // Name wie in Rezepten („grünes pesto“), nicht wie auf der Packung – so findet das Rezept den Vorrat
    const n = p.names?.[0] ?? (p.replaces[0] ? FOOD_CHOICES.find((f) => f.id === p.replaces[0])?.name : undefined) ?? p.name;
    // Schreibweise wie beim vorhandenen Vorrat, sonst mit großem Anfangsbuchstaben
    const known = currentPantry().items.find((it) => normalizeName(it.name) === normalizeName(n))?.name;
    if (!name.trim()) setName(known ?? n.charAt(0).toLocaleUpperCase('de-DE') + n.slice(1));
    if (!amount && p.packageAmount && p.packageUnit) { setAmount(String(p.packageAmount).replace('.', ',')); setUnit(p.packageUnit); }
  };
  const submit = () => {
    if (!name.trim()) return;
    const a = parseAmount(amount);
    addPantryItem(name, a, a === undefined ? undefined : unit, product?.id);
    toast(`„${name.trim()}“ in der Speisekammer`);
    setName('');
    setAmount('');
    setProduct(null);
  };
  return (
    <div className="panel stack">
      <label className="field"><span>Was?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" placeholder="z. B. Hähnchenbrust" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      {product
        ? <p className="scan-note" role="status">Sorte: <strong>{product.name}</strong> <button type="button" className="link" onClick={() => setProduct(null)}>entfernen</button></p>
        : <p className="small muted">Menge leer lassen = einfach „vorhanden“.</p>}
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
  /** Einfrieren: null = zu, sonst die Menge (vorausgefüllt: alles) */
  const [freezing, setFreezing] = useState<string | null>(null);
  const pantry = usePantry();
  const save = () => {
    const a = parseAmount(amount);
    const changedDate = useBy !== initialDate;
    updatePantryItem(item.id, {
      name: name.trim() || item.name, amount: a, unit: a === undefined ? undefined : unit, reduced: reduced || undefined,
      ...(changedDate ? { useBy: useBy ? new Date(`${useBy}T12:00:00`).toISOString() : undefined } : {}),
    });
    onDone();
  };
  const freeze = () => {
    const part = freezing ? parseAmount(freezing) : undefined;
    freezePantryItem(item.id, part);
    toast(part !== undefined && item.amount !== undefined && part < item.amount
      ? `${quantityLabel({ amount: part, unit: item.unit })} ${item.name} eingefroren`
      : `„${item.name}“ eingefroren`);
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
      <input value={name} onChange={(e) => setName(e.target.value)} list="ingredient-names" aria-label="Name" />
      {reserved && <p className="small muted pantry-reserved">{reserved} Hier steht der ganze Vorrat.</p>}
      <AmountFields amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      {item.frozenAt ? (
        <p className="small muted pantry-frozen">Eingefroren am {new Date(item.frozenAt).toLocaleDateString('de-DE')}</p>
      ) : (
        <>
          <label className="pantry-date">
            <span className="small muted">{item.useBy ? 'Verbrauchen bis' : estimate ? 'Verbrauchen bis (geschätzt)' : 'Verbrauchen bis (optional)'}</span>
            <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
          </label>
          <label className="pantry-mhd">
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            <span className="small">MHD-Ware (reduziert)</span>
          </label>
        </>
      )}
      <div className="pantry-actions">
        <button className="btn btn--primary btn--sm" onClick={save}>OK</button>
        {item.frozenAt
          ? <button className="btn btn--soft btn--sm" onClick={thaw}>Auftauen</button>
          : freezing === null && (
            <button className="btn btn--soft btn--sm" onClick={() => setFreezing(item.amount === undefined ? '' : String(item.amount).replace('.', ','))}>Einfrieren</button>
          )}
      </div>
      {freezing !== null && (
        <div className="pantry-freeze">
          {item.amount !== undefined && (
            <label className="small">Wie viel?
              <input inputMode="decimal" value={freezing} onChange={(e) => setFreezing(e.target.value)} aria-label="Menge zum Einfrieren" /> {item.unit}
            </label>
          )}
          <button className="btn btn--primary btn--sm" onClick={freeze}>Einfrieren</button>
          <button className="link link--muted" onClick={() => setFreezing(null)}>Abbrechen</button>
        </div>
      )}
    </li>
  );
}
