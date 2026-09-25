import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/nunito-sans/latin-600.css';
import '@fontsource/nunito-sans/latin-700.css';
import '@fontsource/dancing-script/latin-500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StartError } from './ui/StartError';
import { boot } from './data/backend';
import { registerServiceWorker, startUpdateCheck } from './pwa';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

// Erst den Speicher starten (Demo oder Sync), dann die Oberfläche.
// Klappt das nicht (Speicher voll, Browser sperrt IndexedDB …), eine Meldung statt einer weißen Seite.
boot().then(
  (mode) => {
    root.render(
      <StrictMode>
        <App mode={mode} />
      </StrictMode>,
    );
  },
  (e: unknown) => {
    console.error('Mashi: Start fehlgeschlagen', e);
    root.render(<StartError error={e} />);
  },
);

registerServiceWorker();
startUpdateCheck();
