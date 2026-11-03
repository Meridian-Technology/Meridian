import React, { useMemo, useState } from 'react';
import PivotOpsSection from '../../../../components/PivotOps/PivotOpsSection';
import { issueId, issueName, listPastIssues } from './carouselLibrary';
import './PivotCarouselLibrary.scss';

function previewImages(issue) {
  if (Array.isArray(issue.previewImages) && issue.previewImages.length) return issue.previewImages;
  const images = [];
  const push = (src) => { if (src && !images.includes(src)) images.push(src); };
  const walk = (elements) => {
    for (const element of elements || []) {
      if (element.kind === 'image' && element.role !== 'sticker') push(element.asset?.src);
      walk(element.children);
    }
  };
  for (const slide of issue.document?.slides || []) {
    push(slide.background?.asset?.src);
    walk(slide.elements);
  }
  if (!images.length && issue.coverImage) images.push(issue.coverImage);
  return images;
}

function PhotoFan({ issue }) {
  const photos = previewImages(issue);
  if (!photos.length) {
    return <span className="jg-library__fan jg-library__fan--empty"><b>{issueName(issue).slice(0, 1)}</b></span>;
  }
  const mid = (photos.length - 1) / 2;
  const step = photos.length > 8 ? 12 : 18;
  const tilt = photos.length > 8 ? 3.5 : 6;
  return (
    <span className="jg-library__fan" aria-hidden="true">
      {photos.map((src, index) => {
        const offset = index - mid;
        return (
          <span
            key={src}
            className="jg-library__photo"
            style={{
              zIndex: index,
              '--fan-x': `${offset * step}px`,
              '--fan-r': `${offset * tilt}deg`,
            }}
          >
            <img src={src} alt="" />
          </span>
        );
      })}
    </span>
  );
}

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Library view for PlatformAdmin/PivotTenantDashboard. PivotCarouselPage merges
 * canonical account issue metadata into legacy deck rows before passing issues,
 * so generated-draft filtering can use origin and reviewState.
 */
export default function PivotCarouselLibrary({
  issues,
  missingId,
  onOpen,
  onCreate,
  onArchive,
  onDelete,
  busy,
}) {
  const [filter, setFilter] = useState('all');
  const past = useMemo(() => listPastIssues(issues).filter(issue => (
    filter === 'all' || (issue.origin === 'agent-generated' && (issue.reviewState || 'unapproved') === 'unapproved')
  )), [issues, filter]);

  return (
    <div className="jg-library">
      {missingId && (
        <p className="jg-library__missing" role="alert">
          That carousel is gone, or it is not in this city.
        </p>
      )}

      <PivotOpsSection
        className="jg-library__panel"
        title="Carousels"
        description="Open a carousel, or start a new one for this city."
        actions={(
          <button type="button" className="linear-btn linear-btn--primary" onClick={onCreate} disabled={busy}>
            New carousel
          </button>
        )}
      >
        <label className="jg-library__filter">
          Review status
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All carousels</option>
            <option value="unapproved">Unapproved drafts</option>
          </select>
        </label>
        {past.length ? (
          <div className="jg-library__grid">
            {past.map((issue) => (
              <article key={issueId(issue)} className="jg-library__tile">
                <button type="button" className="jg-library__open" onClick={() => onOpen(issueId(issue))} disabled={busy}>
                  <PhotoFan issue={issue} />
                  <span className="jg-library__meta">
                    <strong>{issueName(issue)}</strong>
                    {issue.origin === 'agent-generated' && (issue.reviewState || 'unapproved') === 'unapproved' && (
                      <span className="jg-library__badge">Unapproved draft</span>
                    )}
                    <time dateTime={issue.updatedAt}>{when(issue.updatedAt)}</time>
                  </span>
                </button>
                <span className="jg-library__manage">
                  <button type="button" onClick={() => onArchive?.(issue)} disabled={busy || !onArchive}>Archive</button>
                  <button type="button" onClick={() => onDelete?.(issue)} disabled={busy || !onDelete}>Delete</button>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="pivot-lab__empty">{filter === 'unapproved' ? 'No unapproved drafts.' : 'No carousels yet.'}</p>
        )}
      </PivotOpsSection>
    </div>
  );
}
