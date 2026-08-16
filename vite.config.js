import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Note: shared/ modules are imported lazily inside the middleware below rather
// than at the top of this file. Cloudflare's wrangler parses vite.config.js
// during deploy and chokes on top-level imports it cannot resolve.

// Dev-side twins of the deployed /api/* handlers, so app code never knows
// whether it is talking to Vite, a Worker or a Netlify function.
function apiProxy() {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/parcel', async (req, res) => {
        const { fetchParcel } = await import('./shared/parcel.mjs');
        const { searchParams } = new URL(req.url, 'http://localhost');
        const lat = Number(searchParams.get('lat'));
        const lng = Number(searchParams.get('lng'));
        res.setHeader('content-type', 'application/json');

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'lat and lng are required' }));
          return;
        }

        try {
          res.end(JSON.stringify({ parcel: await fetchParcel(lng, lat) }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      server.middlewares.use('/api/lake-level', async (req, res) => {
        const { fetchLakeLevel } = await import('./shared/usace.mjs');
        res.setHeader('content-type', 'application/json');
        try {
          res.end(JSON.stringify({ level: await fetchLakeLevel() }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), apiProxy()],
  server: { host: true },
  build: {
    // mapbox-gl is ~1.6 MB and changes only when we upgrade it, while app code
    // changes constantly. Splitting them means a redeploy invalidates a ~20 KB
    // chunk instead of the whole bundle.
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ['mapbox-gl'],
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1800,
  },
});
