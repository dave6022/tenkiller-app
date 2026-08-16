// Cloudflare Pages Function — serves /api/lake-level
//
// Current Tenkiller pool elevation from the Corps of Engineers gage. Their page
// sends no CORS header, so this fetches it server-side. Parser is shared with
// the Netlify version so the two cannot drift.

import { fetchLakeLevel } from '../../shared/usace.mjs';

export async function onRequestGet() {
  try {
    const level = await fetchLakeLevel();
    return new Response(JSON.stringify({ level }), {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        // Readings are hourly; no point hammering a government server.
        'cache-control': 'public, max-age=900',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }
}
