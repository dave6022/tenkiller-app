// Parcel lookup against Oklahoma OGI's statewide parcel layer, compiled from
// each County Assessor's tax roll.
//
// Shared by the Worker, the Netlify function and the Vite dev middleware so
// there is one query builder, not three that drift.
//
// This exists server-side only because the GeoServer sends no
// Access-Control-Allow-Origin header, so the browser cannot read it directly.

const BASE = 'https://okmaps.org/geoserver/wms';
const LAYER = 'ogi_wms:Statewide_Parcels';

export async function fetchParcel(lng, lat) {
  // A small box centred on the click; we ask for the pixel at its centre.
  const d = 0.0008;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  const url = `${BASE}?service=WMS&version=1.1.1&request=GetFeatureInfo`
    + `&layers=${encodeURIComponent(LAYER)}&query_layers=${encodeURIComponent(LAYER)}`
    + `&srs=EPSG:4326&bbox=${bbox}&width=101&height=101&x=50&y=50`
    + '&info_format=application/json&feature_count=1';

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);

  const data = await res.json();
  const feature = (data.features || [])[0];
  if (!feature) return null;

  return { ...feature.properties, geometry: feature.geometry };
}
