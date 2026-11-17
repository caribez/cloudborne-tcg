import { defineConfig } from 'vite';

// Dev backend port (Socket.IO). The Vite dev server proxies /socket.io to it so
// the browser always talks to the page's own origin.
const DEV_BACKEND_PORT = Number(process.env.DEV_BACKEND_PORT ?? 3001);

export default defineConfig({
  root: '.',
  server: {
    host: true, // listen on the LAN interface too
    port: 5173,
    proxy: {
      '/socket.io': {
        target: `http://localhost:${DEV_BACKEND_PORT}`,
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1000, // three.js alone is ~600 kB minified
  },
});
