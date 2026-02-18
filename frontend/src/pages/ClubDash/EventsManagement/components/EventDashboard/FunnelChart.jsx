import React, { useId } from 'react';
import { scaleLinear } from '@visx/scale';
import { Area } from '@visx/shape';
import { curveBasis } from '@visx/curve';
import ParentSize from '@visx/responsive/lib/components/ParentSize';
import './FunnelChart.scss';

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

function FunnelChart({ width, height, data }) {
    const gradientId = useId().replace(/:/g, '');
    if (!data || data.length === 0) return null;

    const segments = data.map((d, i) => ({ index: i, value: d.value, label: d.label }));
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

    const areas = [
        { padPx: 0, opacity: 1 },
        { padPx: 15, opacity: 0.2 },
        { padPx: 30, opacity: 0.1 },
    ];

    const checkpointIndices = Array.from({ length: numSegments - 1 }, (_, i) => i + 1);

    return (
        <svg width={width} height={height} className="funnel-chart-svg funnel-chart-horizontal">
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4DAA57" />
                    <stop offset="100%" stopColor="#CAF080" />
                </linearGradient>
            </defs>
            <rect width={width} height={height} fill="var(--background)" rx={22} />
            {areas.map((area, i) => (
                <Area
                    key={`area-${i}`}
                    data={interpolated}
                    curve={curveBasis}
                    x={(d) => xScale(x(d))}
                    y0={(d) => yScale(y(d)) - area.padPx}
                    y1={(d) => yScale(-(y(d))) + area.padPx}
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
                        className="funnel-checkpoint-line"
                        x1={xPos}
                        y1={0}
                        x2={xPos}
                        y2={height}
                        stroke="rgba(0, 0, 0, 0.01)"
                        strokeWidth={2}
                    />
                );
            })}
            {segments.slice(0, -1).map((seg, i) => {
                const xPos = xScale(i + 0.5);
                const centerY = height / 2;
                const boxWidth = 84;
                const boxHeight = 40;
                const boxX = xPos - boxWidth / 2;
                const boxY = centerY - boxHeight / 2;
                return (
                    <g key={`label-${i}`} className="funnel-segment-label">
                        <foreignObject
                            x={boxX}
                            y={boxY}
                            width={boxWidth}
                            height={boxHeight}
                            className="funnel-segment-label-foreign"
                        >
                            <div
                                xmlns="http://www.w3.org/1999/xhtml"
                                className="funnel-segment-label-bg"
                            >
                                <span className="funnel-segment-value-text">{formatNumber(seg.value)}</span>
                                <span className="funnel-segment-label-text">{seg.label}</span>
                            </div>
                        </foreignObject>
                    </g>
                );
            })}
        </svg>
    );
}

function FunnelChartWithSize(props) {
    return (
        <ParentSize>
            {(parent) => (
                <FunnelChart
                    {...props}
                    width={parent?.width ?? 400}
                    height={parent?.height ?? 160}
                />
            )}
        </ParentSize>
    );
}

export default FunnelChartWithSize;
