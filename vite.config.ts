import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' + Hash-Routing: Die App läuft so unter jedem Pfad,
// auch unter https://<user>.github.io/mashi/ ohne 404-Tricks.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
