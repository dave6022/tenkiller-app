const M_TO_FT = 3.28084;

export const metresToFeet = (m) => (m == null ? null : Math.round(m * M_TO_FT));

/** Decimal degrees to degrees/minutes/seconds, the format on most paper maps. */
export function toDMS(value, axis) {
  const hemi = axis === 'lat'
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W');
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${deg}° ${String(min).padStart(2, '0')}' ${String(sec).padStart(4, '0')}" ${hemi}`;
}

/** Degrees and decimal minutes — what most marine and fishing GPS units show. */
export function toDDM(value, axis) {
  const hemi = axis === 'lat'
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W');
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = ((abs - deg) * 60).toFixed(3);
  return `${deg}° ${String(min).padStart(6, '0')}' ${hemi}`;
}

export const toDD = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/** Best-effort clipboard write; returns whether it worked. */
export async function copy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  return false;
}
