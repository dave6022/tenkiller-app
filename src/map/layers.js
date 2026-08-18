// The layer registry.
//
// Every overlay in the app is one entry here. Adding a layer means adding an
// object with attach/detach — no other file changes. The layer panel, the
// persistence and the style-reload handling all read from this list.
//
// Two things to know about Mapbox before writing a layer:
//
//  1. Changing the basemap style destroys every source and layer you added.
//     MapView re-runs attach() for enabled layers on each `style.load`, so
//     attach() must be safe to call repeatedly — check before adding.
//  2. Layer order is insertion order. Use `before` to slot a layer beneath
//     the basemap's labels rather than painting over them.

const DEM_SOURCE = 'dem';
const TERRAIN_TILES = 'mapbox://mapbox.mapbox-terrain-dem-v1';
const VECTOR_TERRAIN = 'mapbox://mapbox.mapbox-terrain-v2';

/** The elevation model, shared by 3D terrain and hillshade. */
export function ensureDem(map) {
  if (!map.getSource(DEM_SOURCE)) {
    map.addSource(DEM_SOURCE, {
      type: 'raster-dem',
      url: TERRAIN_TILES,
      tileSize: 512,
      maxzoom: 14,
    });
  }
  return DEM_SOURCE;
}

// Put a layer under the basemap's text so labels stay readable.
function firstLabelLayer(map) {
  const layers = map.getStyle().layers || [];
  const label = layers.find((l) => l.type === 'symbol' && l.layout && l.layout['text-field']);
  return label ? label.id : undefined;
}

export const LAYERS = [
  {
    id: 'terrain',
    name: '3D terrain',
    group: 'Terrain',
    note: 'Real elevation, from Mapbox DEM. Drag with two fingers, or right-drag, to tilt.',
    defaultOn: true,
    attach(map, { exaggeration = 1.4 } = {}) {
      ensureDem(map);
      map.setTerrain({ source: DEM_SOURCE, exaggeration });
      if (!map.getLayer('sky')) {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        });
      }
    },
    detach(map) {
      map.setTerrain(null);
      if (map.getLayer('sky')) map.removeLayer('sky');
    },
  },

  {
    id: 'hillshade',
    name: 'Shaded relief',
    group: 'Terrain',
    note: 'Directional shading that reveals draws, benches and ridgelines the imagery flattens out.',
    defaultOn: true,
    attach(map) {
      ensureDem(map);
      if (map.getLayer('hillshade')) return;
      map.addLayer({
        id: 'hillshade',
        type: 'hillshade',
        source: DEM_SOURCE,
        paint: {
          'hillshade-exaggeration': 0.55,
          'hillshade-shadow-color': '#22301C',
          'hillshade-highlight-color': '#FBFAF8',
          'hillshade-accent-color': '#4A4F42',
        },
      }, firstLabelLayer(map));
    },
    detach(map) {
      if (map.getLayer('hillshade')) map.removeLayer('hillshade');
    },
  },

  {
    id: 'contours',
    name: 'Elevation contours',
    group: 'Terrain',
    note: 'Lines every 10 m, heavier every 50 m, labelled in feet. Works over any basemap.',
    defaultOn: true,
    attach(map) {
      if (!map.getSource('terrain-vector')) {
        map.addSource('terrain-vector', { type: 'vector', url: VECTOR_TERRAIN });
      }
      const before = firstLabelLayer(map);

      if (!map.getLayer('contour-line')) {
        map.addLayer({
          id: 'contour-line',
          type: 'line',
          source: 'terrain-vector',
          'source-layer': 'contour',
          paint: {
            'line-color': '#C8A45C',
            // Index contours (every 5th) draw heavier.
            'line-width': ['case', ['>', ['get', 'index'], 0], 1.4, 0.6],
            'line-opacity': ['case', ['>', ['get', 'index'], 0], 0.9, 0.45],
          },
        }, before);
      }

      if (!map.getLayer('contour-label')) {
        map.addLayer({
          id: 'contour-label',
          type: 'symbol',
          source: 'terrain-vector',
          'source-layer': 'contour',
          filter: ['>', ['get', 'index'], 0],
          layout: {
            'symbol-placement': 'line',
            // `ele` is metres; show feet, which is what Oklahoma maps use.
            'text-field': [
              'concat',
              ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
              " ft",
            ],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'symbol-spacing': 320,
          },
          paint: {
            'text-color': '#F2E4C4',
            'text-halo-color': 'rgba(20,23,15,0.85)',
            'text-halo-width': 1.2,
          },
        }, before);
      }
    },
    detach(map) {
      ['contour-label', 'contour-line'].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
    },
  },
];

