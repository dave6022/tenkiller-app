export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Lake Tenkiller, Cherokee and Sequoyah counties, Oklahoma.
// A Corps of Engineers reservoir on the Illinois River, ~130 miles of shoreline.
export const LAKE = {
  center: [-95.005, 35.726],   // [lng, lat] — Mapbox order
  zoom: 12.4,
  pitch: 62,
  bearing: -18,
  // This app is for Lake Tenkiller. Panning is capped at 50 miles from the
  // centre, which still reaches Tahlequah, Muskogee, Sallisaw, Fort Gibson
  // and the Cookson Hills, but stops the map wandering off across Oklahoma.
  bounds: [[-95.895, 35.001], [-94.115, 36.451]],
  // At zoom 9 a desktop viewport still fits inside those bounds. Lower than
  // that and the viewport is wider than the box, which Mapbox has to clamp.
  minZoom: 9,
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
