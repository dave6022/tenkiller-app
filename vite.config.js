import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchLakeLevel } from './shared/usace.mjs';

const PARCEL_WMS = 'https://okmaps.org/geoserver/wms';
const PARCEL_LAYER = 'ogi_wms:Statewide_Parcels';

// In production /api/parcel is a Netlify function. This gives the dev server
// the same endpoint so the app code has no idea which one it is talking to.
function parcelProxy() {
  return {
    name: 'parcel-proxy',
    configureServer(server) {
      server.middlewares.use('/api/parcel', async (req, res) => {
        const { searchParams } = new URL(req.url, 'http://localhost');
        const lat = Number(searchParams.get('lat'));
        const lng = Number(searchParams.get('lng'));
        res.setHeader('content-type', 'application/json');

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'lat and lng are required' }));
          return;
        }

        const d = 0.0008;
        const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
        const url = `${PARCEL_WMS}?service=WMS&version=1.1.1&request=GetFeatureInfo`
          + `&layers=${encodeURIComponent(PARCEL_LAYER)}&query_layers=${encodeURIComponent(PARCEL_LAYER)}`
          + `&srs=EPSG:4326&bbox=${bbox}&width=101&height=101&x=50&y=50`
          + '&info_format=application/json&feature_count=1';

        try {
          const upstream = await fetch(url, { headers: { accept: 'application/json' } });
          const data = await upstream.json();
          const feature = (data.features || [])[0];
          res.end(JSON.stringify({
            parcel: feature ? { ...feature.properties, geometry: feature.geometry } : null,
          }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// Dev-side twin of the lake-level Netlify function.
function lakeLevelProxy() {
  return {
    name: 'lake-level-proxy',
    configureServer(server) {
      server.middlewares.use('/api/lake-level', async (req, res) => {
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
  plugins: [react(), parcelProxy(), lakeLevelProxy()],
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
