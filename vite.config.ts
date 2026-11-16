import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({command}) => {
  return {
    base: command === 'build' ? '/GroupTrip/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('xlsx')) return 'xlsx-vendor';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
            if (id.includes('qrcode') || id.includes('@yudiel/react-qr-scanner')) return 'qr-vendor';
            if (id.includes('framer-motion') || id.includes('motion') || id.includes('lucide-react') || id.includes('date-fns')) return 'ui-vendor';
            if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
          },
        },
      },
    },
  };
});