// Parcel boundaries, served as WMS images straight from the state GeoServer.
// Tiles are images, so they are not subject to CORS — only the click lookup in
// lib/parcel.js needs the proxy.
const PARCEL_TILES = 'https://okmaps.org/geoserver/wms'
  + '?service=WMS&version=1.1.1&request=GetMap'
  + '&layers=ogi_wms%3AStatewide_Parcels'
  + '&srs=EPSG:3857&bbox={bbox-epsg-3857}'
  + '&width=256&height=256&format=image/png&transparent=true';

LAYERS.push({
  id: 'parcels',
  name: 'Parcels & owners',
  group: 'Property',
  note: 'County assessor boundaries statewide. Tap a parcel for owner of record, acreage and a link to the county record.',
  defaultOn: true,
  attach(map) {
    if (!map.getSource('parcels')) {
      map.addSource('parcels', {
        type: 'raster',
        tiles: [PARCEL_TILES],
        tileSize: 256,
        attribution: 'Parcels: Oklahoma OGI / county assessors',
      });
    }
    if (!map.getLayer('parcels')) {
      map.addLayer({
        id: 'parcels',
        type: 'raster',
        source: 'parcels',
        paint: { 'raster-opacity': 0.85 },
      }, firstLabelLayer(map));
    }
  },
  detach(map) {
    if (map.getLayer('parcels')) map.removeLayer('parcels');
    if (map.getSource('parcels')) map.removeSource('parcels');
  },
});

// Water depth is deliberately absent, and this records why so the next person
// does not repeat the search.
//
// Checked 16 Aug 2026:
//   - Oklahoma OGI GeoServer (621 layers): no bathymetry, depth or soundings.
//   - OWRB `LOK_Lakes` layer 2 "Contours" carries a real `depth` field but
//     covers 91 lakes, all state or municipal. Every big Corps reservoir —
//     Tenkiller, Eufaula, Texoma, Keystone — is absent, because the Corps
//     surveys those, not OWRB.
//   - USGS publishes no inland reservoir bathymetry service for Oklahoma.
//   - Tenkiller's most recent survey is a 2015 hydrographic survey done by
//     Bowen Engineering & Surveying for USACE Tulsa District. It is not
//     published as a web service.
//
// Two real routes to depth contours, neither of them code:
//   1. Request the 2015 survey from USACE Tulsa District (CESWT-PA@usace.army.mil)
//      and host the contours yourself. Free, authoritative, needs a human ask.
//   2. License a commercial chart layer (Navionics, C-MAP). Paid, instant,
//      and what fishing apps actually use.
//
// Do not approximate it. A depth contour that is wrong by six feet is worse
// than no contour at all when someone is running a boat over it.

export const DEPTH_STATUS = {
  available: false,
  reason: 'Lake Tenkiller has no publicly published bathymetry. The Corps surveyed it in 2015 but has not released it as data.',
};

// Landmarks: parks, campgrounds, reserves, marinas, boat ramps and named peaks.
//
// Source: OpenStreetMap, licensed ODbL — free to use commercially, requires
// attribution, which is set on the source below and shown in the map's
// attribution control. Pre-fetched to a static file rather than queried live:
// these features change rarely, and hammering the volunteer-run Overpass API on
// every page load would be rude.
//
// Regenerate with the Overpass query documented in README.
const LANDMARK_COLORS = [
  'match', ['get', 'kind'],
  'park', '#3F6212',
  'campground', '#B45309',
  'reserve', '#0F766E',
  'marina', '#1D4ED8',
  'ramp', '#1D4ED8',
  'peak', '#7C6A52',
  '#4A4F42',
];

