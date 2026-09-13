import React from 'react';
import { Link } from 'react-router-dom';
import PivotCarouselPopup from './PivotCarouselPopup';
import {
  ARTIFACTS_EXPIRED_COPY,
  carouselComputeJobsHref,
  EXPORT_STATE_LABELS,
  exportDurationLabel,
  formatBytes,
  renderedRevision,
  slideArtifacts,
  zipArtifact,
} from './pivotCarouselExport';

function StateList({ uiState }) {
  const order = [
    'creating',
    'relay-notified',
    'waiting-for-worker',
    'rendering',
    'uploading',
    'completed',
  ];
  const currentIndex = order.indexOf(uiState);
  const failed = uiState === 'failed' || uiState === 'cancelled';

  return (
    <ol className="jgz-export-panel__states">
      {order.map((state, index) => {
        const done = !failed && currentIndex > index;
        const active = uiState === state || (failed && index === Math.max(currentIndex, 0));
        return (
          <li
            key={state}
            className={`jgz-export-panel__state${done ? ' is-done' : ''}${active ? ' is-active' : ''}${failed && active ? ' is-failed' : ''}`}
          >
            {EXPORT_STATE_LABELS[state]}
          </li>
        );
      })}
      {failed ? (
        <li className="jgz-export-panel__state is-active is-failed">
          {EXPORT_STATE_LABELS[uiState]}
        </li>
      ) : null}
    </ol>
  );
}

function DownloadList({ job, expired, busy, onDownload }) {
  const zip = zipArtifact(job);
  const slides = slideArtifacts(job);
  if (!zip && !slides.length) return null;

  if (expired) {
    return (
      <p className="jgz-export-panel__expired" role="status">
        {ARTIFACTS_EXPIRED_COPY}
      </p>
    );
  }

  const singlePng = !zip && slides.length === 1 ? slides[0] : null;

  return (
    <div className="jgz-export-panel__downloads">
      {zip ? (
        <button
          type="button"
          className="jgz-export-panel__zip"
          onClick={() => onDownload(zip)}
          disabled={Boolean(busy)}
        >
          {busy === zip.artifactId ? 'starting download…' : 'Download ZIP'}
          <span>{formatBytes(zip.byteCount)}</span>
        </button>
      ) : null}
      {singlePng ? (
        <button
          type="button"
          className="jgz-export-panel__zip"
          onClick={() => onDownload(singlePng)}
          disabled={Boolean(busy)}
        >
          {busy === singlePng.artifactId ? 'starting download…' : 'Download PNG'}
          <span>{formatBytes(singlePng.byteCount)}</span>
        </button>
      ) : null}
      {!singlePng && slides.length ? (
        <ul className="jgz-export-panel__slides">
          {slides.map((slide) => (
            <li key={slide.artifactId}>
              <button
                type="button"
                onClick={() => onDownload(slide)}
                disabled={Boolean(busy)}
              >
                {busy === slide.artifactId
                  ? 'starting…'
                  : `Slide ${String(slide.slideNumber).padStart(2, '0')}`}
                <span>{formatBytes(slide.byteCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function PivotCarouselExportPanel({
  open,
  onClose,
  job,
  uiState,
  progressLabel,
  failureLabel,
  revisionStale,
  artifactsExpired: expired,
  onCancel,
  onRetry,
  onDownload,
  onOpen,
  busy,
  showStrip = true,
}) {
  if (!job && uiState !== 'creating') return null;

  const stateLabel = EXPORT_STATE_LABELS[uiState] || 'Export';
  const revision = renderedRevision(job);
  const duration = exportDurationLabel(job);
  const computeHref = carouselComputeJobsHref(job);
  const canCancel = uiState && !['completed', 'failed', 'cancelled'].includes(uiState);
  const canRetry = uiState === 'failed' || uiState === 'cancelled';
  const completed = uiState === 'completed';

  return (
    <>
      {showStrip && job ? (
        <div className="jgz-export-line" role="status">
          <p>
            <strong>{stateLabel}</strong>
            {progressLabel && progressLabel !== stateLabel ? ` · ${progressLabel}` : null}
            {completed && revision ? ` · revision ${revision}` : null}
          </p>
          <div className="jgz-export-line__ops">
            <button type="button" onClick={onOpen}>
              {open ? 'export open' : 'open export'}
            </button>
            {completed && !expired && zipArtifact(job) ? (
              <button type="button" onClick={() => onDownload(zipArtifact(job))}>
                Download ZIP
              </button>
            ) : null}
            {completed && !expired && !zipArtifact(job) && slideArtifacts(job).length === 1 ? (
              <button type="button" onClick={() => onDownload(slideArtifacts(job)[0])}>
                Download PNG
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <PivotCarouselPopup open={open} onClose={onClose} className="jgz-export-popup">
        <div className="jgz-export-panel" data-testid="carousel-export-panel">
          <header className="jgz-export-panel__head">
            <h2>Carousel export</h2>
            <p>{stateLabel}{progressLabel && progressLabel !== stateLabel ? ` · ${progressLabel}` : ''}</p>
          </header>

          <StateList uiState={uiState || 'creating'} />

          {revisionStale ? (
            <p className="jgz-export-panel__warn" role="status">
              The saved deck has changed since this export started. This job is
              still rendering revision {job?.options?.deckRevision}.
            </p>
          ) : null}

          {failureLabel ? (
            <p className="jgz-export-panel__error" role="alert">{failureLabel}</p>
          ) : null}

          {completed ? (
            <dl className="jgz-export-panel__facts">
              {revision ? (
                <div>
                  <dt>Rendered revision</dt>
                  <dd>{revision}</dd>
                </div>
              ) : null}
              {duration ? (
                <div>
                  <dt>Export time</dt>
                  <dd>{duration}</dd>
                </div>
              ) : null}
              {job?.completedAt ? (
                <div>
                  <dt>Finished</dt>
                  <dd>{new Date(job.completedAt).toLocaleString()}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {completed ? (
            <DownloadList
              job={job}
              expired={expired}
              busy={busy}
              onDownload={onDownload}
            />
          ) : null}

          <div className="jgz-export-panel__ops">
            {canCancel ? (
              <button type="button" onClick={onCancel} disabled={Boolean(busy)}>
                {busy === 'cancel' ? 'cancelling…' : 'Cancel'}
              </button>
            ) : null}
            {canRetry ? (
              <button type="button" onClick={onRetry} disabled={Boolean(busy)}>
                {busy === 'retry' ? 'retrying…' : 'Retry'}
              </button>
            ) : null}
            {computeHref ? (
              <Link to={computeHref}>Open in compute jobs</Link>
            ) : null}
          </div>
        </div>
      </PivotCarouselPopup>
    </>
  );
}
