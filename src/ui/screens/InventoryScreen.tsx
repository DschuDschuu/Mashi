import { useState } from 'react';
import { applyInventory, useFoodTable, usePantry, usePlan } from '../../data/store';
import { basicsOf } from '../../domain/mealplan';
import { zeroOf } from '../../domain/nutrition/noNutrition';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { type PantryItem, type PantryUnit } from '../../domain/pantry';
import { suggestPantryUnit } from '../../domain/packs';
import { amountLabel, packLabel } from '../../domain/pantryLabel';
import { storageOf } from '../../domain/shelfLife';
import { stageOf } from '../../domain/stage';
import { navigate } from '../../router';
import { Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { toast } from '../toast';

type Mark = 'ok' | 'weg' | { amount: string; unit?: PantryUnit };
const UNITS: PantryUnit[] = ['Stück', 'g', 'ml', 'Glas'];

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Inventur – wann du willst, kein Rhythmus. Für das, was gern verschwindet: Speisekammer & Keller,
 * Tiefkühler, dazu Immer im Haus und Gewürze zum Abhaken („auffüllen“ → Einkaufsliste).
 * Der Kühlschrank ist ausgeblendet – den hat man meist im Blick (einblendbar).
 * Übernommen wird erst mit „Fertig“, mit „Rückgängig“.
 */
export function InventoryScreen() {
  const pantry = usePantry();
  const plan = usePlan();
  const table = useFoodTable();
  const [fridge, setFridge] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [checks, setChecks] = useState<Record<string, 'da' | 'auffuellen'>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name, 'de') || Number(!a.openedAt) - Number(!b.openedAt);
  // Immer im Haus und Gewürze zählt Mashi nicht – die stehen nur unten in der Abhakliste, nicht doppelt
  const counted = (it: PantryItem) => !['haus', 'ohne'].includes(stageOf(it.name, pantry, table).stage);
  const where = (it: PantryItem) => (counted(it) ? storageOf(it, table, pantry.shelfDays) : undefined);
  const groups: { title: string; icon: 'archive' | 'cup' | 'glass'; items: PantryItem[] }[] = [
    { title: 'Speisekammer & Keller', icon: 'archive' as const, items: pantry.items.filter((i) => where(i) === 'vorrat').sort(byName) },
    { title: 'Gefroren', icon: 'glass' as const, items: pantry.items.filter((i) => where(i) === 'gefroren').sort(byName) },
    ...(fridge ? [{ title: 'Kühlschrank', icon: 'cup' as const, items: pantry.items.filter((i) => where(i) === 'kuehl').sort(byName) }] : []),
  ].filter((g) => g.items.length);
  const onList = new Set((plan.extra ?? []).map((x) => normalizeName(x.name)));
  const lists = [
    { title: 'Immer im Haus', icon: 'home' as const, names: [...basicsOf(pantry)].sort((a, b) => a.localeCompare(b, 'de')) },
    { title: 'Gewürze', icon: 'leaf' as const, names: [...zeroOf(pantry)].sort((a, b) => a.localeCompare(b, 'de')) },
  ].filter((l) => l.names.length);

  const all = groups.reduce((n, g) => n + g.items.length, 0) + lists.reduce((n, l) => n + l.names.length, 0);
  const done = Object.keys(marks).length + Object.keys(checks).length;
  const mark = (id: string, m: Mark | undefined) => setMarks(({ [id]: _old, ...rest }) => (m ? { ...rest, [id]: m } : rest));

  const finish = () => {
    const amounts: Record<string, number> = {};
    const units: Record<string, PantryUnit> = {};
    const remove: string[] = [];
    for (const [id, m] of Object.entries(marks)) {
      if (m === 'weg') remove.push(id);
      else if (m !== 'ok') {
        const n = parse(m.amount);
        if (n === undefined) continue;
        amounts[id] = n;
        const it = pantry.items.find((x) => x.id === id);
        // bisher nur „vorhanden“: die gewählte (oder vorgeschlagene) Einheit mitgeben
        if (it && !it.unit) units[id] = m.unit ?? suggestPantryUnit(table.matchName(it.name)?.food);
      }
    }
    const refill = Object.entries(checks).filter(([, v]) => v === 'auffuellen').map(([n]) => n);
    const changed = remove.length + Object.keys(amounts).length + refill.length;
    if (changed) {
      const undo = applyInventory({ amounts, remove, refill, units });
      toast(`Inventur übernommen${refill.length ? ` – ${refill.length} auf der Einkaufsliste` : ''}`, { label: 'Rückgängig', run: undo });
    } else toast('Alles stimmt – nichts geändert');
    navigate('/speisekammer', { replace: true });
  };

  return (
    <main className="screen inventory">
      <TopBar title="Inventur" backTo="/speisekammer" />
      <p className="muted small">Einmal durchgehen, was im Schrank, im Keller und im Tiefkühler steht – und welche Gewürze zur Neige gehen. Übernommen wird erst mit „Fertig“.</p>
      <label className="inventory__toggle small">
        <input type="checkbox" checked={fridge} onChange={(e) => setFridge(e.target.checked)} /> Auch Kühlschrank
      </label>

      {groups.map((g) => (
        <Section key={g.title} icon={g.icon} title={`${g.title} (${g.items.length})`}>
          <ul className="inventory__list panel">
            {g.items.map((it) => {
              const m = marks[it.id];
              const edited = m && typeof m === 'object' ? m : undefined;
              const unit = it.pack && (it.unit === 'Stück' || it.unit === 'Glas') ? `× ${packLabel(it.pack)}` : it.recipeId ? 'Portionen' : it.unit ?? '';
              return (
                <li key={it.id} className={`inventory__row${m === 'weg' ? ' is-gone' : m === 'ok' ? ' is-ok' : ''}`}>
                  <span className="inventory__name">{it.name}</span>
                  {editing === it.id ? (
                    <span className="inventory__edit">
                      <input inputMode="decimal" autoFocus value={edited?.amount ?? String(it.amount ?? '').replace('.', ',')} aria-label={`Menge ${it.name}`}
                        onChange={(e) => mark(it.id, { ...edited, amount: e.target.value })}
                        // Wechsel ins Einheiten-Feld daneben schließt die Bearbeitung nicht
                        onBlur={(e) => { if (!e.relatedTarget?.closest('.inventory__edit')) setEditing(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} />
                      {it.unit || it.recipeId
                        ? <span className="small muted">{unit}</span>
                        : (
                          // bisher nur „vorhanden“ – dann braucht die Zahl eine Einheit
                          <select value={edited?.unit ?? suggestPantryUnit(table.matchName(it.name)?.food)} aria-label={`Einheit ${it.name}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => mark(it.id, { amount: edited?.amount ?? '', unit: e.target.value as PantryUnit })}>
                            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        )}
                    </span>
                  ) : (
                    <button type="button" className="inventory__qty" onClick={() => setEditing(it.id)} aria-label={`Menge von ${it.name} ändern`}>
                      {edited && parse(edited.amount) !== undefined ? amountLabel({ ...it, amount: parse(edited.amount), unit: it.unit ?? edited.unit ?? suggestPantryUnit(table.matchName(it.name)?.food) }) : amountLabel(it)}
                      <Icon name="pencil" size={13} />
                    </button>
                  )}
                  <span className="inventory__actions">
                    <button type="button" className={`iconbtn iconbtn--sm${m === 'ok' ? ' is-on' : ''}`} aria-pressed={m === 'ok'} aria-label={`${it.name} stimmt`}
                      onClick={() => mark(it.id, m === 'ok' ? undefined : 'ok')}><Icon name="check" size={16} /></button>
                    <button type="button" className={`iconbtn iconbtn--sm${m === 'weg' ? ' is-on' : ''}`} aria-pressed={m === 'weg'} aria-label={`${it.name} ist weg`}
                      onClick={() => mark(it.id, m === 'weg' ? undefined : 'weg')}><Icon name="trash" size={16} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      {lists.map((l) => (
        <Section key={l.title} icon={l.icon} title={`${l.title} (${l.names.length})`}>
          <ul className="inventory__list panel">
            {l.names.map((n) => {
              const v = checks[n];
              const already = onList.has(normalizeName(n));
              const set = (x: 'da' | 'auffuellen') => setChecks(({ [n]: _old, ...rest }) => (v === x ? rest : { ...rest, [n]: x }));
              return (
                <li key={n} className={`inventory__row${v === 'da' ? ' is-ok' : ''}`}>
                  <span className="inventory__name">{n}{already && <span className="small muted"> · steht schon auf der Liste</span>}</span>
                  <span className="inventory__actions">
                    <button type="button" className={`chip chip--sm${v === 'da' ? ' is-on' : ''}`} aria-pressed={v === 'da'} onClick={() => set('da')}>
                      <Icon name="check" size={14} /> da
                    </button>
                    {!already && (
                      <button type="button" className={`chip chip--sm${v === 'auffuellen' ? ' is-on' : ''}`} aria-pressed={v === 'auffuellen'} onClick={() => set('auffuellen')}>
                        <Icon name="cart" size={14} /> auffüllen
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <div className="inventory__done">
        <span className="small muted">{done} von {all} geprüft</span>
        <button type="button" className="btn btn--primary" onClick={finish}>Fertig</button>
      </div>
    </main>
  );
}
