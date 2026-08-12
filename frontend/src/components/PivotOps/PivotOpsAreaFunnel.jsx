import React, { useId, useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { Area } from '@visx/shape';
import { curveBasis } from '@visx/curve';
import ParentSize from '@visx/responsive/lib/components/ParentSize';
import './PivotOpsAreaFunnel.scss';

/**
 * Compact horizontal area funnel adapted from ClubDash EventDashboard/FunnelChart.
 * stages / data: [{ label, value }]
 */
const x = (d) => d.index;
const y = (d) => Math.max(d.value, 0.25);

function interpolateData(data) {
  return data.map((d, i) => interpolatePoints(d, data[i + 1])).flat();
}

function interpolatePoints(current, next) {
  if (!next) return current;
  const xStep = 0.25;
  const yStep = Math.abs(y(next) - y(current)) * 0.03;
  const yMid1 = Math.abs(y(current) - yStep);
  const yMid2 = Math.abs(y(next) + yStep);
  const xMid1 = Math.abs(x(current) + xStep);
  const xMid2 = Math.abs(x(next) - xStep);
  return [
    current,
    { index: xMid1, value: yMid1 },
    { index: xMid2, value: yMid2 },
  ];
}

const formatNumber = (n) => new Intl.NumberFormat().format(n);

function PivotOpsAreaFunnelChart({
  width,
  height,
  data,
  fromColor = '#ff4f1f',
  toColor = '#ffb089',
}) {
  const gradientId = useId().replace(/:/g, '');
  if (!data?.length || width < 40 || height < 40) return null;

  const segments = data.map((d, i) => ({
    index: i,
    value: Number(d.value) || 0,
    label: d.label,
  }));
  segments.push({ index: data.length, value: 0 });

  const interpolated = interpolateData(segments);
  const numSegments = Math.max(...segments.map(x));
  const firstValue = Math.max(segments[0]?.value ?? 1, 0.25);
  const valuePadding = Math.min(50, Math.max(3, firstValue * 2));
  const minmax = firstValue + valuePadding;

  const xScale = scaleLinear({
    range: [0, width],
    domain: [0, numSegments],
  });
  const yScale = scaleLinear({
    range: [height, 0],
    domain: [-minmax, minmax],
  });

  // Smaller glow pads than ClubDash so the ribbon fits a short card.
  const areas = [
    { padPx: 0, opacity: 1 },
    { padPx: 8, opacity: 0.22 },
    { padPx: 16, opacity: 0.1 },
  ];

  const checkpointIndices = Array.from(
    { length: numSegments - 1 },
    (_, i) => i + 1,
  );

  const boxWidth = Math.min(72, Math.max(52, width / (data.length + 0.5)));
  const boxHeight = 34;

  return (
    <svg
      width={width}
      height={height}
      className="pivot-ops-area-funnel__svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={fromColor} />
          <stop offset="100%" stopColor={toColor} />
        </linearGradient>
      </defs>
      {areas.map((area, i) => (
        <Area
          key={`area-${i}`}
          data={interpolated}
          curve={curveBasis}
          x={(d) => xScale(x(d))}
          y0={(d) => yScale(y(d)) - area.padPx}
          y1={(d) => yScale(-y(d)) + area.padPx}
          fill={`url(#${gradientId})`}
          fillOpacity={area.opacity}
          stroke="transparent"
        />
      ))}
      {checkpointIndices.map((idx) => {
        const xPos = xScale(idx);
        return (
          <line
            key={`checkpoint-${idx}`}
            className="pivot-ops-area-funnel__checkpoint"
            x1={xPos}
            y1={0}
            x2={xPos}
            y2={height}
          />
        );
      })}
      {segments.slice(0, -1).map((seg, i) => {
        const xPos = xScale(i + 0.5);
        const centerY = height / 2;
        const boxX = xPos - boxWidth / 2;
        const boxY = centerY - boxHeight / 2;
        return (
          <g key={`label-${i}`} className="pivot-ops-area-funnel__label">
            <foreignObject
              x={boxX}
              y={boxY}
              width={boxWidth}
              height={boxHeight}
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                className="pivot-ops-area-funnel__label-bg"
              >
                <span className="pivot-ops-area-funnel__value">
                  {formatNumber(seg.value)}
                </span>
                <span className="pivot-ops-area-funnel__name">{seg.label}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function PivotOpsAreaFunnel({
  stages,
  data,
  ariaLabel = 'Conversion funnel',
  className = '',
  /** Fixed pixel height. Ignored when `fill` is true. */
  height = 128,
  /** Grow to fill the parent height (ParentSize follows the container). */
  fill = false,
}) {
  const series = useMemo(() => {
    const source = stages || data || [];
    return source.map((stage) => ({
      label: stage.label,
      value: stage.value ?? 0,
    }));
  }, [stages, data]);

  if (!series.length) return null;

  return (
    <div
      className={`pivot-ops-area-funnel${fill ? ' pivot-ops-area-funnel--fill' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="img"
      aria-label={ariaLabel}
      style={fill ? undefined : { height }}
    >
      <ParentSize debounceTime={80}>
        {(parent) => (
          <PivotOpsAreaFunnelChart
            width={Math.floor(parent?.width ?? 0)}
            height={Math.floor(parent?.height ?? 0)}
            data={series}
          />
        )}
      </ParentSize>
    </div>
  );
}

export default PivotOpsAreaFunnel;
