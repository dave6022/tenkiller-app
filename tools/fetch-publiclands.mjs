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

const fc = {
  type: 'FeatureCollection',
  attribution: 'USGS PAD-US 4.1 (public domain)',
  generated: new Date().toISOString().slice(0, 10),
  features,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/publiclands.geojson', JSON.stringify(fc));

const byKind = {};
for (const f of features) byKind[f.properties.kind] = (byKind[f.properties.kind] || 0) + 1;
console.log('features:', features.length);
console.log('by kind :', JSON.stringify(byKind));
console.log('largest :', features
  .slice()
  .sort((a, b) => (b.properties.acres || 0) - (a.properties.acres || 0))
  .slice(0, 6)
  .map((f) => `${f.properties.name} (${f.properties.acres?.toLocaleString()} ac)`)
  .join(' | '));
