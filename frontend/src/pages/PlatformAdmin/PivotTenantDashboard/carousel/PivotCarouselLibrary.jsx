import React, { useMemo } from 'react';
import { issueId, issueName, latestIssue, listPastIssues } from './carouselLibrary';
import './PivotCarouselLibrary.scss';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Thumb({ issue }) {
  return (
    <span className="jg-library__thumb">
      {issue.coverImage
        ? <img src={issue.coverImage} alt="" />
        : <b>{issueName(issue)}</b>}
    </span>
  );
}

export default function PivotCarouselLibrary({
  issues,
  missingId,
  onOpen,
  onCreate,
  busy,
}) {
  const past = useMemo(() => listPastIssues(issues), [issues]);
  const previous = latestIssue(past);
  const older = previous ? past.filter((issue) => issueId(issue) !== issueId(previous)) : [];

  return (
    <div className="jg-library">
      {missingId && (
        <p className="jg-library__missing" role="alert">
          That issue is gone, or it is not in this city.
        </p>
      )}

      <div className="jg-library__actions">
        {previous ? (
          <button
            type="button"
            className="jg-library__continue"
            onClick={() => onOpen(issueId(previous))}
            disabled={busy}
          >
            <Thumb issue={previous} />
            <span className="jg-library__continue-copy">
              <small>Continue previous</small>
              <strong>{issueName(previous)}</strong>
              <time dateTime={previous.updatedAt}>{when(previous.updatedAt)}</time>
            </span>
          </button>
        ) : (
          <p className="jg-library__empty">No issues yet.</p>
        )}
        <button type="button" className="jg-library__new" onClick={onCreate} disabled={busy}>
          New
        </button>
      </div>

      {older.length > 0 && (
        <ul className="jg-library__grid">
          {older.map((issue) => (
            <li key={issueId(issue)}>
              <button type="button" className="jg-library__card" onClick={() => onOpen(issueId(issue))}>
                <Thumb issue={issue} />
                <span className="jg-library__meta">
                  <strong>{issueName(issue)}</strong>
                  <time dateTime={issue.updatedAt}>{when(issue.updatedAt)}</time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