LAYERS.push({
  id: 'landmarks',
  name: 'Parks & landmarks',
  group: 'Landmarks',
  note: 'Park, campground and refuge boundaries, plus marinas, boat ramps and named peaks with elevations. OpenStreetMap.',
  defaultOn: true,
  attach(map) {
    if (!map.getSource('landmarks')) {
      map.addSource('landmarks', {
        type: 'geojson',
        data: new URL('data/landmarks.geojson', document.baseURI).href,
        attribution: '© OpenStreetMap contributors',
      });
    }
    const before = firstLabelLayer(map);

    // Area fills
    if (!map.getLayer('landmark-fill')) {
      map.addLayer({
        id: 'landmark-fill',
        type: 'fill',
        source: 'landmarks',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': LANDMARK_COLORS, 'fill-opacity': 0.18 },
      }, before);
    }

    // Outlines — the boundary is the point of this layer, so it stays crisp.
    if (!map.getLayer('landmark-outline')) {
      map.addLayer({
        id: 'landmark-outline',
        type: 'line',
        source: 'landmarks',
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: {
          'line-color': LANDMARK_COLORS,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 2.6],
          'line-opacity': 0.95,
        },
      }, before);
    }

    // Points: peaks, ramps, marinas, campground nodes
    if (!map.getLayer('landmark-point')) {
      map.addLayer({
        id: 'landmark-point',
        type: 'circle',
        source: 'landmarks',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 6],
          'circle-color': LANDMARK_COLORS,
          'circle-stroke-color': '#FBFAF8',
          'circle-stroke-width': 1.4,
        },
      }, before);
    }

    // Labels. Peaks carry their elevation, which is the useful part.
    if (!map.getLayer('landmark-label')) {
      map.addLayer({
        id: 'landmark-label',
        type: 'symbol',
        source: 'landmarks',
        filter: ['has', 'name'],
        layout: {
          'text-field': [
            'case',
            ['all', ['==', ['get', 'kind'], 'peak'], ['has', 'ele_ft']],
            ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele_ft']], ' ft'],
            ['get', 'name'],
          ],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 13],
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
          'text-optional': true,
        },
        paint: {
          'text-color': '#FBFAF8',
          'text-halo-color': 'rgba(20,23,15,0.9)',
          'text-halo-width': 1.4,
        },
      });
    }
  },
  detach(map) {
    ['landmark-label', 'landmark-point', 'landmark-outline', 'landmark-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('landmarks')) map.removeSource('landmarks');
  },
});

// Public lands: Corps recreation areas, state parks, refuges, WMAs.
//
// Source: USGS PAD-US 4.1 — a US Government work in the public domain, so no
// attribution is required, though it is credited anyway.
//
// This is the layer that actually covers the lake. OpenStreetMap has good
// campground and boat-ramp detail but has mapped only two of Tenkiller's park
// boundaries; PAD-US carries the Corps and state ownership polygons.
//
// Regenerate with: node tools/fetch-publiclands.mjs
const LAND_COLORS = [
  'match', ['get', 'kind'],
  'corps', '#2563EB',
  'statepark', '#3F6212',
  'refuge', '#0F766E',
  'wma', '#B45309',
  'reserve', '#65A30D',
  'citypark', '#4D7C0F',
  'historic', '#7C3AED',
  'military', '#9F1239',
  '#4A4F42',
];

LAYERS.push({
  id: 'publiclands',
  name: 'Public lands',
  group: 'Landmarks',
  note: 'Corps recreation areas, state parks, wildlife refuges and WMAs, with acreage and public access. USGS PAD-US.',
  defaultOn: true,
  attach(map) {
    if (!map.getSource('publiclands')) {
      map.addSource('publiclands', {
        type: 'geojson',
        data: new URL('data/publiclands.geojson', document.baseURI).href,
        attribution: 'USGS PAD-US',
      });
    }
    const before = firstLabelLayer(map);

    if (!map.getLayer('land-fill')) {
      map.addLayer({
        id: 'land-fill',
        type: 'fill',
        source: 'publiclands',
        paint: { 'fill-color': LAND_COLORS, 'fill-opacity': 0.2 },
      }, before);
    }

    if (!map.getLayer('land-outline')) {
      map.addLayer({
        id: 'land-outline',
        type: 'line',
        source: 'publiclands',
        paint: {
          'line-color': LAND_COLORS,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 3],
          'line-opacity': 0.95,
        },
      }, before);
    }

    if (!map.getLayer('land-label')) {
      map.addLayer({
        id: 'land-label',
        type: 'symbol',
        source: 'publiclands',
        filter: ['has', 'name'],
        layout: {
          'text-field': ['concat', ['get', 'name'], '\n', ['get', 'designation']],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
          'text-max-width': 11,
          'text-optional': true,
        },
        paint: {
          'text-color': '#FBFAF8',
          'text-halo-color': 'rgba(20,23,15,0.9)',
          'text-halo-width': 1.5,
        },
      });
    }
  },
  detach(map) {
    ['land-label', 'land-outline', 'land-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('publiclands')) map.removeSource('publiclands');
  },
});

// Campgrounds and individual campsites from Recreation.gov (RIDB).
//
// Public domain federal data. The API key is used only by
// tools/fetch-recreation.mjs at tooling time — it never ships to the browser.
//
// Individual sites appear from zoom 13 so a campground reads as one marker on
// the way in, then resolves into its actual sites once you are close, which is
// how onX behaves.
//
// Regenerate with: node tools/fetch-recreation.mjs

