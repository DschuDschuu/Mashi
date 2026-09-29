import { useEffect, type ReactElement } from 'react';
import { Onboarding } from './ui/components/Onboarding';
import { useSettings } from './ui/settings';
import type { Mode } from './data/backend';
import { useLeftoverAsk, useStoreReady } from './data/store';
import { navigate, useRoute, type Route } from './router';
import { BottomNav } from './ui/components/BottomNav';
import { StatusBanner } from './ui/components/StatusBanner';
import { dismissToast, useToast } from './ui/toast';
import { AiCreateScreen } from './ui/screens/AiCreateScreen';
import { ConnectScreen } from './ui/screens/ConnectScreen';
import { CookbookScreen } from './ui/screens/CookbookScreen';
import { CookModeScreen } from './ui/screens/CookModeScreen';
import { ImportScreen } from './ui/screens/ImportScreen';
import { MoreScreen } from './ui/screens/MoreScreens';
import { PlanScreen } from './ui/screens/PlanScreen';
import { PantryScreen } from './ui/screens/PantryScreen';
import { PricesScreen } from './ui/screens/PricesScreen';
import { ShoppingScreen } from './ui/screens/ShoppingScreen';
import { ReceiptImportScreen } from './ui/screens/ReceiptImportScreen';
import { RecipeDetailScreen } from './ui/screens/RecipeDetailScreen';
import { RecipeFormScreen } from './ui/screens/RecipeFormScreen';
import { ProductsScreen } from './ui/screens/ProductsScreen';
import { StartScreen } from './ui/screens/StartScreen';
import { TestFeedbackScreen } from './ui/screens/TestFeedbackScreen';
import { UseUpScreen } from './ui/screens/UseUpScreen';
import { LeftoverSheet } from './ui/components/LeftoverSheet';
import { InventoryScreen } from './ui/screens/InventoryScreen';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { ConfirmSheet } from './ui/components/ConfirmSheet';
import { useConfirm } from './ui/confirm';

/** Weiterleitung ohne eigenen Eintrag im Verlauf */
function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/**
 * Routen-Tabelle. Tabs zeigen die untere Navigation, Unterseiten nicht.
 * section: zu welchem Reiter eine Unterseite gehört – auf dem Tablet bleibt er in der Seitenleiste markiert.
 */
function resolve(route: Route): { screen: ReactElement; tab?: string; section?: string } {
  const [a, b, c] = route.segments;
  switch (a) {
    case undefined: return { screen: <StartScreen />, tab: '/' };
    case 'kochbuch': return { screen: <CookbookScreen key={route.query.toString()} route={route} />, tab: '/kochbuch' };
    // „Zum Testen“ lebt im Kochbuch (KI-Ideen + Rezepte zum Testen) – alte Links landen dort
    case 'testen': return { screen: <Redirect to="/kochbuch?segment=testen" /> };
    case 'plan': return { screen: <PlanScreen />, tab: '/plan' };
    case 'reste': return { screen: <UseUpScreen />, section: '/' };
    case 'preise': return { screen: <PricesScreen />, tab: '/speisekammer' };
    // die Einkaufsliste hängt am Wagen in der Speisekammer
    case 'einkauf': return { screen: <ShoppingScreen />, tab: '/speisekammer' };
    case 'speisekammer':
      if (b === 'bon') return { screen: <ReceiptImportScreen shared={route.query.has('geteilt')} />, section: '/speisekammer' };
      if (b === 'inventur') return { screen: <InventoryScreen />, section: '/speisekammer' };
      return { screen: <PantryScreen />, tab: '/speisekammer' };
    // „Einstellungen“ (früher Tab „Mehr“) – übers Zahnrad auf Start und Kochbuch, auf dem Tablet in der Seitenleiste
    case 'mehr': return { screen: <MoreScreen />, section: '/mehr' };
    case 'produkte': return { screen: <ProductsScreen />, section: '/speisekammer' };
    case 'neu':
      if (b === 'ki') return { screen: <AiCreateScreen initialPrompt={route.query.get('text') ?? ''} /> };
      if (b === 'import') return { screen: <ImportScreen /> };
      return { screen: <RecipeFormScreen key="neu" /> };
    case 'rezept':
      if (c === 'kochen') return { screen: <CookModeScreen id={b} servings={Number(route.query.get('p')) || undefined} variants={parseVariants(route.query.get('s'))} /> };
      if (c === 'test') return { screen: <TestFeedbackScreen key={b} id={b} />, section: '/kochbuch' };
      if (c === 'bearbeiten') return { screen: <RecipeFormScreen key={b} editId={b} />, section: '/kochbuch' };
      return { screen: <RecipeDetailScreen key={b} id={b} />, section: '/kochbuch' };
  }
  return { screen: <StartScreen />, tab: '/' };
}

/** mode = null: auf diesem Gerät noch nicht verbunden → Verbindungs-Bildschirm. */
export function App({ mode }: { mode: Mode | null }) {
  const ready = useStoreReady();
  const route = useRoute();
  const message = useToast();
  const leftoverOpen = !!useLeftoverAsk();
  const confirmOpen = !!useConfirm();
  const settings = useSettings();

  // Geschweifte Klammern nötig: neuere Browser geben bei scrollTo ein Promise zurück,
  // das React sonst für eine Aufräumfunktion hält.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  if (mode === null) return <div className="app"><ConnectScreen /></div>;
  if (!ready) return <div className="boot"><span className="logo">Mashi</span></div>;

  const { screen, tab, section } = resolve(route);
  // Kochmodus: bewusst ohne Navigation, auch auf dem Tablet – ein Schritt, nichts sonst.
  const cooking = route.segments[0] === 'rezept' && route.segments[2] === 'kochen';
  return (
    <div className={`app${cooking ? '' : ' app--nav'}`}>
      <StatusBanner />
      {/* stürzt eine Seite ab: Meldung statt leerem Bildschirm – je Seite neu (key), damit Zurück wieder geht */}
      <ErrorBoundary key={route.path}>{screen}</ErrorBoundary>
      {!cooking && <BottomNav active={tab ?? section} onlyTablet={!tab} />}
      {/* Einführung beim ersten Start (je Gerät) – nicht mitten im Kochen */}
      {!settings.onboarded && !cooking && <Onboarding onClose={() => undefined} />}
      {/* nach „Gekocht“ – überall, auch nach dem Kochmodus */}
      <LeftoverSheet />
      {/* Nachfragen im Mashi-Stil statt Browser-Dialog (ask) */}
      <ConfirmSheet />
      {/* solange „Was ist übrig?“ offen ist, nicht über dessen Knöpfe legen – danach erscheint er wieder */}
      {message && !leftoverOpen && !confirmOpen && (
        <div className={`toast${message.action ? ' toast--action' : ''}`} role="status">
          {message.text}
          {message.action && (
            <button className="toast__action" onClick={() => { message.action!.run(); dismissToast(); }}>
              {message.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** „?s=…“ – im Rezept gewählte Sorten (Zutat-ID → Produkt-ID); alles andere wird ignoriert */
function parseVariants(raw: string | null): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return undefined;
  }
}
