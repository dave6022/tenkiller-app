import { BASEMAPS } from '../config.js';
import { LAYERS, LAYER_GROUPS } from '../map/layers.js';

const sheet = {
  position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
  background: '#FBFAF8', borderRadius: '18px 18px 0 0',
  boxShadow: '0 -6px 32px rgba(20,23,15,.28)',
  borderTop: '1px solid rgba(20,23,15,.08)',
  display: 'flex', flexDirection: 'column',
  maxHeight: '76%',
};

const label = {
  font: "600 10px/1 'JetBrains Mono',monospace", letterSpacing: '1.1px',
  color: '#7C8272', textTransform: 'uppercase',
};

export default function LayerPanel({
  open, basemap, enabled, exaggeration,
  onClose, onSetBasemap, onToggle, onSetExaggeration,
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close layers"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 30, border: 0,
          background: 'rgba(20,23,15,.32)', cursor: 'pointer',
        }}
      />

      <div style={{ ...sheet, paddingBottom: 'var(--tk-footer)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px', borderBottom: '1px solid rgba(20,23,15,.08)',
        }}>
          <span style={{ font: '600 16px/1 Geist,system-ui' }}>Layers</span>
          <button type="button" onClick={onClose} aria-label="Done" style={{
            border: 0, background: 'transparent', font: '500 13px/1 Geist,system-ui',
            color: '#3F6212', cursor: 'pointer', padding: 0,
          }}>Done</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 16px 18px' }}>
          <div style={label}>Basemap</div>
          <div style={{ marginTop: 9, display: 'flex', gap: 7 }}>
            {BASEMAPS.map((b) => {
              const on = b.id === basemap;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSetBasemap(b.id)}
                  title={b.note}
                  style={{
                    flex: 1, height: 40, borderRadius: 10,
                    border: `1px solid ${on ? '#3F6212' : 'rgba(20,23,15,.12)'}`,
                    background: on ? '#EEF3E2' : '#fff', color: on ? '#3F6212' : '#4A4F42',
                    font: '500 12.5px/1 Geist,system-ui', cursor: 'pointer',
                  }}
                >{b.name}</button>
              );
            })}
          </div>

          {LAYER_GROUPS.map((group) => (
            <div key={group} style={{ marginTop: 22 }}>
              <div style={label}>{group}</div>
              <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LAYERS.filter((l) => l.group === group).map((l) => {
                  const on = enabled.includes(l.id);
                  return (
                    <div key={l.id} style={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 12, padding: '12px 13px', borderRadius: 11, background: '#fff',
                      border: `1px solid ${on ? 'rgba(63,98,18,.35)' : 'rgba(20,23,15,.1)'}`,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', font: '500 13.5px/1.2 Geist,system-ui' }}>{l.name}</span>
                        <span style={{ display: 'block', marginTop: 4, font: '400 11.5px/1.4 Geist,system-ui', color: '#7C8272' }}>
                          {l.note}
                        </span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={l.name}
                        onClick={() => onToggle(l.id)}
                        style={{
                          width: 48, height: 29, flex: 'none', borderRadius: 15, border: 0,
                          background: on ? '#3F6212' : 'rgba(20,23,15,.16)', cursor: 'pointer',
                          padding: 3, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
                          transition: 'background .18s',
                        }}
                      >
                        <span style={{
                          width: 23, height: 23, borderRadius: 12, background: '#fff',
                          boxShadow: '0 1px 3px rgba(20,23,15,.28)', display: 'block',
                        }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {enabled.includes('terrain') && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={label}>Vertical exaggeration</span>
                <span style={{ font: "600 12px/1 'JetBrains Mono',monospace" }}>{exaggeration.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={exaggeration}
                onChange={(e) => onSetExaggeration(parseFloat(e.target.value))}
                aria-label="Vertical exaggeration"
                style={{ width: '100%', marginTop: 10, accentColor: '#3F6212' }}
              />
              <div style={{ marginTop: 6, font: '400 11px/1.4 Geist,system-ui', color: '#7C8272' }}>
                1.0× is true scale. Anything above it stretches relief to read more easily — useful for
                spotting structure, but it is no longer the real shape of the ground.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
