import React from 'react';
import justGoBurst from '../../../assets/pivot/just-go-burst.svg';

/** Same burst silhouette as just-go-burst / mobile scrapbook burst. */
const BURST_PATH =
  'M 50 0 L 62 16 L 82 12 L 68 28 L 78 48 L 50 38 L 22 48 L 32 28 L 18 12 L 38 16 Z';
const BURST_VIEWBOX = '18 0 64 48';

/**
 * Top-left Just Go burst — same role as Meridian AdminGrad on classic dashes.
 * Oversized + clipped so only the bottom-right of the burst peeks in.
 * Ink burst sits behind the orange burst so the silhouette reads with depth.
 */
function PivotDashBurst() {
  return (
    <div className="pivot-dash-burst" aria-hidden="true">
      <svg
        className="pivot-dash-burst__ink"
        viewBox={BURST_VIEWBOX}
        aria-hidden="true"
      >
        <path d={BURST_PATH} fill="#1A1714" />
      </svg>
      <img
        className="pivot-dash-burst__orange"
        src={justGoBurst}
        alt=""
        draggable={false}
      />
    </div>
  );
}

export default PivotDashBurst;
