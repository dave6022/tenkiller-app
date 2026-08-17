// Regenerates public/data/recreation.geojson from RIDB (Recreation.gov).
//
//   node tools/fetch-recreation.mjs
//
// Needs RIDB_API_KEY in .env. The key stays server-side: this runs at tooling
// time and commits a static GeoJSON, so the key never reaches the browser.
// Campsite inventory changes rarely — regenerate when you want it refreshed.
//
// Source: Recreation Information Database, US federal government. Public
// domain; no attribution obligation, credited anyway.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

// Minimal .env reader so this tool has no dependencies.
function envKey() {
  if (process.env.RIDB_API_KEY) return process.env.RIDB_API_KEY;
  try {
    const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('RIDB_API_KEY='));
    if (line) return line.slice('RIDB_API_KEY='.length).trim();
  } catch { /* no .env */ }
  throw new Error('RIDB_API_KEY not set (add it to .env)');
}

const KEY = envKey();
const API = 'https://ridb.recreation.gov/api/v1';
const CENTER = { lat: 35.726, lng: -95.005, radiusMiles: 30 };

const get = async (path) => {
  const res = await fetch(`${API}${path}`, {
    headers: { apikey: KEY, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RIDB ${res.status} for ${path}`);
  return res.json();
};

// Campsite ATTRIBUTES arrive as a name/value list; pull out the useful ones.
const attr = (site, name) => {
  const found = (site.ATTRIBUTES || []).find((a) => a.AttributeName === name);
  return found ? found.AttributeValue : null;
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

console.log('fetching facilities…');
const facilities = (await get(
  `/facilities?latitude=${CENTER.lat}&longitude=${CENTER.lng}&radius=${CENTER.radiusMiles}&limit=200`,
)).RECDATA;

// Activity Passes are permits, not places on a map.
const places = facilities.filter((f) => f.FacilityTypeDescription !== 'Activity Pass');
console.log(`  ${places.length} places (${facilities.length - places.length} activity passes skipped)`);

const features = [];

for (const f of places) {
  const isCampground = f.FacilityTypeDescription === 'Campground';

  if (f.FacilityLatitude && f.FacilityLongitude) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.FacilityLongitude, f.FacilityLatitude] },
      properties: {
        kind: isCampground ? 'campground' : 'facility',
        name: f.FacilityName,
        facilityId: f.FacilityID,
        phone: f.FacilityPhone || null,
        reservable: f.Reservable === true,
        url: f.FacilityID ? `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}` : null,
      },
    });
  }

  if (!isCampground) continue;

  // Individual sites — the whole point of this layer.
  let sites = [];
  try {
    sites = (await get(`/facilities/${f.FacilityID}/campsites?limit=1000`)).RECDATA || [];
  } catch (err) {
    console.warn(`  ! ${f.FacilityName}: ${err.message}`);
    continue;
  }

  let placed = 0;
  for (const s of sites) {
    const lat = Number(s.CampsiteLatitude);
    const lng = Number(s.CampsiteLongitude);
    if (!lat || !lng) continue;   // a few sites have no survey position
    placed += 1;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        kind: 'campsite',
        name: s.CampsiteName,
        loop: s.Loop || null,
        siteType: s.CampsiteType || null,
        reservable: s.CampsiteReservable === true,
        campground: f.FacilityName,
        facilityId: f.FacilityID,
        electric: attr(s, 'Electricity Hookup'),
        water: attr(s, 'Water Hookup'),
        sewer: attr(s, 'Sewer Hookup'),
        maxPeople: num(attr(s, 'Max Num of People')),
        maxVehicleFt: num(attr(s, 'Max Vehicle Length')),
        driveway: attr(s, 'Driveway Entry'),
        surface: attr(s, 'Driveway Surface'),
        shade: attr(s, 'Shade'),
        pets: attr(s, 'Pets Allowed'),
        url: `https://www.recreation.gov/camping/campsites/${s.CampsiteID}`,
      },
    });
  }
  console.log(`  ${f.FacilityName}: ${placed}/${sites.length} sites mapped`);
}

const fc = {
  type: 'FeatureCollection',
  attribution: 'Recreation.gov / RIDB (public domain)',
  generated: new Date().toISOString().slice(0, 10),
  features,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/recreation.geojson', JSON.stringify(fc));

const byKind = {};
for (const f of features) byKind[f.properties.kind] = (byKind[f.properties.kind] || 0) + 1;
console.log('\ntotal features:', features.length);
console.log('by kind       :', JSON.stringify(byKind));
