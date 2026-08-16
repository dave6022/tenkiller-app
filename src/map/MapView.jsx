import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { BASEMAPS, LAKE, MAPBOX_TOKEN } from '../config.js';
import { LAYERS, findLayer, showSelectedParcel } from './layers.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * The map. Owns the mapbox instance and keeps it in sync with the enabled
 * layer set, the basemap and the terrain exaggeration.
 *
 * The awkward part of Mapbox is that switching basemap style wipes every source
 * and layer you added, so `restyle` re-attaches the enabled set once the new
 * style reports ready. Layer attach() functions are written to tolerate that.
 */
export default function MapView({
  basemap, enabled, exaggeration, point, parcelGeometry, onReady, onReadout,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const pendingRemoveRef = useRef(null);
  const markerRef = useRef(null);

  const scheduleRemove = () => {
    pendingRemoveRef.current = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      pendingRemoveRef.current = null;
    }, 0);
  };

  // Latest props, readable from map event handlers without re-subscribing.
  const stateRef = useRef({ enabled, exaggeration });
  stateRef.current = { enabled, exaggeration };
  const readoutRef = useRef(onReadout);
  readoutRef.current = onReadout;

  const applyLayers = (map) => {
    const { enabled: on, exaggeration: ex } = stateRef.current;
    LAYERS.forEach((layer) => {
      const want = on.includes(layer.id);
      try {
        if (want) layer.attach(map, { exaggeration: ex });
        else layer.detach(map);
      } catch (err) {
        // A layer failing must not take the map down with it.
        console.error(`layer "${layer.id}" failed`, err);
      }
    });
  };

  // Create once.
  //
  // StrictMode mounts, unmounts and remounts in development. Removing a
  // half-initialised mapbox map throws from its own async callbacks
  // ("applyProjectionUpdate of undefined") and can leave the instance dead, so
  // teardown is deferred by a tick and cancelled if we are immediately
  // remounted. A real unmount still cleans up on the next tick.
  useEffect(() => {
    if (pendingRemoveRef.current) {
      clearTimeout(pendingRemoveRef.current);
      pendingRemoveRef.current = null;
    }
    if (mapRef.current) return () => scheduleRemove();
    if (!MAPBOX_TOKEN || !hostRef.current) return undefined;

    const map = new mapboxgl.Map({
      container: hostRef.current,
      style: BASEMAPS[0].style,
      center: LAKE.center,
      zoom: LAKE.zoom,
      pitch: LAKE.pitch,
      bearing: LAKE.bearing,
      minZoom: LAKE.minZoom,
      maxZoom: LAKE.maxZoom,
      attributionControl: true,
      antialias: true,
    });
    mapRef.current = map;
    // Handy when debugging layers from the console; dev builds only.
    if (import.meta.env.DEV) window.__map = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'imperial' }), 'bottom-left');
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    }), 'bottom-right');

    // Fires on first load and again after every setStyle().
    map.on('style.load', () => applyLayers(map));
    map.on('load', () => onReady && onReady(map));

    // Click to inspect a coordinate.
    //
    // Deliberately not on mousemove: queryTerrainElevation raycasts against the
    // terrain mesh, and running that every pointer move burns frames for a
    // number nobody asked for. A click is also the only gesture that works on
    // a phone.
    const elevationAt = (lngLat) => {
      try {
        return map.queryTerrainElevation(lngLat, { exaggerated: false });
      } catch {
        return null;
      }
    };

    map.on('click', (e) => {
      if (!readoutRef.current) return;
      const { lng, lat } = e.lngLat;
      const metres = elevationAt(e.lngLat);
      readoutRef.current({ lng, lat, metres, pending: metres == null });

      // The DEM tile for this spot may not have arrived yet. Rather than
      // report a null forever, try once more when the map goes idle.
      if (metres == null) {
        map.once('idle', () => {
          if (!readoutRef.current) return;
          readoutRef.current({ lng, lat, metres: elevationAt(e.lngLat), pending: false });
        });
      }
    });

    return () => scheduleRemove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dropped pin. Markers are DOM overlays, so they survive setStyle()
  // and do not need re-attaching the way sources and layers do.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!point) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:18px',
        'background:#3F6212', 'border:2.5px solid #FBFAF8',
        'box-shadow:0 2px 8px rgba(20,23,15,.5)', 'cursor:pointer',
      ].join(';');
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([point.lng, point.lat]);
    }
  }, [point]);

  // Outline of the tapped parcel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      showSelectedParcel(map, parcelGeometry);
    } catch (err) {
      console.error('parcel highlight failed', err);
    }
  }, [parcelGeometry]);

  // Basemap switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = BASEMAPS.find((b) => b.id === basemap);
    if (next) map.setStyle(next.style);
  }, [basemap]);

  // Layer toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLayers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Exaggeration slider — cheap to apply directly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('dem')) return;
    if (enabled.includes('terrain')) {
      map.setTerrain({ source: 'dem', exaggeration });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exaggeration]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, background: '#22301C', color: '#FBFAF8',
        font: '400 14px/1.6 Geist, system-ui', textAlign: 'center',
      }}>
        <div>
          <div style={{ font: '600 16px/1.3 Geist, system-ui' }}>No Mapbox token</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Set <code>VITE_MAPBOX_TOKEN</code> in <code>.env</code> and restart the dev server.
          </div>
        </div>
      </div>
    );
  }

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}

export { findLayer };
