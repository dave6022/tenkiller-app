import { useCallback, useEffect, useState } from 'react';

import MapView from './map/MapView.jsx';
import LayerPanel from './components/LayerPanel.jsx';
import PointCard from './components/PointCard.jsx';
import { LAYERS } from './map/layers.js';
import { lookupParcel } from './lib/parcel.js';
import { fetchLakeLevel } from './lib/lakeLevel.js';
import { NORMAL_POOL_FT } from './config.js';

const STORE_KEY = 'tenkiller.map.v1';

const DEFAULTS = {
  basemap: 'satellite',
  enabled: LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
  exaggeration: 1.4,
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    // Drop ids for layers that no longer exist, so an old save cannot break a
    // new build.
    const known = new Set(LAYERS.map((l) => l.id));
    return {
      ...s,
      enabled: Array.isArray(s.enabled) ? s.enabled.filter((id) => known.has(id)) : undefined,
    };
  } catch {
    return {};
  }
}

export default function App() {
  const [ui, setUi] = useState(() => ({ ...DEFAULTS, ...loadStored() }));
  const [panel, setPanel] = useState(false);
  const [point, setPoint] = useState(null);
  const [parcel, setParcel] = useState({ status: 'idle', data: null });
  const [lake, setLake] = useState(null);

  // Current pool elevation, fetched once per session.
  useEffect(() => {
    const ac = new AbortController();
    fetchLakeLevel({ signal: ac.signal })
      .then(setLake)
      .catch(() => { /* the plate falls back to normal pool */ });
    return () => ac.abort();
  }, []);

  const parcelsOn = ui.enabled.includes('parcels');

  // Look the parcel up whenever a new coordinate is tapped, but only while the
  // layer is on — otherwise every tap would hit the state's server for data
  // nobody asked to see.
  useEffect(() => {
    if (!point || !parcelsOn) { setParcel({ status: 'idle', data: null }); return undefined; }

    const ac = new AbortController();
    setParcel({ status: 'loading', data: null });

    lookupParcel(point.lng, point.lat, { signal: ac.signal })
      .then((data) => setParcel({ status: data ? 'ok' : 'empty', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setParcel({ status: 'error', data: null, error: err.message });
      });

    return () => ac.abort();
  }, [point, parcelsOn]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        basemap: ui.basemap, enabled: ui.enabled, exaggeration: ui.exaggeration,
      }));
    } catch { /* private mode; preferences are best-effort */ }
  }, [ui]);

  const toggle = useCallback((id) => setUi((s) => ({
    ...s,
    enabled: s.enabled.includes(id) ? s.enabled.filter((x) => x !== id) : s.enabled.concat(id),
  })), []);

  const insets = {
    '--tk-top': 'calc(max(env(safe-area-inset-top, 0px), 12px) + 10px)',
    '--tk-footer': 'calc(12px + max(env(safe-area-inset-bottom, 0px), 12px))',
  };

  const activeCount = ui.enabled.length;

  return (
    <div style={{
      ...insets,
      position: 'fixed', inset: 0, overflow: 'hidden', background: '#22301C',
      fontFamily: 'Geist, system-ui, sans-serif', color: '#14170F',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <MapView
        basemap={ui.basemap}
        enabled={ui.enabled}
        exaggeration={ui.exaggeration}
        point={point}
        parcelGeometry={parcel.data ? parcel.data.geometry : null}
        onReadout={setPoint}
      />

      {/* Title plate */}
      <div style={{
        position: 'absolute', top: 'var(--tk-top)', left: 12, zIndex: 20,
        padding: '8px 12px', borderRadius: 12, background: 'rgba(251,250,248,.92)',
        backdropFilter: 'blur(10px)', border: '1px solid rgba(20,23,15,.1)',
        boxShadow: '0 2px 10px rgba(20,23,15,.16)', pointerEvents: 'none',
      }}>
        <div style={{ font: '600 15px/1.1 Geist,system-ui', letterSpacing: '-0.4px' }}>Lake Tenkiller</div>
        <div style={{ marginTop: 3, font: "500 9.5px/1 'JetBrains Mono',monospace", color: '#4A4F42', letterSpacing: '.3px' }}>
          {lake
            ? `POOL ${lake.elevationFt.toFixed(2)} FT · ${(lake.elevationFt - NORMAL_POOL_FT >= 0 ? '+' : '')}${(lake.elevationFt - NORMAL_POOL_FT).toFixed(2)} VS NORMAL`
            : `NORMAL POOL ${NORMAL_POOL_FT} FT`}
        </div>
        {lake && (
          <div style={{ marginTop: 2, font: "400 8.5px/1 'JetBrains Mono',monospace", color: '#7C8272' }}>
            USACE {lake.date} {lake.time}
          </div>
        )}
      </div>

      {/* Shown until the first point is dropped, then it has served its purpose. */}
      {!point && (
        <div style={{
          position: 'absolute', top: 'var(--tk-top)', right: 12, zIndex: 20,
          padding: '8px 11px', borderRadius: 12, background: 'rgba(20,23,15,.82)',
          backdropFilter: 'blur(10px)', color: '#FBFAF8',
          boxShadow: '0 2px 10px rgba(20,23,15,.2)', pointerEvents: 'none',
          font: "500 10px/1.3 'JetBrains Mono',monospace", letterSpacing: '.3px',
        }}>
          TAP THE MAP
        </div>
      )}

      {/* Layers button */}
      <button
        type="button"
        onClick={() => setPanel(true)}
        style={{
          position: 'absolute', left: 12, bottom: 'calc(var(--tk-footer) + 8px)', zIndex: 25,
          display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 16px',
          borderRadius: 14, border: '1px solid rgba(20,23,15,.12)',
          background: 'rgba(251,250,248,.94)', backdropFilter: 'blur(10px)',
          boxShadow: '0 3px 14px rgba(20,23,15,.22)', cursor: 'pointer',
          font: '600 13.5px/1 Geist,system-ui', color: '#14170F',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3F6212" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 3.5 21 8l-9 4.5L3 8z" />
          <path d="M3 12.5 12 17l9-4.5" />
          <path d="M3 17 12 21.5 21 17" />
        </svg>
        Layers
        <span style={{
          minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10, background: '#3F6212',
          color: '#fff', font: "600 10px/19px 'JetBrains Mono',monospace", textAlign: 'center',
        }}>{activeCount}</span>
      </button>

      <PointCard
        point={point}
        parcel={parcel}
        parcelsOn={parcelsOn}
        lake={lake}
        onClose={() => setPoint(null)}
      />

      <LayerPanel
        open={panel}
        basemap={ui.basemap}
        enabled={ui.enabled}
        exaggeration={ui.exaggeration}
        onClose={() => setPanel(false)}
        onSetBasemap={(basemap) => setUi((s) => ({ ...s, basemap }))}
        onToggle={toggle}
        onSetExaggeration={(exaggeration) => setUi((s) => ({ ...s, exaggeration }))}
      />
    </div>
  );
}
