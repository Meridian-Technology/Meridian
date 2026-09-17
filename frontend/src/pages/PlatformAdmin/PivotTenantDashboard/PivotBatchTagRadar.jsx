import React, { useId, useMemo } from 'react';
import { PivotOpsSection } from '../../../components/PivotOps';
import './PivotBatchTagRadar.scss';

const LAYOUTS = {
  full: {
    width: 760,
    height: 500,
    cx: 380,
    cy: 250,
    radius: 166,
    labelRadius: 207,
  },
  compact: {
    width: 360,
    height: 250,
    cx: 180,
    cy: 122,
    radius: 78,
    labelRadius: 102,
  },
};
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

function normalizeTag(value) {
  return String(value || '').trim().toLowerCase();
}

function displayTagLabel(value) {
  const label = String(value || '').trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : '';
}

function buildBatchTagStrength(events = [], catalogTags = []) {
  const catalogBySlug = new Map();
  const catalogOrder = new Map();
  catalogTags.forEach((tag, index) => {
    const slug = normalizeTag(tag?.slug);
    if (!slug) return;
    catalogBySlug.set(slug, tag?.label || slug);
    catalogOrder.set(slug, index);
  });

  const counts = new Map();
  events.forEach((event) => {
    const eventTags = new Set((event?.tags || []).map(normalizeTag).filter(Boolean));
    const live = event?.ingestStatus === 'published'
      && event?.rankingOverride?.tier !== 'hidden';
    eventTags.forEach((slug) => {
      const current = counts.get(slug) || { catalogCount: 0, liveCount: 0 };
      current.catalogCount += 1;
      if (live) current.liveCount += 1;
      counts.set(slug, current);
    });
  });

  const tags = Array.from(counts.entries())
    .map(([slug, count]) => ({
      slug,
      label: displayTagLabel(catalogBySlug.get(slug) || slug.replace(/-/g, ' ')),
      ...count,
    }))
    .sort((a, b) => {
      const aOrder = catalogOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = catalogOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.label.localeCompare(b.label);
    });

  return {
    tags,
    maxCatalogCount: Math.max(1, ...tags.map((tag) => tag.catalogCount)),
  };
}

function polarPoint(index, count, radius, layout) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return {
    x: layout.cx + Math.cos(angle) * radius,
    y: layout.cy + Math.sin(angle) * radius,
    angle,
  };
}

