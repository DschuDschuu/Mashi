import { useState } from 'react';
import { setFoodStage, useFoodTable, usePantry } from '../../data/store';
import type { PantryUnit } from '../../domain/pantry';
import { ruleKey, type RestockRule, type RestockStatus } from '../../domain/restock';
import { stageOf, type FoodStage } from '../../domain/stage';
import { toast } from '../toast';
import { useRestockStatus } from '../useShoppingCount';
import { Icon } from './Icon';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

// „normal“ ist kein eigener Knopf – es ist einfach „nichts gewählt“; nochmal antippen schaltet ab
const STAGES: { stage: Exclude<FoodStage, 'normal'>; label: string; icon: 'home' | 'refresh' | 'leaf' }[] = [
  { stage: 'nachkaufen', label: 'Nachkaufen', icon: 'refresh' },
  { stage: 'haus', label: 'Im Haus', icon: 'home' }, // kurz, damit alle drei in eine Zeile passen
  { stage: 'ohne', label: 'Gewürze', icon: 'leaf' },
];

const HINT: Record<FoodStage, string> = {
  normal: 'Nichts gewählt: Steht es im Vorrat, zählt Mashi mit.',
  haus: 'Wird nicht gezählt: bei Rezepten nie „fehlt“, auf der Einkaufsliste unter „Basics“.',
  ohne: 'Gewürze & Co.: immer da und zählen in Rezepten nicht mit. Eigene Werte bleiben gespeichert.',
  nachkaufen: 'Wird gezählt und kommt unter der Grenze von selbst auf die Einkaufsliste.',
};

/**
 * „Wie behältst du es im Blick?“ – genau eine Stufe je Lebensmittel: normal · 🏠 immer im Haus ·
 * 🔄 nachkaufen unter X. Dieselbe Auswahl unter „Meine Lebensmittel“ und am Vorrat in der Speisekammer.
 */
export function StagePicker({ name, onTouch }: { name: string; onTouch?: () => void }) {
  const pantry = usePantry();
  const statuses = useRestockStatus();
  const table = useFoodTable();
  const { stage, rule } = stageOf(name, pantry, table);
  const key = ruleKey({ name }, table);
  /** „Nachkaufen“ angetippt, Grenze noch nicht eingetragen */
  const [asking, setAsking] = useState(false);
  const shown = asking ? 'nachkaufen' : stage;
  const pick = (s: Exclude<FoodStage, 'normal'>) => {
    onTouch?.();
    // der aktive Knopf nochmal → wieder normal
    if (s === shown) {
      setAsking(false);
      if (stage === 'normal') return; // „Nachkaufen“ angetippt, aber noch keine Grenze – einfach zu
      const undo = setFoodStage(name, 'normal');
      toast(`„${name}“ – nichts Besonderes mehr festgelegt`, { label: 'Rückgängig', run: undo });
      return;
    }
    if (s === 'nachkaufen') {
      setAsking(true);
      return;
    }
    setAsking(false);
    const undo = setFoodStage(name, s);
    toast(s === 'haus' ? `„${name}“ ist jetzt immer im Haus` : `„${name}“ steht jetzt unter „Gewürze“ – zählt nicht mit`, { label: 'Rückgängig', run: undo });
  };
  return (
    <div className="stage">
      <span className="small muted">Wie behältst du es im Blick?</span>
      {/* onPointerDown: ein offenes Grenzfeld soll nicht erst per Blur speichern und dann gleich umspringen */}
      <div className="stage__options" role="group" aria-label={`${name}: wie im Blick behalten`}>
        {STAGES.map((o) => (
          <button key={o.stage} type="button" aria-pressed={shown === o.stage}
            className={`chip chip--sm${shown === o.stage ? ' is-on' : ''}`} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o.stage)}>
            <Icon name={o.icon} size={14} /> {o.label}
          </button>
        ))}
      </div>
      {shown === 'nachkaufen'
        ? <RestockField key={rule ? `${rule.below}${rule.unit}` : 'neu'} name={name} rule={rule} status={key ? statuses.get(key) : undefined} onClose={() => setAsking(false)} />
        : <p className="small muted stage__hint">{HINT[shown]}</p>}
    </div>
  );
}

const RESTOCK_UNITS: PantryUnit[] = ['Stück', 'Glas', 'g', 'ml'];

/**
 * „Auf die Einkaufsliste, wenn weniger als 4 Stück da sind“ – ein Hinweis, keine Menge.
 * Gespeichert beim Verlassen des Felds bzw. sofort bei der Einheit. Zahl gelöscht = zurück auf „normal“.
 * Darunter der Stand, damit „kein Hinweis“ nie rätselhaft ist (reicht / steht drauf / kann nicht zählen).
 */
function RestockField({ name, rule, status, onClose }: { name: string; rule?: RestockRule; status?: RestockStatus; onClose: () => void }) {
  const [below, setBelow] = useState(rule ? fmt(rule.below) : '');
  const [unit, setUnit] = useState<PantryUnit>(rule?.unit ?? 'Stück');
  const save = (b = below, u = unit) => {
    const n = Number(b.replace(',', '.'));
    if (!b.trim() || !(n > 0)) {
      // leer (oder 0): bestehende Regel weg, sonst einfach zu
      if (rule) {
        const undo = setFoodStage(name, 'normal');
        toast(`„${name}“ kommt nicht mehr von selbst auf die Liste`, { label: 'Rückgängig', run: undo });
      }
      onClose();
      return;
    }
    if (rule && rule.below === n && rule.unit === u) return;
    setFoodStage(name, 'nachkaufen', { below: n, unit: u });
    if (!rule) toast(`„${name}“ kommt unter ${fmt(n)} ${u} von selbst auf die Einkaufsliste`);
    onClose();
  };
  return (
    <div className="restock">
      <label className="restock__row">
        <span className="small">Nachkaufen unter</span>
        <span className="pantry-amount">
          <input inputMode="decimal" value={below} autoFocus={!rule} placeholder="z. B. 4" aria-label="Mindestbestand"
            onChange={(e) => setBelow(e.target.value)} onBlur={() => save()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { if (rule) setBelow(fmt(rule.below)); else onClose(); }
            }} />
          <select value={unit} aria-label="Einheit" onChange={(e) => { const u = e.target.value as PantryUnit; setUnit(u); save(below, u); }}>
            {RESTOCK_UNITS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </span>
      </label>
      {rule && status && <p className={`small restock__status is-${status.state}`}>{status.text}</p>}
      {!rule && <button type="button" className="link link--muted" onPointerDown={(e) => e.preventDefault()} onClick={onClose}>Abbrechen</button>}
    </div>
  );
}
