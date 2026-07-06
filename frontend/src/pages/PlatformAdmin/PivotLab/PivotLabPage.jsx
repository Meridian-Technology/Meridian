import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  toIsoWeek,
  formatEventWhen,
  formatSnapshotAge,
  formatPivotDeckWhen,
} from '../../../utils/pivotIsoWeek';
import { PivotDeckPhonePreview, DeckPreviewModal } from './PivotDeckCardPreview';
import PivotTagMultiSelect from './PivotTagMultiSelect';
import '../TenantManagement/TenantManagementPage.scss';
import './PivotLabPage.scss';
import './PivotDeckCardPreview.scss';

const EMPTY_LIST = [];
const NO_FETCH_CACHE = { enabled: false };
const IS_DEV = process.env.NODE_ENV !== 'production';
const PURGE_CONFIRM_TOKEN = 'PURGE';

function buildDeckPreviewProps({
  name,
  organizerName,
  startTime,
  endTime,
  location,
  description,
  imageUrl,
}) {
  const whenLabel = formatPivotDeckWhen(startTime, endTime);
  return {
    title: name,
    hostName: organizerName,
    whenLabel: whenLabel || undefined,
    locationLabel: location || undefined,
    description: description || undefined,
    imageUrl: imageUrl || undefined,
  };
}

function isBlockingImportDuplicate(duplicate) {
  if (!duplicate) return false;
  return duplicate.matchType !== 'sourceUrl';
}

function duplicateBadgeLabel(duplicate) {
  if (!duplicate) return null;
  if (duplicate.matchType === 'sourceUrl') return 'Will update';
  if (duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint') {
    return 'Batch duplicate';
  }
  return 'Duplicate';
}

function createBatchImportRow(entry, index) {
  const draft = entry?.draft || {};
  const duplicate = entry?.duplicate || null;
  const isBlockingDuplicate = isBlockingImportDuplicate(duplicate);
  const hasRequiredFields = Boolean(
    draft.hostName && draft.name && draft.location && draft.start_time,
  );

  return {
    key: entry?.sourceUrl || draft.sourceUrl || `batch-row-${index}`,
    selected: hasRequiredFields && !isBlockingDuplicate,
    sourceUrl: entry?.sourceUrl || draft.sourceUrl || '',
    name: draft.name || '',
    organizerName: draft.hostName || '',
    location: draft.location || '',
    startTime: draft.start_time || '',
    description: draft.description || '',
    imageUrl: draft.image || '',
    sourceTags: Array.isArray(draft.sourceTags) ? draft.sourceTags : [],
    tags: [],
    warnings: entry?.warnings || [],
    duplicate,
    isBlockingDuplicate,
    duplicateLabel: duplicateBadgeLabel(duplicate),
  };
}

function formatEventTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return '—';
  if (tags.length === 1) return tags[0];
  return `${tags[0]} +${tags.length - 1}`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="linear-stat pivot-lab__metric">
      <span className="linear-stat__label">{label}</span>
      <span className="linear-stat__value">{value}</span>
      {hint ? <span className="pivot-lab__metric-hint">{hint}</span> : null}
    </div>
  );
}

function CitySummaryCard({ tenant }) {
  const feedback =
    tenant.feedbackAvg != null
      ? `${tenant.feedbackAvg} (${tenant.feedbackCount ?? 0})`
      : tenant.feedbackCount
        ? `${tenant.feedbackCount} ratings`
        : '—';

  return (
    <article className="pivot-lab__city-card">
      <header className="pivot-lab__city-head">
        <h3>{tenant.cityDisplayName || tenant.tenantKey}</h3>
        <span className="pivot-lab__city-key">{tenant.tenantKey}</span>
      </header>
      {tenant.error ? (
        <p className="pivot-lab__city-error">Metrics unavailable for this city.</p>
      ) : (
        <div className="pivot-lab__city-metrics">
          <MetricCard label="Events" value={tenant.eventCount ?? 0} />
          <MetricCard label="Active users" value={tenant.activeUsers ?? 0} />
          <MetricCard label="Interested" value={tenant.interestedCount ?? 0} />
          <MetricCard label="Going" value={tenant.registeredCount ?? 0} />
          <MetricCard label="External opens" value={tenant.externalOpenCount ?? 0} />
          <MetricCard label="Swipes" value={tenant.swipeCount ?? 0} />
          <MetricCard label="Feedback avg" value={feedback} />
          {tenant.dropSchedule ? (
            <MetricCard
              label="Next drop"
              value={tenant.dropSchedule.nextDropFormatted}
              hint={`${tenant.dropSchedule.localSchedule} · ${
                tenant.dropSchedule.source === 'override' ? 'override' : 'default'
              }`}
            />
          ) : null}
        </div>
      )}
    </article>
  );
}

function IngestStatusPill({ status }) {
  if (status === 'published') {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Published</span>;
  }
  if (status === 'draft') {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Draft</span>;
  }
  return <span className="pivot-lab__pill">—</span>;
}

function ReferralStatus({ code }) {
  if (!code.active) return <span className="pivot-lab__pill pivot-lab__pill--muted">Inactive</span>;
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Expired</span>;
  }
  if (code.redemptionCount >= code.maxRedemptions) {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Maxed</span>;
  }
  if (code.redeemable) {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Redeemable</span>;
  }
  return <span className="pivot-lab__pill">—</span>;
}

