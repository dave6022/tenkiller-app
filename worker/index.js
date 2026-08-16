// Cloudflare Worker entry point.
//
// Cloudflare has retired Pages for new projects, so the app deploys as a Worker
// with static assets. This script does two things:
//
//   1. Answers /api/parcel and /api/lake-level, which exist because both
//      upstream sources refuse cross-origin browser reads.
//   2. Hands everything else to the static asset binding, which serves the
//      built site out of dist/.
//
// The handlers are thin — the real work lives in shared/, which the Netlify
// functions and the Vite dev server also use, so no logic is duplicated.

import { fetchLakeLevel } from '../shared/usace.mjs';
import { fetchParcel } from '../shared/parcel.mjs';

const json = (body, status = 200, maxAge = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    ...(maxAge ? { 'cache-control': `public, max-age=${maxAge}` } : {}),
  },
});

async function handleParcel(url) {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'lat and lng are required' }, 400);
  }
  try {
    // Parcel rolls update roughly monthly; an hour of caching spares the
    // state's server without anyone seeing stale ownership.
    return json({ parcel: await fetchParcel(lng, lat) }, 200, 3600);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function handleLakeLevel() {
  try {
    // Gage readings are hourly; no point hammering a government server.
    return json({ level: await fetchLakeLevel() }, 200, 900);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/parcel') return handleParcel(url);
    if (url.pathname === '/api/lake-level') return handleLakeLevel();

    return env.ASSETS.fetch(request);
  },
};
