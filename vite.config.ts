import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Texterkennung ohne fremden Server (Code-Review #3): Worker, Programmkern und deutsche Sprachdaten kommen von der
 * eigenen Seite statt von cdn.jsdelivr.net – kein fremder Code mit Zugriff auf die App-Daten, und es geht offline.
 * Beim Bauen liegen sie unter tesseract/ neben der App, im Dev-Server werden sie direkt aus node_modules ausgeliefert.
 * Der Kern in drei Varianten (je nach Gerät lädt Tesseract genau eine), siehe tesseract.js getCore.
 */
const OCR_FILES: Record<string, string> = {
  'tesseract/worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract/core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract/core/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract/lang/deu.traineddata.gz': '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz',
};
const fromModules = (path: string) => readFileSync(resolve('node_modules', path));

function ocrFiles(): Plugin {
  return {
    name: 'mashi-ocr-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const name = Object.keys(OCR_FILES).find((k) => path.endsWith(`/${k}`));
        if (!name) return next();
        res.setHeader('Content-Type', name.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript');
        res.end(fromModules(OCR_FILES[name]));
      });
    },
    generateBundle() {
      for (const [fileName, path] of Object.entries(OCR_FILES)) this.emitFile({ type: 'asset', fileName, source: fromModules(path) });
    },
  };
}

// base './' + Hash-Routing: Die App läuft so unter jedem Pfad,
// auch unter https://<user>.github.io/mashi/ ohne 404-Tricks.
export default defineConfig({
  base: './',
  plugins: [react(), ocrFiles()],
  server: { port: 5173 },
});