function PivotLabPage() {
  const { addNotification } = useNotification();
  const [batchWeek, setBatchWeek] = useState(() => toIsoWeek());
  const [selectedTenantKey, setSelectedTenantKey] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [rebuildingSnapshot, setRebuildingSnapshot] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importMode, setImportMode] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importBatchLabel, setImportBatchLabel] = useState('');
  const [importBatchRows, setImportBatchRows] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importDuplicate, setImportDuplicate] = useState(null);
  const [importProvider, setImportProvider] = useState('');
  const [importOrganizerName, setImportOrganizerName] = useState('');
  const [importSelectedTags, setImportSelectedTags] = useState([]);
  const [importSourceTags, setImportSourceTags] = useState([]);
  const [batchApplyTags, setBatchApplyTags] = useState([]);
  const [tagSuggestLoadingKey, setTagSuggestLoadingKey] = useState(null);
  const [importName, setImportName] = useState('');
  const [importLocation, setImportLocation] = useState('');
  const [importStartTime, setImportStartTime] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importPublishLoading, setImportPublishLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deckPreviewState, setDeckPreviewState] = useState(null);
  const [purgeScope, setPurgeScope] = useState('selected');
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purgingCatalog, setPurgingCatalog] = useState(false);

  const overviewParams = useMemo(() => ({ batchWeek }), [batchWeek]);
  const {
    data: overviewResponse,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useFetch('/admin/pivot/overview', {
    params: overviewParams,
    cache: NO_FETCH_CACHE,
  });

  const eventsParams = useMemo(
    () => ({ batchWeek, tenantKey: selectedTenantKey }),
    [batchWeek, selectedTenantKey],
  );
  const eventsUrl = selectedTenantKey ? '/admin/pivot/events' : null;
  const {
    data: eventsResponse,
    loading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useFetch(eventsUrl, {
    params: eventsParams,
    cache: NO_FETCH_CACHE,
  });

  const notesParams = useMemo(() => ({ batchWeek }), [batchWeek]);
  const {
    data: notesResponse,
    loading: notesLoading,
    refetch: refetchNotes,
  } = useFetch('/admin/pivot/interview-notes', {
    params: notesParams,
    cache: NO_FETCH_CACHE,
  });

  const {
    data: tagsResponse,
    loading: tagsLoading,
  } = useFetch('/admin/pivot/tags', {
    cache: NO_FETCH_CACHE,
  });

  const catalogTags = tagsResponse?.success ? (tagsResponse.data?.tags ?? EMPTY_LIST) : EMPTY_LIST;

  const buildTagSuggestPayload = useCallback((fields) => ({
    name: fields.name?.trim() || undefined,
    description: fields.description?.trim() || undefined,
    location: fields.location?.trim() || undefined,
    hostName: fields.organizerName?.trim() || fields.hostName?.trim() || undefined,
    sourceTags: fields.sourceTags || undefined,
  }), []);

  const requestSuggestedTags = useCallback(async (payload) => {
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/suggest-tags', {
      method: 'POST',
      data: { event: payload },
    });

    if (error || !data?.success) {
      return {
        error: error || data?.message || 'Could not suggest tags.',
        code: data?.code,
      };
    }

    return { tags: data.data?.tags || [] };
  }, []);

  const overview = overviewResponse?.success ? overviewResponse.data : null;
  const tenants = overview?.tenants ?? EMPTY_LIST;
  const events = eventsResponse?.success
    ? (eventsResponse.data?.events ?? EMPTY_LIST)
    : EMPTY_LIST;
  const firstTenantKey = tenants[0]?.tenantKey ?? '';
  const referralRows = useMemo(
    () =>
      tenants.flatMap((tenant) =>
        (tenant.referralCodes || []).map((code) => ({
          ...code,
          cityDisplayName: tenant.cityDisplayName || tenant.tenantKey,
        })),
      ),
    [tenants],
  );

  useEffect(() => {
    if (!firstTenantKey) {
      setSelectedTenantKey((prev) => (prev === '' ? prev : ''));
      return;
    }
    setSelectedTenantKey((prev) =>
      prev && tenants.some((row) => row.tenantKey === prev) ? prev : firstTenantKey,
    );
  }, [firstTenantKey, tenants]);

  useEffect(() => {
    if (notesLoading) return;
    const savedNotes = notesResponse?.success ? notesResponse.data?.notes || '' : '';
    setNotesDraft(savedNotes);
    setNotesDirty(false);
  }, [notesResponse, notesLoading, batchWeek]);

  const handleSaveNotes = useCallback(async () => {
    setSavingNotes(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/interview-notes', {
      method: 'PUT',
      data: { batchWeek, notes: notesDraft },
    });
    setSavingNotes(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Save failed',
        message: error || data?.message || 'Could not save interview notes.',
        type: 'error',
      });
      return;
    }

    setNotesDirty(false);
    refetchNotes({ silent: true });
    addNotification({
      title: 'Saved',
      message: 'Interview notes updated.',
      type: 'success',
    });
  }, [addNotification, batchWeek, notesDraft, refetchNotes]);

  const handleRebuildSnapshot = useCallback(async () => {
    setRebuildingSnapshot(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/snapshots/rebuild', {
      method: 'POST',
      data: { batchWeek },
    });
    setRebuildingSnapshot(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Rebuild failed',
        message: error || data?.message || 'Could not rebuild snapshot.',
        type: 'error',
      });
      return;
    }

    refetchOverview();
    addNotification({
      title: 'Snapshot rebuilt',
      message: `Weekly snapshot refreshed for ${batchWeek}.`,
      type: 'success',
    });
  }, [addNotification, batchWeek, refetchOverview]);

  const handlePurgeCatalog = useCallback(async () => {
    if (purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN) {
      addNotification({
        title: 'Confirmation required',
        message: `Type ${PURGE_CONFIRM_TOKEN} to delete catalog data.`,
        type: 'error',
      });
      return;
    }

    const scopeLabel =
      purgeScope === 'all'
        ? 'all pivot cities'
        : tenants.find((row) => row.tenantKey === selectedTenantKey)?.cityDisplayName ||
          selectedTenantKey ||
          'this city';

    if (
      !window.confirm(
        `Permanently delete all pivot catalog events and related intents, feedback, and analytics for ${scopeLabel}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setPurgingCatalog(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/dev/purge-catalog', {
      method: 'POST',
      data: {
        confirm: PURGE_CONFIRM_TOKEN,
        tenantKey: purgeScope === 'all' ? undefined : selectedTenantKey || undefined,
        clearSnapshots: true,
      },
    });
    setPurgingCatalog(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Purge failed',
        message: error || data?.message || 'Could not purge pivot catalog data.',
        type: 'error',
      });
      return;
    }

    const totals = data.data?.totals || {};
    setPurgeConfirm('');
    refetchOverview();
    refetchEvents();
    addNotification({
      title: 'Catalog purged',
      message: `Removed ${totals.events ?? 0} events, ${totals.intents ?? 0} intents, and ${totals.feedback ?? 0} feedback rows.`,
      type: 'success',
    });
  }, [
    addNotification,
    purgeConfirm,
    purgeScope,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
    tenants,
  ]);

  const handlePreviewImport = useCallback(async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl) {
      setImportError('Paste a Partiful or Luma event or explore URL.');
      return;
    }

    setImportLoading(true);
    setImportError('');
    setImportMode(null);
    setImportPreview(null);
    setImportBatchLabel('');
    setImportBatchRows([]);
    setDeckPreviewState(null);
    setImportWarnings([]);
    setImportDuplicate(null);
    setImportName('');
    setImportLocation('');
    setImportStartTime('');
    setImportDescription('');
    setImportOrganizerName('');
    setImportSelectedTags([]);
    setImportSourceTags([]);
    setBatchApplyTags([]);

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/preview', {
      method: 'POST',
      data: {
        url: trimmedUrl,
        tenantKey: selectedTenantKey || undefined,
      },
    });
    setImportLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not preview this URL.');
      return;
    }

    const previewData = data.data || {};
    setImportProvider(previewData.providerLabel || previewData.provider || '');
    setImportWarnings(previewData.warnings || []);

    if (previewData.mode === 'batch') {
      setImportMode('batch');
      setImportBatchLabel(previewData.listLabel || 'Explore page');
      setImportBatchRows((previewData.drafts || []).map(createBatchImportRow));
      return;
    }

    const draft = previewData.draft || {};
    setImportMode('single');
    setImportPreview(draft);
    setImportOrganizerName(draft.hostName || '');
    setImportName(draft.name || '');
    setImportLocation(draft.location || '');
    setImportStartTime(draft.start_time || '');
    setImportDescription(draft.description || '');
    setImportSourceTags(Array.isArray(draft.sourceTags) ? draft.sourceTags : []);
    setImportSelectedTags([]);
    setImportDuplicate(previewData.duplicate || null);
  }, [importUrl, selectedTenantKey]);

  const updateBatchImportRow = useCallback((key, patch) => {
    setImportBatchRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }, []);

  const selectedBatchRows = useMemo(
    () => importBatchRows.filter((row) => row.selected),
    [importBatchRows],
  );

  const suggestTagsForImport = useCallback(async () => {
    setTagSuggestLoadingKey('single-import');
    const result = await requestSuggestedTags(
      buildTagSuggestPayload({
        name: importName,
        description: importDescription,
        location: importLocation,
        organizerName: importOrganizerName,
        sourceTags: importSourceTags,
      }),
    );
    setTagSuggestLoadingKey(null);

    if (result.error) {
      addNotification({
        title: 'Tag suggestion failed',
        message: result.error,
        type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
      });
      return;
    }

    setImportSelectedTags(result.tags);
    if (!result.tags.length) {
      addNotification({
        title: 'No tags suggested',
        message: 'Claude did not return valid catalog tags for this event.',
        type: 'warning',
      });
      return;
    }

    addNotification({
      title: 'Tags suggested',
      message: result.tags.length
        ? `Claude picked: ${result.tags.join(', ')}`
        : 'No catalog tags matched this event.',
      type: result.tags.length ? 'success' : 'warning',
    });
  }, [
    addNotification,
    buildTagSuggestPayload,
    importDescription,
    importLocation,
    importName,
    importOrganizerName,
    importSourceTags,
    requestSuggestedTags,
  ]);

  const suggestTagsForBatchRow = useCallback(
    async (rowKey) => {
      const row = importBatchRows.find((entry) => entry.key === rowKey);
      if (!row) return;

      setTagSuggestLoadingKey(rowKey);
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: row.name,
          description: row.description,
          location: row.location,
          organizerName: row.organizerName,
          sourceTags: row.sourceTags,
        }),
      );
      setTagSuggestLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
        });
        return;
      }

      updateBatchImportRow(rowKey, { tags: result.tags });
    },
    [addNotification, buildTagSuggestPayload, importBatchRows, requestSuggestedTags, updateBatchImportRow],
  );

  const suggestTagsForSelectedBatchRows = useCallback(async () => {
    if (!selectedBatchRows.length) return;

    setTagSuggestLoadingKey('batch-all');
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/suggest-tags', {
      method: 'POST',
      data: {
        events: selectedBatchRows.map((row) =>
          buildTagSuggestPayload({
            name: row.name,
            description: row.description,
            location: row.location,
            organizerName: row.organizerName,
            sourceTags: row.sourceTags,
          }),
        ),
      },
    });
    setTagSuggestLoadingKey(null);

    if (error || !data?.success) {
      addNotification({
        title: 'Batch tag suggestion failed',
        message: error || data?.message || 'Could not suggest tags.',
        type: data?.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
      });
      return;
    }

    const suggestions = data.data?.suggestions || [];
    const failedCount = data.data?.failedCount ?? 0;
    const suggestedCount = data.data?.suggestedCount ?? 0;
    setImportBatchRows((rows) =>
      rows.map((row) => {
        const selectedIndex = selectedBatchRows.findIndex((entry) => entry.key === row.key);
        if (selectedIndex === -1) return row;
        return { ...row, tags: suggestions[selectedIndex]?.tags || row.tags || [] };
      }),
    );

    if (suggestedCount === 0) {
      addNotification({
        title: 'No tags suggested',
        message: data.data?.failures?.[0]?.message || 'Claude did not return valid catalog tags.',
        type: 'warning',
      });
      return;
    }

    addNotification({
      title: failedCount ? 'Batch partially tagged' : 'Batch tags suggested',
      message: failedCount
        ? `${suggestedCount} row(s) tagged, ${failedCount} failed.`
        : `${suggestedCount} row(s) tagged via Claude.`,
      type: failedCount ? 'warning' : 'success',
    });
  }, [addNotification, buildTagSuggestPayload, selectedBatchRows]);

  const suggestTagsForEdit = useCallback(async () => {
    if (!editDraft) return;

    setTagSuggestLoadingKey('edit');
    const result = await requestSuggestedTags(
      buildTagSuggestPayload({
        name: editDraft.name,
        description: editDraft.description,
        location: editDraft.location,
        organizerName: editDraft.organizerName,
      }),
    );
    setTagSuggestLoadingKey(null);

    if (result.error) {
      addNotification({
        title: 'Tag suggestion failed',
        message: result.error,
        type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
      });
      return;
    }

    setEditDraft({ ...editDraft, tags: result.tags });
  }, [addNotification, buildTagSuggestPayload, editDraft, requestSuggestedTags]);

  const applyTagsToSelectedBatchRows = useCallback(() => {
    if (!batchApplyTags.length) return;
    setImportBatchRows((rows) =>
      rows.map((row) => (row.selected ? { ...row, tags: [...batchApplyTags] } : row)),
    );
  }, [batchApplyTags]);

  const publishableBatchRows = useMemo(
    () =>
      selectedBatchRows.filter(
        (row) =>
          !row.isBlockingDuplicate &&
          row.organizerName.trim() &&
          row.name.trim() &&
          row.location.trim() &&
          row.startTime.trim() &&
          row.tags.length > 0,
      ),
    [selectedBatchRows],
  );

  const selectableBatchRows = useMemo(
    () => importBatchRows.filter((row) => !row.isBlockingDuplicate),
    [importBatchRows],
  );

  const importBlockingDuplicate = isBlockingImportDuplicate(importDuplicate);

  const singleImportDeckPreview = useMemo(
    () =>
      importMode === 'single' && importPreview
        ? buildDeckPreviewProps({
            name: importName,
            organizerName: importOrganizerName,
            startTime: importStartTime,
            location: importLocation,
            description: importDescription,
            imageUrl: importPreview.image,
          })
        : null,
    [
      importDescription,
      importLocation,
      importMode,
      importName,
      importOrganizerName,
      importPreview,
      importStartTime,
    ],
  );

  const editDeckPreview = useMemo(
    () =>
      editingEvent && editDraft
        ? buildDeckPreviewProps({
            name: editDraft.name,
            organizerName: editDraft.organizerName,
            startTime: editDraft.start_time,
            location: editDraft.location,
            description: editingEvent.description,
          })
        : null,
    [editDraft, editingEvent],
  );

  const deckPreviewContent = useMemo(() => {
    if (!deckPreviewState) return null;

    if (deckPreviewState.type === 'batch') {
      const row = importBatchRows.find((entry) => entry.key === deckPreviewState.rowKey);
      if (!row) return null;
      return {
        props: buildDeckPreviewProps({
          name: row.name,
          organizerName: row.organizerName,
          startTime: row.startTime,
          location: row.location,
          description: row.description,
          imageUrl: row.imageUrl,
        }),
        hint: 'Preview updates as you edit the selected batch row.',
      };
    }

    return {
      props: deckPreviewState.props,
      hint: deckPreviewState.hint,
    };
  }, [deckPreviewState, importBatchRows]);

  const handlePublishBatchImport = useCallback(async () => {
    if (!publishableBatchRows.length || !selectedTenantKey) {
      setImportError('Select events with title, organizer, location, start time, and at least one tag.');
      return;
    }

    setImportPublishLoading(true);
    setImportError('');

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/batch', {
      method: 'POST',
      data: {
        tenantKey: selectedTenantKey,
        batchWeek,
        events: publishableBatchRows.map((row) => ({
          url: row.sourceUrl,
          overrides: {
            hostName: row.organizerName.trim(),
            name: row.name.trim(),
            location: row.location.trim(),
            start_time: row.startTime.trim(),
            description: row.description.trim() || undefined,
            image: row.imageUrl.trim() || undefined,
            tags: row.tags,
          },
        })),
      },
    });
    setImportPublishLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not publish selected events.');
      return;
    }

    const publishedCount = data.data?.publishedCount ?? data.data?.published?.length ?? 0;
    const failedCount = data.data?.failedCount ?? data.data?.failures?.length ?? 0;

    refetchEvents();
    refetchOverview();
    addNotification({
      title: failedCount ? 'Batch partially published' : 'Batch published',
      message: failedCount
        ? `${publishedCount} event(s) published, ${failedCount} failed.`
        : `${publishedCount} event(s) added to ${selectedTenantKey}.`,
      type: failedCount ? 'warning' : 'success',
    });
  }, [
    addNotification,
    batchWeek,
    publishableBatchRows,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
  ]);

  const handlePublishImport = useCallback(async () => {
    if (importMode === 'batch') {
      return handlePublishBatchImport();
    }

    if (!importPreview || !selectedTenantKey) {
      setImportError('Preview an event and choose a city before publishing.');
      return;
    }
    if (!importOrganizerName.trim()) {
      setImportError('Organizer name is required.');
      return;
    }
    if (!importSelectedTags.length) {
      setImportError('Select at least one catalog tag.');
      return;
    }

    setImportPublishLoading(true);
    setImportError('');

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
      method: 'POST',
      data: {
        tenantKey: selectedTenantKey,
        url: importUrl.trim(),
        batchWeek,
        overrides: {
          hostName: importOrganizerName.trim(),
          name: importName.trim() || undefined,
          location: importLocation.trim() || undefined,
          start_time: importStartTime.trim() || undefined,
          description: importDescription.trim() || undefined,
          tags: importSelectedTags,
        },
      },
    });
    setImportPublishLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not publish event.');
      return;
    }

    refetchEvents();
    refetchOverview();
    addNotification({
      title: 'Published',
      message: `${data.data?.event?.name || 'Event'} added to ${selectedTenantKey}.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeek,
    handlePublishBatchImport,
    importDescription,
    importLocation,
    importMode,
    importName,
    importOrganizerName,
    importSelectedTags,
    importPreview,
    importStartTime,
    importUrl,
    importBlockingDuplicate,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
  ]);

  const openEditEvent = useCallback((event) => {
    setEditingEvent(event);
    setEditDraft({
      name: event.name || '',
      organizerName: event.organizerName || '',
      location: event.location || '',
      start_time: event.start_time ? new Date(event.start_time).toISOString().slice(0, 16) : '',
      description: event.description || '',
      ingestStatus: event.ingestStatus || 'published',
      tags: Array.isArray(event.tags) ? event.tags : [],
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingEvent || !editDraft || !selectedTenantKey) return;

    setEditSaving(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/ingest/${editingEvent._id}`,
      {
        method: 'PATCH',
        data: {
          tenantKey: selectedTenantKey,
          overrides: {
            name: editDraft.name,
            hostName: editDraft.organizerName,
            location: editDraft.location,
            start_time: editDraft.start_time
              ? new Date(editDraft.start_time).toISOString()
              : undefined,
            ingestStatus: editDraft.ingestStatus,
            tags: editDraft.tags,
          },
        },
      },
    );
    setEditSaving(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Update failed',
        message: error || data?.message || 'Could not update event.',
        type: 'error',
      });
      return;
    }

    setEditingEvent(null);
    setEditDraft(null);
    refetchEvents();
    addNotification({
      title: 'Updated',
      message: 'Catalog event saved.',
      type: 'success',
    });
  }, [addNotification, editDraft, editingEvent, refetchEvents, selectedTenantKey]);

  const snapshotLabel = formatSnapshotAge(overview?.snapshotGeneratedAt);
  const selectedTenant = useMemo(
    () => tenants.find((row) => row.tenantKey === selectedTenantKey) || null,
    [tenants, selectedTenantKey],
  );

  return (
    <div className="pivot-lab linear-admin">
      <header className="pivot-lab__header">
        <div>
          <p className="pivot-lab__eyebrow">Internal · Just Go pilot</p>
          <h1>Pivot Lab</h1>
          <p className="pivot-lab__subtitle">
            Cross-city funnel metrics, catalog events, referral redemptions, and interview themes.
          </p>
        </div>
        <div className="pivot-lab__controls">
          <label className="linear-field">
            <span className="linear-field__label">Batch week</span>
            <input
              className="linear-input"
              value={batchWeek}
              onChange={(e) => setBatchWeek(e.target.value.toUpperCase())}
              placeholder="2026-W26"
            />
          </label>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => refetchOverview()}
            disabled={overviewLoading}
          >
            {overviewLoading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handleRebuildSnapshot}
            disabled={rebuildingSnapshot}
          >
            {rebuildingSnapshot ? 'Rebuilding…' : 'Rebuild snapshot'}
          </button>
        </div>
      </header>

      {snapshotLabel ? (
        <p className="pivot-lab__snapshot-meta">
          Snapshot generated {snapshotLabel}
        </p>
      ) : (
        <p className="pivot-lab__snapshot-meta pivot-lab__snapshot-meta--stale">
          No stored snapshot for this week — live aggregates shown.
        </p>
      )}

      {overviewError ? (
        <p className="pivot-lab__error">{overviewError}</p>
      ) : null}

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-cities">
        <h2 id="pivot-lab-cities" className="linear-section__title">
          City summary
        </h2>
        {overviewLoading && !tenants.length ? (
          <p className="pivot-lab__empty">Loading overview…</p>
        ) : tenants.length ? (
          <div className="pivot-lab__city-grid">
            {tenants.map((tenant) => (
              <CitySummaryCard key={tenant.tenantKey} tenant={tenant} />
            ))}
          </div>
        ) : (
          <p className="pivot-lab__empty">No pivot cities configured for this week.</p>
        )}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-import">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-import" className="linear-section__title">
              Import event
            </h2>
            <p className="pivot-lab__notes-hint">
              Paste a single event link or a city explore page (Partiful explore or Luma city calendar),
              review drafts, set organizer names, and publish to the selected city for {batchWeek}.
            </p>
          </div>
          <label className="linear-field pivot-lab__tenant-filter">
            <span className="linear-field__label">City</span>
            <select
              className="linear-input"
              value={selectedTenantKey}
              onChange={(e) => setSelectedTenantKey(e.target.value)}
              disabled={!tenants.length}
            >
              {tenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenant.cityDisplayName || tenant.tenantKey}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pivot-lab__import-row">
          <label className="linear-field pivot-lab__import-url">
            <span className="linear-field__label">Event or explore URL</span>
            <input
              className="linear-input"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://partiful.com/e/…, https://partiful.com/explore/sf, or https://luma.com/sf"
            />
          </label>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handlePreviewImport}
            disabled={importLoading}
          >
            {importLoading ? 'Fetching…' : 'Preview import'}
          </button>
        </div>
        {importError ? <p className="pivot-lab__error">{importError}</p> : null}
        {importMode === 'batch' && importBatchRows.length ? (
          <div className="pivot-lab__import-preview">
            {importProvider ? (
              <p className="pivot-lab__import-provider">Detected provider: {importProvider}</p>
            ) : null}
            <p className="pivot-lab__batch-summary">
              Found {importBatchRows.length} event(s) from {importBatchLabel}. Select rows to publish
              and fill any missing organizer names.
            </p>
            {importWarnings.length ? (
              <ul className="pivot-lab__import-warnings">
                {importWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="pivot-lab__batch-tag-tools">
              <PivotTagMultiSelect
                catalogTags={catalogTags}
                selectedSlugs={batchApplyTags}
                onChange={setBatchApplyTags}
                labelId="pivot-lab-batch-apply-tags"
                hint="Optional shortcut: pick tags once, then apply to all selected rows."
                compact
              />
              <div className="pivot-lab__notes-actions pivot-lab__batch-tag-actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={applyTagsToSelectedBatchRows}
                  disabled={!batchApplyTags.length || !selectedBatchRows.length}
                >
                  Apply to selected
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={suggestTagsForSelectedBatchRows}
                  disabled={!selectedBatchRows.length || tagSuggestLoadingKey === 'batch-all'}
                >
                  {tagSuggestLoadingKey === 'batch-all'
                    ? 'Suggesting…'
                    : 'Suggest tags for selected (Claude)'}
                </button>
              </div>
            </div>
            <div className="pivot-lab__table-wrap">
              <table className="pivot-lab__table pivot-lab__batch-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select all events"
                        checked={
                          selectableBatchRows.length > 0 &&
                          selectableBatchRows.every((row) => row.selected)
                        }
                        onChange={(e) => {
                          const { checked } = e.target;
                          setImportBatchRows((rows) =>
                            rows.map((row) => ({
                              ...row,
                              selected: checked && !row.isBlockingDuplicate,
                            })),
                          );
                        }}
                      />
                    </th>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <th scope="col">Organizer</th>
                    <th scope="col">When</th>
                    <th scope="col">Location</th>
                    <th scope="col">Tags</th>
                    <th scope="col">Source</th>
                    <th scope="col">Deck</th>
                  </tr>
                </thead>
                <tbody>
                  {importBatchRows.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.isBlockingDuplicate
                          ? 'pivot-lab__batch-row--duplicate'
                          : row.warnings.length || row.duplicate
                            ? 'pivot-lab__batch-row--warn'
                            : ''
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={row.isBlockingDuplicate}
                          onChange={(e) =>
                            updateBatchImportRow(row.key, { selected: e.target.checked })
                          }
                          aria-label={`Select ${row.name || 'event'}`}
                        />
                      </td>
                      <td>{row.name || '—'}</td>
                      <td>
                        {row.duplicateLabel ? (
                          <span
                            className={`pivot-lab__duplicate-pill${
                              row.isBlockingDuplicate
                                ? ' pivot-lab__duplicate-pill--blocking'
                                : ' pivot-lab__duplicate-pill--update'
                            }`}
                          >
                            {row.duplicateLabel}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <input
                          className="linear-input pivot-lab__batch-input"
                          value={row.organizerName}
                          onChange={(e) =>
                            updateBatchImportRow(row.key, { organizerName: e.target.value })
                          }
                          placeholder="Required"
                        />
                      </td>
                      <td>{formatEventWhen(row.startTime)}</td>
                      <td>{row.location || '—'}</td>
                      <td className="pivot-lab__batch-tags-cell">
                        <PivotTagMultiSelect
                          catalogTags={catalogTags}
                          selectedSlugs={row.tags}
                          onChange={(tags) => updateBatchImportRow(row.key, { tags })}
                          labelId={`pivot-lab-batch-tags-${row.key}`}
                          compact
                          showLabel={false}
                        />
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost pivot-lab__tag-ai-btn"
                          onClick={() => suggestTagsForBatchRow(row.key)}
                          disabled={tagSuggestLoadingKey === row.key}
                        >
                          {tagSuggestLoadingKey === row.key ? '…' : 'AI'}
                        </button>
                      </td>
                      <td>
                        {row.sourceUrl ? (
                          <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                          onClick={() =>
                            setDeckPreviewState({ type: 'batch', rowKey: row.key })
                          }
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pivot-lab__notes-actions">
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                onClick={handlePublishBatchImport}
                disabled={
                  importPublishLoading || !selectedTenantKey || !publishableBatchRows.length
                }
              >
                {importPublishLoading
                  ? 'Publishing…'
                  : `Publish ${publishableBatchRows.length} selected to ${selectedTenantKey || 'city'}`}
              </button>
            </div>
          </div>
        ) : null}
        {importMode === 'single' && importPreview ? (
          <div className="pivot-lab__import-preview">
            {importProvider ? (
              <p className="pivot-lab__import-provider">Detected provider: {importProvider}</p>
            ) : null}
            <div className="pivot-lab__import-layout">
              <div className="pivot-lab__import-main">
                <div className="pivot-lab__import-grid">
                  <label className="linear-field">
                    <span className="linear-field__label">Event title</span>
                    <input
                      className="linear-input"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Organizer name</span>
                    <input
                      className="linear-input"
                      value={importOrganizerName}
                      onChange={(e) => setImportOrganizerName(e.target.value)}
                      placeholder="Required before publish"
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Start time</span>
                    <input
                      className="linear-input"
                      value={importStartTime}
                      onChange={(e) => setImportStartTime(e.target.value)}
                      placeholder="ISO datetime or edit after preview"
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Location</span>
                    <input
                      className="linear-input"
                      value={importLocation}
                      onChange={(e) => setImportLocation(e.target.value)}
                    />
                  </label>
                </div>
                <div className="pivot-lab__tag-actions">
                  <PivotTagMultiSelect
                    catalogTags={catalogTags}
                    selectedSlugs={importSelectedTags}
                    onChange={setImportSelectedTags}
                    labelId="pivot-lab-import-tags"
                    hint={
                      importSourceTags.length
                        ? `Required — pick catalog tags. Listing hints: ${importSourceTags.join(', ')}`
                        : 'Required — pick at least one tag from the catalog.'
                    }
                  />
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={suggestTagsForImport}
                    disabled={tagSuggestLoadingKey === 'single-import'}
                  >
                    {tagSuggestLoadingKey === 'single-import'
                      ? 'Suggesting…'
                      : 'Suggest tags with Claude'}
                  </button>
                </div>
                <label className="linear-field">
                  <span className="linear-field__label">Description</span>
                  <textarea
                    className="pivot-lab__notes"
                    value={importDescription}
                    onChange={(e) => setImportDescription(e.target.value)}
                    rows={3}
                  />
                </label>
                {importPreview.image ? (
                  <p className="pivot-lab__import-image">
                    Cover image:{' '}
                    <a href={importPreview.image} target="_blank" rel="noreferrer">
                      preview
                    </a>
                  </p>
                ) : null}
                {importWarnings.length ? (
                  <ul className="pivot-lab__import-warnings">
                    {importWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="pivot-lab__notes-actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handlePublishImport}
                    disabled={
                      importPublishLoading ||
                      !selectedTenantKey ||
                      importBlockingDuplicate ||
                      !importSelectedTags.length
                    }
                  >
                    {importPublishLoading
                      ? 'Publishing…'
                      : `Publish to ${selectedTenantKey || 'city'}`}
                  </button>
                </div>
              </div>
              {singleImportDeckPreview ? (
                <PivotDeckPhonePreview
                  {...singleImportDeckPreview}
                  hint="Live preview of the swipe deck card."
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-events">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-events" className="linear-section__title">
              Catalog events
            </h2>
            {selectedTenant?.dropSchedule ? (
              <p className="pivot-lab__next-drop">
                Next drop ({batchWeek}): {selectedTenant.dropSchedule.nextDropFormatted}
                {' · '}
                {selectedTenant.dropSchedule.localSchedule}
              </p>
            ) : null}
          </div>
        </div>
        {eventsError ? <p className="pivot-lab__error">{eventsError}</p> : null}
        {eventsLoading ? (
          <p className="pivot-lab__empty">Loading events…</p>
        ) : events.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Organizer</th>
                  <th scope="col">When</th>
                  <th scope="col">Location</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Tickets</th>
                  <th scope="col">Deck</th>
                  <th scope="col">Edit</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event._id}>
                    <td>{event.name}</td>
                    <td>{event.organizerName || '—'}</td>
                    <td>{formatEventWhen(event.start_time)}</td>
                    <td>{event.location || '—'}</td>
                    <td>{formatEventTags(event.tags)}</td>
                    <td>{event.source || '—'}</td>
                    <td>
                      <IngestStatusPill status={event.ingestStatus} />
                    </td>
                    <td>
                      {event.externalLink ? (
                        <a href={event.externalLink} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                        onClick={() =>
                          setDeckPreviewState({
                            type: 'static',
                            props: buildDeckPreviewProps({
                              name: event.name,
                              organizerName: event.organizerName,
                              startTime: event.start_time,
                              endTime: event.end_time,
                              location: event.location,
                            }),
                          })
                        }
                      >
                        Preview
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                        onClick={() => openEditEvent(event)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No catalog events for this city and week.</p>
        )}
        {editingEvent && editDraft ? (
          <div className="pivot-lab__import-preview pivot-lab__edit-panel">
            <h3 className="pivot-lab__edit-title">Edit catalog event</h3>
            <div className="pivot-lab__import-layout">
              <div className="pivot-lab__import-main">
                <div className="pivot-lab__import-grid">
                  <label className="linear-field">
                    <span className="linear-field__label">Event title</span>
                    <input
                      className="linear-input"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Organizer name</span>
                    <input
                      className="linear-input"
                      value={editDraft.organizerName}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, organizerName: e.target.value })
                      }
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Start time</span>
                    <input
                      className="linear-input"
                      type="datetime-local"
                      value={editDraft.start_time}
                      onChange={(e) => setEditDraft({ ...editDraft, start_time: e.target.value })}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Location</span>
                    <input
                      className="linear-input"
                      value={editDraft.location}
                      onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Ingest status</span>
                    <select
                      className="linear-input"
                      value={editDraft.ingestStatus}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, ingestStatus: e.target.value })
                      }
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </label>
                </div>
                <div className="pivot-lab__tag-actions">
                  <PivotTagMultiSelect
                    catalogTags={catalogTags}
                    selectedSlugs={editDraft.tags}
                    onChange={(tags) => setEditDraft({ ...editDraft, tags })}
                    labelId="pivot-lab-edit-tags"
                    hint="Select at least one catalog tag for published events."
                  />
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={suggestTagsForEdit}
                    disabled={tagSuggestLoadingKey === 'edit'}
                  >
                    {tagSuggestLoadingKey === 'edit' ? 'Suggesting…' : 'Suggest tags with Claude'}
                  </button>
                </div>
                <div className="pivot-lab__notes-actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={() => {
                      setEditingEvent(null);
                      setEditDraft(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                  >
                    {editSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              {editDeckPreview ? (
                <PivotDeckPhonePreview
                  {...editDeckPreview}
                  hint="Live preview of the swipe deck card."
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-referrals">
        <h2 id="pivot-lab-referrals" className="linear-section__title">
          Referral codes
        </h2>
        {referralRows.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">City</th>
                  <th scope="col">Cohort</th>
                  <th scope="col">Redemptions</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {referralRows.map((row) => (
                  <tr key={`${row.tenantKey}-${row.code}`}>
                    <td>{row.code}</td>
                    <td>{row.cityDisplayName}</td>
                    <td>{row.cohortId || '—'}</td>
                    <td>
                      {row.redemptionCount ?? 0} / {row.maxRedemptions ?? 0}
                    </td>
                    <td>
                      <ReferralStatus code={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No referral codes for pivot cities.</p>
        )}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-notes">
        <h2 id="pivot-lab-notes" className="linear-section__title">
          Interview notes
        </h2>
        <p className="pivot-lab__notes-hint">
          Log qualitative themes from pilot interviews. Saved per batch week in the global DB.
        </p>
        <textarea
          className="pivot-lab__notes"
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesDirty(true);
          }}
          rows={8}
          placeholder="Week themes, quotes, blockers…"
          disabled={notesLoading}
        />
        <div className="pivot-lab__notes-actions">
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handleSaveNotes}
            disabled={savingNotes || notesLoading || !notesDirty}
          >
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </section>

      {IS_DEV ? (
        <section
          className="linear-section pivot-lab__section pivot-lab__dev-tools"
          aria-labelledby="pivot-lab-dev-tools"
        >
          <h2 id="pivot-lab-dev-tools" className="linear-section__title">
            Dev tools
          </h2>
          <p className="pivot-lab__notes-hint">
            Development only. Deletes all pivot catalog events (every batch week), attendee intents,
            event feedback, and stored weekly snapshots. Referral codes and interview notes are kept.
          </p>
          <div className="pivot-lab__dev-tools-grid">
            <label className="linear-field">
              <span className="linear-field__label">Scope</span>
              <select
                className="linear-input"
                value={purgeScope}
                onChange={(e) => setPurgeScope(e.target.value)}
              >
                <option value="selected">Selected city only</option>
                <option value="all">All pivot cities</option>
              </select>
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Type {PURGE_CONFIRM_TOKEN} to confirm</span>
              <input
                className="linear-input"
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder={PURGE_CONFIRM_TOKEN}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="pivot-lab__notes-actions">
            <button
              type="button"
              className="linear-btn pivot-lab__purge-btn"
              onClick={handlePurgeCatalog}
              disabled={
                purgingCatalog ||
                purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN ||
                (purgeScope === 'selected' && !selectedTenantKey)
              }
            >
              {purgingCatalog ? 'Purging…' : 'Purge catalog events'}
            </button>
          </div>
        </section>
      ) : null}

      <DeckPreviewModal
        previewProps={deckPreviewContent?.props}
        hint={deckPreviewContent?.hint}
        onClose={() => setDeckPreviewState(null)}
      />
    </div>
  );
}

export default PivotLabPage;
