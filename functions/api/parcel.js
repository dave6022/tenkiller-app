// Cloudflare Pages Function — serves /api/parcel
//
// Same job as netlify/functions/parcel.mjs: Oklahoma OGI's GeoServer answers
// GetFeatureInfo but sends no Access-Control-Allow-Origin, so the browser
// cannot read it directly. This fetches server-side and returns JSON.
//
// Both hosts' versions are kept so you can move between them without a rewrite.

const BASE = 'https://okmaps.org/geoserver/wms';
const LAYER = 'ogi_wms:Statewide_Parcels';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
  },
});

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'lat and lng are required' }, 400);
  }

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
}
