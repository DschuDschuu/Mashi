import { useState } from 'react';
import { setFoodStage, useFoodTable, usePantry } from '../../data/store';
import type { PantryUnit } from '../../domain/pantry';
import { ruleKey, type RestockRule, type RestockStatus } from '../../domain/restock';
import { stageOf, type FoodStage } from '../../domain/stage';
import { withSpices } from '../../domain/nutrition/noNutrition';
import { toast } from '../toast';
import { useRestockStatus } from '../useShoppingCount';
import { Stepper } from './Controls';
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
 * Stufen-Chips (ohne Überschrift, Julia) – genau eine Stufe je Lebensmittel: normal · 🏠 immer im Haus ·
 * 🔄 nachkaufen unter X. Dieselbe Auswahl unter „Meine Lebensmittel“ und am Vorrat in der Speisekammer.
 */
/**
 * @param name Schlüssel, unter dem die Stufe gespeichert ist (Zutat der Tabelle, z. B. „Magermilch“)
 * @param label so heißt es in der Kachel („Milch“) – nur für Meldungen; ohne = name
 */
export function StagePicker({ name, label = name, onTouch }: { name: string; label?: string; onTouch?: () => void }) {
  const pantry = usePantry();
  const statuses = useRestockStatus();
  const table = useFoodTable();
  const { stage, rule } = stageOf(name, pantry, table);
  const key = ruleKey({ name }, table);
  /** „Nachkaufen“ angetippt, Grenze noch nicht bestätigt (✓) */
  const [asking, setAsking] = useState(false);
  const shown = asking ? 'nachkaufen' : stage;
  const status = key ? statuses.get(key) : undefined;
  const pick = (s: Exclude<FoodStage, 'normal'>) => {
    onTouch?.();
    if (s === shown) {
      setAsking(false);
      if (stage === 'normal') return; // „Nachkaufen“ offen, aber noch nicht bestätigt – einfach zu
      // gespeicherte Grenze: nochmal antippen tut nichts (Julia: löschen war zu fehleranfällig – dafür 🗑)
      if (s === 'nachkaufen') return;
      // Im Haus / Gewürze nochmal → wieder normal (mit Rückgängig)
      const undo = setFoodStage(name, 'normal');
      toast(`„${label}“ – nichts Besonderes mehr festgelegt`, { label: 'Rückgängig', run: undo });
      return;
    }
    if (s === 'nachkaufen') {
      // erst die Grenze einstellen, dann ✓ (Julia) – nichts wird gespeichert, bevor du bestätigst
      setAsking(true);
      return;
    }
    setAsking(false);
    // ein Kraut, das es auch frisch gibt: Gewürz wird die getrocknete – der Bund bleibt, wie er ist (Julia)
    const dried = s === 'ohne' ? withSpices(table, [name]).driedOf?.(name) : undefined;
    const undo = setFoodStage(name, s);
    toast(s === 'haus' ? `„${label}“ ist jetzt immer im Haus`
      : dried ? `„${dried.name}“ steht jetzt unter „Gewürze“ – „${label}“ bleibt, wie es ist`
        : `„${label}“ steht jetzt unter „Gewürze“ – zählt nicht mit`, { label: 'Rückgängig', run: undo });
  };
  return (
    <div className="stage">
      {/* onPointerDown: ein offenes Grenzfeld soll nicht erst per Blur speichern und dann gleich umspringen */}
      <div className="stage__options" role="group" aria-label={`${label}: wie im Blick behalten`}>
        {STAGES.map((o) => (
          <button key={o.stage} type="button" aria-pressed={shown === o.stage}
            className={`chip chip--sm${shown === o.stage ? ' is-on' : ''}`} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o.stage)}>
            <Icon name={o.icon} size={14} /> {o.label}
          </button>
        ))}
      </div>
      {shown === 'nachkaufen'
        ? <RestockField key={rule ? `${rule.below}${rule.unit}` : 'neu'} name={name} label={label} rule={rule} status={status} onClose={() => setAsking(false)} />
        : <p className="small muted stage__hint">{HINT[shown]}</p>}
    </div>
  );
}

const RESTOCK_UNITS: PantryUnit[] = ['Stück', 'Glas', 'g', 'ml'];
/** Stück und Glas zählt man in ganzen Schritten – dort − / +, bei g und ml ein Feld (kein Schritt passt) */
const counted = (u: PantryUnit) => u === 'Stück' || u === 'Glas';

