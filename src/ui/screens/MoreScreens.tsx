import { useRef, useState } from 'react';
import { createBackup, parseBackup, type ParsedBackup } from '../../domain/backup';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import { currentContent } from '../../domain/recipe';
import { disconnect, leaveDemo, savedSyncConfig, uploadPending, useSyncState } from '../../data/backend';
import { deleteRecipe, importProducts, importRecipes, isDemo, resetDemoData, restoreRecipe, useProducts, useRecipes } from '../../data/store';
import type { Recipe } from '../../domain/types';
import { Empty, Section, Switch } from '../components/Controls';
import { TopBar } from '../components/TopBar';
import { MacroGoalSettings } from '../components/MacroGoalSettings';
import { Icon } from '../components/Icon';
import { RecipeImage } from '../components/RecipeImage';
import { updateSettings, useSettings } from '../settings';
import { recipeCount } from '../format';
import { toast } from '../toast';

export function MoreScreen() {
  const all = useRecipes();
  const archived = all.filter((r) => r.archivedAt);
  const settings = useSettings();
  return (
    <main className="screen">
      <TopBar title="Einstellungen" backTo="/" />

      <Section title="Über Mashi">
        <div className="panel">
          <p><span lang="ko">맛있다</span> <em>(mashitda)</em> heißt auf Koreanisch „es schmeckt“. Mashi ist dein persönliches Kochbuch – es wächst mit jedem Rezept, das du wirklich ausprobiert hast.</p>
          <p className="muted small">Keine Werbung, kein Tracking, keine Weitergabe deiner Rezepte.</p>
        </div>
      </Section>

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
        <MacroGoalSettings />
      </Section>

      <Section title="Sicherung">
        <BackupPanel recipes={all} />
      </Section>

      <Section title="Synchronisation">
        {isDemo() ? <DemoPanel /> : <SyncPanel />}
      </Section>
    </main>
  );
}

function SyncPanel() {
  const state = useSyncState();
  const [leaving, setLeaving] = useState(false);
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
      <button className="btn btn--ghost" disabled={leaving} onClick={async () => {
        if (!confirm("Auf diesem Gerät abmelden? Die lokale Kopie wird gelöscht – auf dem Server und deinen anderen Geräten bleibt alles erhalten.")) return;
        setLeaving(true);
        // Erst hochladen, was noch nicht abgeglichen ist – sonst wäre es mit der lokalen Kopie weg
        if (!(await uploadPending())) {
          const anyway = confirm("Nicht alles ist beim Server angekommen (offline oder Anmeldung abgelaufen). Trotzdem abmelden? Änderungen, die nur auf diesem Gerät sind, gehen dann verloren. Tipp: vorher unten „Sicherung herunterladen“.");
          if (!anyway) return setLeaving(false);
        }
        await disconnect();
      }}>{leaving ? "Lade noch hoch …" : "Auf diesem Gerät abmelden"}</button>
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
function downloadBackup(recipes: Recipe[], products: MyProduct[]) {
  const blob = new Blob([JSON.stringify(createBackup(recipes, products), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mashi-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Sicherung herunterladen und wieder einspielen. Beim Einspielen erst eine Vorschau –
 * übernommen wird nur nach Bestätigung. Vorhandene Rezepte werden zusammengeführt.
 */
function BackupPanel({ recipes }: { recipes: Recipe[] }) {
  const products = useProducts();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<(ParsedBackup & { fileName: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = ''; // dieselbe Datei später erneut wählbar
    if (!file) return;
    setError(null);
    try {
      setPreview({ ...parseBackup(JSON.parse(await file.text())), fileName: file.name });
    } catch (e) {
      setPreview(null);
      setError(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : (e as Error).message);
    }
  };

  const existingIds = new Set(recipes.map((r) => r.id));
  const known = preview ? preview.recipes.filter((r) => existingIds.has(r.id)).length : 0;

  const apply = () => {
    if (!preview) return;
    const { added, merged } = importRecipes(preview.recipes);
    const prods = importProducts(preview.products);
    toast(`${recipeCount(added)} neu${merged ? `, ${merged} zusammengeführt` : ''}${prods ? ` · ${prods} Produkt${prods === 1 ? '' : 'e'}` : ''}`);
    setPreview(null);
  };

  return (
    <div className="panel stack">
      <p className="muted small">Alle Rezepte als Datei auf diesem Gerät speichern – oder eine solche Datei wieder einspielen.</p>
      <div className="row-2">
        <button className="btn btn--ghost" onClick={() => downloadBackup(recipes, products)}>Herunterladen</button>
        <button className="btn btn--ghost" onClick={() => input.current?.click()}>Einspielen …</button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p className="error" role="alert">{error}</p>}

      {preview && (
        <div className="backup-preview">
          <p><strong>{preview.fileName}</strong></p>
          <p className="small">
            {recipeCount(preview.recipes.length)} gefunden
            {known > 0 && <> · davon {known} schon vorhanden (werden zusammengeführt, nichts geht verloren)</>}
            {preview.products.length > 0 && <> · dazu {preview.products.length} von „Meine Produkte“</>}
            {preview.rejected > 0 && <> · {preview.rejected} unvollständig, werden übersprungen</>}
          </p>
          <ul className="backup-preview__list">
            {preview.recipes.slice(0, 8).map((r) => <li key={r.id}>{currentContent(r).title}</li>)}
            {preview.recipes.length > 8 && <li className="muted">… und {preview.recipes.length - 8} weitere</li>}
          </ul>
          <div className="row-gap">
            <button className="btn btn--primary" disabled={!preview.recipes.length && !preview.products.length} onClick={apply}>Einspielen</button>
            <button className="btn btn--ghost" onClick={() => setPreview(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
