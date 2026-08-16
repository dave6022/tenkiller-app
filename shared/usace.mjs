// Live Tenkiller pool elevation from the Corps of Engineers, Tulsa District.
//
// Shared by the Netlify function and the Vite dev middleware so there is one
// parser, not two that drift.
//
// The source is a tabular gage page, hourly. Columns, in order:
//   MM/DD  HH:MM  <precip>  <tailwater>  <ELEVATION ft>  <STORAGE ac-ft>  ...
// The last row with a valid elevation is the most recent reading.

export const GAGE_URL = 'https://www.swt-wc.usace.army.mil/webdata/gagedata/TENO2.current.html';

const ROW = /^(\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(\S+)\s+(\S+)\s+(\d{3}\.\d{2})\s+(\d+)/;

export function parseGage(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '\n');

  let latest = null;
  for (const raw of text.split('\n')) {
    const m = ROW.exec(raw.trim());
    if (!m) continue;
    latest = {
      date: m[1],
      time: m[2],
      elevationFt: Number(m[5]),
      storageAcreFt: Number(m[6]),
    };
  }
  return latest;
}

export async function fetchLakeLevel() {
  const res = await fetch(GAGE_URL, {
    headers: { 'user-agent': 'tenkiller-map/1.0 (+lake level readout)' },
  });
  if (!res.ok) throw new Error(`gage ${res.status}`);
  const reading = parseGage(await res.text());
  if (!reading) throw new Error('no reading found in gage page');
  return { ...reading, source: 'USACE Tulsa District', gageUrl: GAGE_URL };
}
