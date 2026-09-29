import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboard } from '../../../contexts/DashboardContext';
import PivotBatchExplorePreview from './PivotBatchExplorePreview';
import './PivotTenantExplorePanel.scss';

const NO_FETCH_CACHE = { enabled: false };
const COLLECTION_SEARCH_DEBOUNCE_MS = 300;
const MAX_COLLECTION_EVENTS = 10;

function emptyCollectionDraft() {
  return { title: '', subtitle: '', events: [] };
}

/**
 * A handful of hand-picked events bundled into one themed Explore row (a
 * weekly theme, a holiday, etc.) — `sectionsSource: 'curated'` on the client.
 */
function PivotExploreCollectionsEditor({ tenantKey, batchWeek }) {
  const { addNotification } = useNotification();
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyCollectionDraft);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const collectionsUrl =
    tenantKey && batchWeek
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/explore/collections`
      : null;
  const {
    data: collectionsResponse,
    loading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useFetch(collectionsUrl, { params: { batchWeek }, cache: NO_FETCH_CACHE });

  const collections = collectionsResponse?.success
    ? (collectionsResponse.data?.collections ?? [])
    : [];

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), COLLECTION_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!formOpen || !tenantKey || !batchWeek) return undefined;
    let cancelled = false;
    setSearchLoading(true);
    authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousel-catalog`,
      { params: { batchWeek, q: searchQuery || undefined, limit: 12 } },
    ).then(({ data }) => {
      if (cancelled) return;
      setSearchResults(data?.success ? (data.data?.events ?? []) : []);
    }).finally(() => {
      if (!cancelled) setSearchLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [formOpen, tenantKey, batchWeek, searchQuery]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setDraft(emptyCollectionDraft());
    setSearchInput('');
    setSearchQuery('');
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((collection) => {
    setEditingId(collection._id);
    setDraft({
      title: collection.title || '',
      subtitle: collection.subtitle || '',
      events: collection.events?.length
        ? collection.events
        : (collection.eventIds || []).map((id) => ({ _id: id, name: id })),
    });
    setSearchInput('');
    setSearchQuery('');
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
  }, [saving]);

  const addEventToDraft = useCallback((event) => {
    setDraft((current) => {
      if (current.events.some((row) => row._id === event._id)) return current;
      if (current.events.length >= MAX_COLLECTION_EVENTS) return current;
      return { ...current, events: [...current.events, event] };
    });
  }, []);

  const removeEventFromDraft = useCallback((eventId) => {
    setDraft((current) => ({
      ...current,
      events: current.events.filter((row) => row._id !== eventId),
    }));
  }, []);

  const moveEventInDraft = useCallback((index, delta) => {
    setDraft((current) => {
      const next = current.events.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, events: next };
    });
  }, []);

  const handleSave = useCallback(async () => {
    const title = draft.title.trim();
    if (!title) {
      addNotification({ title: 'Title required', message: 'Give the collection a short title.', type: 'warning' });
      return;
    }
    if (!draft.events.length) {
      addNotification({ title: 'Add events', message: 'Pick at least one event for this collection.', type: 'warning' });
      return;
    }

    setSaving(true);
    const path = editingId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/explore/collections/${encodeURIComponent(editingId)}`
      : `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/explore/collections`;
    const { data, error } = await authenticatedRequest(path, {
      method: editingId ? 'PATCH' : 'POST',
      data: {
        batchWeek,
        title,
        subtitle: draft.subtitle.trim() || undefined,
        eventIds: draft.events.map((event) => event._id),
      },
    });
    setSaving(false);

    if (error || !data?.success) {
      addNotification({
        title: editingId ? 'Update failed' : 'Create failed',
        message: error || data?.message || 'Could not save the collection.',
        type: 'error',
      });
      return;
    }

    setFormOpen(false);
    setEditingId(null);
    refetchCollections();
    addNotification({
      title: editingId ? 'Collection updated' : 'Collection created',
      message: `“${title}” will render as one Explore row for ${batchWeek}.`,
      type: 'success',
    });
  }, [addNotification, batchWeek, draft, editingId, refetchCollections, tenantKey]);

  const handleDelete = useCallback(async (collection) => {
    if (!window.confirm(`Delete the “${collection.title}” collection?`)) return;
    setDeletingId(collection._id);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/explore/collections/${encodeURIComponent(collection._id)}`,
      { method: 'DELETE' },
    );
    setDeletingId(null);
    if (error || !data?.success) {
      addNotification({
        title: 'Delete failed',
        message: error || data?.message || 'Could not delete the collection.',
        type: 'error',
      });
      return;
    }
    refetchCollections();
    addNotification({ title: 'Collection deleted', type: 'success' });
  }, [addNotification, refetchCollections, tenantKey]);

  const draftEventIds = useMemo(() => new Set(draft.events.map((event) => event._id)), [draft.events]);

  return (
    <section className="pivot-explore-collections">
      <div className="pivot-explore-collections__head">
        <div>
          <h2 className="linear-section__title">Explore collections</h2>
          <p className="pivot-lab__section-hint">
            Bundle a few events into one themed Explore row — weekly themes, holidays, etc.
          </p>
        </div>
        {!formOpen ? (
          <button type="button" className="linear-btn linear-btn--secondary" onClick={openCreate}>
            New collection
          </button>
        ) : null}
      </div>

      {collectionsError ? (
        <p className="pivot-explore-collections__status pivot-explore-collections__status--error">
          {collectionsError}
        </p>
      ) : null}

      {!formOpen ? (
        collectionsLoading ? (
          <p className="pivot-explore-collections__status">Loading…</p>
        ) : collections.length ? (
          <ul className="pivot-explore-collections__list">
            {collections.map((collection) => (
              <li key={collection._id} className="pivot-explore-collections__row">
                <div className="pivot-explore-collections__row-copy">
                  <span className="pivot-explore-collections__row-title">{collection.title}</span>
                  <span className="pivot-explore-collections__row-meta">
                    {collection.eventIds?.length ?? 0} event(s)
                    {collection.active === false ? ' · hidden' : ''}
                  </span>
                </div>
                <div className="pivot-explore-collections__row-actions">
                  <button type="button" className="linear-btn linear-btn--ghost" onClick={() => openEdit(collection)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    disabled={deletingId === collection._id}
                    onClick={() => handleDelete(collection)}
                  >
                    {deletingId === collection._id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pivot-explore-collections__status">
            No curated collections for {batchWeek} yet.
          </p>
        )
      ) : (
        <div className="pivot-explore-collections__form">
          <label className="pivot-explore-collections__field">
            <span>Title</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
              placeholder="e.g. Spooky season picks"
              autoFocus
            />
          </label>
          <label className="pivot-explore-collections__field">
            <span>Subtitle (optional)</span>
            <input
              value={draft.subtitle}
              onChange={(e) => setDraft((current) => ({ ...current, subtitle: e.target.value }))}
              placeholder="e.g. Halloween events this week"
            />
          </label>

          <div className="pivot-explore-collections__events">
            <div className="pivot-explore-collections__events-col">
              <span className="pivot-explore-collections__events-label">
                Selected ({draft.events.length}/{MAX_COLLECTION_EVENTS})
              </span>
              {draft.events.length ? (
                <ul className="pivot-explore-collections__event-list">
                  {draft.events.map((event, index) => (
                    <li key={event._id} className="pivot-explore-collections__event-row">
                      <span className="pivot-explore-collections__event-name">{event.name}</span>
                      <div className="pivot-explore-collections__event-actions">
                        <button type="button" disabled={index === 0} onClick={() => moveEventInDraft(index, -1)}>
                          <Icon icon="mdi:arrow-up" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={index === draft.events.length - 1}
                          onClick={() => moveEventInDraft(index, 1)}
                        >
                          <Icon icon="mdi:arrow-down" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => removeEventFromDraft(event._id)}>
                          <Icon icon="mdi:close" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pivot-explore-collections__status">Search and add events on the right.</p>
              )}
            </div>

            <div className="pivot-explore-collections__events-col">
              <span className="pivot-explore-collections__events-label">Search published events</span>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="search by name, host, or location"
              />
              {searchLoading ? (
                <p className="pivot-explore-collections__status">Searching…</p>
              ) : (
                <ul className="pivot-explore-collections__event-list">
                  {searchResults.map((event) => (
                    <li key={event._id} className="pivot-explore-collections__event-row">
                      <span className="pivot-explore-collections__event-name">{event.name}</span>
                      <button
                        type="button"
                        className="linear-btn linear-btn--ghost"
                        disabled={draftEventIds.has(event._id) || draft.events.length >= MAX_COLLECTION_EVENTS}
                        onClick={() => addEventToDraft(event)}
                      >
                        {draftEventIds.has(event._id) ? 'Added' : 'Add'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="pivot-explore-collections__form-actions">
            <button type="button" className="linear-btn linear-btn--ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="linear-btn linear-btn--secondary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create collection'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Full dashboard overlay — mobile Explore preview for the selected batch week,
 * plus the admin-curated collections editor for that same week.
 */
function PivotTenantExplorePanel({
  tenantKey,
  batchWeek,
  cityDisplayName,
  weekRangeLabel,
}) {
  const { hideOverlay } = useDashboard();

  return (
    <div className="pivot-tenant-explore-panel">
      <header className="pivot-tenant-explore-panel__header">
        <button
          type="button"
          className="pivot-tenant-explore-panel__back linear-btn linear-btn--ghost"
          onClick={hideOverlay}
        >
          <Icon icon="mdi:arrow-left" aria-hidden="true" />
          Back to curation
        </button>
        <div className="pivot-tenant-explore-panel__titles">
          <h1 className="pivot-tenant-explore-panel__title">Explore preview</h1>
          <p className="pivot-tenant-explore-panel__subtitle">
            {batchWeek}
            {weekRangeLabel ? ` · ${weekRangeLabel}` : ''}
            {cityDisplayName ? ` · ${cityDisplayName}` : ''}
          </p>
        </div>
      </header>
      <div className="pivot-tenant-explore-panel__body">
        <PivotExploreCollectionsEditor tenantKey={tenantKey} batchWeek={batchWeek} />
        <PivotBatchExplorePreview
          tenantKey={tenantKey}
          batchWeek={batchWeek}
          cityDisplayName={cityDisplayName}
          weekRangeLabel={weekRangeLabel}
          layout="panel"
        />
      </div>
    </div>
  );
}

export default PivotTenantExplorePanel;
