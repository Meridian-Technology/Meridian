import React, { useMemo } from 'react';
import { PivotOpsSection } from '../../../components/PivotOps';
import './PivotHistoricLocationHeatmap.scss';

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

function projectLngLat(point, bounds, cols, rows) {
  if (!point || !bounds) return null;
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  if (!(latSpan > 0) || !(lngSpan > 0)) return null;
  return {
    x: ((point.longitude - bounds.west) / lngSpan) * cols,
    y: ((bounds.north - point.latitude) / latSpan) * rows,
  };
}

function projectBoundsRect(box, bounds, cols, rows) {
  if (!box) return null;
  const northWest = projectLngLat(
    { latitude: box.north, longitude: box.west },
    bounds,
    cols,
    rows,
  );
  const southEast = projectLngLat(
    { latitude: box.south, longitude: box.east },
    bounds,
    cols,
    rows,
  );
  if (!northWest || !southEast) return null;
  return {
    x: Math.min(northWest.x, southEast.x),
    y: Math.min(northWest.y, southEast.y),
    width: Math.abs(southEast.x - northWest.x),
    height: Math.abs(southEast.y - northWest.y),
  };
}

function projectRadiusCircle(center, radiusKm, bounds, cols, rows) {
  const origin = projectLngLat(center, bounds, cols, rows);
  if (!origin || !(radiusKm > 0)) return null;
  const north = projectLngLat({
    latitude: center.latitude + (radiusKm / 111.32),
    longitude: center.longitude,
  }, bounds, cols, rows);
  const eastLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));
  const east = projectLngLat({
    latitude: center.latitude,
    longitude: center.longitude + eastLng,
  }, bounds, cols, rows);
  if (!north || !east) return null;
  return {
    cx: origin.x,
    cy: origin.y,
    rx: Math.abs(east.x - origin.x),
    ry: Math.abs(origin.y - north.y),
  };
}

function heatOpacity(count, maxCount) {
  if (!maxCount) return 0;
  return 0.18 + (0.82 * Math.sqrt(count / maxCount));
}

function PivotHistoricLocationHeatmap({ data, loading, error, draftConstraints }) {
  const cols = Number(data?.cols) || 40;
  const rows = Number(data?.rows) || 32;
  const overlay = overlayFromFields(draftConstraints) || overlayFromHeatmap(data);
  const cityRect = overlay?.bounds
    ? projectBoundsRect(overlay.bounds, data?.bounds, cols, rows)
    : null;
  const cityCircle = overlay?.center
    ? projectRadiusCircle(overlay.center, overlay.radiusKm, data?.bounds, cols, rows)
    : null;
  const pointCount = Number(data?.pointCount || 0);
  const outsideCount = Number(data?.outsideCount || 0);
  const unresolvedCount = Number(data?.unresolvedCount || 0);
  const maxCount = Number(data?.maxCount || 0);
  const cells = useMemo(() => data?.cells || [], [data?.cells]);

  const description = loading
    ? 'Loading resolved locations across every batch week.'
    : 'All weeks · resolved coordinates only. The selected batch week does not change this map.';

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
          <div className="pivot-historic-heatmap__map">
            <svg
              viewBox={`0 0 ${cols} ${rows}`}
              role="img"
              aria-label="Historic event location heatmap across every batch week"
              preserveAspectRatio="xMidYMid meet"
            >
              <rect className="pivot-historic-heatmap__canvas" x="0" y="0" width={cols} height={rows} />
              {cells.map((cell) => (
                <rect
                  key={`${cell.x}-${cell.y}`}
                  className="pivot-historic-heatmap__cell"
                  x={cell.x}
                  y={cell.y}
                  width="1"
                  height="1"
                  fillOpacity={heatOpacity(cell.count, maxCount)}
                >
                  <title>{`${cell.count} resolved ${cell.count === 1 ? 'event' : 'events'}`}</title>
                </rect>
              ))}
              {cityRect && cityRect.width > 0 && cityRect.height > 0 ? (
                <rect
                  className="pivot-historic-heatmap__city"
                  x={cityRect.x}
                  y={cityRect.y}
                  width={cityRect.width}
                  height={cityRect.height}
                />
              ) : null}
              {cityCircle && cityCircle.rx > 0 && cityCircle.ry > 0 ? (
                <ellipse
                  className="pivot-historic-heatmap__city"
                  cx={cityCircle.cx}
                  cy={cityCircle.cy}
                  rx={cityCircle.rx}
                  ry={cityCircle.ry}
                />
              ) : null}
            </svg>
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
  overlayFromFields,
  projectBoundsRect,
  projectLngLat,
  projectRadiusCircle,
};
export default PivotHistoricLocationHeatmap;