/**
 * „Auf die Einkaufsliste, wenn weniger als 4 Stück da sind“ – ein Hinweis, keine Menge.
 * Erst einstellen (− / + bei Stück und Glas, Feld bei g und ml), dann ✓ – vorher wird nichts gespeichert.
 * Beim Ändern ✓ (übernehmen) und ✕ (nur verwerfen – zurück auf gespeichert, bzw. zu, wenn noch nichts
 * gespeichert ist). Nichts geändert: 🗑 löscht die Grenze (mit Rückgängig). So heißt jedes Zeichen immer
 * dasselbe (Julia: ✕ löschte, wenn man nur zurück wollte).
 * Darunter nur, wenn die Grenze nicht funktionieren kann („Kann nicht zählen …“) – den normalen Stand
 * („Gerade 3 Stück – reicht“) zeigen Speisekammer und Einkaufsliste ohnehin (Julia).
 */
function RestockField({ name, label, rule, status, onClose }: { name: string; label: string; rule?: RestockRule; status?: RestockStatus; onClose: () => void }) {
  const [below, setBelow] = useState(rule ? fmt(rule.below) : '1');
  const [unit, setUnit] = useState<PantryUnit>(rule?.unit ?? 'Stück');
  const n = Number(below.replace(',', '.'));
  const valid = below.trim() !== '' && n > 0;
  // ✓ nur, wenn es etwas zu übernehmen gibt: neu, oder anders als gespeichert
  const dirty = !rule || rule.below !== n || rule.unit !== unit;
  const confirm = () => {
    if (!valid) return;
    setFoodStage(name, 'nachkaufen', { below: n, unit });
    toast(`„${label}“ kommt unter ${fmt(n)} ${unit} von selbst auf die Einkaufsliste`);
    onClose();
  };
  /** ✕: Änderung verwerfen – nichts wird gelöscht */
  const discard = () => {
    if (!rule) return onClose();
    setBelow(fmt(rule.below));
    setUnit(rule.unit);
  };
  /** 🗑: die gespeicherte Grenze löschen */
  const remove = () => {
    if (!rule) return;
    const undo = setFoodStage(name, 'normal');
    toast(`„${label}“ kommt nicht mehr von selbst auf die Liste`, { label: 'Rückgängig', run: undo });
    onClose();
  };
  // von g auf Stück wird aus „250“ keine 250 Stück – dann neu mit 1
  const changeUnit = (u: PantryUnit) => {
    if (counted(u) && !counted(unit)) setBelow('1');
    setUnit(u);
  };
  return (
    <div className="restock">
      <div className="restock__line">
        {/* div statt label: in einem label löste ein Tipp auf den Text den ersten Knopf (−) aus */}
        <div className="restock__row">
          <span className="small">Nachkaufen unter</span>
          <span className="pantry-amount">
            {counted(unit)
              ? <Stepper small value={Math.max(1, Math.round(n) || 1)} min={1} max={99} label="Mindestbestand" onChange={(v) => setBelow(String(v))} />
              : (
                <input inputMode="decimal" value={below} placeholder="250" aria-label="Mindestbestand" autoFocus
                  onChange={(e) => setBelow(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setBelow(rule ? fmt(rule.below) : ''); }} />
              )}
            <select value={unit} aria-label="Einheit" onChange={(e) => changeUnit(e.target.value as PantryUnit)}>
              {RESTOCK_UNITS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </span>
        </div>
        {dirty ? (
          <>
            {/* ✓ links neben ✕ (Julia): erst bestätigen, dann gilt es */}
            <button type="button" className="iconbtn iconbtn--sm restock__ok" onClick={confirm} disabled={!valid} aria-label="Grenze übernehmen">
              <Icon name="check" size={16} />
            </button>
            <button type="button" className="iconbtn iconbtn--sm restock__remove" onClick={discard} aria-label={rule ? 'Änderung verwerfen' : 'Schließen'}>
              <Icon name="close" size={16} />
            </button>
          </>
        ) : (
          <button type="button" className="iconbtn iconbtn--sm iconbtn--danger restock__remove restock__trash" onClick={remove} aria-label="Nachkaufen-Grenze löschen">
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      {rule && status?.state === 'unbekannt' && <p className={`small restock__status is-${status.state}`}>{status.text}</p>}
    </div>
  );
}