// Icons and fill patterns are drawn to a canvas synchronously so they can be
// registered before the layers that reference them. Loading an <img> would be
// async, and Mapbox would log "image not found" until it arrived.
function canvasImage(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  return g.getImageData(0, 0, size, size);
}

function ensureTentIcon(map) {
  if (map.hasImage('tk-tent')) return;
  const img = canvasImage(40, (g) => {
    g.beginPath(); g.moveTo(20, 5); g.lineTo(35, 33); g.lineTo(5, 33); g.closePath();
    g.fillStyle = '#B45309'; g.fill();
    g.lineWidth = 3.5; g.strokeStyle = '#FBFAF8'; g.lineJoin = 'round'; g.stroke();
    // Door, so it reads as a tent and not just a triangle.
    g.beginPath(); g.moveTo(20, 15); g.lineTo(27.5, 33); g.lineTo(12.5, 33); g.closePath();
    g.fillStyle = '#FBFAF8'; g.fill();
  });
  map.addImage('tk-tent', img, { pixelRatio: 2 });
}

function ensureHatch(map) {
  if (map.hasImage('tk-hatch')) return;
  const img = canvasImage(16, (g, s) => {
    g.strokeStyle = 'rgba(63,98,18,0.85)';
    g.lineWidth = 2.2;
    g.beginPath();
    for (let i = -s; i < s * 2; i += 8) { g.moveTo(i, 0); g.lineTo(i + s, s); }
    g.stroke();
  });
  map.addImage('tk-hatch', img, { pixelRatio: 2 });
}

export const REC_LAYER_IDS = ['rec-campsite', 'rec-campground', 'rec-facility'];

LAYERS.push({
  id: 'recreation',
  name: 'Campsites & ramps',
  group: 'Landmarks',
  note: 'Every bookable Corps campsite with hookups, vehicle limits and a link to reserve. Zoom in past a campground to see its individual sites.',
  defaultOn: true,
  attach(map) {
    ensureTentIcon(map);
    ensureHatch(map);

    if (!map.getSource('recreation')) {
      map.addSource('recreation', {
        type: 'geojson',
        data: new URL('data/recreation.geojson', document.baseURI).href,
        attribution: 'Recreation.gov',
      });
    }

    // Campground footprint: translucent green wash, a hatch over it, and a
    // solid boundary. Derived from site positions — see tools/fetch-recreation.
    if (!map.getLayer('rec-area-fill')) {
      map.addLayer({
        id: 'rec-area-fill',
        type: 'fill',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campground-area'],
        paint: { 'fill-color': '#3F6212', 'fill-opacity': 0.22 },
      });
    }

    if (!map.getLayer('rec-area-hatch')) {
      map.addLayer({
        id: 'rec-area-hatch',
        type: 'fill',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campground-area'],
        paint: { 'fill-pattern': 'tk-hatch', 'fill-opacity': 0.5 },
      });
    }

    if (!map.getLayer('rec-area-line')) {
      map.addLayer({
        id: 'rec-area-line',
        type: 'line',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campground-area'],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': '#3F6212',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.6, 16, 4],
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer('rec-facility')) {
      map.addLayer({
        id: 'rec-facility',
        type: 'circle',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'facility'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 6],
          'circle-color': '#1D4ED8',
          'circle-stroke-color': '#FBFAF8',
          'circle-stroke-width': 1.4,
        },
      });
    }

    // Individual sites — only once you are close enough for them to mean
    // something.
    if (!map.getLayer('rec-campsite')) {
      map.addLayer({
        id: 'rec-campsite',
        type: 'symbol',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campsite'],
        minzoom: 13,
        layout: {
          'icon-image': 'tk-tent',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.28, 15, 0.5, 18, 0.9],
          // Every site must show; a campground is a grid of them and letting
          // Mapbox drop colliding icons would hide half the sites.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    if (!map.getLayer('rec-campground')) {
      map.addLayer({
        id: 'rec-campground',
        type: 'circle',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campground'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 15, 9],
          'circle-color': '#B45309',
          'circle-stroke-color': '#FBFAF8',
          'circle-stroke-width': 2,
        },
      });
    }

    if (!map.getLayer('rec-campground-label')) {
      map.addLayer({
        id: 'rec-campground-label',
        type: 'symbol',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campground'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 15, 13],
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-optional': true,
        },
        paint: {
          'text-color': '#FBFAF8',
          'text-halo-color': 'rgba(20,23,15,0.9)',
          'text-halo-width': 1.5,
        },
      });
    }

    // Site numbers, only when genuinely readable.
    if (!map.getLayer('rec-campsite-label')) {
      map.addLayer({
        id: 'rec-campsite-label',
        type: 'symbol',
        source: 'recreation',
        filter: ['==', ['get', 'kind'], 'campsite'],
        minzoom: 16,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [0.6, 0],
          'text-optional': true,
        },
        paint: {
          'text-color': '#FBFAF8',
          'text-halo-color': 'rgba(20,23,15,0.85)',
          'text-halo-width': 1.2,
        },
      });
    }
  },
  detach(map) {
    ['rec-campsite-label', 'rec-campground-label', 'rec-campground', 'rec-campsite', 'rec-facility',
     'rec-area-line', 'rec-area-hatch', 'rec-area-fill']
      .forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource('recreation')) map.removeSource('recreation');
  },
});