function polygonPoints(count, radiusForIndex, layout) {
  return Array.from({ length: count }, (_, index) => {
    const point = polarPoint(index, count, radiusForIndex(index), layout);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(' ');
}

function labelAnchor(angle) {
  const horizontal = Math.cos(angle);
  if (horizontal > 0.2) return 'start';
  if (horizontal < -0.2) return 'end';
  return 'middle';
}

function TagRadarChart({ batchWeek, tags, maxCatalogCount, layout, compact }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div className="pivot-tag-radar__viewport">
      <svg
        className="pivot-tag-radar__chart"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Tag strength for {batchWeek}</title>
        <desc id={descriptionId}>
          A radar chart comparing live discovery events with all catalog events for every tag represented in the batch.
        </desc>
        <g className="pivot-tag-radar__grid">
          {GRID_LEVELS.map((level) => (
            <polygon
              key={level}
              points={polygonPoints(tags.length, () => layout.radius * level, layout)}
            />
          ))}
          {tags.map((tag, index) => {
            const endpoint = polarPoint(index, tags.length, layout.radius, layout);
            return (
              <line
                key={tag.slug}
                x1={layout.cx}
                y1={layout.cy}
                x2={endpoint.x}
                y2={endpoint.y}
              />
            );
          })}
        </g>
        <polygon
          className="pivot-tag-radar__shape pivot-tag-radar__shape--catalog"
          points={polygonPoints(
            tags.length,
            (index) => layout.radius * (tags[index].catalogCount / maxCatalogCount),
            layout,
          )}
        />
        <polygon
          className="pivot-tag-radar__shape pivot-tag-radar__shape--live"
          points={polygonPoints(
            tags.length,
            (index) => layout.radius * (tags[index].liveCount / maxCatalogCount),
            layout,
          )}
        />
        <g className="pivot-tag-radar__points">
          {tags.map((tag, index) => {
            const catalogPoint = polarPoint(
              index,
              tags.length,
              layout.radius * (tag.catalogCount / maxCatalogCount),
              layout,
            );
            const livePoint = polarPoint(
              index,
              tags.length,
              layout.radius * (tag.liveCount / maxCatalogCount),
              layout,
            );
            return (
              <React.Fragment key={tag.slug}>
                <circle
                  className="pivot-tag-radar__point pivot-tag-radar__point--catalog"
                  cx={catalogPoint.x}
                  cy={catalogPoint.y}
                  r={compact ? 2 : 3}
                >
                  <title>{tag.label}: {tag.catalogCount} catalog events</title>
                </circle>
                <circle
                  className="pivot-tag-radar__point pivot-tag-radar__point--live"
                  cx={livePoint.x}
                  cy={livePoint.y}
                  r={compact ? 3 : 4}
                >
                  <title>{tag.label}: {tag.liveCount} live discovery events</title>
                </circle>
              </React.Fragment>
            );
          })}
        </g>
        <g className="pivot-tag-radar__labels">
          {tags.map((tag, index) => {
            const labelPoint = polarPoint(index, tags.length, layout.labelRadius, layout);
            const anchor = labelAnchor(labelPoint.angle);
            return (
              <text
                key={tag.slug}
                x={labelPoint.x}
                y={labelPoint.y - (compact ? 2 : 5)}
                textAnchor={anchor}
              >
                <tspan x={labelPoint.x}>{tag.label}</tspan>
                {compact ? null : (
                  <tspan x={labelPoint.x} dy="15" className="pivot-tag-radar__label-count">
                    {tag.liveCount} / {tag.catalogCount}
                  </tspan>
                )}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function PivotBatchTagRadar({
  batchWeek,
  events = [],
  catalogTags = [],
  loading = false,
  compact = false,
  embedded = false,
}) {
  const strength = useMemo(
    () => buildBatchTagStrength(events, catalogTags),
    [events, catalogTags],
  );
  const { tags, maxCatalogCount } = strength;
  const enoughForRadar = tags.length >= 3;
  const layout = compact ? LAYOUTS.compact : LAYOUTS.full;
  const chart = enoughForRadar && !loading ? (
    <TagRadarChart
      batchWeek={batchWeek}
      tags={tags}
      maxCatalogCount={maxCatalogCount}
      layout={layout}
      compact={compact}
    />
  ) : null;

  const body = (
    <>
      {loading ? (
        <div className="pivot-tag-radar__loading" role="status">
          <p className="pivot-tag-radar__empty">Loading tag coverage…</p>
        </div>
      ) : null}
      {!loading && !tags.length ? (
        <p className="pivot-tag-radar__empty">No tags are assigned to this batch yet.</p>
      ) : null}
      {!loading && tags.length > 0 && !enoughForRadar ? (
        <div className="pivot-tag-radar__short-list">
          {tags.map((tag) => (
            <div key={tag.slug}>
              <span>{tag.label}</span>
              <strong>{tag.liveCount} live / {tag.catalogCount} catalog</strong>
            </div>
          ))}
          {compact ? null : <p>Add at least three represented tags to reveal the radial shape.</p>}
        </div>
      ) : null}
      {chart}
      {tags.length > 0 && !compact ? (
        <p className="pivot-tag-radar__note">
          Live discovery includes published, non-Hidden events. Values beside each tag are live / catalog.
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={`pivot-tag-radar${compact ? ' pivot-tag-radar--compact' : ''}`}>
        {tags.length ? (
          <div className="pivot-tag-radar__legend" aria-label="Chart legend">
            <span><i className="pivot-tag-radar__swatch pivot-tag-radar__swatch--catalog" />Catalog</span>
            <span><i className="pivot-tag-radar__swatch pivot-tag-radar__swatch--live" />Live</span>
          </div>
        ) : null}
        {body}
      </div>
    );
  }

  return (
    <PivotOpsSection
      title={`Tag strength · ${batchWeek}`}
      titleId={`tag-strength-${batchWeek}`}
      description={
        tags.length
          ? `Live discovery coverage versus the full catalog. Outer ring = ${maxCatalogCount} event${maxCatalogCount === 1 ? '' : 's'}; multi-tag events count on every matching spoke.`
          : 'Coverage across the tags assigned to events in this batch.'
      }
      actions={tags.length ? (
        <div className="pivot-tag-radar__legend" aria-label="Chart legend">
          <span><i className="pivot-tag-radar__swatch pivot-tag-radar__swatch--catalog" />Catalog</span>
          <span><i className="pivot-tag-radar__swatch pivot-tag-radar__swatch--live" />Live discovery</span>
        </div>
      ) : null}
      className={`pivot-tag-radar${compact ? ' pivot-tag-radar--compact' : ''}`}
    >
      {body}
    </PivotOpsSection>
  );
}

export { buildBatchTagStrength };
export default PivotBatchTagRadar;
