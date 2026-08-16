// Parcel lookup.
//
// Source: Oklahoma Office of Geographic Information's statewide parcel layer,
// compiled from each County Assessor's tax roll. Owner of record is public
// record data that the state already publishes; this shows the county's own
// value for the parcel you tapped and links back to the official record.
//
// Deliberately not built: any way to search *by owner name*. Tapping a place
// to see who owns it is a map; typing a person's name to find where they live
// is a people-finder, and that is a different product with different duties.

export async function lookupParcel(lng, lat, { signal } = {}) {
  const res = await fetch(`/api/parcel?lat=${lat}&lng=${lng}`, { signal });
  if (!res.ok) throw new Error(`parcel lookup failed (${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.parcel || null;
}

/** Assessors write owner names in raw upper case; soften without mangling. */
export function ownerName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // "U S A" and similar all-initial entries are meaningful as written.
  if (/^[A-Z](\s[A-Z])+$/.test(trimmed)) return trimmed;
  return trimmed;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The rows worth showing, in the order they make sense to read. */
export function parcelRows(p) {
  if (!p) return [];
  const buildings = ['resibldgcnt', 'combldgcnt', 'mohobldgcnt', 'miscbldgcnt']
    .reduce((sum, k) => sum + (num(p[k]) || 0), 0);
  const acres = num(p.acres);

  return [
    ['Owner of record', ownerName(p.owner) || 'not published'],
    ['County', p.county || null],
    ['Parcel ID', p.parcelid || null],
    ['Account', p.accountnumber != null ? String(p.accountnumber) : null],
    ['Acres', acres != null ? acres.toLocaleString('en-US') : null],
    ['Buildings', buildings > 0 ? String(buildings) : 'none on record'],
    ['School district', p.schooldistrict || null],
    ['Twp-Rng-Sec', p.trs || null],
  ].filter(([, v]) => v != null && v !== '');
}

/** When the county last refreshed this record — shown so nothing looks live. */
export function parcelUpdated(p) {
  if (!p || !p.dataupdate) return null;
  const d = new Date(p.dataupdate);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
