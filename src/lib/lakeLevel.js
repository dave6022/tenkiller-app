// Current pool elevation, measured by the Corps of Engineers.
//
// This is the real water-surface number. It is NOT depth — see the note on the
// water-depth layer in map/layers.js for why Tenkiller has no public
// bathymetry. What it does give you is a true datum: how far a point sits
// above or below the water as it stands today, rather than against a nominal
// 632 ft that the lake is rarely exactly at.

export async function fetchLakeLevel({ signal } = {}) {
  const res = await fetch('/api/lake-level', { signal });
  if (!res.ok) throw new Error(`lake level failed (${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.level;
}
