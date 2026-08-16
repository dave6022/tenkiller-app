// Proxy for Oklahoma OGI's parcel service.
//
// The GeoServer at okmaps.org answers GetFeatureInfo happily but sends no
// Access-Control-Allow-Origin header, so a browser fetch is blocked. This
// function makes the request server-side and hands back JSON the app can read.
// Parcel *tiles* do not come through here — images are not CORS-restricted, so
// the map requests those from GeoServer directly.

const BASE = 'https://okmaps.org/geoserver/wms';
const LAYER = 'ogi_wms:Statewide_Parcels';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    // Parcel rolls update roughly monthly; an hour of edge caching spares the
    // state's server without anyone seeing stale ownership.
    'cache-control': 'public, max-age=3600',
  },
});

export default async (req) => {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'lat and lng are required' }, 400);
  }

  // A small box centred on the click; we ask for the pixel at its centre.
  const d = 0.0008;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  const url = `${BASE}?service=WMS&version=1.1.1&request=GetFeatureInfo`
    + `&layers=${encodeURIComponent(LAYER)}&query_layers=${encodeURIComponent(LAYER)}`
    + `&srs=EPSG:4326&bbox=${bbox}&width=101&height=101&x=50&y=50`
    + '&info_format=application/json&feature_count=1';

  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);

    const data = await res.json();
    const feature = (data.features || [])[0];
    if (!feature) return json({ parcel: null });

    return json({ parcel: { ...feature.properties, geometry: feature.geometry } });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
};

export const config = { path: '/api/parcel' };
