import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PivotOpsAnimateNumber,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import { formatEventWhen, formatEventWhenWithShowtimes } from '../../../utils/pivotIsoWeek';
import PivotImportThumb from '../PivotLab/PivotImportThumb';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import { isTypingTarget } from '../PivotLab/PivotManualImportModal';
import { curationPublicEventUrl } from './curationPublicEventUrl';
import { dragRangeSelection, nextSelection } from './curationQueueSelection';
import useCurationImmersiveScroll from './useCurationImmersiveScroll';
import './PivotCurationQueue.scss';

const HOST_CREATED_SOURCE = 'justgo';
const DRAG_SELECT_THRESHOLD_PX = 5;

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
            <PivotImportThumb src={event.image} alt={event.name} />
          </a>
        ) : (
          <PivotImportThumb src={event.image} alt={event.name} />
        )}
      </td>
      <td>
        <span className="pivot-curation-sheet__name">
          {event.name || 'Untitled'}
        </span>
        <div className="pivot-curation-sheet__host">
          {event.organizerName || 'No host'}
        </div>
        {event.featured ? (
          <span
            className="pivot-curation-sheet__featured"
            title="Featured — public landing deck"
          >
            Featured
          </span>
        ) : null}
      </td>
      <td className="pivot-curation-sheet__when">
        {formatEventWhenWithShowtimes(event)}
      </td>
      {showPerformance ? (
        <>
          <td className="pivot-curation-sheet__num">
            {perf ? <PivotOpsAnimateNumber value={perf.reached} /> : '—'}
          </td>
          <td>
            <InterestMeter rate={perf?.interestRate} />
          </td>
        </>
      ) : null}
      <td>
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
      <td>
        <PivotOpsStatus tone={ingestTone(event.ingestStatus)}>
          {event.ingestStatus || '—'}
        </PivotOpsStatus>
      </td>
      <td>
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
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
  onToggleFeatured,
  busyKey,
  releaseDisabled,
  releaseBlockReason,
}) {
  if (!event) return null;
  const sourceHref = event.externalLink || event.sourceUrl;
  const publicHref = curationPublicEventUrl(event);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const unpublishing = busyKey === `unrelease-${event._id}`;
  const publishing = busyKey === `release-${event._id}`;
  const deleting = busyKey === `delete-${event._id}`;
  const featuring = busyKey === `feature-${event._id}`;

  return (
    <aside className="pivot-curation-sheet__inspect" aria-label={`${event.name} details`}>
      <div className="pivot-curation-sheet__inspect-media">
        {event.image ? (
          <img src={event.image} alt="" />
        ) : (
          <div className="pivot-curation-sheet__inspect-fallback" aria-hidden="true">
            {(event.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="pivot-curation-sheet__inspect-body">
        <div className="pivot-curation-sheet__inspect-head">
          <h3 className="pivot-curation-sheet__inspect-title">{event.name || 'Untitled'}</h3>
          <button
            type="button"
            className="linear-btn linear-btn--ghost pivot-curation-sheet__inspect-close"
            onClick={onClose}
          >
            Close
          </button>
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
          <p className="pivot-curation-sheet__inspect-copy">{event.description}</p>
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
          {event.ingestStatus === 'staged' ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={() => onPublish(event)}
              disabled={releaseDisabled || publishing}
              title={releaseBlockReason || 'Publish this staged event'}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          ) : null}
          {event.ingestStatus === 'published' ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={() => onUnpublish(event)}
              disabled={unpublishing}
              title="Pull this event out of the live feed"
            >
              {unpublishing ? 'Unpublishing…' : 'Unpublish'}
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

function PivotCurationQueue({
  batchWeek,
  events,
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
  onDelete,
  onBulkStage,
  onBulkPublish,
  onBulkUnpublish,
  onBulkApplyTags,
  onBulkSuggestTags,
  onBulkCollapseShowtimes,
  onBulkFeature,
  onBulkUnfeature,
  onToggleFeatured,
  emptyLabel,
}) {
  const sheetRef = useRef(null);
  const scrollerRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastIndexRef = useRef(0);
  const dragRef = useRef(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [inspectingId, setInspectingId] = useState(null);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LAZY_CHUNK);
  const eventsIdentity = `${events.length}:${events[0]?._id ?? ''}:${events[events.length - 1]?._id ?? ''}`;
  const { frameRef, slotRef, slotHeight, immersive, expanded, collapse } = useCurationImmersiveScroll({
    enabled: events.length > 0,
    scrollerRef,
  });

  const inspectingEvent = useMemo(
    () => events.find((event) => String(event._id) === String(inspectingId)) || null,
    [events, inspectingId],
  );

  useEffect(() => {
    if (inspectingId && !inspectingEvent) setInspectingId(null);
  }, [inspectingId, inspectingEvent]);

  useEffect(() => {
    setVisibleCount(Math.min(LAZY_CHUNK, events.length || LAZY_CHUNK));
  }, [eventsIdentity, events.length]);

  useEffect(() => {
    if (!events.length) {
      setFocusIndex(0);
      return;
    }
    setFocusIndex((current) => Math.max(0, Math.min(current, events.length - 1)));
  }, [events]);

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
  const selectedPublishedCount = selectedEvents.filter((e) => e.ingestStatus === 'published').length;
  const selectedUnfeaturedCount = selectedEvents.filter((e) => e.featured !== true).length;
  const selectedFeaturedCount = selectedEvents.filter((e) => e.featured === true).length;

  const previewAt = useCallback((event, index, nextIds) => {
    if (typeof index === 'number') {
      lastIndexRef.current = index;
      setFocusIndex(index);
    }
    if (event?._id != null) setInspectingId(event._id);
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
      setFocusIndex(index);
      setInspectingId(event._id);
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

  const handlePanePointerDown = useCallback(
    (nativeEvent) => {
      if (nativeEvent.button !== 0) return;
      if (isInteractiveTarget(nativeEvent.target)) return;
      const row = nativeEvent.target.closest?.('tr[data-index]');
      if (!row) return;
      const index = Number(row.getAttribute('data-index'));
      const event = events[index];
      if (!event || !Number.isInteger(index)) return;

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
    [events, previewAt, selectAt, selectedIds],
  );

  const handlePanePointerMove = useCallback(
    (nativeEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== nativeEvent.pointerId) return;

      const dx = nativeEvent.clientX - drag.startX;
      const dy = nativeEvent.clientY - drag.startY;
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
      endDrag(nativeEvent.pointerId);
    },
    [endDrag],
  );

  const handleKeyDown = useCallback(
    (nativeEvent) => {
      if (isTypingTarget(nativeEvent.target)) return;

      if (nativeEvent.key === 'Escape') {
        nativeEvent.preventDefault();
        if (inspectingId) {
          setInspectingId(null);
          return;
        }
        if (immersive) {
          collapse();
          return;
        }
        onSelectedIdsChange(new Set());
        return;
      }

      if (!events.length) return;

      if ((nativeEvent.metaKey || nativeEvent.ctrlKey) && nativeEvent.key.toLowerCase() === 'a') {
        nativeEvent.preventDefault();
        onSelectedIdsChange(new Set(events.map((event) => event._id)));
        return;
      }

      if (nativeEvent.key === 'Enter') {
        const focused = events[focusIndex];
        if (!focused) return;
        nativeEvent.preventDefault();
        previewAt(focused, focusIndex, new Set([focused._id]));
        return;
      }

      if (nativeEvent.key === ' ' || nativeEvent.key === 'Spacebar') {
        const focused = events[focusIndex];
        if (!focused) return;
        nativeEvent.preventDefault();
        selectAt(focused, focusIndex, nativeEvent, { toggle: true });
        return;
      }

      if (nativeEvent.key === 'ArrowDown' || nativeEvent.key === 'ArrowUp') {
        nativeEvent.preventDefault();
        const delta = nativeEvent.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(events.length - 1, focusIndex + delta));
        const focused = events[nextIndex];
        if (!focused) return;
        if (nativeEvent.shiftKey) {
          selectAt(focused, nextIndex, nativeEvent);
        } else {
          previewAt(focused, nextIndex, new Set([focused._id]));
        }
      }
    },
    [events, focusIndex, immersive, collapse, inspectingId, onSelectedIdsChange, previewAt, selectAt],
  );

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
          onClick={() => onFilterChange(opt.value)}
        >
          {opt.label}
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

  return (
    <div className="pivot-curation-host">
      <div
        ref={slotRef}
        className="pivot-curation-frame__slot"
        hidden={!immersive}
        aria-hidden="true"
        style={immersive ? { height: slotHeight } : undefined}
      />
      <div
        ref={frameRef}
        className={`pivot-curation-frame${immersive ? ' is-immersive' : ''}${
          expanded ? ' is-expanded' : ''
        }`}
      >
        <PivotOpsSection
      title={`Catalog · ${batchWeek}`}
      titleId="curation-queue"
      description={
        immersive
          ? 'Scroll the list. Scroll up past the top to return.'
          : showPerformance
            ? 'Click a row to preview · click and drag to select several. Interest % updates as the live batch gets swipes.'
            : 'Click a row to preview · click and drag to select several. Draft and staged rows are ready to publish; published rows can be pulled back.'
      }
      actions={filterActions}
      className={`pivot-curation-sheet${immersive ? ' is-immersive' : ''}`}
      bodyClassName="pivot-curation-sheet__body"
    >
      <div
        className={`pivot-curation-sheet__layout${
          inspectingEvent ? ' pivot-curation-sheet__layout--split' : ''
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
                    <th scope="col">When</th>
                    {showPerformance ? (
                      <>
                        <th scope="col" className="pivot-curation-sheet__num">
                          Reached
                        </th>
                        <th scope="col">Interest</th>
                      </>
                    ) : null}
                    <th scope="col">Tags</th>
                    <th scope="col">Status</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, visibleCount).map((event, index) => (
                    <CatalogRow
                      key={event._id}
                      event={event}
                      index={index}
                      selected={selectedIds.has(event._id)}
                      focused={index === focusIndex}
                      showPerformance={showPerformance}
                      performanceById={performanceById}
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
              {emptyLabel || 'No events match this filter.'}
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
                {selectedIds.size > 1 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkCollapseShowtimes}
                    disabled={busyKey === 'bulk-showtimes'}
                    title="Merge selected rows into one listing with showtimes"
                  >
                    {busyKey === 'bulk-showtimes'
                      ? 'Collapsing…'
                      : `Showtimes (${selectedIds.size})`}
                  </button>
                ) : null}
                {selectedDraftCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkStage}
                    disabled={busyKey === 'bulk-stage'}
                  >
                    {busyKey === 'bulk-stage' ? 'Staging…' : `Stage (${selectedDraftCount})`}
                  </button>
                ) : null}
                {selectedStagedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={onBulkPublish}
                    disabled={releaseDisabled || busyKey === 'bulk-release'}
                    title={releaseBlockReason || `Publish ${selectedStagedCount} selected`}
                  >
                    {busyKey === 'bulk-release'
                      ? 'Publishing…'
                      : `Publish (${selectedStagedCount})`}
                  </button>
                ) : null}
                {selectedPublishedCount > 0 ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    onClick={onBulkUnpublish}
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

        {inspectingEvent ? (
          <QueueInspector
            event={inspectingEvent}
            perf={eventPerf(inspectingEvent, performanceById)}
            showPerformance={showPerformance}
            onClose={() => setInspectingId(null)}
            onEdit={onEdit}
            onPublish={onPublish}
            onUnpublish={onUnpublish}
            onDelete={onDelete}
            onToggleFeatured={onToggleFeatured}
            busyKey={busyKey}
            releaseDisabled={releaseDisabled}
            releaseBlockReason={releaseBlockReason}
          />
        ) : null}
      </div>
    </PivotOpsSection>
      </div>
    </div>
  );
}

export default PivotCurationQueue;
export { HOST_CREATED_SOURCE, eventPerf };
