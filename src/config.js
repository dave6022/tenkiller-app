export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Lake Tenkiller, Cherokee and Sequoyah counties, Oklahoma.
// A Corps of Engineers reservoir on the Illinois River, ~130 miles of shoreline.
export const LAKE = {
  center: [-95.005, 35.726],   // [lng, lat] — Mapbox order
  zoom: 11.2,
  pitch: 62,
  bearing: -18,
  // Generous bounds so panning stays on the lake and its drainage.
  bounds: [[-95.28, 35.44], [-94.72, 35.94]],
  minZoom: 8,
  maxZoom: 18,
};

// Normal pool elevation, USACE Tulsa District. Used to describe depth readings
// relative to a known surface rather than implying a live lake level.
export const NORMAL_POOL_FT = 632;

export const BASEMAPS = [
  {
    id: 'satellite',
    name: 'Satellite',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    note: 'Aerial imagery with roads and labels',
  },
  {
    id: 'outdoors',
    name: 'Topo',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    note: 'Contours, trails and terrain shading',
  },
  {
    id: 'dark',
    name: 'Dark',
    style: 'mapbox://styles/mapbox/dark-v11',
    note: 'Low-light basemap for data overlays',
  },
];
