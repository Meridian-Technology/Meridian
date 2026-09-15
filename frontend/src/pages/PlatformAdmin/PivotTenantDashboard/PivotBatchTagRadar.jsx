import React, { useId, useMemo } from 'react';
import { PivotOpsSection } from '../../../components/PivotOps';
import './PivotBatchTagRadar.scss';

const VIEWBOX_WIDTH = 760;
const VIEWBOX_HEIGHT = 500;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;
const CHART_RADIUS = 166;
const LABEL_RADIUS = 207;
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

function polarPoint(index, count, radius) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
    angle,
  };
}

function polygonPoints(count, radiusForIndex) {
  return Array.from({ length: count }, (_, index) => {
    const point = polarPoint(index, count, radiusForIndex(index));
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(' ');
}

function labelAnchor(angle) {
  const horizontal = Math.cos(angle);
  if (horizontal > 0.2) return 'start';
  if (horizontal < -0.2) return 'end';
  return 'middle';
}

function PivotBatchTagRadar({ batchWeek, events = [], catalogTags = [], loading = false }) {
  const titleId = useId();
  const descriptionId = useId();
  const strength = useMemo(
    () => buildBatchTagStrength(events, catalogTags),
    [events, catalogTags],
  );
  const { tags, maxCatalogCount } = strength;
  const enoughForRadar = tags.length >= 3;

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
      className="pivot-tag-radar"
    >
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
          <p>Add at least three represented tags to reveal the radial shape.</p>
        </div>
      ) : null}
      {!loading && enoughForRadar ? (
        <div className="pivot-tag-radar__viewport">
          <svg
            className="pivot-tag-radar__chart"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
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
                  points={polygonPoints(tags.length, () => CHART_RADIUS * level)}
                />
              ))}
              {tags.map((tag, index) => {
                const endpoint = polarPoint(index, tags.length, CHART_RADIUS);
                return (
                  <line
                    key={tag.slug}
                    x1={CENTER_X}
                    y1={CENTER_Y}
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
                (index) => CHART_RADIUS * (tags[index].catalogCount / maxCatalogCount),
              )}
            />
            <polygon
              className="pivot-tag-radar__shape pivot-tag-radar__shape--live"
              points={polygonPoints(
                tags.length,
                (index) => CHART_RADIUS * (tags[index].liveCount / maxCatalogCount),
              )}
            />
            <g className="pivot-tag-radar__points">
              {tags.map((tag, index) => {
                const catalogPoint = polarPoint(
                  index,
                  tags.length,
                  CHART_RADIUS * (tag.catalogCount / maxCatalogCount),
                );
                const livePoint = polarPoint(
                  index,
                  tags.length,
                  CHART_RADIUS * (tag.liveCount / maxCatalogCount),
                );
                return (
                  <React.Fragment key={tag.slug}>
                    <circle
                      className="pivot-tag-radar__point pivot-tag-radar__point--catalog"
                      cx={catalogPoint.x}
                      cy={catalogPoint.y}
                      r="3"
                    >
                      <title>{tag.label}: {tag.catalogCount} catalog events</title>
                    </circle>
                    <circle
                      className="pivot-tag-radar__point pivot-tag-radar__point--live"
                      cx={livePoint.x}
                      cy={livePoint.y}
                      r="4"
                    >
                      <title>{tag.label}: {tag.liveCount} live discovery events</title>
                    </circle>
                  </React.Fragment>
                );
              })}
            </g>
            <g className="pivot-tag-radar__labels">
              {tags.map((tag, index) => {
                const labelPoint = polarPoint(index, tags.length, LABEL_RADIUS);
                const anchor = labelAnchor(labelPoint.angle);
                return (
                  <text
                    key={tag.slug}
                    x={labelPoint.x}
                    y={labelPoint.y - 5}
                    textAnchor={anchor}
                  >
                    <tspan x={labelPoint.x}>{tag.label}</tspan>
                    <tspan x={labelPoint.x} dy="15" className="pivot-tag-radar__label-count">
                      {tag.liveCount} / {tag.catalogCount}
                    </tspan>
                  </text>
                );
              })}
            </g>
          </svg>
        </div>
      ) : null}
      {tags.length ? (
        <p className="pivot-tag-radar__note">
          Live discovery includes published, non-Hidden events. Values beside each tag are live / catalog.
        </p>
      ) : null}
    </PivotOpsSection>
  );
}

export { buildBatchTagStrength };
export default PivotBatchTagRadar;
