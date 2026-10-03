import { unsavedDays, type SavedBon } from '../../domain/bons';
import { dropPriceDay, forgetReceiptRule, usePantry } from '../../data/store';
import { formatAmount } from '../../domain/scaling';
import { TileSummary } from '../components/TileSummary';
import { navigate } from '../../router';
import { FoodsButton } from '../components/FoodsButton';
import { Empty, Section } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PantryTabs, usePantrySwipe } from '../components/PlanTabs';
import { ask } from '../confirm';
import { euro } from '../format';
import { toast } from '../toast';
import { bonTitle } from './BonScreen';

/**
 * Einkäufe (Julia: eigener Tab, damit die Preise-Seite nicht voll wird): alle gespeicherten Kassenbons, neueste zuerst –
 * antippen zum Ansehen und Korrigieren –, darunter die Tage, die vor dem Speichern der Bons eingelesen wurden.
 */
export function ReceiptsScreen() {
  const swipe = usePantrySwipe('bons');
  const pantry = usePantry();
  const empty = !(pantry.bons ?? []).length && !unsavedDays(pantry).length;
  return (
    <main className="screen screen--tabbed" {...swipe}>
      <header className="page-head"><h1>Einkäufe</h1><FoodsButton /></header>
      <PantryTabs active="bons" />
      <button type="button" className="btn btn--soft btn--block" onClick={() => navigate('/speisekammer/bon')}>
        <Icon name="camera" size={18} /> Kassenbon importieren
      </button>
      {/* gehört zu den Bons (Julia) – vorher in der Speisekammer unter „Verwalten“; zugeklappt, damit es keinen Platz nimmt */}
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
      {empty ? (
        <Empty icon="cart"><span>Noch kein Kassenbon gespeichert.</span></Empty>
      ) : (
        <>
          <BonList bons={pantry.bons ?? []} />
          <OldDays />
        </>
      )}
    </main>
  );
}

/** Meine Einkäufe (Julia): die gespeicherten Bons, neueste zuerst – antippen zum Ansehen und Korrigieren */
function BonList({ bons }: { bons: SavedBon[] }) {
  if (!bons.length) return null;
  const shown = [...bons].reverse();
  return (
    <Section title={`Gespeicherte Kassenbons (${bons.length})`}>
      <ul className="bonview">
        {shown.map((b) => {
          const saved = b.savings ? b.savings.offers + b.savings.lidlPlus + b.savings.mhd : 0;
          return (
            <li key={b.id} className="bonview__line">
              <button type="button" className="bonview__open" onClick={() => navigate(`/preise/bon/${b.id}`)}>
                <span className="bonview__name">{bonTitle(b)}</span>
                <span className="bonview__price">{b.total !== undefined ? euro(b.total) : ''}</span>
                <span className="small muted bonview__sub">{b.lines.filter((l) => !l.skip).length} Artikel{saved > 0 ? ` · gespart ${euro(saved)}` : ''}</span>
                <Icon name="chevron" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * Eingelesen vor dem Speichern der Bons (Julia): je Tag, wie viele Preise – löschbar, z. B. wenn der Bon damals
 * ohne erkanntes Datum am falschen Tag gelandet ist. Danach mit richtigem Datum neu einlesen.
 */
function OldDays() {
  const days = unsavedDays(usePantry());
  if (!days.length) return null;
  return (
    <Section title="Eingelesen vor dem Speichern der Bons">
      <ul className="bonview">
        {days.map(({ day, names }) => (
          <li key={day} className="bonview__line old-day">
            <span className="old-day__text">
              <strong>{bonTitle({ date: `${day}T12:00:00.000Z` })}</strong>
              <span className="small muted">{names.length} {names.length === 1 ? 'Preis' : 'Preise'} · {names.slice(0, 3).join(', ')}{names.length > 3 ? ' …' : ''}</span>
            </span>
            <button type="button" className="iconbtn iconbtn--sm iconbtn--danger" aria-label={`Preise vom ${bonTitle({ date: `${day}T12:00:00.000Z` })} löschen`} onClick={async () => {
              if (!(await ask({
                title: 'Preise dieses Tages löschen?',
                text: `${names.length} ${names.length === 1 ? 'Preis' : 'Preise'} und die Ersparnis dieses Tages fallen aus dem Verlauf. Die Speisekammer bleibt, wie sie ist.`,
                confirm: 'Löschen', danger: true,
              }))) return;
              const undo = dropPriceDay(day);
              toast('Preise gelöscht – jetzt den Bon mit richtigem Datum neu einlesen', { label: 'Rückgängig', run: undo });
            }}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
