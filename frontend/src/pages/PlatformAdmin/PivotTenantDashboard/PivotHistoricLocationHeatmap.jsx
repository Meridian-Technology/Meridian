import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PivotOpsSection } from '../../../components/PivotOps';
import './PivotHistoricLocationHeatmap.scss';

const MAPS_BROWSER_KEY = String(
  process.env.REACT_APP_GOOGLE_MAPS_EMBED_API_KEY || '',
).trim().replace(/^["']|["']$/g, '');

const HEAT_COLOR = '#ff4f1f';
const CITY_STROKE = '#1a1714';

function finiteNumber(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function overlayFromFields(fields) {
  if (!fields) return null;
  if (fields.mode === 'bounds') {
    const bounds = {
      north: finiteNumber(fields.north),
      south: finiteNumber(fields.south),
      east: finiteNumber(fields.east),
      west: finiteNumber(fields.west),
    };
    if (Object.values(bounds).some((value) => value === null) || bounds.south > bounds.north) {
      return null;
    }
    return { bounds };
  }
  const center = {
    latitude: finiteNumber(fields.latitude),
    longitude: finiteNumber(fields.longitude),
  };
  const radiusKm = finiteNumber(fields.radiusKm);
  if (center.latitude === null || center.longitude === null || !(radiusKm > 0)) return null;
  return { center, radiusKm };
}

function overlayFromHeatmap(data) {
  if (!data) return null;
  if (data.cityBounds) return { bounds: data.cityBounds };
  if (data.cityCenter && data.cityRadiusKm > 0) {
    return { center: data.cityCenter, radiusKm: data.cityRadiusKm };
  }
  return null;
}

function heatOpacity(count, maxCount) {
  if (!maxCount) return 0;
  return 0.22 + (0.7 * Math.sqrt(count / maxCount));
}

function cellGeoBounds(cell, data) {
  const lngSpan = data.bounds.east - data.bounds.west;
  const latSpan = data.bounds.north - data.bounds.south;
  if (!(lngSpan > 0) || !(latSpan > 0)) return null;
  return {
    west: data.bounds.west + ((cell.x / data.cols) * lngSpan),
    east: data.bounds.west + (((cell.x + 1) / data.cols) * lngSpan),
    north: data.bounds.north - ((cell.y / data.rows) * latSpan),
    south: data.bounds.north - (((cell.y + 1) / data.rows) * latSpan),
  };
}

function toLatLngBounds(maps, box) {
  if (!maps || !box) return null;
  return new maps.LatLngBounds(
    { lat: box.south, lng: box.west },
    { lat: box.north, lng: box.east },
  );
}

let mapsPromise = null;

function loadGoogleMaps(apiKey = MAPS_BROWSER_KEY) {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }
  if (!apiKey) {
    return Promise.reject(Object.assign(new Error('GOOGLE_MAPS_KEY_MISSING'), { code: 'GOOGLE_MAPS_KEY_MISSING' }));
  }
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
        return;
      }
      mapsPromise = null;
      reject(Object.assign(new Error('GOOGLE_MAPS_LOAD_FAILED'), { code: 'GOOGLE_MAPS_LOAD_FAILED' }));
    };
    const existing = document.querySelector('script[data-historic-google-maps]');
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', finish, { once: true });
      return;
    }
    window.__pivotHistoricGoogleMapsReady = finish;
    const script = document.createElement('script');
    script.dataset.historicGoogleMaps = 'true';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=__pivotHistoricGoogleMapsReady`;
    script.onerror = finish;
    document.head.appendChild(script);
  });
  return mapsPromise;
}

function clearOverlays(overlays) {
  overlays.forEach((overlay) => overlay.setMap?.(null));
  overlays.length = 0;
}

function PivotHistoricLocationHeatmap({ data, loading, error, draftConstraints }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [mapsApi, setMapsApi] = useState(() => (
    typeof window !== 'undefined' && window.google?.maps?.Map ? window.google.maps : null
  ));
  const [mapsError, setMapsError] = useState(MAPS_BROWSER_KEY ? null : 'GOOGLE_MAPS_KEY_MISSING');
  const cols = Number(data?.cols) || 40;
  const rows = Number(data?.rows) || 32;
  const overlay = overlayFromFields(draftConstraints) || overlayFromHeatmap(data);
  const boundsKey = data?.bounds
    ? [data.bounds.north, data.bounds.south, data.bounds.east, data.bounds.west].join(':')
    : '';
  const cells = useMemo(() => data?.cells || [], [data?.cells]);
  const pointCount = Number(data?.pointCount || 0);
  const outsideCount = Number(data?.outsideCount || 0);
  const unresolvedCount = Number(data?.unresolvedCount || 0);
  const maxCount = Number(data?.maxCount || 0);

  useEffect(() => {
    let cancelled = false;
    if (mapsApi || mapsError === 'GOOGLE_MAPS_KEY_MISSING') return undefined;
    loadGoogleMaps().then((maps) => {
      if (!cancelled) setMapsApi(maps);
    }).catch((loadError) => {
      if (!cancelled) setMapsError(loadError.code || 'GOOGLE_MAPS_LOAD_FAILED');
    });
    return () => {
      cancelled = true;
    };
  }, [mapsApi, mapsError]);

  useEffect(() => {
    if (!mapsApi || !hostRef.current || mapRef.current) return undefined;
    mapRef.current = new mapsApi.Map(hostRef.current, {
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy',
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });
    return undefined;
  }, [mapsApi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsApi || !data?.bounds) return undefined;
    map.fitBounds(toLatLngBounds(mapsApi, data.bounds), 24);
    return undefined;
  }, [boundsKey, data?.bounds, mapsApi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsApi) return undefined;
    const next = [];
    if (data?.bounds) {
      cells.forEach((cell) => {
        const box = cellGeoBounds(cell, { ...data, cols, rows });
        const bounds = toLatLngBounds(mapsApi, box);
        if (!bounds) return;
        next.push(new mapsApi.Rectangle({
          bounds,
          map,
          clickable: false,
          strokeWeight: 0,
          fillColor: HEAT_COLOR,
          fillOpacity: heatOpacity(cell.count, maxCount),
        }));
      });
    }
    if (overlay?.bounds) {
      const bounds = toLatLngBounds(mapsApi, overlay.bounds);
      if (bounds) {
        next.push(new mapsApi.Rectangle({
          bounds,
          map,
          clickable: false,
          strokeColor: CITY_STROKE,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: CITY_STROKE,
          fillOpacity: 0.06,
        }));
      }
    } else if (overlay?.center) {
      next.push(new mapsApi.Circle({
        map,
        clickable: false,
        center: { lat: overlay.center.latitude, lng: overlay.center.longitude },
        radius: overlay.radiusKm * 1000,
        strokeColor: CITY_STROKE,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: CITY_STROKE,
        fillOpacity: 0.06,
      }));
    }
    overlaysRef.current = next;
    return () => clearOverlays(next);
  }, [cells, cols, data, mapsApi, maxCount, overlay, rows]);

  const description = loading
    ? 'Loading resolved locations across every batch week.'
    : 'All weeks · drag to move and scroll to zoom on Google Maps.';

  let mapMessage = null;
  if (mapsError === 'GOOGLE_MAPS_KEY_MISSING') {
    mapMessage = 'Add a Google Maps browser key to show this map.';
  } else if (mapsError) {
    mapMessage = 'Google Maps did not load. Check the browser Maps key and that Maps JavaScript API is enabled.';
  } else if (!mapsApi) {
    mapMessage = 'Loading Google Maps…';
  }

  return (
    <PivotOpsSection
      className="pivot-historic-heatmap"
      title="Historic locations"
      description={description}
    >
      {error ? (
        <p className="pivot-historic-heatmap__empty">Could not load the historic heatmap.</p>
      ) : !loading && !pointCount && !data?.bounds ? (
        <p className="pivot-historic-heatmap__empty">
          Historic density appears after events have resolved coordinates.
        </p>
      ) : (
        <>
          <div
            className="pivot-historic-heatmap__frame"
            role="application"
            aria-label="Historic event location heatmap across every batch week"
          >
            <div ref={hostRef} className="pivot-historic-heatmap__map" />
            {mapMessage ? (
              <p className="pivot-historic-heatmap__map-status">{mapMessage}</p>
            ) : null}
          </div>
          <div className="pivot-historic-heatmap__footer">
            <p>
              {loading ? 'Loading…' : (
                <>
                  <strong>{pointCount.toLocaleString()}</strong>
                  {` resolved location${pointCount === 1 ? '' : 's'} across every batch week`}
                  {outsideCount > 0 ? (
                    <>
                      {' · '}
                      <strong>{outsideCount.toLocaleString()}</strong>
                      {' outside the current city boundary'}
                    </>
                  ) : null}
                  {unresolvedCount > 0 ? (
                    <>
                      {' · '}
                      {unresolvedCount.toLocaleString()}
                      {' still without coordinates'}
                    </>
                  ) : null}
                  {data?.truncated ? ' · showing the first 8,000 resolved locations' : ''}
                </>
              )}
            </p>
            <div className="pivot-historic-heatmap__legend" aria-hidden="true">
              <span>Fewer</span>
              <span className="pivot-historic-heatmap__swatch" />
              <span>More</span>
              {overlay ? <span className="pivot-historic-heatmap__boundary-key">City boundary</span> : null}
            </div>
          </div>
        </>
      )}
    </PivotOpsSection>
  );
}

export {
  heatOpacity,
  loadGoogleMaps,
  overlayFromFields,
  toLatLngBounds,
};
export default PivotHistoricLocationHeatmap;
