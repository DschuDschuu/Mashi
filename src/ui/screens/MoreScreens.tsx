import { currentContent } from '../../domain/recipe';
import { disconnect, leaveDemo, savedSyncConfig, useSyncState } from '../../data/backend';
import { deleteRecipe, isDemo, resetDemoData, restoreRecipe, useRecipes } from '../../data/store';
import type { Recipe } from '../../domain/types';
import { navigate } from '../../router';
import { Empty, Section, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { TopBar } from '../components/TopBar';
import { updateSettings, useSettings } from '../settings';
import { toast } from '../toast';

export function MoreScreen() {
  const all = useRecipes();
  const archived = all.filter((r) => r.archivedAt);
  const settings = useSettings();
  return (
    <main className="screen screen--tabbed">
      <header className="page-head"><h1>Mehr</h1></header>

      <Section title={`Archiv (${archived.length})`}>
        {archived.length === 0 ? (
          <Empty icon="archive">Nichts archiviert.</Empty>
        ) : (
          <ul className="list">
            {archived.map((r) => (
              <li key={r.id} className="list__item">
                <RecipeImage image={r.image} size="sm" />
                <span className="list__title">{currentContent(r).title}</span>
                <button className="btn btn--soft btn--sm" onClick={() => { restoreRecipe(r.id); toast('Wiederhergestellt'); }}>Zurückholen</button>
                <button className="iconbtn iconbtn--sm" aria-label="Endgültig löschen"
                  onClick={() => confirm(`„${currentContent(r).title}“ endgültig löschen? Es verschwindet auf allen deinen Geräten und kann nicht wiederhergestellt werden.`) && deleteRecipe(r.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Einstellungen">
        <div className="panel">
          <Switch
            label="Zutaten bei jedem Schritt anzeigen"
            hint="Über jedem Zubereitungsschritt stehen die Zutaten, die du dafür brauchst – auch im Kochmodus. Gilt nur für dieses Gerät."
            checked={settings.showStepIngredients}
            onChange={(showStepIngredients) => updateSettings({ showStepIngredients })}
          />
        </div>
      </Section>

      <Section title="Über Mashi">
        <div className="panel">
          <p><span lang="ko">맛있다</span> <em>(mashitda)</em> heißt auf Koreanisch „es schmeckt“. Mashi ist dein persönliches Kochbuch – es wächst mit jedem Rezept, das du wirklich ausprobiert hast.</p>
          <p className="muted small">Keine Werbung, kein Tracking, keine Weitergabe deiner Rezepte.</p>
        </div>
      </Section>

      <Section title="Synchronisation">
        {isDemo() ? <DemoPanel /> : <SyncPanel />}
        <button className="btn btn--ghost btn--block" onClick={() => downloadBackup(all)}>Sicherung herunterladen</button>
      </Section>
    </main>
  );
}

export function ImportScreen() {
  return (
    <main className="screen">
      <TopBar title="Rezept importieren" />
      <div className="import-grid">
        {([['camera', 'Foto', 'mint'], ['image', 'Screenshot', 'sky'], ['file', 'PDF', 'peach'], ['clipboard', 'Text einfügen', 'sage']] as const).map(([icon, label, tint]) => (
          <div key={label} className={`quick tint-${tint} is-disabled`}><Icon name={icon} size={30} /><span>{label}</span></div>
        ))}
      </div>
      <div className="tip tint-butter">
        <Icon name="info" size={20} />
        <p>Der Import kommt mit der KI-Anbindung (Phase 5). Erkannte Zutaten und Mengen werden dir dann <strong>immer erst zur Prüfung</strong> gezeigt, bevor etwas gespeichert wird.</p>
      </div>
      <button className="btn btn--soft btn--block" onClick={() => navigate('/neu/manuell', { replace: true })}>Stattdessen selbst eintragen</button>
    </main>
  );
}

function SyncPanel() {
  const state = useSyncState();
  const cfg = savedSyncConfig();
  const label = {
    aus: ["grey", "Nicht verbunden"],
    verbinde: ["yellow", "Gleiche ab …"],
    aktuell: ["green", "Auf dem neuesten Stand"],
    offline: ["yellow", "Offline – Änderungen werden später abgeglichen"],
    fehler: ["grey", "Problem beim Abgleich"],
  }[state.kind];
  return (
    <div className="panel stack">
      <p className="accuracy"><span className={`dot dot--${label[0]}`} />{label[1]}</p>
      {state.kind === "fehler" && <p className="error">{state.message}</p>}
      {state.kind === "aktuell" && <p className="muted small">Zuletzt abgeglichen: {new Date(state.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</p>}
      {cfg && <p className="muted small">Angemeldet als <strong>{cfg.username}</strong> · {new URL(cfg.url).host}</p>}
      <button className="btn btn--ghost" onClick={async () => {
        if (confirm("Auf diesem Gerät abmelden? Die lokale Kopie wird gelöscht – auf dem Server und deinen anderen Geräten bleibt alles erhalten.")) await disconnect();
      }}>Auf diesem Gerät abmelden</button>
    </div>
  );
}

function DemoPanel() {
  return (
    <div className="panel stack">
      <p className="muted small">Du siehst die <strong>Demo</strong>: Beispieldaten, die nur in diesem Browser liegen und nie hochgeladen werden.</p>
      <button className="btn btn--primary" onClick={leaveDemo}>Mit meinem Server verbinden</button>
      <button className="btn btn--ghost" onClick={async () => { if (confirm("Alle Änderungen verwerfen und Beispieldaten neu laden?")) { await resetDemoData(); toast("Beispieldaten geladen"); } }}>
        Beispieldaten zurücksetzen
      </button>
    </div>
  );
}

/** Alle Rezepte als JSON-Datei – eine Sicherung, die unabhängig vom Server ist. */
function downloadBackup(recipes: Recipe[]) {
  const blob = new Blob([JSON.stringify({ app: "mashi", exportedAt: new Date().toISOString(), recipes }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mashi-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
