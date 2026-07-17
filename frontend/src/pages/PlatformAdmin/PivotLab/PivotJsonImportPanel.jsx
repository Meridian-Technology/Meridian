import React, { useCallback, useMemo, useState } from 'react';
import { authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';
import PivotImportThumb from './PivotImportThumb';
import {
  autoMatchFilmsForImportEntries,
  autoMatchTmdbMovieForEvent,
  isFilmImportCandidate,
} from './pivotTmdbClient';
import {
  PIVOT_JSON_IMPORT_AGENT_PROMPT,
  PIVOT_JSON_IMPORT_EXAMPLE,
  applyMovieMetadataToImportDraft,
  buildBatchPublishOverridesFromEntry,
  buildJsonImportPreviewDocument,
  duplicateBadgeLabel,
  formatEventFilmStatus,
  formatEventTags,
  formatEventTimeSlots,
  isBlockingImportDuplicate,
  isJsonImportEntryReady,
  parsePivotJsonImport,
  serializeJsonImportDraft,
} from './pivotJsonImportUtils';

/**
 * Shared JSON import panel for Pivot Lab and tenant Curation.
 *
 * mode=load — parent receives parsed entries (Lab batch table).
 * mode=stage — posts ready rows to /admin/pivot/ingest/batch (Curation queue).
 */
export default function PivotJsonImportPanel({
  tenantKey,
  batchWeek,
  forceBatchWeek = false,
  disabled = false,
  mode = 'load',
  onLoadEntries,
  onStaged,
  onBeforeStage,
}) {
  const { addNotification } = useNotification();
  const [importJsonDraft, setImportJsonDraft] = useState('');
  const [jsonImportPreview, setJsonImportPreview] = useState(null);
  const [tmdbMatchLoadingKey, setTmdbMatchLoadingKey] = useState(null);
  const [stageLoading, setStageLoading] = useState(false);

  const syncJsonImportDraftFromEntries = useCallback((label, entries) => {
    setImportJsonDraft(serializeJsonImportDraft(label, entries));
  }, []);

  const annotateJsonEntriesWithDuplicates = useCallback(
    async (entries) => {
      if (!tenantKey || !entries.length) {
        return { entries, duplicateWarnings: [] };
      }

      const { data, error } = await authenticatedRequest(
        '/admin/pivot/ingest/annotate-duplicates',
        {
          method: 'POST',
          data: { tenantKey, drafts: entries },
        },
      );

      if (error || !data?.success) {
        return { entries, duplicateWarnings: [] };
      }

      return {
        entries: data.data?.drafts || entries,
        duplicateWarnings: data.data?.duplicateWarnings || [],
      };
    },
    [tenantKey],
  );

  const enrichEntriesWithTmdb = useCallback(
    async (entries, loadingKey) => {
      const pendingFilmCount = entries.filter((entry) =>
        isFilmImportCandidate(entry.draft || {}),
      ).length;

      if (!pendingFilmCount) {
        return { entries, tmdbMatch: { matched: 0, failed: 0, pending: 0 } };
      }

      setTmdbMatchLoadingKey(loadingKey);
      const matchResult = await autoMatchFilmsForImportEntries(entries);
      setTmdbMatchLoadingKey(null);

      let enriched = entries;
      if (matchResult.moviesByIndex.size) {
        enriched = entries.map((entry, index) =>
          matchResult.moviesByIndex.has(index)
            ? {
                ...entry,
                draft: applyMovieMetadataToImportDraft(
                  entry.draft || {},
                  matchResult.moviesByIndex.get(index),
                ),
              }
            : entry,
        );
      }

      return {
        entries: enriched,
        tmdbMatch: {
          matched: matchResult.matched,
          failed: matchResult.failed,
          pending: pendingFilmCount,
        },
      };
    },
    [],
  );

  const handlePreviewJsonImport = useCallback(async () => {
    const result = parsePivotJsonImport(importJsonDraft);
    if (result.error) {
      setJsonImportPreview({ error: result.error });
      return;
    }

    const { entries: tmdbEntries, tmdbMatch } = await enrichEntriesWithTmdb(
      result.entries,
      'json-preview',
    );
    if (tmdbMatch.pending) {
      syncJsonImportDraftFromEntries(result.label, tmdbEntries);
    }

    const { entries, duplicateWarnings } =
      await annotateJsonEntriesWithDuplicates(tmdbEntries);

    setJsonImportPreview({
      label: result.label,
      entries,
      tmdbMatch,
      duplicateWarnings,
    });

    if (tmdbMatch.pending) {
      addNotification({
        title: tmdbMatch.matched ? 'Films matched from TMDB' : 'TMDB matching finished',
        message: tmdbMatch.matched
          ? `${tmdbMatch.matched} film(s) matched automatically${tmdbMatch.failed ? `, ${tmdbMatch.failed} failed` : ''}.`
          : tmdbMatch.failed
            ? `${tmdbMatch.failed} film event(s) could not be matched.`
            : 'No TMDB matches found for film events.',
        type: tmdbMatch.matched ? (tmdbMatch.failed ? 'warning' : 'success') : 'warning',
      });
    }
  }, [
    addNotification,
    annotateJsonEntriesWithDuplicates,
    enrichEntriesWithTmdb,
    importJsonDraft,
    syncJsonImportDraftFromEntries,
  ]);

  const resolveImportEntries = useCallback(async () => {
    const parsed =
      jsonImportPreview?.entries?.length && !jsonImportPreview.error
        ? { label: jsonImportPreview.label, entries: jsonImportPreview.entries }
        : parsePivotJsonImport(importJsonDraft);

    if (parsed.error) {
      setJsonImportPreview({ error: parsed.error });
      return null;
    }

    const { entries: tmdbEntries, tmdbMatch } = await enrichEntriesWithTmdb(
      parsed.entries,
      mode === 'stage' ? 'json-stage' : 'json-load',
    );
    if (tmdbMatch.pending) {
      syncJsonImportDraftFromEntries(parsed.label, tmdbEntries);
    }

    const { entries, duplicateWarnings } =
      await annotateJsonEntriesWithDuplicates(tmdbEntries);

    const preview = {
      label: parsed.label,
      entries,
      tmdbMatch,
      duplicateWarnings,
    };
    setJsonImportPreview(preview);
    return preview;
  }, [
    annotateJsonEntriesWithDuplicates,
    enrichEntriesWithTmdb,
    importJsonDraft,
    jsonImportPreview,
    mode,
    syncJsonImportDraftFromEntries,
  ]);

  const handleLoadJsonImport = useCallback(async () => {
    const preview = await resolveImportEntries();
    if (!preview) return;

    onLoadEntries?.({
      label: preview.label,
      entries: preview.entries,
      duplicateWarnings: preview.duplicateWarnings,
      tmdbMatch: preview.tmdbMatch,
    });

    addNotification({
      title: 'JSON loaded',
      message:
        preview.tmdbMatch?.matched > 0
          ? `${preview.entries.length} event(s) loaded · ${preview.tmdbMatch.matched} film(s) matched from TMDB.`
          : `${preview.entries.length} event(s) ready for review.`,
      type: 'success',
    });
  }, [addNotification, onLoadEntries, resolveImportEntries]);

  const handleStageJsonImport = useCallback(async () => {
    if (!tenantKey || !batchWeek) return;

    const preview = await resolveImportEntries();
    if (!preview) return;

    const stageable = preview.entries.filter(
      (entry) => isJsonImportEntryReady(entry) && !isBlockingImportDuplicate(entry.duplicate),
    );

    if (!stageable.length) {
      addNotification({
        title: 'Nothing to stage',
        message:
          'No ready events — each row needs title, organizer, location, start time, and tags.',
        type: 'warning',
      });
      return;
    }

    onBeforeStage?.();
    setStageLoading(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/batch', {
      method: 'POST',
      data: {
        tenantKey,
        batchWeek,
        forceBatchWeek,
        events: stageable.map((entry) => ({
          url: entry.sourceUrl || entry.draft?.sourceUrl || undefined,
          overrides: buildBatchPublishOverridesFromEntry(entry),
        })),
      },
    });
    setStageLoading(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Stage failed',
        message: error || data?.message || 'Could not stage JSON events.',
        type: 'error',
      });
      return;
    }

    const publishedCount = data.data?.publishedCount ?? data.data?.published?.length ?? 0;
    const failedCount = data.data?.failedCount ?? data.data?.failures?.length ?? 0;
    const updatedCount = data.data?.updatedCount ?? 0;
    const batchWeekCounts = data.data?.batchWeekCounts || {};
    const weekKeys = Object.keys(batchWeekCounts).sort();
    const weekSuffix =
      weekKeys.length > 1
        ? ` Weeks: ${weekKeys.map((w) => `${w} (${batchWeekCounts[w]})`).join(', ')}.`
        : weekKeys.length === 1
          ? ` Week ${weekKeys[0]}.`
          : batchWeek
            ? ` Week ${batchWeek}.`
            : '';
    const landedInReviewWeek =
      !forceBatchWeek && batchWeek && (batchWeekCounts[batchWeek] || 0) < publishedCount;
    const updatedSuffix =
      updatedCount > 0
        ? ` ${updatedCount} updated existing catalog event(s) — already-published rows stay live.`
        : '';

    addNotification({
      title: failedCount ? 'Batch partially staged' : 'JSON staged',
      message: failedCount
        ? `${publishedCount} staged, ${updatedCount} updated, ${failedCount} failed.${weekSuffix}${updatedSuffix}`
        : `${publishedCount} event(s) staged.${weekSuffix}${updatedSuffix}${
            landedInReviewWeek
              ? ' Some events landed outside the selected review week — switch batch week to review them.'
              : ' Open the review queue below to publish.'
          }`,
      type: failedCount || landedInReviewWeek ? 'warning' : 'success',
    });
    onStaged?.({
      batchWeekCounts,
      publishedCount,
      updatedCount,
      failedCount,
      forceBatchWeek,
    });
  }, [
    addNotification,
    batchWeek,
    forceBatchWeek,
    onBeforeStage,
    onStaged,
    resolveImportEntries,
    tenantKey,
  ]);

  const handleMatchTmdbForJsonEntry = useCallback(
    async (index) => {
      const entry = jsonImportPreview?.entries?.[index];
      if (!entry) return;

      const draft = entry.draft || {};
      if (draft.movie?.tmdbId) {
        addNotification({
          title: 'Already matched',
          message: `${draft.name || 'Event'} already has TMDB metadata.`,
          type: 'warning',
        });
        return;
      }

      setTmdbMatchLoadingKey(`json-${index}`);
      const result = await autoMatchTmdbMovieForEvent({
        name: draft.name,
        startTime: draft.start_time || draft.timeSlots?.[0]?.start_time,
        movie: draft.movie,
      });
      setTmdbMatchLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'TMDB match failed',
          message: `${draft.name || 'Event'}: ${result.error}`,
          type: 'error',
        });
        return;
      }

      setJsonImportPreview((prev) => {
        if (!prev?.entries) return prev;
        const entries = prev.entries.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                draft: applyMovieMetadataToImportDraft(item.draft || {}, result.movie),
              }
            : item,
        );
        syncJsonImportDraftFromEntries(prev.label, entries);
        return { ...prev, entries };
      });

      addNotification({
        title: 'Film matched',
        message: `${result.movie.title} attached to ${draft.name || 'event'}.`,
        type: 'success',
      });
    },
    [addNotification, jsonImportPreview, syncJsonImportDraftFromEntries],
  );

  const handleCopyJsonAgentPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PIVOT_JSON_IMPORT_AGENT_PROMPT);
      addNotification({
        title: 'Copied',
        message: 'Agent JSON prompt copied to clipboard.',
        type: 'success',
      });
    } catch {
      addNotification({
        title: 'Copy failed',
        message: 'Could not copy to clipboard.',
        type: 'error',
      });
    }
  }, [addNotification]);

  const jsonImportPreviewDocument = useMemo(
    () => buildJsonImportPreviewDocument(jsonImportPreview),
    [jsonImportPreview],
  );

  const jsonImportReadyCount = useMemo(() => {
    if (!jsonImportPreview?.entries) return 0;
    return jsonImportPreview.entries.filter(isJsonImportEntryReady).length;
  }, [jsonImportPreview]);

  const jsonImportTmdbMatching = Boolean(
    tmdbMatchLoadingKey === 'json-preview' ||
      tmdbMatchLoadingKey === 'json-load' ||
      tmdbMatchLoadingKey === 'json-stage',
  );

  const primaryDisabled =
    disabled || !importJsonDraft.trim() || jsonImportTmdbMatching || stageLoading;

  return (
    <details className="pivot-lab__json-import">
      <summary className="pivot-lab__json-import-summary">
        JSON import (agents)
        {mode === 'stage' && batchWeek && forceBatchWeek ? ` · pins to ${batchWeek}` : null}
      </summary>
      <div className="pivot-lab__json-import-body">
        {!forceBatchWeek && mode === 'stage' && batchWeek ? (
          <p className="pivot-lab__json-import-hint pivot-lab__json-import-hint--warn">
            <strong>Force into review week</strong> is off — events will land in the ISO week of each
            start date and may split across multiple weeks. They will not appear in the review queue
            until you switch to that batch week.
          </p>
        ) : null}
        <p className="pivot-lab__json-import-hint">
          For Just Go weekly ops: give agents the prompt below, paste their JSON here, then review
          before {mode === 'stage' ? 'staging' : 'loading'}.
          {mode === 'stage' && batchWeek ? (
            <>
              {' '}
              Ready rows stage into <strong>{batchWeek}</strong>
              {forceBatchWeek ? ' (forced)' : ' by event start date unless forced'}.
            </>
          ) : null}{' '}
          Listing URLs are optional — manual events work without a sourceUrl. Film events tagged{' '}
          <code>film-and-tv</code> auto-match TMDB on preview and load.
        </p>
        <div className="pivot-lab__json-import-actions">
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={handleCopyJsonAgentPrompt}
          >
            Copy agent prompt
          </button>
        </div>
        <pre className="pivot-lab__json-import-prompt" aria-label="Agent JSON format">
          {PIVOT_JSON_IMPORT_AGENT_PROMPT}
        </pre>
        <label className="linear-field pivot-lab__json-import-field">
          <span className="linear-field__label">Agent JSON</span>
          <textarea
            className="linear-input pivot-lab__json-import-textarea"
            value={importJsonDraft}
            onChange={(e) => {
              setImportJsonDraft(e.target.value);
              setJsonImportPreview(null);
            }}
            placeholder={PIVOT_JSON_IMPORT_EXAMPLE}
            rows={8}
            spellCheck={false}
          />
        </label>
        <div className="pivot-lab__notes-actions pivot-lab__json-import-buttons">
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={handlePreviewJsonImport}
            disabled={primaryDisabled}
          >
            {tmdbMatchLoadingKey === 'json-preview' ? 'Matching films…' : 'Preview JSON'}
          </button>
          {mode === 'stage' ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleStageJsonImport}
              disabled={primaryDisabled}
            >
              {stageLoading || tmdbMatchLoadingKey === 'json-stage'
                ? 'Staging…'
                : batchWeek
                  ? `Stage JSON · ${batchWeek}`
                  : 'Stage JSON'}
            </button>
          ) : (
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleLoadJsonImport}
              disabled={primaryDisabled}
            >
              {tmdbMatchLoadingKey === 'json-load' ? 'Matching films…' : 'Load JSON into batch'}
            </button>
          )}
        </div>
        {jsonImportPreview?.error ? (
          <p className="pivot-lab__json-preview-error">{jsonImportPreview.error}</p>
        ) : null}
        {jsonImportPreview?.entries?.length ? (
          <div className="pivot-lab__json-preview">
            <p className="pivot-lab__json-preview-summary">
              Found {jsonImportPreview.entries.length} event(s) in{' '}
              <strong>{jsonImportPreview.label}</strong>. {jsonImportReadyCount} ready to stage
              as-is; others need tags or missing fields.
              {jsonImportPreview.tmdbMatch?.matched
                ? ` ${jsonImportPreview.tmdbMatch.matched} film(s) matched from TMDB.`
                : ''}
              {jsonImportPreview.tmdbMatch?.failed
                ? ` ${jsonImportPreview.tmdbMatch.failed} film match(es) failed.`
                : ''}
            </p>
            <div className="pivot-lab__table-wrap">
              <table className="pivot-lab__table pivot-lab__json-preview-table">
                <thead>
                  <tr>
                    <th scope="col">Image</th>
                    <th scope="col">Event</th>
                    <th scope="col">Organizer</th>
                    <th scope="col">When</th>
                    <th scope="col">Showtimes</th>
                    <th scope="col">Location</th>
                    <th scope="col">Tags</th>
                    <th scope="col">Film</th>
                    <th scope="col">Status</th>
                    <th scope="col">Catalog</th>
                    <th scope="col">TMDB</th>
                  </tr>
                </thead>
                <tbody>
                  {jsonImportPreview.entries.map((entry, index) => {
                    const draft = entry.draft || {};
                    const ready = isJsonImportEntryReady(entry);
                    const rowLoadingKey = `json-${index}`;
                    return (
                      <tr
                        key={`${draft.name || 'event'}-${index}`}
                        className={ready ? '' : 'pivot-lab__json-preview-row--warn'}
                      >
                        <td className="pivot-lab__thumb-cell">
                          <PivotImportThumb src={draft.image} alt={draft.name} />
                        </td>
                        <td>{draft.name || '—'}</td>
                        <td>{draft.hostName || '—'}</td>
                        <td>{formatEventWhen(draft.start_time || draft.timeSlots?.[0]?.start_time)}</td>
                        <td>{formatEventTimeSlots(draft.timeSlots)}</td>
                        <td>{draft.location || '—'}</td>
                        <td>{formatEventTags(draft.tags)}</td>
                        <td>{formatEventFilmStatus(draft)}</td>
                        <td>
                          {ready ? (
                            <span className="pivot-lab__pill pivot-lab__pill--ok">Ready</span>
                          ) : (
                            <span className="pivot-lab__pill pivot-lab__pill--warn">Needs review</span>
                          )}
                        </td>
                        <td>
                          {entry.duplicate ? (
                            <span
                              className={`pivot-lab__duplicate-pill${
                                isBlockingImportDuplicate(entry.duplicate)
                                  ? ' pivot-lab__duplicate-pill--blocking'
                                  : ' pivot-lab__duplicate-pill--update'
                              }`}
                              title={
                                entry.duplicate.existingName
                                  ? `Matches "${entry.duplicate.existingName}"`
                                  : undefined
                              }
                            >
                              {duplicateBadgeLabel(entry.duplicate)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {draft.movie?.tmdbId ? (
                            '—'
                          ) : (
                            <button
                              type="button"
                              className="linear-btn linear-btn--ghost pivot-lab__tmdb-btn"
                              onClick={() => handleMatchTmdbForJsonEntry(index)}
                              disabled={
                                Boolean(tmdbMatchLoadingKey) &&
                                tmdbMatchLoadingKey !== rowLoadingKey
                              }
                            >
                              {tmdbMatchLoadingKey === rowLoadingKey ? '…' : 'Retry'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {jsonImportPreview.duplicateWarnings?.length ? (
              <ul className="pivot-lab__import-warnings pivot-lab__json-preview-warnings">
                {jsonImportPreview.duplicateWarnings.map((warning) => (
                  <li key={`dup-${warning}`}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {jsonImportPreview.entries.some((entry) => entry.warnings?.length) ? (
              <ul className="pivot-lab__import-warnings pivot-lab__json-preview-warnings">
                {jsonImportPreview.entries.flatMap((entry, index) =>
                  (entry.warnings || []).map((warning) => (
                    <li key={`${entry.draft?.name || 'event'}-${index}-${warning}`}>
                      {entry.draft?.name ? `${entry.draft.name}: ` : `Event ${index + 1}: `}
                      {warning}
                    </li>
                  )),
                )}
              </ul>
            ) : null}
            <details className="pivot-lab__json-preview-raw">
              <summary className="pivot-lab__json-preview-raw-summary">Normalized JSON</summary>
              <pre className="pivot-lab__json-preview-code">{jsonImportPreviewDocument}</pre>
            </details>
          </div>
        ) : null}
      </div>
    </details>
  );
}
