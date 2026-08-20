// Regenerates public/data/publiclands.geojson from PAD-US.
//
//   node tools/fetch-publiclands.mjs
//
// Source: USGS Protected Areas Database of the United States (PAD-US) 4.1,
// a US Government work in the PUBLIC DOMAIN — no attribution obligation,
// though the app credits it anyway because saying where data came from is the
// point of the Data screen.
//
// Two deliberate filters:
//   * Tribal Statistical Areas and State Land Office holdings are excluded.
//     They are administrative units measured in millions of acres and would
//     wash the entire map in one colour, which is the opposite of useful.
//   * Geometry is generalised server-side. Full precision is 2.7 MB; at ~11 m
//     tolerance it is a fraction of that and indistinguishable at these zooms.

import { writeFileSync, mkdirSync } from 'node:fs';
import { difference, rewind, featureCollection, booleanIntersects, area, convertArea } from '@turf/turf';

const SERVICE = 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services'
  + '/Manager_Name_PADUS/FeatureServer/0/query';

// Lake Tenkiller and its drainage.
const BBOX = { xmin: -95.28, ymin: 35.44, xmax: -94.72, ymax: 35.94, spatialReference: { wkid: 4326 } };

// PAD-US designation codes -> what a human would call it.
const DESIGNATION = {
  REC: 'Corps recreation area',
  SP: 'State park',
  NWR: 'National wildlife refuge',
  SCA: 'Wildlife management area',
  FORE: 'Forest / reserve programme',
  CONE: 'Conservation easement',
  LP: 'City park',
  LREC: 'City recreation area',
  SHCA: 'Historic or cultural area',
  HCA: 'Historic or cultural area',
  MIL: 'Military land',
};

// Broad buckets used for map styling.
const KIND = {
  REC: 'corps',
  SP: 'statepark',
  NWR: 'refuge',
  SCA: 'wma',
  FORE: 'reserve',
  CONE: 'reserve',
  LP: 'citypark',
  LREC: 'citypark',
  SHCA: 'historic',
  HCA: 'historic',
  MIL: 'military',
};

const ACCESS = { OA: 'Open', RA: 'Restricted', XA: 'Closed', UK: 'Unknown' };

const params = new URLSearchParams({
  geometry: JSON.stringify(BBOX),
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  outSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  where: "Des_Tp NOT IN ('TRIBL','SRMA')",
  outFields: 'Unit_Nm,Loc_Nm,Mang_Name,Des_Tp,Pub_Access,GIS_Acres',
  returnGeometry: 'true',
  // ~11 m in degrees. Boundary display only; not for survey use.
  maxAllowableOffset: '0.0001',
  geometryPrecision: '6',
  f: 'geojson',
});

const res = await fetch(`${SERVICE}?${params}`);
if (!res.ok) throw new Error(`PAD-US ${res.status}`);
const raw = await res.json();

const features = raw.features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: p.Unit_Nm || p.Loc_Nm || null,
        kind: KIND[p.Des_Tp] || 'other',
        designation: DESIGNATION[p.Des_Tp] || p.Des_Tp,
        manager: p.Mang_Name || null,
        access: ACCESS[p.Pub_Access] || p.Pub_Access || null,
        acres: p.GIS_Acres != null ? Math.round(p.GIS_Acres) : null,
      },
    };
  })
  // Keep the map legible: anything this large is administrative, not a place
  // you visit.
  .filter((f) => (f.properties.acres ?? 0) < 100000);

// ── Cut the water out ───────────────────────────────────────────────────────
//
// PAD-US fee boundaries include the lakebed: the government owns the ground
// under a reservoir, so "Tenkiller Ferry Lake" as published covers open water.
// For a hunting layer that is wrong — you cannot stand on it. Subtract the
// waterbodies so a hunting zone is land only.
//
// Water source: USGS National Hydrography Dataset, public domain.
const NHD = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12/query';

console.log('fetching waterbodies…');
const waterParams = new URLSearchParams({
  geometry: JSON.stringify(BBOX),
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  outSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  // Anything smaller than ~60 acres is a farm pond; ignoring them keeps the
  // geometry simple and makes no practical difference to a hunting boundary.
  where: 'AREASQKM > 0.25',
  outFields: 'GNIS_NAME,AREASQKM',
  returnGeometry: 'true',
  geometryPrecision: '6',
  f: 'geojson',
});
const waterRes = await fetch(`${NHD}?${waterParams}`);
if (!waterRes.ok) throw new Error(`NHD ${waterRes.status}`);
const water = (await waterRes.json()).features.filter((w) => w.geometry);
console.log(`  ${water.length} waterbodies over 60 acres`);

let clipped = 0;
const landOnly = [];
for (const f of features) {
  let g = f;
  for (const w of water) {
    try {
      if (!booleanIntersects(g, w)) continue;
      const cut = difference(featureCollection([g, w]));
      // A polygon entirely under water disappears, which is the correct result.
      if (!cut) { g = null; break; }
      g = { ...cut, properties: f.properties };
      clipped += 1;
    } catch { /* leave this piece alone rather than mangle it */ }
  }
  if (g) landOnly.push(g);
}
console.log(`  ${clipped} clips applied, ${features.length - landOnly.length} polygons removed as all-water`);

// Clipping the lake out of a fee boundary that hugs the waterline leaves a
// confetti of shoreline slivers — Tenkiller Ferry Lake alone came out as 649
// pieces, 621 of them under five acres. They are not somewhere you would hunt
// and they cost more in file size than the whole rest of the layer, so drop
// anything too small to stand on.
const MIN_PIECE_ACRES = 5;

function dropSlivers(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const kept = f.geometry.coordinates.filter((coords) => {
    const piece = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    try { return convertArea(area(piece), 'meters', 'acres') >= MIN_PIECE_ACRES; } catch { return true; }
  });
  if (!kept.length) return null;
  return {
    ...f,
    geometry: kept.length === 1
      ? { type: 'Polygon', coordinates: kept[0] }
      : { type: 'MultiPolygon', coordinates: kept },
  };
}

const trimmed = landOnly.map(dropSlivers).filter(Boolean);
console.log(`  ${landOnly.length - trimmed.length} polygons dropped entirely as slivers`);

// Acreage now describes the land actually drawn, not the fee boundary that
// included the lakebed. The published figure is kept alongside it.
for (const f of trimmed) {
  try {
    f.properties.feeAcres = f.properties.acres;
    f.properties.acres = Math.round(convertArea(area(f), 'meters', 'acres'));
  } catch { /* keep the published figure */ }
}

// ArcGIS emits rings with the opposite winding to RFC 7946. Turf's containment
// tests do not care, but Mapbox decides what is a hole from winding order — so
// without this, holes render as filled.
const wound = trimmed.map((f) => { try { return rewind(f); } catch { return f; } });

const fc = {
  type: 'FeatureCollection',
  attribution: 'USGS PAD-US 4.1 + NHD (public domain)',
  generated: new Date().toISOString().slice(0, 10),
  features: wound,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/publiclands.geojson', JSON.stringify(fc));

const byKind = {};
for (const f of wound) byKind[f.properties.kind] = (byKind[f.properties.kind] || 0) + 1;
console.log('features:', wound.length);
console.log('by kind :', JSON.stringify(byKind));
console.log('largest :', wound
  .slice()
  .sort((a, b) => (b.properties.acres || 0) - (a.properties.acres || 0))
  .slice(0, 6)
  .map((f) => `${f.properties.name} (${f.properties.acres?.toLocaleString()} ac)`)
  .join(' | '));
