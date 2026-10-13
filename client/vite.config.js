import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fejlesztéskor a /api kéréseket a backendre továbbítjuk → azonos origin,
// így a SameSite=Strict süti működik, és nem kell CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
