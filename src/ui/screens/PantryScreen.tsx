import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isCount, plannedOf, recipesFromPantry, type PantryItem, type PantryUnit } from '../../domain/pantry';
import { suggestPantryUnit } from '../../domain/packs';
import { daysLabel, daysLeft, frozenSince, specialDays, useByOf } from '../../domain/shelfLife';
import {
  eatPreparedPortions,
  addPantryItem, answerPantryCheck, addProduct, assignPantrySorts, currentPantry, freezePantryItem, removePantryItem, setPantryAmount, thawPantryItem, updatePantryItem,
  useFoodTable, usePantry, usePlan, useProducts, useRecipes,
} from '../../data/store';
import { currentContent } from '../../domain/recipe';
import { asCooked } from '../../domain/scaling';
import { DishNutrition } from '../components/DishNutrition';
import { navigate, useRoute } from '../../router';
import { foodTable } from '../../services';
import { Empty, Section, Stepper, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { FoodsButton } from '../components/FoodsButton';
import { PantryTabs, usePantrySwipe } from '../components/PlanTabs';
import { IngredientNames } from '../components/IngredientNames';
import { groupByCategory } from '../../domain/categories';
import { useCategoryOf } from '../useCategory';
import { useUseUp } from '../useUseUp';
import { PantryMatchList, RecipeIdeaPanel } from '../components/PantryMatches';
import { ShelfSettings } from '../components/ShelfSettings';
import { toast } from '../toast';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { SortPicker, useSortOptions } from '../components/SortPicker';
import { BrandNames } from '../components/BrandNames';
import { NewProduct } from '../components/NewProduct';
import type { FoodEntry } from '../../domain/nutrition/types';
import { newId } from '../../domain/recipe';
import { nameOf, sortTags, type MyProduct } from '../../domain/nutrition/myProducts';
import { FOOD_CHOICES, normalizeName, PROVIDER } from '../../domain/nutrition/localFoods';

const UNITS: PantryUnit[] = ['g', 'ml', 'Stück', 'Glas'];


import { quantityLabel, stockLabels } from '../format';
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
  // Sorte am Vorrat: nur die Marke – der Name steht ja schon darüber („Kokosmilch“ → „Ja!“, nicht „Kokosmilch · Ja!“).
  // Ohne Marke der Sortenname, aber nur, wenn er etwas Neues sagt
  const sortLabel = (i: PantryItem) => {
    const p = i.productId ? products.find((x) => x.id === i.productId) : undefined;
    if (!p) return undefined;
    // Zusatz und Marke („leicht · K-Classic“) – Rinderhack leicht und normal sind zwei Sorten
    const tags = sortTags(p);
    if (tags.length) return tags.join(' · ');
    return normalizeName(nameOf(p)) !== normalizeName(i.name) ? nameOf(p) : undefined;
  };
  /** Zusatz der Sorte („leicht“) – steht hinter dem Namen */
  const detailOf = (i: PantryItem) => (i.productId ? products.find((x) => x.id === i.productId)?.detail : undefined);
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

  const categoryOf = useCategoryOf();
  const toCheck = pantry.items.filter((i) => i.check);
  // Nur was nach dem Wochenplan übrig bleibt – bald Ablaufendes zuerst; Eingeplantes nicht noch einmal vorschlagen
  const { rest, keys, idea, planned } = useUseUp();
  // Julia: jede Zeile zeigt, was wirklich da ist – darunter „davon 300 g verplant“ (wie bei Packungen),
  // auch ganz Verplantes bleibt sichtbar. Abgezogen wird erst beim Kochen.
  const shownOf = (item: PantryItem) => item;
  const plannedNote = (items: PantryItem[]) => {
    const p = plannedOf(items, planned);
    if (!p) return null;
    return p === 'alles' ? 'für den Wochenplan verplant' : `davon ${quantityLabel(p)} verplant`;
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
  // gleicher Name: das Angebrochene zuerst – „Joghurt 200 g offen“ direkt über „Joghurt 3 × 500 g“
  // … und danach das Ältere zuerst – beim Vorgekochten steht oben, was zuerst gegessen werden muss
  const sorted = [...pantry.items].sort((a, b) => a.name.localeCompare(b.name, 'de') || Number(!a.openedAt) - Number(!b.openedAt) || a.addedAt.localeCompare(b.addedAt));
  // Gefrorenes als eigene Gruppe am Ende – es hält ganz anders als der Rest seiner Art
  // alles bleibt sichtbar, auch ganz Verplantes („800 g · davon 800 g verplant“)
  const shown = sorted;
  const prepared = shown.filter((i) => i.recipeId && !i.frozenAt);
  const groups = [
    // Vorgekochtes zuerst – es hält am kürzesten und will gegessen werden
    ...(prepared.length ? [{ title: 'Vorgekocht', items: prepared }] : []),
    ...groupByCategory(shown.filter((i) => !i.frozenAt && !i.recipeId), (i) => categoryOf(i.name, i.productId)),
    ...(shown.some((i) => i.frozenAt) ? [{ title: 'Gefroren', items: shown.filter((i) => i.frozenAt) }] : []),
  ];
  // Eine Zeile je Lebensmittel: „Joghurt · 4 × 500 g + 400 g offen“ – antippen klappt die Teile auf
  const [expanded, setExpanded] = useState<string | null>(null);
  const clusters = (items: PantryItem[]) => {
    const out: PantryItem[][] = [];
    for (const i of items) {
      const last = out[out.length - 1];
      // Gefrorene Zutaten auch (Julia: drei Packungen Hack = eine Zeile) – Gerichte bleiben einzeln, „1 auftauen“ steht an der Zeile
      const joins = last && normalizeName(last[0].name) === normalizeName(i.name)
        && (i.frozenAt ? !!last[0].frozenAt && !i.recipeId && !last[0].recipeId : !last[0].frozenAt);
      if (joins) last.push(i);
      else out.push([i]);
    }
    return out;
  };
  /**
   * Eine Zeile – beim Bearbeiten bleibt sie als Kopf stehen und das Formular klappt darunter auf.
   * (Früher ersetzte das Formular die Zeile: ohne Namen sah es aus wie ein Teil der Gruppe darüber,
   * und es gab nichts mehr, was man zum Zuklappen antippen konnte.)
   */
  /**
   * Vorgekochtes (Julia): „1 essen“ (bzw. „1 auftauen“) direkt hinter dem Namen, darunter die Nährwerte pro Portion über
   * die ganze Breite. Ein Knopf darf keinen Knopf enthalten – darum liegt der Zeilen-Knopf unsichtbar
   * über der ganzen Zeile (.pantry__cover) und Pille und ✕ liegen obendrauf.
   */
  const dishRow = ({ key, recipeId, cooked, name, alarm, qty, open, onToggle, label, pill, end, date }: {
    key: string; recipeId?: string;
    /** so gekocht (Mengen, Sorten) – die Nährwerte pro Portion rechnen damit */
    cooked?: PantryItem['cooked'];
    name: string; alarm: boolean; qty: ReactNode;
    open: boolean; onToggle: () => void; label: string; pill?: ReactNode; end: ReactNode;
    /** Datum links unter dem Namen (wie bei den Vorräten) */
    date?: ReactNode;
  }) => {
    const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
    return (
      <li key={key} className={`pantry__item pantry__item--dish${open ? ' is-editing' : ''}`}>
        <button type="button" className="pantry__cover" onClick={onToggle} aria-expanded={open} aria-label={label} />
        <span className="pantry__name">
          {name}
          {alarm && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={12} /></span>}
          {pill}
        </span>
        {/* rechts oben die Portionen, das Datum darunter (Julia: spart eine Zeile links) */}
        <span className="pantry__dishright">{qty}{date}</span>
        {end}
        {recipe && <DishNutrition content={cooked ? asCooked(currentContent(recipe), cooked.servings, cooked.amounts) : currentContent(recipe)} own={cooked?.variants} sorts={false} full className="pantry__dishnut" />}
      </li>
    );
  };
  const row = (i: PantryItem, part = false) => {
    const isEditing = editing === i.id;
    const edit = isEditing ? [<EditRow key={`${i.id}~edit`} item={i} estimate={useByOf({ ...i, useBy: undefined }, table, pantry.shelfDays)} onDone={() => setEditing(null)} />] : [];
    // Vorgekochtes – frisch („1 essen“) und eingefroren („1 auftauen“) in derselben Kachel
    if (!part && i.recipeId) {
      const shelf = shelfLabel(i);
      return [
        dishRow({
          key: i.id, recipeId: i.recipeId, cooked: i.cooked, name: i.name, alarm: !!shelf?.alarm,
          pill: i.frozenAt ? <ThawPill item={i} /> : <EatPill item={i} />,
          open: isEditing, onToggle: () => setEditing(isEditing ? null : i.id), label: `${i.name} bearbeiten`,
          qty: (
            <span className="pantry__qty pantry__qty--stack">
              {quantityLabel(shownOf(i))}
              {plannedNote([i]) && <span className="pantry__planned">{plannedNote([i])}</span>}
            </span>
          ),
          date: shelf && <span className={`pantry__shelf pantry__shelf--left${shelf.urgent ? ' is-urgent' : ''}`}>{shelf.text}</span>,
          end: <span className={`pantry__chev${isEditing ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>,
        }),
        ...edit,
      ];
    }
    return [
      <li key={i.id} className={`pantry__item${part ? ' pantry__item--part' : ''}${isEditing ? ' is-editing' : ''}`}>
        <button className="pantry__hit" onClick={() => setEditing(isEditing ? null : i.id)} aria-expanded={isEditing} aria-label={`${i.name} bearbeiten`}>
          {/* links nur der Name (groß), rechts die freie Menge mit dem Datum darunter */}
          <span className="pantry__name">
            {part ? partLabel(i) : i.name}
            {/* Zusatz der Sorte („leicht“) direkt hinter dem Namen (Julia) – die Marke nicht */}
            {!part && detailOf(i) && <span className="pantry__detail">{detailOf(i)}</span>}
            {shelfLabel(i)?.alarm && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={12} /></span>}
            {i.reduced && !i.frozenAt && <span className="badge tint-peach pantry__mhd">MHD</span>}
            {/* Marke/Sorte nur in den Teilen einer Gruppe – dort unterscheidet sie die Packungen; sonst bleibt die Zeile flach (Julia) */}
            {part && sortLabel(i) && <span className="pantry__sort">{sortLabel(i)}</span>}
            {/* das Datum links unter dem Namen – rechts steht die Menge mit „davon … verplant“ (Julia) */}
            {shelfLabel(i) && !(part && i.frozenAt && !shelfLabel(i)!.urgent) && <span className={`pantry__shelf pantry__shelf--left${shelfLabel(i)!.urgent ? ' is-urgent' : ''}`}>{shelfLabel(i)!.text}</span>}
          </span>
          <span className="pantry__qty pantry__qty--stack">
            {/* in der Teilzeile sagt links schon „angebrochen“ */}
            {quantityLabel(part ? { ...shownOf(i), openedAt: undefined } : shownOf(i))}
            {plannedNote([i]) && <span className="pantry__planned">{plannedNote([i])}</span>}
          </span>
          {/* Pfeil statt ✕ (Julia): Aufklappen braucht man oft, Entfernen selten – das steht jetzt im Aufgeklappten */}
          <span className={`pantry__chev${isEditing ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>
        </button>
        {/* Teil eines vorgekochten Gerichts („gekocht 29.9.“): „1 essen“ für genau diesen Eintrag */}
        {isFreshPrepared(i) && <EatPill item={i} />}
      </li>,
      ...edit,
    ];
  };
  const clusterRow = (parts: PantryItem[]) => {
    if (parts.length === 1) return row(parts[0]);
    const k = `${normalizeName(parts[0].name)}|${parts[0].id}`;
    const open = expanded === k || parts.some((p) => p.id === editing);
    // das früheste Datum zählt – das Offene muss zuerst weg
    const first = [...parts].sort((a, b) => (useByOf(a, table, pantry.shelfDays)?.getTime() ?? Infinity) - (useByOf(b, table, pantry.shelfDays)?.getTime() ?? Infinity))[0];
    const shelf = shelfLabel(first);
    const qty = (
      <span className="pantry__qty pantry__qty--stack">
        {/* Offenes vorne und zusammengefasst („1,2 l offen + 7 × 1 l“) – aufgeklappt stehen die Teile einzeln */}
        <span className="pantry__parts">
          {stockLabels(parts.map(shownOf)).map((l, n) => <span key={n} className="pantry__part">{n ? `+ ${l}` : l}</span>)}
        </span>
        {plannedNote(parts) && <span className="pantry__planned">{plannedNote(parts)}</span>}
      </span>
    );
    const shelfLeft = shelf && <span className={`pantry__shelf pantry__shelf--left${shelf.urgent ? ' is-urgent' : ''}`}>{shelf.text}</span>;
    // zwei Einträge desselben Gerichts: wie ein einzelnes, „1 essen“ nimmt, was zuerst weg muss
    if (parts.every(isFreshPrepared)) {
      return [
        dishRow({
          // Nährwerte des Teils, das als Nächstes gegessen wird
          key: k, recipeId: parts[0].recipeId, cooked: first.cooked, name: parts[0].name, alarm: parts.some((p) => shelfLabel(p)?.alarm),
          pill: open ? undefined : <EatPill item={first} />, open, onToggle: () => setExpanded(open ? null : k), label: `${parts[0].name}: ${parts.length} Teile`, qty, date: shelfLeft,
          end: <span className={`pantry__chev${open ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>,
        }),
        ...(open ? parts.flatMap((p) => row(p, true)) : []),
      ];
    }
    return [
      <li key={k} className="pantry__item pantry__item--group">
        <button className="pantry__hit" onClick={() => setExpanded(open ? null : k)} aria-expanded={open} aria-label={`${parts[0].name}: ${parts.length} Teile`}>
          <span className="pantry__name">
            {parts[0].name}
            {parts.some((p) => shelfLabel(p)?.alarm) && <span className="pantry__alarm" role="img" aria-label="läuft heute oder morgen ab"><Icon name="clock" size={12} /></span>}
            {shelfLeft}
          </span>
          {qty}
          {/* im Knopf – sonst klappt ein Tipp auf den Pfeil nichts auf */}
          <span className={`pantry__chev${open ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>
        </button>
      </li>,
      ...(open ? parts.flatMap((p) => row(p, true)) : []),
    ];
  };

  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Speisekammer</h1><FoodsButton /></header>
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
            <ShelfSettings />


            {/* ganz unten (Julia): seltener gebraucht – wann du willst, kein Rhythmus */}
            <button className="panel link-row" onClick={() => navigate('/speisekammer/inventur')}>
              <Icon name="list" size={20} />
              <span className="link-row__text">
                <strong>Inventur</strong>
                <small className="muted">Speisekammer, Keller, Tiefkühler und Gewürze durchgehen</small>
              </span>
              <Icon name="chevron" size={18} />
            </button>
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
  /** dem gerade eingetragenen Vorrat die Sorte geben – das Produkt ist schon gespeichert */
  const assign = (p: MyProduct) => {
    const ids = currentPantry().items.filter((it) => !it.productId && normalizeName(it.name) === normalizeName(offer!.name)).map((it) => it.id);
    assignPantrySorts([{ itemIds: ids, productId: p.id }]);
    setOffer(null);
  };
  /** Produkt (Werte aus der Tabelle) speichern und dem Vorrat die Sorte geben */
  const adopt = (p: MyProduct) => {
    assign(addProduct(p, offer!.name));
    toast(`„${offer!.name} · ${offer!.brand}“ steht jetzt unter „Meine Lebensmittel“`);
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
      // dasselbe Formular wie unter „Meine Lebensmittel“ (Julia) – speichert selbst, hier nur noch die Sorte am Vorrat
      <NewProduct name={offer.name} pack={{ brand: offer.brand }} onDone={(p) => { if (p) assign(p); else setOffer(null); setWithValues(false); }} />
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

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });

/** Vorgekocht und nicht eingefroren – nur das isst man direkt aus dem Kühlschrank */
const isFreshPrepared = (i: PantryItem) => !!i.recipeId && !i.frozenAt;

/** Teilzeile einer Gruppe: Vorgekochtes nach Kochtag („gekocht 28.9.“), Packungen offen oder zu */
function partLabel(i: PantryItem): string {
  if (i.recipeId) return `gekocht ${shortDate(i.addedAt)}`;
  if (i.frozenAt) return `eingefroren ${shortDate(i.frozenAt)}`;
  return i.openedAt ? `angebrochen ${shortDate(i.openedAt)}` : 'geschlossen';
}

/** 1 Portion gegessen – mit „Rückgängig“; die Zeile und das Bearbeiten nutzen dasselbe */
function eatOne(item: PantryItem) {
  const undo = eatPreparedPortions(item.id, 1);
  // alle frischen Einträge dieses Gerichts – sonst hieße es „aufgegessen“, obwohl vom 30.9. noch welche da sind
  const left = currentPantry().items.filter((x) => x.recipeId === item.recipeId && !x.frozenAt).reduce((s, x) => s + (x.amount ?? 0), 0);
  toast(left > 0 ? `Guten Appetit! Noch ${quantityLabel({ ...item, amount: left })} ${item.name}` : `„${item.name}“ aufgegessen`, { label: 'Rückgängig', run: undo });
}

/** Eine Portion aus dem Tiefkühler holen – bei mehreren wird sie abgeteilt, der Rest bleibt gefroren */
function thawOne(item: PantryItem) {
  const one = (item.amount ?? 0) > 1 ? 1 : undefined;
  const undo = thawPantryItem(item.id, one);
  const d = specialDays('thawed', currentPantry().shelfDays);
  toast(`${one ? `1 Portion ${item.name}` : `„${item.name}“`} aufgetaut – hält noch ${d === 1 ? 'einen Tag' : `${d} Tage`}`, { label: 'Rückgängig', run: undo });
}

// Pillen im Aktiv (Julia): was du jetzt tust – „1 essen“, „1 auftauen“
function EatPill({ item }: { item: PantryItem }) {
  return (
    <button type="button" className="eat-pill pantry__eat" onClick={() => eatOne(item)} aria-label={`${item.name}: 1 Portion essen`}>
      <Icon name="cutlery" size={13} /> 1 essen
    </button>
  );
}

function ThawPill({ item }: { item: PantryItem }) {
  return (
    <button type="button" className="eat-pill pantry__eat" onClick={() => thawOne(item)} aria-label={`${item.name}: 1 Portion auftauen`}>
      <Icon name="snow" size={12} /> 1 auftauen
    </button>
  );
}

/**
 * Aufgeklappt (Julia): eine kurze Liste wie in den Einstellungen – alles gilt sofort, ohne „OK“.
 * Vorrat: Menge (weniger = angebrochen, siehe changeAmount), MHD-Ware, Angebrochen; unten Einfrieren
 * und Entfernen. Vorgekocht: Portionen und „Hält noch … Tage“ mit − / +.
 * Name, Sorte, Stufe und „Verbrauchen bis“ gibt es hier nicht mehr – eingetragen wird, was da ist.
 */
/** @param onDone nach Einfrieren, Auftauen, Entfernen: der Eintrag wandert oder geht – dann zuklappen */
function EditRow({ item, estimate, onDone }: { item: PantryItem; estimate?: Date; onDone: () => void }) {
  const prep = !!item.recipeId;
  /** Packungen („3 × 400 ml“): die Menge als Gesamtmenge in ml/g – 150 ml genommen = 1050 eintragen */
  const packed = !!item.pack && isCount(item.unit);
  const total = item.amount === undefined ? undefined : packed ? item.amount * item.pack!.amount : item.amount;
  const unitLabel = packed ? item.pack!.unit : item.unit;
  const [amount, setAmount] = useState(total === undefined ? '' : String(total).replace('.', ','));
  const [unit, setUnit] = useState<PantryUnit>(item.unit ?? 'g');
  /** Einfrieren: null = zu, sonst die Menge (vorausgefüllt: alles) */
  const [freezing, setFreezing] = useState<string | null>(null);
  const pantry = usePantry();

  /** Menge übernehmen (beim Verlassen des Felds) – wurde es dadurch angebrochen, sagt es die Meldung */
  const commitAmount = () => {
    const a = parseAmount(amount);
    if (a === undefined || a === total) return;
    if (item.amount === undefined) {
      updatePantryItem(item.id, { amount: a, unit });
      return;
    }
    const { undo, result } = setPantryAmount(item.id, packed ? a / item.pack!.amount : a);
    if (result === 'alle') toast(`„${item.name}“ ist alle`, { label: 'Rückgängig', run: undo });
    else if (result === 'angebrochen') toast(`${item.name} angebrochen – hält offen kürzer`, { label: 'Rückgängig', run: undo });
  };
  const freeze = () => {
    const part = freezing ? parseAmount(freezing) : undefined;
    freezePantryItem(item.id, part);
    toast(part !== undefined && item.amount !== undefined && part < item.amount
      ? `${quantityLabel({ amount: part, unit: item.unit, recipeId: item.recipeId })} ${item.name} eingefroren`
      : `„${item.name}“ eingefroren`);
    onDone();
  };
  const thaw = () => {
    const undo = thawPantryItem(item.id);
    const d = specialDays('thawed', pantry.shelfDays);
    toast(`„${item.name}“ aufgetaut – hält noch ${d === 1 ? 'einen Tag' : `${d} Tage`}`, { label: 'Rückgängig', run: undo });
    onDone();
  };
  const remove = () => {
    const undo = removePantryItem(item.id);
    toast(`„${item.name}“ entfernt`, { label: 'Rückgängig', run: undo });
    onDone();
  };

  // Vorgekocht: „Hält noch 2 Tage“ statt eines Datums – ab heute gezählt, gespeichert als Datum
  const until = item.useBy ? new Date(item.useBy) : estimate;
  const left = until ? Math.max(0, daysLeft(until)) : 0;
  const setLeft = (d: number) => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    t.setDate(t.getDate() + d);
    updatePantryItem(item.id, { useBy: t.toISOString() });
  };

  return (
    <li className="pantry__item pantry__item--edit pantry-set">
      {/* „davon … verplant“ steht schon oben in der Zeile (Julia) – hier nicht noch einmal */}
      {prep ? (
        <>
          {/* keine Portionen-Zeile (Julia): weniger wird es über „1 essen“ in der Zeile */}
          {item.frozenAt
            ? <p className="pantry-set__row small muted">Eingefroren am {new Date(item.frozenAt).toLocaleDateString('de-DE')}</p>
            : (
              <div className="pantry-set__row">
                <span>Hält noch</span>
                {/* „[−] 2 [+] Tage“ – 0 heißt: heute essen */}
                <span className="pantry-set__amount">
                  <Stepper small value={left} min={0} max={60} label="Hält noch, Tage" onChange={setLeft} />
                  <span className="small muted pantry-set__unit">{left === 0 ? 'heute' : left === 1 ? 'Tag' : 'Tage'}</span>
                </span>
              </div>
            )}
        </>
      ) : (
        <>
          <label className="pantry-set__row">
            {/* angebrochen wird über die Menge (weniger = offen) – hier nur, seit wann */}
            <span>Menge{packed && <span className="small muted"> · Packungen à {packLabel(item.pack!)}</span>}
              {item.openedAt && <span className="small muted"> · offen seit {shortDate(item.openedAt)}</span>}</span>
            <span className="pantry-set__amount">
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={commitAmount}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Menge" />
              {item.amount === undefined
                ? (
                  <select value={unit} onChange={(e) => setUnit(e.target.value as PantryUnit)} aria-label="Einheit">
                    {(['g', 'ml', 'Stück', 'Glas'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                )
                : <span className="small muted">{unitLabel}</span>}
            </span>
          </label>
          {!item.frozenAt && (
            <Switch checked={!!item.reduced} label="MHD-Ware (reduziert)" hint={item.reduced ? 'hält nur noch kurz' : undefined}
              onChange={(on) => updatePantryItem(item.id, { reduced: on || undefined })} />
          )}
          {item.frozenAt && <p className="pantry-set__row small muted">Eingefroren am {new Date(item.frozenAt).toLocaleDateString('de-DE')}</p>}
        </>
      )}

      {freezing !== null ? (
        // gleich die Menge (vorausgefüllt: alles) – Gerichte mit − / + wie „Portionen“, Knöpfe rechts
        <div className="pantry-freeze">
          {item.amount !== undefined && (prep ? (
            <span className="pantry-set__amount">
              <Stepper small value={parseAmount(freezing) ?? item.amount} min={1} max={Math.max(1, Math.ceil(item.amount))} label="Portionen zum Einfrieren" onChange={(v) => setFreezing(String(v))} />
              <span className="small muted">{parseAmount(freezing) === 1 ? 'Portion' : 'Portionen'}</span>
            </span>
          ) : (
            <span className="pantry-set__amount">
              <input inputMode="decimal" value={freezing} onChange={(e) => setFreezing(e.target.value)} aria-label="Menge zum Einfrieren" />
              <span className="small muted">{item.unit}</span>
            </span>
          ))}
          <span className="pantry-freeze__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFreezing(null)}>Abbrechen</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={freeze}>Einfrieren</button>
          </span>
        </div>
      ) : (
        <div className="pantry-set__foot">
          {item.frozenAt
            // neben „1 auftauen“ in der Zeile: hier taut alles auf – bei mehreren Portionen sagt der Knopf das
            ? <button className="btn btn--soft btn--sm" onClick={thaw}><Icon name="snow" size={14} /> {prep && (item.amount ?? 0) > 1 ? 'Alle auftauen' : 'Auftauen'}</button>
            : <button className="btn btn--soft btn--sm" onClick={() => setFreezing(item.amount === undefined ? '' : String(item.amount).replace('.', ','))}><Icon name="snow" size={14} /> Einfrieren</button>}
          <button type="button" className="link pantry-set__remove" onClick={remove}><Icon name="trash" size={14} /> Entfernen</button>
        </div>
      )}
    </li>
  );
}

/**
 * Neues Produkt mit Name + Marke, noch ohne eigene Nährwerte – es rechnet mit dem Richtwert der Tabelle
 * (Eintrag aus der Tabelle: über „ersetzt“; sonst wie früher mit einer Kopie der Werte)
 */
function fromTable(offer: { name: string; brand: string }, food: FoodEntry): MyProduct {
  const base = { id: newId('p'), name: offer.name, brand: offer.brand, names: [normalizeName(offer.name)], updatedAt: new Date().toISOString() };
  return food.ref.provider === PROVIDER
    ? { ...base, replaces: [food.ref.foodId], per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, noValues: true }
    : { ...base, replaces: [], per100g: food.per100g };
}

