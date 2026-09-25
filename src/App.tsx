import { useEffect, type ReactElement } from 'react';
import type { Mode } from './data/backend';
import { useStoreReady } from './data/store';
import { useRoute, type Route } from './router';
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
import { StartScreen } from './ui/screens/StartScreen';
import { TestFeedbackScreen } from './ui/screens/TestFeedbackScreen';
import { TestingScreen } from './ui/screens/TestingScreen';

/** Routen-Tabelle. Tabs zeigen die untere Navigation, Unterseiten nicht. */
function resolve(route: Route): { screen: ReactElement; tab?: string } {
  const [a, b, c] = route.segments;
  switch (a) {
    case undefined: return { screen: <StartScreen />, tab: '/' };
    case 'kochbuch': return { screen: <CookbookScreen key={route.query.toString()} route={route} />, tab: '/kochbuch' };
    // „Zum Testen“ ist kein eigener Tab mehr – erreichbar über Start und Kochbuch
    case 'testen': return { screen: <TestingScreen /> };
    case 'plan': return { screen: <PlanScreen />, tab: '/plan' };
    case 'preise': return { screen: <PricesScreen />, tab: '/plan' };
    case 'einkauf': return { screen: <ShoppingScreen />, tab: '/plan' };
    case 'speisekammer':
      if (b === 'bon') return { screen: <ReceiptImportScreen shared={route.query.has('geteilt')} /> };
      return { screen: <PantryScreen />, tab: '/plan' };
    case 'mehr': return { screen: <MoreScreen />, tab: '/mehr' };
    case 'neu':
      if (b === 'ki') return { screen: <AiCreateScreen /> };
      if (b === 'import') return { screen: <ImportScreen /> };
      return { screen: <RecipeFormScreen key="neu" /> };
    case 'rezept':
      if (c === 'kochen') return { screen: <CookModeScreen id={b} servings={Number(route.query.get('p')) || undefined} /> };
      if (c === 'test') return { screen: <TestFeedbackScreen key={b} id={b} /> };
      if (c === 'bearbeiten') return { screen: <RecipeFormScreen key={b} editId={b} /> };
      return { screen: <RecipeDetailScreen key={b} id={b} /> };
  }
  return { screen: <StartScreen />, tab: '/' };
}

/** mode = null: auf diesem Gerät noch nicht verbunden → Verbindungs-Bildschirm. */
export function App({ mode }: { mode: Mode | null }) {
  const ready = useStoreReady();
  const route = useRoute();
  const message = useToast();

  // Geschweifte Klammern nötig: neuere Browser geben bei scrollTo ein Promise zurück,
  // das React sonst für eine Aufräumfunktion hält.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  if (mode === null) return <div className="app"><ConnectScreen /></div>;
  if (!ready) return <div className="boot"><span className="logo">Mashi</span></div>;

  const { screen, tab } = resolve(route);
  // Kochmodus: bewusst ohne Navigation, auch auf dem Tablet – ein Schritt, nichts sonst.
  const cooking = route.segments[0] === 'rezept' && route.segments[2] === 'kochen';
  return (
    <div className={`app${cooking ? '' : ' app--nav'}`}>
      <StatusBanner />
      {screen}
      {!cooking && <BottomNav active={tab} onlyTablet={!tab} />}
      {message && (
        <div className="toast" role="status">
          {message.text}
          {message.action && (
            <button className="toast__action" onClick={() => { message.action!.run(); dismissToast(); }}>{message.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