// Trails, extracted from the Geofabrik Oklahoma OSM extract.
//
// ODbL — attribution is required and set on the source below.
//
// Drawn as a dark casing under a bright dashed line, which is the convention
// outdoor maps use because a single-stroke line disappears over aerial imagery.
//
// Regenerate with: node tools/fetch-trails.mjs <oklahoma-latest.osm.pbf>
const TRAIL_COLORS = [
  'match', ['get', 'kind'],
  'path', '#F59E0B',
  'footway', '#FBBF24',
  'track', '#D97706',
  'cycleway', '#38BDF8',
  'steps', '#C084FC',
  '#F59E0B',
];

LAYERS.push({
  id: 'trails',
  name: 'Trails',
  group: 'Landmarks',
  note: 'Hiking paths, tracks and cycleways. Farm tracks are filtered out unless named or waymarked.',
  defaultOn: true,
  attach(map) {
    if (!map.getSource('trails')) {
      map.addSource('trails', {
        type: 'geojson',
        data: new URL('data/trails.geojson', document.baseURI).href,
        attribution: '© OpenStreetMap contributors',
      });
    }

    if (!map.getLayer('trail-casing')) {
      map.addLayer({
        id: 'trail-casing',
        type: 'line',
        source: 'trails',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(20,23,15,0.65)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 17, 8],
        },
      });
    }

    if (!map.getLayer('trail-line')) {
      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trails',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': TRAIL_COLORS,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.4, 17, 4],
          'line-dasharray': [2, 1.4],
        },
      });
    }

    if (!map.getLayer('trail-label')) {
      map.addLayer({
        id: 'trail-label',
        type: 'symbol',
        source: 'trails',
        filter: ['has', 'name'],
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13],
          'symbol-spacing': 260,
          'text-optional': true,
        },
        paint: {
          'text-color': '#FDE68A',
          'text-halo-color': 'rgba(20,23,15,0.9)',
          'text-halo-width': 1.4,
        },
      });
    }
  },
  detach(map) {
    ['trail-label', 'trail-line', 'trail-casing'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('trails')) map.removeSource('trails');
  },
});

const SELECTED_SOURCE = 'parcel-selected';

/** Outline the parcel the user tapped, using the geometry the lookup returned. */
export function showSelectedParcel(map, geometry) {
  if (!map || !map.isStyleLoaded()) return;

  if (!geometry) {
    if (map.getLayer('parcel-selected-line')) map.removeLayer('parcel-selected-line');
    if (map.getLayer('parcel-selected-fill')) map.removeLayer('parcel-selected-fill');
    if (map.getSource(SELECTED_SOURCE)) map.removeSource(SELECTED_SOURCE);
    return;
  }

  const data = { type: 'Feature', geometry, properties: {} };

  if (map.getSource(SELECTED_SOURCE)) {
    map.getSource(SELECTED_SOURCE).setData(data);
  } else {
    map.addSource(SELECTED_SOURCE, { type: 'geojson', data });
  }

  if (!map.getLayer('parcel-selected-fill')) {
    map.addLayer({
      id: 'parcel-selected-fill',
      type: 'fill',
      source: SELECTED_SOURCE,
      paint: { 'fill-color': '#3F6212', 'fill-opacity': 0.22 },
    }, firstLabelLayer(map));
  }
  if (!map.getLayer('parcel-selected-line')) {
    map.addLayer({
      id: 'parcel-selected-line',
      type: 'line',
      source: SELECTED_SOURCE,
      paint: { 'line-color': '#3F6212', 'line-width': 2.4 },
    }, firstLabelLayer(map));
  }
}

export const LAYER_GROUPS = [...new Set(LAYERS.map((l) => l.group))];
export const findLayer = (id) => LAYERS.find((l) => l.id === id);
