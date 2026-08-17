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
    defaultOn: false,
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
    defaultOn: false,
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
  defaultOn: false,
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
  defaultOn: false,
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
