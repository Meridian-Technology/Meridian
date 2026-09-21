import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PivotOpsAnimateNumber,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import Select from '../../../components/Select/Select';
import { formatEventWhen, formatEventWhenWithShowtimes } from '../../../utils/pivotIsoWeek';
import PivotImportThumb from '../PivotLab/PivotImportThumb';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import { isTypingTarget } from '../PivotLab/PivotManualImportModal';
import { curationPublicEventUrl } from './curationPublicEventUrl';
import { dragRangeSelection, nextSelection, reconcileCatalogAnchor, sameIdSet } from './curationQueueSelection';
import useCurationImmersiveScroll from './useCurationImmersiveScroll';
import { eventMatchesCatalogSearch } from './curationCatalogFilters';
import { locationReviewBlock, locationReviewHref, coverImageBlock, eventPublishBlock, publishReviewBlock } from './curationPublishFeedback';
import PivotCurationPortalPopup from './PivotCurationPortalPopup';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import './PivotCurationQueue.scss';

const HOST_CREATED_SOURCE = 'justgo';
const DRAG_SELECT_THRESHOLD_PX = 5;
const CURATION_INSPECT_POPUP_MQ = '(max-width: 720px)';

function useCurationInspectPopup() {
  const [inspectAsPopup, setInspectAsPopup] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(CURATION_INSPECT_POPUP_MQ).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(CURATION_INSPECT_POPUP_MQ);
    const update = () => setInspectAsPopup(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return inspectAsPopup;
}
const EDITORIAL_TIERS = [
  { value: 'hidden', label: 'Hidden', help: 'Exclude from Drop and Explore.' },
  { value: 'demote', label: 'Demote', help: 'Lower its rank; strong relevance can recover.' },
  { value: 'standard', label: 'Standard', help: 'Use normal personalization.' },
  { value: 'promote', label: 'Promote', help: 'Add one interest-match boost.' },
  { value: 'strong_promote', label: 'Strong Promote', help: 'Add one friend-going boost.' },
  { value: 'must_show', label: 'Must Show', help: 'Guarantee a place in every new Drop.' },
];

function editorialTierLabel(event) {
  const tier = event?.rankingOverride?.tier;
  return EDITORIAL_TIERS.find((option) => option.value === tier)?.label || null;
}

function EditorialWeightControl({ event, busy, onSave, hotkeys = false, onCancel }) {
  const saved = event.rankingOverride || {};
  const [tier, setTier] = useState(saved.tier || 'standard');
  const [audience, setAudience] = useState(saved.audience || 'everyone');
  const sliderRef = useRef(null);

  useEffect(() => {
    setTier(saved.tier || 'standard');
    setAudience(saved.audience || 'everyone');
  }, [event._id, saved.audience, saved.tier]);

  const promotion = tier === 'promote' || tier === 'strong_promote';
  const active = EDITORIAL_TIERS.find((option) => option.value === tier);
  const activeIndex = Math.max(0, EDITORIAL_TIERS.findIndex((option) => option.value === tier));
  const savedTier = saved.tier || 'standard';
  const savedAudience = saved.audience || 'everyone';
  const hasChanges = tier !== savedTier || (promotion && audience !== savedAudience);

  const selectTierAt = (index) => {
    const option = EDITORIAL_TIERS[index] || EDITORIAL_TIERS[2];
    setTier(option.value);
    if (option.value !== 'promote' && option.value !== 'strong_promote') {
      setAudience('everyone');
    }
  };

  const commit = useCallback(() => {
    if (busy) return false;
    if (!hasChanges) {
      onCancel?.();
      return false;
    }
    onSave(event, tier === 'standard' ? null : { tier, audience });
    onCancel?.();
    return true;
  }, [audience, busy, event, hasChanges, onCancel, onSave, tier]);

  useEffect(() => {
    if (!hotkeys) return undefined;
    const frame = requestAnimationFrame(() => sliderRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [hotkeys, event._id]);

  useEffect(() => {
    if (!hotkeys) return undefined;
    const onKey = (nativeEvent) => {
      if (nativeEvent.metaKey || nativeEvent.ctrlKey || nativeEvent.altKey) return;
      const key = String(nativeEvent.key || '');
      const lower = key.toLowerCase();
      if (key === 'Escape') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        onCancel?.();
        return;
      }
      if (key === 'Enter') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        commit();
        return;
      }
      if (lower === 'i') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        setAudience((current) => (current === 'matching_interests' ? 'everyone' : 'matching_interests'));
        return;
      }
      if (key === 'ArrowRight' || key === 'ArrowUp' || lower === 'k') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        selectTierAt(Math.min(EDITORIAL_TIERS.length - 1, activeIndex + 1));
        return;
      }
      if (key === 'ArrowLeft' || key === 'ArrowDown' || lower === 'j') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        selectTierAt(Math.max(0, activeIndex - 1));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeIndex, commit, hotkeys, onCancel]);

  return (
    <section
      className={`pivot-curation-editorial${hotkeys ? ' pivot-curation-editorial--hotkeys' : ''}`}
      aria-labelledby={`editorial-${event._id}`}
    >
      <div className="pivot-curation-editorial__slider-card">
        <div className="pivot-curation-editorial__slider-head">
          <div className="pivot-curation-editorial__current">
            <span className="visually-hidden">Editorial weight: </span>
            <h4 id={`editorial-${event._id}`}>{active?.label}</h4>
            <p>{active?.help}</p>
          </div>
          <button
            type="button"
            className="pivot-curation-editorial__reset"
            aria-label="Reset editorial weight to Standard"
            title="Reset to Standard"
            onClick={() => selectTierAt(2)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.7 8.3A8 8 0 1 1 4 14M4.7 8.3V3.8m0 4.5h4.5" />
            </svg>
          </button>
        </div>
        <div
          className="pivot-curation-editorial__slider"
          data-position={activeIndex}
        >
          <div className="pivot-curation-editorial__ticks" aria-hidden="true">
            {EDITORIAL_TIERS.map((option, index) => (
              <span
                key={option.value}
                className={index <= activeIndex ? 'is-reached' : ''}
              />
            ))}
          </div>
          <span className="pivot-curation-editorial__thumb" aria-hidden="true" />
          <input
            ref={sliderRef}
            type="range"
            min="0"
            max={EDITORIAL_TIERS.length - 1}
            step="1"
            value={activeIndex}
            aria-label="Editorial weight"
            aria-valuetext={active?.label}
            onChange={(e) => selectTierAt(Number(e.target.value))}
          />
        </div>
      </div>
      {hotkeys || promotion ? (
        hotkeys ? (
          <div className="pivot-curation-editorial__audience">
            <span>Apply to</span>
            <div className="pivot-curation-editorial__audience-toggle" role="group" aria-label="Promotion audience">
              <button
                type="button"
                aria-pressed={audience === 'everyone'}
                onClick={() => setAudience('everyone')}
              >
                Everyone
              </button>
              <button
                type="button"
                aria-pressed={audience === 'matching_interests'}
                onClick={() => setAudience('matching_interests')}
              >
                Matching interests
              </button>
            </div>
            <span aria-hidden="true"><KeybindTooltip label="Toggle audience" keybind="I" /></span>
          </div>
        ) : (
          <label className="pivot-curation-editorial__field">
            <span>Apply promotion to</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="everyone">Everyone</option>
              <option value="matching_interests">People with matching interests</option>
            </select>
          </label>
        )
      ) : null}
      <div className="pivot-curation-editorial__save-slot">
        {hasChanges ? (
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm pivot-curation-sheet__key-btn"
            disabled={busy}
            onClick={() => commit()}
          >
            {busy ? 'Saving…' : 'Save weight'}
            {busy || !hotkeys ? null : (
              <span aria-hidden="true"><KeybindTooltip label="Save" keybind="↵" /></span>
            )}
          </button>
        ) : null}
      </div>
      <p className="pivot-curation-editorial__foot">
        {hotkeys ? (
          <>
            <kbd>J</kbd><kbd>K</kbd> or <kbd>←</kbd><kbd>→</kbd> slide
            {' · '}
            <kbd>↑</kbd><kbd>↓</kbd> also
            {' · '}
            <kbd>I</kbd> audience · <kbd>↵</kbd> save · <kbd>Esc</kbd> cancel. Opened decks remain unchanged.
          </>
        ) : (
          'Opened decks remain unchanged.'
        )}
      </p>
    </section>
  );
}

function ingestTone(status) {
  if (status === 'published') return 'ok';
  if (status === 'staged') return 'info';
  if (status === 'draft') return 'warn';
  return 'muted';
}

function formatRate(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return null;
  return Math.round(Number(rate) * 100);
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, a, input, label, textarea, select'));
}

function richDataFlag(event) {
  const missing = Array.isArray(event?.missingRichData)
    ? event.missingRichData
    : [!event?.description?.trim() ? 'description' : null, !event?.image ? 'image' : null].filter(Boolean);
  if (!missing.length) return null;
  return `Missing ${missing.map((field) => (field === 'description' ? 'desc' : field)).join(' + ')}`;
}

function CatalogSourceBadge({ source }) {
  if (source === HOST_CREATED_SOURCE) {
    return (
      <span
        className="pivot-lab__pill pivot-tenant-curation__source-pill pivot-tenant-curation__source-pill--justgo"
        title="Submitted via Just Go Creator Console"
      >
        Host-created
      </span>
    );
  }
  if (source === 'partiful') {
    return <span className="pivot-lab__pill pivot-tenant-curation__source-pill">Partiful</span>;
  }
  if (source === 'luma') {
    return <span className="pivot-lab__pill pivot-tenant-curation__source-pill">Luma</span>;
  }
  if (source === 'manual') {
    return (
      <span className="pivot-lab__pill pivot-lab__pill--muted pivot-tenant-curation__source-pill">
        Manual
      </span>
    );
  }
  if (source) {
    return <span className="pivot-lab__pill pivot-tenant-curation__source-pill">{source}</span>;
  }
  return <span className="pivot-lab__pill pivot-lab__pill--muted">—</span>;
}

function eventPerf(event, performanceById) {
  const perf = performanceById?.get(String(event._id));
  if (perf) {
    return {
      reached: perf.reached ?? 0,
      interestRate: perf.interestRate,
      going: perf.registered ?? 0,
      interested: perf.interestedTotal ?? 0,
    };
  }
  const stats = event.intentStats;
  if (!stats) return null;
  const interested = (stats.interested || 0) + (stats.registered || 0);
  const reached = interested + (stats.passed || 0);
  return {
    reached,
    interestRate: reached > 0 ? interested / reached : null,
    going: stats.registered || 0,
    interested,
  };
}

const LAZY_CHUNK = 32;

function InterestMeter({ rate }) {
  const pct = formatRate(rate);
  if (pct == null) {
    return <span className="pivot-curation-sheet__muted">—</span>;
  }
  return (
    <span className="pivot-curation-sheet__meter" title={`${pct}% interest`}>
      <span className="pivot-curation-sheet__meter-track" aria-hidden="true">
        <span
          className="pivot-curation-sheet__meter-fill"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="pivot-curation-sheet__meter-value">{pct}%</span>
    </span>
  );
}

const CatalogRow = React.memo(function CatalogRow({
  event,
  index,
  selected,
  focused,
  showPerformance,
  performanceById,
  imageBroken,
}) {
  const perf = eventPerf(event, performanceById);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const sourceHref = event.externalLink || event.sourceUrl;
  return (
    <tr
      data-event-id={event._id}
      data-index={index}
      className={[
        selected ? 'is-selected' : '',
        focused ? 'is-focused' : '',
        event.outOfReviewRange ? 'is-out-of-range' : '',
        event.ingestStatus === 'published' ? 'is-published' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <td className="pivot-curation-sheet__thumb-col">
        {sourceHref ? (
          <a
            className="pivot-lab__thumb-link"
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            title="Open source listing"
            onPointerDown={(nativeEvent) => nativeEvent.stopPropagation()}
          >
            <PivotImportThumb src={event.image} alt={event.name} broken={imageBroken} />
          </a>
        ) : (
          <PivotImportThumb src={event.image} alt={event.name} broken={imageBroken} />
        )}
      </td>
      <td>
        <span className="pivot-curation-sheet__name">
          {event.name || 'Untitled'}
        </span>
        <div className="pivot-curation-sheet__host">
          {event.organizerName || 'No host'}
        </div>
        {richDataFlag(event) ? (
          <span className="pivot-curation-sheet__rich-flag">{richDataFlag(event)}</span>
        ) : null}
        <div className="pivot-curation-sheet__mobile-when">
          {formatEventWhenWithShowtimes(event)}
        </div>
        {event.featured ? (
          <span
            className="pivot-curation-sheet__featured"
            title="Featured — public landing deck"
          >
            Featured
          </span>
        ) : null}
        {locationReviewBlock(event) ? (
          <span
            className="pivot-curation-sheet__review-flag"
            title={locationReviewBlock(event).detail}
          >
            Location review
          </span>
        ) : null}
        {imageBroken ? (
          <span
            className="pivot-curation-sheet__broken-flag"
            title="This event has an image URL, but the file did not load"
          >
            Broken image
          </span>
        ) : null}
        {editorialTierLabel(event) ? (
          <span
            className={`pivot-curation-sheet__editorial-badge pivot-curation-sheet__editorial-badge--${event.rankingOverride.tier}`}
            title={event.rankingOverride.audience === 'matching_interests'
              ? 'Applies only when an event tag matches the member’s interests'
              : 'Applies to everyone'}
          >
            {editorialTierLabel(event)}
            {event.rankingOverride.audience === 'matching_interests' ? ' · interests' : ''}
          </span>
        ) : null}
      </td>
      <td className="pivot-curation-sheet__when pivot-curation-sheet__desktop-only">
        {formatEventWhenWithShowtimes(event)}
      </td>
      {showPerformance ? (
        <>
          <td className="pivot-curation-sheet__num pivot-curation-sheet__desktop-only">
            {perf ? <PivotOpsAnimateNumber value={perf.reached} /> : '—'}
          </td>
          <td className="pivot-curation-sheet__desktop-only">
            <InterestMeter rate={perf?.interestRate} />
          </td>
        </>
      ) : null}
      <td className="pivot-curation-sheet__desktop-only">
        {tags.length ? (
          <div className="pivot-curation-sheet__tag-list">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="pivot-curation-sheet__tag">
                {tag}
              </span>
            ))}
            {tags.length > 3 ? (
              <span className="pivot-curation-sheet__muted">+{tags.length - 3}</span>
            ) : null}
          </div>
        ) : (
          <span className="pivot-curation-sheet__muted">—</span>
        )}
      </td>
      <td className="pivot-curation-sheet__status-col">
        <PivotOpsStatus tone={ingestTone(event.ingestStatus)}>
          {event.ingestStatus || '—'}
        </PivotOpsStatus>
      </td>
      <td className="pivot-curation-sheet__desktop-only">
        <CatalogSourceBadge source={event.source} />
      </td>
    </tr>
  );
});

