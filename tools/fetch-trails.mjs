// Regenerates public/data/trails.geojson from a Geofabrik OSM extract.
//
//   1. Download https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf
//   2. node tools/fetch-trails.mjs <path-to.pbf>
//
// Why not Overpass: the public API times out on path/footway queries over an
// area this size, and hammering a volunteer-run service to work around that
// would be rude. A state extract is the supported way to do bulk extraction.
//
// Source: OpenStreetMap, ODbL. Attribution is required and is set on the
// GeoJSON source in src/map/layers.js.
//
// Two passes, because a PBF stores ways as lists of node IDs with no
// coordinates. Holding every Oklahoma node in memory would be gigabytes, so:
//   pass 1 — find matching ways, remember which node IDs they need
//   pass 2 — collect coordinates for just those nodes
// The set is small (trails only), so peak memory stays modest.

import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import parseOSM from 'osm-pbf-parser';

const PBF = process.argv[2];
if (!PBF) {
  console.error('usage: node tools/fetch-trails.mjs <oklahoma-latest.osm.pbf>');
  process.exit(1);
}

// Lake Tenkiller and its drainage.
const BBOX = { w: -95.28, s: 35.44, e: -94.72, n: 35.94 };
const inBox = (lon, lat) => lon >= BBOX.w && lon <= BBOX.e && lat >= BBOX.s && lat <= BBOX.n;

const TRAIL = new Set(['path', 'footway', 'bridleway', 'cycleway', 'steps', 'track']);

// A track is a farm road unless something marks it as recreational.
//
// Do NOT use `name` as the signal: rural Oklahoma county section roads are
// tagged highway=track AND named ("East 928 Road", "South 545 Road"), so a
// name test keeps precisely the things this is meant to exclude. Only an
// explicit recreational tag counts.
function keep(tags = {}) {
  const hw = tags.highway;
  if (!TRAIL.has(hw)) return false;

  if (hw === 'track') {
    return Boolean(tags.route === 'hiking' || tags.sac_scale || tags.trail_visibility
      || tags.mtb === 'yes' || tags.horse === 'designated');
  }

  // Pavements and crossings beside roads are not trails.
  if (hw === 'footway' && (tags.footway === 'sidewalk' || tags.footway === 'crossing')) return false;

  return true;
}

async function scan(onItem) {
  await pipeline(
    createReadStream(PBF),
    parseOSM(),
    new Transform({
      objectMode: true,
      transform(items, _enc, cb) { for (const it of items) onItem(it); cb(); },
    }),
  );
}

// ── pass 1 ───────────────────────────────────────────────────────────────────
console.log('pass 1: finding trail ways…');
const ways = [];
const needed = new Set();
let seenWays = 0;

await scan((it) => {
  if (it.type !== 'way') return;
  seenWays += 1;
  if (!keep(it.tags)) return;
  ways.push({ refs: it.refs, tags: it.tags });
  for (const r of it.refs) needed.add(r);
});

console.log(`  ${ways.length} candidate ways out of ${seenWays.toLocaleString()} (need ${needed.size.toLocaleString()} nodes)`);

// ── pass 2 ───────────────────────────────────────────────────────────────────
console.log('pass 2: collecting node coordinates…');
const coords = new Map();
await scan((it) => {
  if (it.type !== 'node') return;
  if (!needed.has(it.id)) return;
  coords.set(it.id, [it.lon, it.lat]);
});
console.log(`  resolved ${coords.size.toLocaleString()} nodes`);

// ── assemble ─────────────────────────────────────────────────────────────────
const round = (n) => Math.round(n * 1e6) / 1e6;
const features = [];

for (const w of ways) {
  const line = [];
  for (const r of w.refs) {
    const c = coords.get(r);
    if (c) line.push([round(c[0]), round(c[1])]);
  }
  if (line.length < 2) continue;
  // Keep anything that touches the area of interest.
  if (!line.some(([lon, lat]) => inBox(lon, lat))) continue;

  const t = w.tags;
  features.push({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: line },
    properties: {
      name: t.name || null,
      kind: t.highway,
      surface: t.surface || null,
      difficulty: t.sac_scale || null,
      access: t.access || null,
      bicycle: t.bicycle || null,
      horse: t.horse || null,
    },
  });
}

const fc = {
  type: 'FeatureCollection',
  attribution: '© OpenStreetMap contributors (ODbL)',
  generated: new Date().toISOString().slice(0, 10),
  features,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/trails.geojson', JSON.stringify(fc));

const byKind = {};
for (const f of features) byKind[f.properties.kind] = (byKind[f.properties.kind] || 0) + 1;
console.log('\ntrails in area:', features.length);
console.log('by kind       :', JSON.stringify(byKind));
console.log('named         :', features.filter((f) => f.properties.name).length);
