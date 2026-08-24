import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Separa las librerías pesadas en chunks propios: cambian poco entre deploys y el
    // navegador las mantiene en caché aunque cambie el código de la app.
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
