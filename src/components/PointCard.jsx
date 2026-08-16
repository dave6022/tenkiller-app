import { useEffect, useState } from 'react';
import { NORMAL_POOL_FT } from '../config.js';
import { copy, metresToFeet, toDD, toDDM, toDMS } from '../lib/coords.js';
import { parcelRows, parcelUpdated } from '../lib/parcel.js';

const row = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0' };
const key = { font: '400 11.5px/1.3 Geist,system-ui', color: '#7C8272' };
const val = { font: "500 12.5px/1.3 'JetBrains Mono',monospace", color: '#14170F', textAlign: 'right' };

export default function PointCard({ point, parcel, parcelsOn, lake, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => { setCopied(false); }, [point]);

  if (!point) return null;

  const feet = metresToFeet(point.metres);
  const dd = toDD(point.lat, point.lng);

  // Measure against today's pool when the Corps reading is available, and say
  // which datum is in use — the lake is rarely exactly at nominal 632 ft.
  const datum = lake ? lake.elevationFt : NORMAL_POOL_FT;
  const datumLabel = lake ? "today's pool" : 'normal pool';

  // Mapbox's DEM is a surface model: over water it samples the water surface at
  // survey time, not the lake bed. Saying so is the difference between an
  // elevation reading and a fake depth reading.
  const nearPool = feet != null && Math.abs(feet - datum) <= 6;
  const relative = feet == null ? null : feet - datum;

  const onCopy = async () => {
    const ok = await copy(dd);
    setCopied(ok ? 'yes' : 'no');
  };

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 'calc(var(--tk-footer) + 66px)',
      zIndex: 26, background: '#FBFAF8', borderRadius: 16,
      border: '1px solid rgba(20,23,15,.1)', boxShadow: '0 6px 28px rgba(20,23,15,.3)',
      padding: '14px 16px 12px', maxWidth: 420, maxHeight: '62vh', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ font: "600 10px/1 'JetBrains Mono',monospace", letterSpacing: '1.1px', color: '#7C8272', textTransform: 'uppercase' }}>
            Selected point
          </div>
          <div style={{ marginTop: 7, font: "600 24px/1 'JetBrains Mono',monospace", letterSpacing: '-.8px' }}>
            {point.pending ? '…' : feet != null ? `${feet.toLocaleString('en-US')} ft` : 'no data'}
          </div>
          {feet != null && !point.pending && (
            <div style={{ marginTop: 5, font: '400 11.5px/1.35 Geist,system-ui', color: nearPool ? '#B45309' : '#7C8272' }}>
              {nearPool
                ? `At ${datumLabel} — this is the water surface, not the bottom`
                : `${Math.abs(relative).toLocaleString('en-US')} ft ${relative > 0 ? 'above' : 'below'} ${datumLabel}`}
            </div>
          )}
        </div>

        <button type="button" onClick={onClose} aria-label="Clear point" style={{
          width: 32, height: 32, flex: 'none', borderRadius: 10, border: '1px solid rgba(20,23,15,.12)',
          background: '#fff', cursor: 'pointer', color: '#7C8272', font: '400 16px/1 Geist,system-ui',
        }}>×</button>
      </div>

      <div style={{ marginTop: 10, borderTop: '1px solid rgba(20,23,15,.08)' }}>
        <div style={{ ...row, borderBottom: '1px solid rgba(20,23,15,.06)' }}>
          <span style={key}>Decimal</span><span style={val}>{dd}</span>
        </div>
        <div style={{ ...row, borderBottom: '1px solid rgba(20,23,15,.06)' }}>
          <span style={key}>Deg / min</span>
          <span style={val}>{toDDM(point.lat, 'lat')}  {toDDM(point.lng, 'lng')}</span>
        </div>
        <div style={{ ...row, borderBottom: '1px solid rgba(20,23,15,.06)' }}>
          <span style={key}>DMS</span>
          <span style={val}>{toDMS(point.lat, 'lat')}  {toDMS(point.lng, 'lng')}</span>
        </div>
        {feet != null && (
          <div style={row}>
            <span style={key}>Elevation</span>
            <span style={val}>{feet.toLocaleString('en-US')} ft · {Math.round(point.metres)} m</span>
          </div>
        )}
      </div>

      {point.pending && (
        <div style={{ marginTop: 4, font: '400 11px/1.4 Geist,system-ui', color: '#7C8272' }}>
          Waiting for the elevation tile to load…
        </div>
      )}

      {!point.pending && feet == null && (
        <div style={{ marginTop: 4, font: '400 11px/1.4 Geist,system-ui', color: '#7C6A52' }}>
          No elevation here. Turn on 3D terrain — the reading comes from the terrain mesh.
        </div>
      )}

      {nearPool && !point.pending && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#FDF7F0',
          border: '1px solid rgba(180,83,9,.22)', font: '400 11px/1.45 Geist,system-ui', color: '#7C6A52',
        }}>
          Depth is not available for Tenkiller. The elevation model reads the water surface, and the Corps
          has not published its bathymetric survey as data — so this map will not guess at a bottom contour.
        </div>
      )}

      {parcelsOn && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(20,23,15,.12)' }}>
          <div style={{ font: "600 10px/1 'JetBrains Mono',monospace", letterSpacing: '1.1px', color: '#7C8272', textTransform: 'uppercase' }}>
            Parcel
          </div>

          {parcel.status === 'loading' && (
            <div style={{ marginTop: 8, font: '400 11.5px/1.4 Geist,system-ui', color: '#7C8272' }}>
              Looking up the assessor record…
            </div>
          )}

          {parcel.status === 'empty' && (
            <div style={{ marginTop: 8, font: '400 11.5px/1.4 Geist,system-ui', color: '#7C8272' }}>
              No parcel here. Open water and Corps shoreline are often outside the tax roll.
            </div>
          )}

          {parcel.status === 'error' && (
            <div style={{ marginTop: 8, font: '400 11.5px/1.4 Geist,system-ui', color: '#7C6A52' }}>
              Lookup failed — {parcel.error}
            </div>
          )}

          {parcel.status === 'ok' && (
            <>
              <div style={{ marginTop: 6 }}>
                {parcelRows(parcel.data).map(([k, v], i, arr) => (
                  <div key={k} style={{ ...row, borderBottom: i < arr.length - 1 ? '1px solid rgba(20,23,15,.06)' : 'none' }}>
                    <span style={key}>{k}</span>
                    <span style={{ ...val, maxWidth: '62%', wordBreak: 'break-word' }}>{v}</span>
                  </div>
                ))}
              </div>

              {parcel.data.iproplogiclink && (
                <a
                  href={parcel.data.iproplogiclink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block', marginTop: 8, height: 38, borderRadius: 10,
                    border: '1px solid rgba(20,23,15,.12)', background: '#fff',
                    font: '500 12.5px/38px Geist,system-ui', color: '#14170F',
                    textAlign: 'center', textDecoration: 'none',
                  }}
                >Open county record ↗</a>
              )}

              {parcelUpdated(parcel.data) && (
                <div style={{ marginTop: 8, font: '400 10.5px/1.4 Geist,system-ui', color: '#A5A99B' }}>
                  County roll updated {parcelUpdated(parcel.data)}. Ownership changes reach the assessor
                  before they reach this map.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button type="button" onClick={onCopy} style={{
        marginTop: 10, width: '100%', height: 38, borderRadius: 10,
        border: '1px solid rgba(20,23,15,.12)', background: '#fff',
        font: '500 12.5px/1 Geist,system-ui', color: '#14170F', cursor: 'pointer',
      }}>
        {copied === 'yes' ? 'Copied ✓' : copied === 'no' ? 'Copy blocked — select it above' : 'Copy coordinates'}
      </button>
    </div>
  );
}