function QueueInspector({
  event,
  perf,
  showPerformance,
  onClose,
  onOpenDossier,
  onEdit,
  onPublish,
  onRequestPublish,
  onUnpublish,
  onStage,
  onDraft,
  onDelete,
  onToggleFeatured,
  onEditorialChange,
  busyKey,
  releaseDisabled,
  releaseBlockReason,
  tenantKey,
  batchWeek,
  imageBroken = false,
  layout = 'pane',
  showWeight = true,
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    setMediaFailed(false);
  }, [event?._id, event?.image]);
  if (!event) return null;
  const sourceHref = event.externalLink || event.sourceUrl;
  const publicHref = curationPublicEventUrl(event);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const unpublishing = busyKey === `unrelease-${event._id}`;
  const publishing = busyKey === `release-${event._id}`;
  const deleting = busyKey === `delete-${event._id}`;
  const featuring = busyKey === `feature-${event._id}`;
  const drafting = busyKey === 'bulk-draft' || busyKey === `draft-${event._id}`;
  const editorialSaving = busyKey === `editorial-${event._id}`;
  const reviewBlock = locationReviewBlock(event);
  const reviewHref = locationReviewHref(tenantKey, batchWeek);
  const coverBlock = coverImageBlock(event, { broken: imageBroken || mediaFailed });
  const publishBlocked = Boolean(reviewBlock || coverBlock);
  const coverBroken = imageBroken || mediaFailed;
  const dossier = layout === 'dossier';
  const showCover = Boolean(event.image) && !coverBroken;
  const publishTitle = reviewBlock
    ? `${reviewBlock.title}. Approve the location before publishing.`
    : coverBlock
      ? `${coverBlock.title}. ${coverBlock.detail}`
      : releaseBlockReason || 'Publish this staged event';

  return (
    <aside
      className={`pivot-curation-sheet__inspect pivot-curation-sheet__inspect--${layout}`}
      aria-label={`${event.name} ${dossier ? 'dossier' : 'details'}`}
    >
      <div className="pivot-curation-sheet__inspect-media">
        {showCover ? (
          <img
            src={event.image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <div className="pivot-curation-sheet__inspect-fallback" aria-hidden="true">
            {(event.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="pivot-curation-sheet__inspect-body">
        <div className="pivot-curation-sheet__inspect-head">
          <h3 className="pivot-curation-sheet__inspect-title">{event.name || 'Untitled'}</h3>
          {dossier ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost pivot-curation-sheet__inspect-close"
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm pivot-curation-sheet__key-btn"
              onClick={() => onOpenDossier?.(event)}
            >
              Details
              <span aria-hidden="true"><KeybindTooltip label="Open details" keybind="↵" /></span>
            </button>
          )}
        </div>
        <p className="pivot-curation-sheet__inspect-meta">
          {event.organizerName || 'No host'}
          {event.start_time || event.timeSlots?.length
            ? ` · ${formatEventWhenWithShowtimes(event)}`
            : ''}
        </p>
        {event.location ? (
          <p className="pivot-curation-sheet__inspect-meta">{event.location}</p>
        ) : null}
        {reviewBlock ? (
          <div className="pivot-curation-sheet__review-callout" role="status">
            <strong>{reviewBlock.title}</strong>
            <p>{reviewBlock.detail} Publishing stays blocked until location review is approved.</p>
            {reviewHref ? (
              <a className="pivot-curation-sheet__inspect-link" href={reviewHref}>
                Open location review
              </a>
            ) : null}
          </div>
        ) : null}
        {coverBlock ? (
          <div className="pivot-curation-sheet__review-callout" role="status">
            <strong>{coverBlock.title}</strong>
            <p>{coverBlock.detail}</p>
          </div>
        ) : null}
        <div className="pivot-curation-sheet__inspect-status">
          <PivotOpsStatus tone={ingestTone(event.ingestStatus)}>
            {event.ingestStatus || 'unknown'}
          </PivotOpsStatus>
          <CatalogSourceBadge source={event.source} />
          {event.featured ? (
            <span className="pivot-curation-sheet__featured">Featured</span>
          ) : null}
          {event.outOfReviewRange ? (
            <PivotOpsStatus tone="danger">Out of range</PivotOpsStatus>
          ) : null}
          {richDataFlag(event) ? (
            <span className="pivot-curation-sheet__rich-flag">{richDataFlag(event)}</span>
          ) : null}
          {coverBroken ? (
            <span className="pivot-curation-sheet__broken-flag">Broken image</span>
          ) : null}
        </div>
        {showPerformance && perf ? (
          <dl className="pivot-curation-sheet__inspect-kpis">
            <div>
              <dt>Reached</dt>
              <dd>
                <PivotOpsAnimateNumber value={perf.reached} />
              </dd>
            </div>
            <div>
              <dt>Interest</dt>
              <dd>{formatRate(perf.interestRate) == null ? '—' : `${formatRate(perf.interestRate)}%`}</dd>
            </div>
            <div>
              <dt>Going</dt>
              <dd>
                <PivotOpsAnimateNumber value={perf.going} />
              </dd>
            </div>
          </dl>
        ) : null}
        {tags.length ? (
          <div className="pivot-curation-sheet__tag-list">
            {tags.map((tag) => (
              <span key={tag} className="pivot-curation-sheet__tag">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="pivot-curation-sheet__muted">No tags</p>
        )}
        {event.description ? (
          <p className={`pivot-curation-sheet__inspect-copy${dossier ? ' is-full' : ''}`}>
            {event.description}
          </p>
        ) : (
          <p className="pivot-curation-sheet__muted">No description</p>
        )}
        {Array.isArray(event.timeSlots) && event.timeSlots.length > 1 ? (
          <ul className="pivot-curation-sheet__showtimes" aria-label="Showtimes">
            {event.timeSlots.map((slot) => (
              <li key={slot.id || slot.start_time}>{formatEventWhen(slot.start_time)}</li>
            ))}
          </ul>
        ) : null}
        {showWeight ? (
          <EditorialWeightControl
            event={event}
            busy={editorialSaving}
            onSave={onEditorialChange}
          />
        ) : null}
        <div className="pivot-curation-sheet__inspect-links">
          {publicHref ? (
            <a
              className="pivot-curation-sheet__inspect-link"
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open public page ↗
            </a>
          ) : null}
          {sourceHref ? (
            <a
              className="pivot-curation-sheet__inspect-link pivot-curation-sheet__inspect-link--secondary"
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source listing ↗
            </a>
          ) : null}
        </div>
        <div className="pivot-curation-sheet__inspect-actions">
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={() => onEdit(event)}
          >
            Edit
          </button>
          {event.ingestStatus === 'draft' ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary pivot-curation-sheet__key-btn"
              onClick={() => onStage?.(event)}
            >
              Stage
              <span aria-hidden="true"><KeybindTooltip label="Stage" keybind="S" /></span>
            </button>
          ) : null}
          {event.ingestStatus === 'staged' ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary pivot-curation-sheet__key-btn"
              onClick={() => (onRequestPublish || onPublish)?.(event)}
              disabled={releaseDisabled || publishing || publishBlocked}
              title={publishTitle}
            >
              {publishing ? 'Publishing…' : 'Publish'}
              {publishing ? null : (
                <span aria-hidden="true"><KeybindTooltip label="Publish" keybind="P" /></span>
              )}
            </button>
          ) : null}
          {event.ingestStatus === 'published' ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary pivot-curation-sheet__key-btn"
              onClick={() => onUnpublish(event)}
              disabled={unpublishing}
              title="Pull this event out of the live feed"
            >
              {unpublishing ? 'Unpublishing…' : 'Unpublish'}
              {unpublishing ? null : (
                <span aria-hidden="true"><KeybindTooltip label="Unpublish" keybind="U" /></span>
              )}
            </button>
          ) : null}
          {event.ingestStatus && event.ingestStatus !== 'draft' ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost pivot-curation-sheet__key-btn"
              onClick={() => onDraft?.(event)}
              disabled={drafting}
              title="Move this event back to draft"
            >
              {drafting ? 'Drafting…' : 'Draft'}
              {drafting ? null : (
                <span aria-hidden="true"><KeybindTooltip label="Draft" keybind="D" /></span>
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={() => onToggleFeatured(event)}
            disabled={featuring}
            title={
              event.featured
                ? 'Remove from the Just Go landing deck'
                : 'Mark as featured for the public landing deck'
            }
          >
            {featuring
              ? event.featured
                ? 'Removing…'
                : 'Featuring…'
              : event.featured
                ? 'Unfeature'
                : 'Feature'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--ghost pivot-tenant-curation__delete-btn"
            onClick={() => onDelete(event)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </aside>
  );
}

function PublishConfirmCard({ events, onConfirm, onCancel, busy, brokenImageIds }) {
  const rows = events.map((event) => ({
    event,
    block: publishReviewBlock(event, { brokenImageIds }),
  }));
  const ready = rows.filter((row) => !row.block).map((row) => row.event);
  const blockedCount = rows.length - ready.length;
  const canPublish = ready.length > 0;
  const single = ready.length === 1;
  const extra = Math.max(0, events.length - 6);
  return (
    <div className="pivot-curation-publish-confirm">
      <h3 className="pivot-curation-publish-confirm__title">
        {!canPublish
          ? events.length === 1
            ? 'This event is not ready'
            : 'These events are not ready'
          : single
            ? 'Publish this event?'
            : `Publish ${ready.length} event${ready.length === 1 ? '' : 's'}?`}
      </h3>
      <p className="pivot-curation-publish-confirm__lede">
        {!canPublish
          ? 'Events need tags and rich data (plus a working cover and a clear location) before they can go live from review.'
          : blockedCount
            ? `${ready.length} can go live. ${blockedCount} stay unpublished until tags and rich data are filled in.`
            : single
              ? 'It will appear in the live feed for this week.'
              : 'They will appear in the live feed for this week.'}
      </p>
      <ul className="pivot-curation-publish-confirm__list">
        {rows.slice(0, 6).map(({ event, block }) => (
          <li
            key={event._id}
            className={`pivot-curation-publish-confirm__row${block ? ' is-blocked' : ''}`}
          >
            <PivotImportThumb src={event.image} alt={event.name} />
            <div>
              <strong>{event.name || 'Untitled'}</strong>
              <span>
                {block
                  ? block.title
                  : [event.organizerName, formatEventWhenWithShowtimes(event), event.location]
                    .filter(Boolean)
                    .join(' · ') || 'No time or place'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {extra ? (
        <p className="pivot-curation-publish-confirm__more">+{extra} more</p>
      ) : null}
      <div className="pivot-curation-publish-confirm__actions">
        <button type="button" className="linear-btn linear-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="linear-btn linear-btn--primary pivot-curation-sheet__key-btn"
          onClick={() => onConfirm(ready)}
          disabled={busy || !canPublish}
        >
          {busy ? 'Publishing…' : 'Publish'}
          {busy || !canPublish ? null : (
            <span aria-hidden="true"><KeybindTooltip label="Skip next time" keybind="⌘P" /></span>
          )}
        </button>
      </div>
      <p className="pivot-curation-publish-confirm__hint">
        {canPublish
          ? (
            <>
              <kbd>Enter</kbd> or <kbd>P</kbd> to publish · <kbd>Esc</kbd> to cancel · <kbd>⌘P</kbd> skips this
            </>
          )
          : (
            <>
              Add tags and rich data first · <kbd>Esc</kbd> to close
            </>
          )}
      </p>
    </div>
  );
}

function WeightPopupCard({ event, busy, onSave, onCancel }) {
  return (
    <div className="pivot-curation-weight-popup__card">
      <h3 className="pivot-curation-weight-popup__title">{event.name || 'Untitled'}</h3>
      <p className="pivot-curation-weight-popup__lede">Set how strongly this event is ranked in new decks.</p>
      <EditorialWeightControl
        event={event}
        busy={busy}
        onSave={onSave}
        hotkeys
        onCancel={onCancel}
      />
    </div>
  );
}

function PivotCurationQueue({
  tenantKey,
  batchWeek,
  events: catalogEvents,
  eventsLoading,
  eventsError,
  selectedIds,
  onSelectedIdsChange,
  filter,
  onFilterChange,
  filterOptions,
  sourceFilter,
  onSourceFilterChange,
  hostCreatedCount,
  catalogTags,
  bulkTags,
  onBulkTagsChange,
  showPerformance,
  performanceById,
  busyKey,
  releaseDisabled,
  releaseBlockReason,
  onEdit,
  onPublish,
  onUnpublish,
  onStage,
  onDraft,
  onDelete,
  onBulkStage,
  onBulkDraft,
  onBulkPublish,
  onBulkUnpublish,
  onBulkApplyTags,
  onBulkSuggestTags,
  onBulkEnrichRichData,
  onBulkCollapseShowtimes,
  onBulkFeature,
  onBulkUnfeature,
  onToggleFeatured,
  onEditorialChange,
  onBulkEditorial,
  selectionPolicy,
  onSelectionPolicyChange,
  emptyLabel,
  brokenImageIds,
  scanningBrokenImages = false,
}) {
  const sheetRef = useRef(null);
  const scrollerRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastIndexRef = useRef(0);
  const prevEventsRef = useRef([]);
  const focusIdRef = useRef(null);
  const dragRef = useRef(null);
  const layoutRef = useRef(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [anchorActive, setAnchorActive] = useState(true);
  const [dossierEventId, setDossierEventId] = useState(null);
  const [publishConfirmEvents, setPublishConfirmEvents] = useState(null);
  const [weightEventId, setWeightEventId] = useState(null);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LAZY_CHUNK);
  const [query, setQuery] = useState('');
  const inspectAsPopup = useCurationInspectPopup();
  const events = useMemo(
    () => catalogEvents.filter((event) => eventMatchesCatalogSearch(event, query)),
    [catalogEvents, query],
  );
  const eventsIdentity = `${query}:${events.length}:${events[0]?._id ?? ''}:${events[events.length - 1]?._id ?? ''}`;
  const { frameRef, slotRef, slotHeight, immersive, expanded, collapse } = useCurationImmersiveScroll({
    enabled: catalogEvents.length > 0,
    scrollerRef,
  });
  const [chromeFullscreen, setChromeFullscreen] = useState(false);
  const [chromeSlotHeight, setChromeSlotHeight] = useState(0);

  const exitChromeFullscreen = useCallback(() => {
    setChromeFullscreen(false);
    document.documentElement.classList.remove('is-curation-chrome-fullscreen');
  }, []);

  const enterChromeFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (frame && !immersive) {
      setChromeSlotHeight(frame.offsetHeight);
    }
    setChromeFullscreen(true);
    document.documentElement.classList.add('is-curation-chrome-fullscreen');
  }, [frameRef, immersive]);

  useEffect(() => () => {
    document.documentElement.classList.remove('is-curation-chrome-fullscreen');
  }, []);

  const focusedEvent = events[focusIndex] || null;
  const paneEvent = !inspectAsPopup && anchorActive && focusedEvent ? focusedEvent : null;
  const dossierEvent = useMemo(
    () => catalogEvents.find((event) => String(event._id) === String(dossierEventId)) || null,
    [catalogEvents, dossierEventId],
  );
  const weightEvent = useMemo(
    () => catalogEvents.find((event) => String(event._id) === String(weightEventId)) || null,
    [catalogEvents, weightEventId],
  );

  useEffect(() => {
    if (dossierEventId && !dossierEvent) setDossierEventId(null);
  }, [dossierEventId, dossierEvent]);

  useEffect(() => {
    if (weightEventId && !weightEvent) setWeightEventId(null);
  }, [weightEventId, weightEvent]);

  const executePublish = useCallback((staged) => {
    if (!staged?.length) return Promise.resolve(false);
    setPublishConfirmEvents(null);
    return Promise.resolve(
      staged.length === 1
        ? onPublish?.(staged[0], { skipConfirm: true })
        : onBulkPublish?.({ skipConfirm: true, events: staged }),
    );
  }, [onBulkPublish, onPublish]);

  const requestPublishReview = useCallback((staged) => {
    if (!staged?.length) return;
    setPublishConfirmEvents(staged);
  }, []);

  useEffect(() => {
    setVisibleCount(Math.min(LAZY_CHUNK, events.length || LAZY_CHUNK));
  }, [eventsIdentity, events.length]);

  useLayoutEffect(() => {
    const prevEvents = prevEventsRef.current;
    const focusId = focusIdRef.current ?? events[focusIndex]?._id ?? null;
    const next = reconcileCatalogAnchor({
      prevEvents,
      nextEvents: events,
      focusId,
      selectedIds,
      anchorActive,
    });
    prevEventsRef.current = events;
    focusIdRef.current = next.focusId;
    if (next.focusIndex !== focusIndex) setFocusIndex(next.focusIndex);
    if (anchorActive && !sameIdSet(selectedIds, next.selectedIds)) {
      onSelectedIdsChange(next.selectedIds);
    }
  }, [anchorActive, events, focusIndex, onSelectedIdsChange, selectedIds]);

  const revealThrough = useCallback((index) => {
    if (!Number.isInteger(index) || index < 0) return;
    setVisibleCount((current) => {
      const needed = index + 1;
      if (needed <= current) return current;
      return Math.min(events.length, Math.ceil(needed / LAZY_CHUNK) * LAZY_CHUNK);
    });
  }, [events.length]);

  useEffect(() => {
    revealThrough(focusIndex);
  }, [focusIndex, revealThrough]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (!scroller || !sentinel || visibleCount >= events.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(events.length, current + LAZY_CHUNK));
      },
      { root: scroller, rootMargin: '280px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [events.length, visibleCount, expanded]);

  useLayoutEffect(() => {
    const focused = events[focusIndex];
    const scroller = scrollerRef.current;
    if (!focused || !scroller) return;
    const row = sheetRef.current?.querySelector(`[data-event-id="${focused._id}"]`);
    if (!row) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < scrollerRect.top) {
      scroller.scrollTop -= scrollerRect.top - rowRect.top;
    } else if (rowRect.bottom > scrollerRect.bottom) {
      scroller.scrollTop += rowRect.bottom - scrollerRect.bottom;
    }
  }, [events, focusIndex, visibleCount]);

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event._id)),
    [events, selectedIds],
  );
  const selectedDraftCount = selectedEvents.filter((e) => e.ingestStatus === 'draft').length;
  const selectedStagedCount = selectedEvents.filter((e) => e.ingestStatus === 'staged').length;
  const selectedStagedEligibleCount = selectedEvents.filter(
    (event) => event.ingestStatus === 'staged'
      && !eventPublishBlock(event, { brokenImageIds }),
  ).length;
  const selectedPublishedCount = selectedEvents.filter((e) => e.ingestStatus === 'published').length;
  const selectedUnfeaturedCount = selectedEvents.filter((e) => e.featured !== true).length;
  const selectedFeaturedCount = selectedEvents.filter((e) => e.featured === true).length;
  const selectedMissingRichCount = selectedEvents.filter((e) => e.needsRichData).length;
  const [bulkEditorialTier, setBulkEditorialTier] = useState('standard');
  const editorialCounts = useMemo(() => {
    const counts = { hidden: 0, demote: 0, promote: 0, strong_promote: 0, must_show: 0 };
    events.forEach((event) => {
      const tier = event?.rankingOverride?.tier;
      if (Object.prototype.hasOwnProperty.call(counts, tier)) counts[tier] += 1;
    });
    return counts;
  }, [events]);
  const editorialSummary = [
    editorialCounts.must_show ? `${editorialCounts.must_show} must show` : null,
    editorialCounts.strong_promote ? `${editorialCounts.strong_promote} strong` : null,
    editorialCounts.promote ? `${editorialCounts.promote} promoted` : null,
    editorialCounts.demote ? `${editorialCounts.demote} demoted` : null,
    editorialCounts.hidden ? `${editorialCounts.hidden} hidden` : null,
  ].filter(Boolean).join(' · ');

  const previewAt = useCallback((event, index, nextIds) => {
    setAnchorActive(true);
    if (typeof index === 'number') {
      lastIndexRef.current = index;
      setFocusIndex(index);
    }
    if (event?._id != null) focusIdRef.current = event._id;
    if (nextIds) onSelectedIdsChange(nextIds);
  }, [onSelectedIdsChange]);

  const selectAt = useCallback(
    (event, index, nativeEvent, { toggle = false } = {}) => {
      const additive = toggle || nativeEvent.metaKey || nativeEvent.ctrlKey;
      const range = nativeEvent.shiftKey;
      const nextIds = nextSelection(selectedIds, {
        id: event._id,
        index,
        events,
        additive,
        rangeFrom: range ? lastIndexRef.current : null,
      });
      if (!range) lastIndexRef.current = index;
      setAnchorActive(true);
      setFocusIndex(index);
      if (event?._id != null) focusIdRef.current = event._id;
      onSelectedIdsChange(nextIds);
    },
    [events, onSelectedIdsChange, selectedIds],
  );

  const rowIndexFromPoint = useCallback((clientX, clientY) => {
    const node = document.elementFromPoint(clientX, clientY);
    const row = node?.closest?.('tr[data-index]');
    if (!row) return null;
    const index = Number(row.getAttribute('data-index'));
    return Number.isInteger(index) ? index : null;
  }, []);

  const autoScroll = useCallback((clientY) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const edge = 40;
    if (clientY < rect.top + edge) {
      scroller.scrollTop -= 18;
    } else if (clientY > rect.bottom - edge) {
      scroller.scrollTop += 18;
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8) {
        setVisibleCount((current) => Math.min(events.length, current + LAZY_CHUNK));
      }
    }
  }, [events.length]);

  const applyDragRange = useCallback(
    (fromIndex, toIndex, additive, baseSelection) => {
      onSelectedIdsChange(
        dragRangeSelection(
          events,
          fromIndex,
          toIndex,
          additive ? baseSelection : null,
        ),
      );
      setAnchorActive(true);
      setFocusIndex(toIndex);
    },
    [events, onSelectedIdsChange],
  );

  const endDrag = useCallback((pointerId) => {
    const drag = dragRef.current;
    if (!drag || (pointerId != null && drag.pointerId !== pointerId)) return;
    dragRef.current = null;
    setDragSelecting(false);
  }, []);

  const dismissAnchor = useCallback(() => {
    setAnchorActive(false);
    if (selectedIds.size) onSelectedIdsChange(new Set());
    setDossierEventId(null);
  }, [onSelectedIdsChange, selectedIds]);

  const handlePanePointerDown = useCallback(
    (nativeEvent) => {
      if (nativeEvent.button != null && nativeEvent.button !== 0) return;
      if (isInteractiveTarget(nativeEvent.target)) return;
      const row = nativeEvent.target.closest?.('tr[data-index]');
      if (!row) {
        dismissAnchor();
        return;
      }
      const index = Number(row.getAttribute('data-index'));
      const event = events[index];
      if (!event || !Number.isInteger(index)) return;

      if (nativeEvent.pointerType === 'touch') {
        dragRef.current = {
          pointerId: nativeEvent.pointerId,
          touch: true,
          cancelled: false,
          event,
          index,
          startX: nativeEvent.clientX,
          startY: nativeEvent.clientY,
        };
        return;
      }

      nativeEvent.preventDefault();
      nativeEvent.currentTarget.setPointerCapture?.(nativeEvent.pointerId);
      nativeEvent.currentTarget.focus?.({ preventScroll: true });

      if (nativeEvent.shiftKey) {
        selectAt(event, index, nativeEvent);
        return;
      }

      const additive = nativeEvent.metaKey || nativeEvent.ctrlKey;
      dragRef.current = {
        pointerId: nativeEvent.pointerId,
        startIndex: index,
        event,
        dragging: false,
        additive,
        startX: nativeEvent.clientX,
        startY: nativeEvent.clientY,
        baseSelection: new Set(selectedIds),
      };

      if (additive) {
        selectAt(event, index, nativeEvent, { toggle: true });
      } else {
        previewAt(event, index, new Set([event._id]));
      }
    },
    [dismissAnchor, events, previewAt, selectAt, selectedIds],
  );

  const handlePanePointerMove = useCallback(
    (nativeEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== nativeEvent.pointerId) return;

      const dx = nativeEvent.clientX - drag.startX;
      const dy = nativeEvent.clientY - drag.startY;
      if (drag.touch) {
        if (dx * dx + dy * dy >= DRAG_SELECT_THRESHOLD_PX ** 2) drag.cancelled = true;
        return;
      }
      if (!drag.dragging && dx * dx + dy * dy < DRAG_SELECT_THRESHOLD_PX ** 2) {
        return;
      }

      if (!drag.dragging) {
        drag.dragging = true;
        setDragSelecting(true);
      }

      autoScroll(nativeEvent.clientY);
      const index = rowIndexFromPoint(nativeEvent.clientX, nativeEvent.clientY);
      if (index == null) return;
      applyDragRange(drag.startIndex, index, drag.additive, drag.baseSelection);
    },
    [applyDragRange, autoScroll, rowIndexFromPoint],
  );

  const handlePanePointerUp = useCallback(
    (nativeEvent) => {
      const drag = dragRef.current;
      if (nativeEvent.type === 'pointerup' && drag?.pointerId === nativeEvent.pointerId) {
        if (drag.touch && !drag.cancelled) {
          previewAt(drag.event, drag.index, new Set([drag.event._id]));
          if (inspectAsPopup) setDossierEventId(drag.event._id);
        }
      }
      endDrag(nativeEvent.pointerId);
    },
    [endDrag, inspectAsPopup, previewAt],
  );

  const handleKeyDown = useCallback(
    (nativeEvent) => {
      if (isTypingTarget(nativeEvent.target)) return;
      if (nativeEvent.altKey) return;

      const moveFocus = (delta, { extend = false } = {}) => {
        if (!events.length) return;
        nativeEvent.preventDefault();
        if (!anchorActive) {
          const focused = events[focusIndex] || events[0];
          if (!focused) return;
          const index = events[focusIndex] ? focusIndex : 0;
          if (extend) selectAt(focused, index, nativeEvent);
          else previewAt(focused, index, new Set([focused._id]));
          return;
        }
        const nextIndex = Math.max(0, Math.min(events.length - 1, focusIndex + delta));
        const focused = events[nextIndex];
        if (!focused) return;
        if (extend) selectAt(focused, nextIndex, nativeEvent);
        else previewAt(focused, nextIndex, new Set([focused._id]));
      };

      const actionTargets = () => {
        if (selectedIds.size > 0) {
          return events.filter((event) => selectedIds.has(event._id));
        }
        const focused = events[focusIndex];
        return focused ? [focused] : [];
      };

      const holdTargets = (targets) => {
        setAnchorActive(true);
        if (!targets?.length) return;
        if (selectedIds.size > 0) return;
        onSelectedIdsChange(new Set(targets.map((event) => event._id)));
        if (targets[0]?._id != null) focusIdRef.current = targets[0]._id;
      };

      const key = String(nativeEvent.key || '').toLowerCase();
      const withMeta = nativeEvent.metaKey || nativeEvent.ctrlKey;

      if (weightEventId) return;

      if (publishConfirmEvents?.length) {
        if (nativeEvent.key === 'Escape') {
          nativeEvent.preventDefault();
          setPublishConfirmEvents(null);
          return;
        }
        if (nativeEvent.key === 'Enter' || key === 'p') {
          nativeEvent.preventDefault();
          const ready = publishConfirmEvents.filter(
            (event) => !publishReviewBlock(event, { brokenImageIds }),
          );
          if (!ready.length) return;
          Promise.resolve(executePublish(ready)).then((ok) => {
            if (ok) holdTargets(ready);
          });
          return;
        }
        nativeEvent.preventDefault();
        return;
      }

      if (nativeEvent.key === 'Escape') {
        nativeEvent.preventDefault();
        if (dossierEventId) {
          setDossierEventId(null);
          return;
        }
        if (chromeFullscreen) {
          exitChromeFullscreen();
          return;
        }
        if (immersive) {
          collapse();
        }
        return;
      }

      if (withMeta && key === 'a') {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        window.getSelection?.()?.removeAllRanges?.();
        if (events.length) {
          setAnchorActive(true);
          onSelectedIdsChange(new Set(events.map((event) => event._id)));
        }
        return;
      }

      if (!events.length) return;

      if (withMeta && key === 'p') {
        nativeEvent.preventDefault();
        if (busyKey) return;
        const staged = actionTargets().filter((event) => event.ingestStatus === 'staged');
        if (!staged.length) return;
        Promise.resolve(executePublish(staged)).then((ok) => {
          if (ok) holdTargets(staged);
        });
        return;
      }

      if (withMeta) return;

      if (nativeEvent.key === 'Enter') {
        const focused = events[focusIndex];
        if (!focused) return;
        nativeEvent.preventDefault();
        previewAt(focused, focusIndex, new Set([focused._id]));
        setDossierEventId(focused._id);
        return;
      }

      if (nativeEvent.key === ' ' || nativeEvent.key === 'Spacebar') {
        const focused = events[focusIndex];
        if (!focused) return;
        nativeEvent.preventDefault();
        selectAt(focused, focusIndex, nativeEvent, { toggle: true });
        return;
      }

      if (nativeEvent.key === 'ArrowDown' || nativeEvent.key === 'k' || nativeEvent.key === 'K') {
        moveFocus(1, { extend: nativeEvent.shiftKey });
        return;
      }

      if (nativeEvent.key === 'ArrowUp' || nativeEvent.key === 'i' || nativeEvent.key === 'I') {
        moveFocus(-1, { extend: nativeEvent.shiftKey });
        return;
      }

      if (busyKey || !['s', 'p', 'u', 'd', 'w'].includes(key)) return;

      const targets = actionTargets();
      if (!targets.length) return;
      nativeEvent.preventDefault();

      if (key === 'w') {
        setWeightEventId(targets[0]._id);
        holdTargets(targets);
        return;
      }

      if (key === 's') {
        const drafts = targets.filter((event) => event.ingestStatus === 'draft');
        if (!drafts.length) return;
        Promise.resolve(
          drafts.length === 1
            ? onStage?.(drafts[0])
            : onBulkStage?.({ events: drafts }),
        ).then((ok) => {
          if (ok) holdTargets(drafts);
        });
        return;
      }

      if (key === 'p') {
        const staged = targets.filter((event) => event.ingestStatus === 'staged');
        if (!staged.length) return;
        requestPublishReview(staged);
        holdTargets(staged);
        return;
      }

      if (key === 'u') {
        const published = targets.filter((event) => event.ingestStatus === 'published');
        if (!published.length) return;
        Promise.resolve(
          published.length === 1
            ? onUnpublish?.(published[0], { skipConfirm: true })
            : onBulkUnpublish?.({ skipConfirm: true, events: published }),
        ).then((ok) => {
          if (ok) holdTargets(published);
        });
        return;
      }

      if (key === 'd') {
        const toDraft = targets.filter((event) => event.ingestStatus && event.ingestStatus !== 'draft');
        if (!toDraft.length) return;
        Promise.resolve(
          toDraft.length === 1
            ? onDraft?.(toDraft[0])
            : onBulkDraft?.({ events: toDraft }),
        ).then((ok) => {
          if (ok) holdTargets(toDraft);
        });
      }
    },
    [
      anchorActive,
      busyKey,
      chromeFullscreen,
      collapse,
      events,
      executePublish,
      exitChromeFullscreen,
      focusIndex,
      immersive,
      dossierEventId,
      onBulkStage,
      onBulkDraft,
      onBulkUnpublish,
      onDraft,
      onSelectedIdsChange,
      onStage,
      onUnpublish,
      previewAt,
      publishConfirmEvents,
      requestPublishReview,
      selectAt,
      selectedIds,
      weightEventId,
      brokenImageIds,
    ],
  );

  useEffect(() => {
    const onWindowKeyDown = (nativeEvent) => {
      if (nativeEvent.defaultPrevented) return;
      if (isTypingTarget(nativeEvent.target)) return;
      const key = String(nativeEvent.key || '');
      if (weightEventId) return;
      if (publishConfirmEvents?.length) {
        handleKeyDown(nativeEvent);
        return;
      }
      if (key === 'Enter' || (key === 'Escape' && (dossierEventId || chromeFullscreen))) {
        handleKeyDown(nativeEvent);
        return;
      }
      if (!['i', 'I', 'k', 'K', 's', 'S', 'p', 'P', 'u', 'U', 'd', 'D', 'w', 'W'].includes(key)) return;
      handleKeyDown(nativeEvent);
    };
    const onCaptureMeta = (nativeEvent) => {
      if (isTypingTarget(nativeEvent.target)) return;
      const key = String(nativeEvent.key || '').toLowerCase();
      if (!(nativeEvent.metaKey || nativeEvent.ctrlKey) || (key !== 'p' && key !== 'a')) return;
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      handleKeyDown(nativeEvent);
    };
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('keydown', onCaptureMeta, true);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('keydown', onCaptureMeta, true);
    };
  }, [chromeFullscreen, dossierEventId, handleKeyDown, publishConfirmEvents, weightEventId]);

  useEffect(() => {
    const onPointerDown = (nativeEvent) => {
      if (nativeEvent.button != null && nativeEvent.button !== 0) return;
      const target = nativeEvent.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-curation-anchor], .popup-overlay')) return;
      dismissAnchor();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [dismissAnchor]);

  const filterActions = (
    <div className="pivot-curation-sheet__filters">
      {filterOptions.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`pivot-curation-sheet__chip${
            filter === opt.value ? ' pivot-curation-sheet__chip--active' : ''
          }`}
          aria-pressed={filter === opt.value}
          aria-busy={opt.value === 'broken-image' ? scanningBrokenImages : undefined}
          title={
            opt.value === 'broken-image'
              ? scanningBrokenImages
                ? 'Checking cover URLs that have a link but may not load'
                : 'Events whose cover URL did not load'
              : undefined
          }
          onClick={() => onFilterChange(opt.value)}
        >
          {opt.label}
          {opt.value === 'broken-image' && brokenImageIds?.size ? (
            <span className="pivot-curation-sheet__chip-count">{brokenImageIds.size}</span>
          ) : null}
        </button>
      ))}
      <button
        type="button"
        className={`pivot-curation-sheet__chip${
          sourceFilter === HOST_CREATED_SOURCE ? ' pivot-curation-sheet__chip--active' : ''
        }`}
        aria-pressed={sourceFilter === HOST_CREATED_SOURCE}
        onClick={() =>
          onSourceFilterChange(
            sourceFilter === HOST_CREATED_SOURCE ? 'all' : HOST_CREATED_SOURCE,
          )
        }
        title="Show only listings submitted via Just Go Creator"
      >
        Host-created
        {hostCreatedCount > 0 ? (
          <span className="pivot-curation-sheet__chip-count">{hostCreatedCount}</span>
        ) : null}
      </button>
    </div>
  );

  const renderInspector = (event, layout) => (
    <QueueInspector
      layout={layout}
      event={event}
      perf={eventPerf(event, performanceById)}
      showPerformance={showPerformance}
      onClose={() => setDossierEventId(null)}
      onOpenDossier={(next) => setDossierEventId(next._id)}
      onEdit={onEdit}
      onPublish={onPublish}
      onRequestPublish={(next) => requestPublishReview([next])}
      onUnpublish={onUnpublish}
      onStage={onStage}
      onDraft={onDraft}
      onDelete={onDelete}
      onToggleFeatured={onToggleFeatured}
      onEditorialChange={onEditorialChange}
      busyKey={busyKey}
      releaseDisabled={releaseDisabled}
      releaseBlockReason={releaseBlockReason}
      tenantKey={tenantKey}
      batchWeek={batchWeek}
      imageBroken={brokenImageIds?.has(String(event._id))}
      showWeight={layout === 'dossier' || !weightEvent}
    />
  );

  return (
    <div className="pivot-curation-host">
      <div
        ref={slotRef}
        className="pivot-curation-frame__slot"
        hidden={!immersive && !chromeFullscreen}
        aria-hidden="true"
        style={
          immersive
            ? { height: slotHeight }
            : chromeFullscreen
              ? { height: chromeSlotHeight }
              : undefined
        }
      />
      <div
        ref={frameRef}
        className={`pivot-curation-frame${immersive ? ' is-immersive' : ''}${
          expanded ? ' is-expanded' : ''
        }${chromeFullscreen ? ' is-chrome-fullscreen' : ''}`}
      >
        <PivotOpsSection
          title={`Catalog · ${batchWeek}`}
          titleId="curation-queue"
          description={
            immersive
              ? 'Scroll the list. Scroll up past the top to return, or use Fullscreen to hide the dashboard.'
              : showPerformance
                ? 'The side panel follows the focused row. Press Enter for a closer look. Click and drag to select several. Interest % updates as the live batch gets swipes.'
                : 'The side panel follows the focused row. Press Enter for a closer look. Click and drag to select several. Unpublished rows still need staging or location review before they can go live.'
          }
          actions={filterActions}
          className={`pivot-curation-sheet${immersive ? ' is-immersive' : ''}`}
          bodyClassName="pivot-curation-sheet__body"
        >
      <div className="pivot-curation-selection-policy">
        <div>
          <strong>
            {selectionPolicy?.mode === 'editorial' ? 'Exact editorial set' : 'Personalized selection'}
          </strong>
          <span>
            {selectionPolicy?.mode === 'editorial'
              ? `${selectionPolicy.eventIds?.length || 0} chosen events; order remains personalized.`
              : editorialSummary || 'Editorial weights shape new decks; Must Show guarantees membership.'}
          </span>
        </div>
        <div className="pivot-curation-selection-policy__actions">
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            disabled={busyKey === 'selection-policy' || selectedPublishedCount === 0}
            onClick={() => onSelectionPolicyChange('editorial', selectedEvents
              .filter((event) => event.ingestStatus === 'published')
              .map((event) => event._id))}
            title={selectedPublishedCount ? 'Use selected published events as the complete Drop' : 'Select published events first'}
          >
            Use selection as exact set
          </button>
          {selectionPolicy?.mode === 'editorial' ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm"
              disabled={busyKey === 'selection-policy'}
              onClick={() => onSelectionPolicyChange('personalized', [])}
            >
              Return to personalized
            </button>
          ) : null}
        </div>
      </div>
      <div className="pivot-curation-sheet__toolbar">
        <label className="pivot-curation-sheet__search">
          <span className="visually-hidden">Search catalog</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events, hosts, locations…"
            autoComplete="off"
            spellCheck="false"
          />
        </label>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm pivot-curation-sheet__fullscreen"
          onClick={() => (chromeFullscreen ? exitChromeFullscreen() : enterChromeFullscreen())}
          disabled={!catalogEvents.length}
          title={
            chromeFullscreen
              ? 'Exit fullscreen (Esc)'
              : 'Open the catalog over the whole window, hiding the dashboard'
          }
        >
          {chromeFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <p className="pivot-curation-sheet__keys">
          <span><kbd>I</kbd> up <kbd>K</kbd> down</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> also</span>
          <span><kbd>S</kbd> stage</span>
          <span><kbd>D</kbd> draft</span>
          <span><kbd>P</kbd> review</span>
          <span><kbd>⌘P</kbd> publish</span>
          <span><kbd>⌘A</kbd> select all</span>
          <span><kbd>W</kbd> weight</span>
          <span><kbd>U</kbd> unpublish</span>
          <span><kbd>↵</kbd> details</span>
        </p>
      </div>
      <div
        ref={layoutRef}
        data-curation-anchor
        className={`pivot-curation-sheet__layout${
          paneEvent ? ' pivot-curation-sheet__layout--split' : ''
        }`}
      >
        <div
          ref={sheetRef}
          className={`pivot-curation-sheet__pane${
            dragSelecting ? ' pivot-curation-sheet__pane--drag' : ''
          }`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePanePointerDown}
          onPointerMove={handlePanePointerMove}
          onPointerUp={handlePanePointerUp}
          onPointerCancel={handlePanePointerUp}
          onLostPointerCapture={handlePanePointerUp}
          role="grid"
          aria-label="Curation catalog"
        >
          {eventsError ? <p className="pivot-lab__error">{eventsError}</p> : null}
          {eventsLoading ? (
            <p className="pivot-lab__empty">Loading catalog…</p>
          ) : events.length ? (
            <div className="pivot-curation-sheet__scroller" ref={scrollerRef}>
              <table className="pivot-curation-sheet__table" onDragStart={(e) => e.preventDefault()}>
                <thead>
                  <tr>
                    <th scope="col" className="pivot-curation-sheet__thumb-col">
                      <span className="visually-hidden">Image</span>
                    </th>
                    <th scope="col">Event</th>
                    <th scope="col" className="pivot-curation-sheet__desktop-only">When</th>
                    {showPerformance ? (
                      <>
                        <th scope="col" className="pivot-curation-sheet__num pivot-curation-sheet__desktop-only">
                          Reached
                        </th>
                        <th scope="col" className="pivot-curation-sheet__desktop-only">Interest</th>
                      </>
                    ) : null}
                    <th scope="col" className="pivot-curation-sheet__desktop-only">Tags</th>
                    <th scope="col" className="pivot-curation-sheet__status-col">Status</th>
                    <th scope="col" className="pivot-curation-sheet__desktop-only">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, visibleCount).map((event, index) => (
                    <CatalogRow
                      key={event._id}
                      event={event}
                      index={index}
                      selected={selectedIds.has(event._id)}
                      focused={anchorActive && index === focusIndex}
                      showPerformance={showPerformance}
                      performanceById={performanceById}
                      imageBroken={brokenImageIds?.has(String(event._id))}
                    />
                  ))}
                </tbody>
              </table>
              {visibleCount < events.length ? (
                <div
                  ref={sentinelRef}
                  className="pivot-curation-sheet__lazy-sentinel"
                >
                  <span className="pivot-curation-sheet__lazy-status">
                    {visibleCount} of {events.length}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="pivot-lab__empty">
              {query.trim()
                ? 'No events match this search.'
                : emptyLabel || 'No events match this filter.'}
            </p>
          )}

          {selectedIds.size > 0 ? (
            <div className="pivot-curation-sheet__bulk" role="toolbar" aria-label="Bulk catalog actions">
              <span className="pivot-curation-sheet__bulk-count">
                {selectedIds.size} selected
              </span>
              <div className="pivot-curation-sheet__bulk-tags">
                <PivotTagMultiSelect
                  catalogTags={catalogTags}
                  selectedSlugs={bulkTags}
                  onChange={onBulkTagsChange}
                  compact
                  showLabel={false}
                />
              </div>
              <div className="pivot-curation-sheet__bulk-actions">
                <Select
                  className="pivot-curation-sheet__bulk-weight-select"
                  optionItems={EDITORIAL_TIERS}
                  defaultValue={bulkEditorialTier}
                  onChange={setBulkEditorialTier}
                  placeholder="Weight"
                  menuPlacement="top"
                />
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  onClick={() => onBulkEditorial(bulkEditorialTier)}
                  disabled={busyKey === 'bulk-editorial'}
                >
                  {busyKey === 'bulk-editorial' ? 'Applying…' : 'Apply weight'}
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  onClick={onBulkApplyTags}
                  disabled={!selectedIds.size || busyKey === 'bulk-tags'}
                >
                  {busyKey === 'bulk-tags' ? 'Applying…' : 'Apply tags'}
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  onClick={onBulkSuggestTags}
                  disabled={!selectedIds.size || busyKey === 'bulk-suggest'}
                >
                  {busyKey === 'bulk-suggest' ? 'Suggesting…' : 'Suggest tags'}
                </button>
                {selectedMissingRichCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkEnrichRichData}
                    disabled={busyKey === 'bulk-enrich'}
                    title="Open a manual detail-page enrichment job"
                  >
                    Enrich ({selectedMissingRichCount})
                  </button>
                ) : null}
                {selectedIds.size > 1 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkCollapseShowtimes}
                    disabled={busyKey === 'bulk-showtimes'}
                    title="Manually roll selected rows into one listing with showtimes across their dates"
                  >
                    {busyKey === 'bulk-showtimes'
                      ? 'Rolling up…'
                      : `Roll up showtimes (${selectedIds.size})`}
                  </button>
                ) : null}
                {selectedDraftCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={() => onBulkStage()}
                    disabled={busyKey === 'bulk-stage'}
                  >
                    {busyKey === 'bulk-stage' ? 'Staging…' : `Stage (${selectedDraftCount})`}
                  </button>
                ) : null}
                {selectedStagedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={() => onBulkPublish()}
                    disabled={
                      releaseDisabled
                      || busyKey === 'bulk-release'
                      || selectedStagedEligibleCount === 0
                    }
                    title={
                      selectedStagedEligibleCount === 0
                        ? 'Selected staged events need a working cover (and location review) before they can go live'
                        : releaseBlockReason
                          || `Publish ${selectedStagedEligibleCount} selected`
                    }
                  >
                    {busyKey === 'bulk-release'
                      ? 'Publishing…'
                      : `Publish (${selectedStagedEligibleCount})`}
                  </button>
                ) : null}
                {selectedPublishedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={() => onBulkUnpublish()}
                    disabled={busyKey === 'bulk-unrelease'}
                    title="Pull selected published events out of the live feed"
                  >
                    {busyKey === 'bulk-unrelease'
                      ? 'Unpublishing…'
                      : `Unpublish (${selectedPublishedCount})`}
                  </button>
                ) : null}
                {selectedUnfeaturedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkFeature}
                    disabled={busyKey === 'bulk-feature'}
                    title="Mark selected events as featured for the public landing deck"
                  >
                    {busyKey === 'bulk-feature'
                      ? 'Featuring…'
                      : `Feature (${selectedUnfeaturedCount})`}
                  </button>
                ) : null}
                {selectedFeaturedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={onBulkUnfeature}
                    disabled={busyKey === 'bulk-unfeature'}
                    title="Remove selected events from the Just Go landing deck"
                  >
                    {busyKey === 'bulk-unfeature'
                      ? 'Removing…'
                      : `Unfeature (${selectedFeaturedCount})`}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {paneEvent ? renderInspector(paneEvent, 'pane') : null}

        {dossierEvent ? (
          <PivotCurationPortalPopup
            isOpen
            onClose={() => setDossierEventId(null)}
            className="pivot-curation-inspect-popup"
          >
            {renderInspector(dossierEvent, 'dossier')}
          </PivotCurationPortalPopup>
        ) : null}

        {publishConfirmEvents?.length ? (
          <PivotCurationPortalPopup
            isOpen
            onClose={() => setPublishConfirmEvents(null)}
            className="pivot-curation-publish-confirm-popup"
          >
            <PublishConfirmCard
              events={publishConfirmEvents}
              busy={Boolean(busyKey && String(busyKey).includes('release'))}
              brokenImageIds={brokenImageIds}
              onCancel={() => setPublishConfirmEvents(null)}
              onConfirm={(ready) => executePublish(ready)}
            />
          </PivotCurationPortalPopup>
        ) : null}

        {weightEvent ? (
          <PivotCurationPortalPopup
            isOpen
            onClose={() => setWeightEventId(null)}
            className="pivot-curation-weight-popup"
          >
            <WeightPopupCard
              event={weightEvent}
              busy={busyKey === `editorial-${weightEvent._id}`}
              onSave={onEditorialChange}
              onCancel={() => setWeightEventId(null)}
            />
          </PivotCurationPortalPopup>
        ) : null}
      </div>
    </PivotOpsSection>
      </div>
    </div>
  );
}

export default PivotCurationQueue;
export { HOST_CREATED_SOURCE, eventPerf, EditorialWeightControl };
