import { MyProductsPanel } from '../components/MyProductsPanel';
import { TopBar } from '../components/TopBar';

/** Was du immer in derselben Sorte kaufst – eigene Seite, erreichbar aus Speisekammer und Preisen. */
export function ProductsScreen() {
  return (
    <main className="screen">
      <TopBar title="Meine Produkte" backTo="/speisekammer" />
      <MyProductsPanel />
    </main>
  );
}
