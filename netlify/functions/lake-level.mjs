import { fetchLakeLevel } from '../../shared/usace.mjs';

// The Corps' gage page sends no CORS header, so the browser cannot read it
// directly. Same pattern as the parcel proxy.
export default async () => {
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
};

export const config = { path: '/api/lake-level' };
