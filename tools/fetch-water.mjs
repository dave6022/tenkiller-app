// Extracts water bodies around Lake Tenkiller from a Geofabrik OSM extract.
//
//   node tools/fetch-water.mjs <oklahoma-latest.osm.pbf>
//
// Used by tools/fetch-publiclands.mjs to cut the lake out of public hunting
// land, so a hunting zone covers only ground you can actually stand on.
//
// Source: OpenStreetMap, ODbL.

import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import parseOSM from 'osm-pbf-parser';

const PBF = process.argv[2];
if (!PBF) { console.error('usage: node tools/fetch-water.mjs <file.osm.pbf>'); process.exit(1); }

const BBOX = { w: -95.30, s: 35.40, e: -94.70, n: 35.98 };
const inBox = (lon, lat) => lon >= BBOX.w && lon <= BBOX.e && lat >= BBOX.s && lat <= BBOX.n;

const isWater = (t = {}) =>
  t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir';

async function scan(onItem) {
  await pipeline(
    createReadStream(PBF),
    parseOSM(),
    new Transform({ objectMode: true, transform(items, _e, cb) { for (const it of items) onItem(it); cb(); } }),
  );
}

console.log('pass 1: water ways and multipolygon members…');
const ways = new Map();       // id -> refs
const wanted = new Set();     // way ids we need geometry for
const rels = [];
await scan((it) => {
  if (it.type === 'way') {
    ways.set(it.id, it.refs);
    if (isWater(it.tags)) wanted.add(it.id);
  } else if (it.type === 'relation' && isWater(it.tags)) {
    const outers = (it.members || []).filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === ''));
    if (outers.length) { rels.push(outers.map((m) => m.ref)); outers.forEach((m) => wanted.add(m.ref)); }
  }
});
console.log(`  ${wanted.size} water ways, ${rels.length} water relations`);

const needed = new Set();
for (const id of wanted) for (const r of ways.get(id) || []) needed.add(r);

console.log('pass 2: node coordinates…');
const coords = new Map();
await scan((it) => {
  if (it.type === 'node' && needed.has(it.id)) coords.set(it.id, [it.lon, it.lat]);
});
console.log(`  resolved ${coords.size.toLocaleString()} nodes`);

const round = (n) => Math.round(n * 1e6) / 1e6;
const lineOf = (id) => {
  const out = [];
  for (const r of ways.get(id) || []) {
    const c = coords.get(r);
    if (c) out.push([round(c[0]), round(c[1])]);
  }
  return out;
};
const closed = (r) => r.length > 3 && r[0][0] === r[r.length-1][0] && r[0][1] === r[r.length-1][1];

const features = [];
const push = (ring) => {
  if (ring.length < 4) return;
  if (!ring.some(([x, y]) => inBox(x, y))) return;
  const r = closed(ring) ? ring : [...ring, ring[0]];
  features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } });
};

for (const id of wanted) { const l = lineOf(id); if (closed(l)) push(l); }

// Relation outers arrive as separate ways; stitch them end to end.
for (const memberIds of rels) {
  const segs = memberIds.map(lineOf).filter((l) => l.length > 1);
  while (segs.length) {
    let ring = segs.shift();
    let joined = true;
    while (joined && !closed(ring)) {
      joined = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const [a, b] = [ring[ring.length-1], ring[0]];
        if (s[0][0] === a[0] && s[0][1] === a[1]) { ring = ring.concat(s.slice(1)); segs.splice(i,1); joined = true; break; }
        if (s[s.length-1][0] === a[0] && s[s.length-1][1] === a[1]) { ring = ring.concat(s.slice().reverse().slice(1)); segs.splice(i,1); joined = true; break; }
        if (s[s.length-1][0] === b[0] && s[s.length-1][1] === b[1]) { ring = s.slice(0,-1).concat(ring); segs.splice(i,1); joined = true; break; }
        if (s[0][0] === b[0] && s[0][1] === b[1]) { ring = s.slice().reverse().slice(0,-1).concat(ring); segs.splice(i,1); joined = true; break; }
      }
    }
    push(ring);
  }
}

mkdirSync('public/data', { recursive: true });
const fc = { type: 'FeatureCollection', attribution: '© OpenStreetMap contributors (ODbL)', features };
writeFileSync('data-water.geojson', JSON.stringify(fc));
console.log(`\nwater polygons in area: ${features.length}`);
