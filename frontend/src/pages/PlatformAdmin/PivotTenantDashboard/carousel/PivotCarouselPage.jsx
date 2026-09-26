/**
 * Carousel — the "sorry u missed it" Instagram deck, per tenant.
 *
 * A light table of repeatable 4:5 frames in the Just Go zine register: the
 * avant-garde end of the design language, spent loudly because a social post
 * is not a surface anyone has to operate.
 *
 * This page owns the deck: loading it, holding the working draft, and saving.
 * PivotCarouselEditor owns the editing, and the frames own the rendering. A
 * slot write goes draft → PATCH → reload, so what you see after a save is what
 * the server actually stored rather than what the browser hoped it stored.
 *
 * Platform-admin only, reached from the tenant dashboard.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import useAuth from '../../../../hooks/useAuth';
import { useNotification } from '../../../../NotificationContext';
import PivotTenantPage from '../PivotTenantPage';
import PivotCarouselEditor from './PivotCarouselEditor';
import PivotCarouselLibrary from './PivotCarouselLibrary';
import PivotCarouselCurationWorkspace from './PivotCarouselCurationWorkspace';
import StudioEditor from './studio/StudioEditor';
import { librarySelection } from './carouselLibrary';
import { candidateToSelection } from './carouselCurationSelection';
import useCarouselExport from './useCarouselExport';
import PivotCarouselExportPanel from './PivotCarouselExportPanel';
import {
  ZineBack,
  ZineCard,
  ZineCover,
  ZineDispatch,
  ZineNotice,
  ZineReceipt,
  ZineSheet,
} from './zineFrames';
import './PivotCarouselPage.scss';

/**
 * The rendering half of a slide type. The data half is the manifest in
 * backend/constants/zineSlideTypes.js; the two are joined by the type key
 * alone, so adding a template touches one entry in each and nothing else.
 */
const FRAME_COMPONENTS = {
  cover: ZineCover,
  wall: ZineSheet,
  card: ZineCard,
  notice: ZineNotice,
  dispatch: ZineDispatch,
  receipt: ZineReceipt,
  back: ZineBack,
};

const EDITIONS = [
  { key: 'night', label: 'night press' },
  { key: 'paper', label: 'newsprint' },
];

function decksPath(tenantKey) {
  return `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousels`;
}

function EditionTools({
  edition,
  onEdition,
  showIssueNumber,
  onShowIssueNumber,
  inkPlate,
  onInkPlate,
}) {
  return (
    <div className="jgz__controls">
      <div className="jgz__switch" role="group" aria-label="Edition">
        {EDITIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={edition === option.key}
            onClick={() => onEdition(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="jgz__ink">
        <input
          type="checkbox"
          checked={showIssueNumber}
          onChange={(event) => onShowIssueNumber(event.target.checked)}
        />
        <span>issue no.</span>
      </label>
      {/* Only newsprint has an ink plate, so the control appears with it. */}
      {edition === 'paper' ? (
        <label className="jgz__ink">
          <input
            type="checkbox"
            checked={inkPlate}
            onChange={(event) => onInkPlate(event.target.checked)}
          />
          <span>ink plate</span>
        </label>
      ) : null}
    </div>
  );
}

export default function PivotCarouselPage({ tenantKey, cityDisplayName }) {
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDeckId = searchParams.get('deckId');
  const requestedCurationId = searchParams.get('curation');
  const requestedAccountId = searchParams.get('account');

  const [deck, setDeck] = useState(null);
  const [draft, setDraft] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [cityVoice, setCityVoice] = useState(null);
  const [library, setLibrary] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [libraryMode, setLibraryMode] = useState('list');
  const [missingId, setMissingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edition, setEdition] = useState('night');
  const [inkPlate, setInkPlate] = useState(true);
  const [showIssueNumber, setShowIssueNumber] = useState(true);
  const [focused, setFocused] = useState(false);

  const toggleFocus = useCallback(() => setFocused((on) => !on), []);

  const editionTools = (
    <EditionTools
      edition={edition}
      onEdition={setEdition}
      showIssueNumber={showIssueNumber}
      onShowIssueNumber={setShowIssueNumber}
      inkPlate={inkPlate}
      onInkPlate={setInkPlate}
    />
  );

  /** Open a deck only when the URL names it. Otherwise stay on the library. */
  const load = useCallback(async () => {
    if (!tenantKey) return;
    setLoading(true);

    const [list, accountList] = await Promise.all([
      authenticatedRequest(decksPath(tenantKey)),
      authenticatedRequest('/admin/pivot/carousel-accounts', { params: { ownerTenantKey: tenantKey } }),
    ]);
    const rows = list.data?.success ? list.data.data?.decks || [] : [];
    const accountRows = accountList.data?.success ? accountList.data.data?.accounts || [] : [];
    setLibrary(rows);
    setAccounts(accountRows);
    setAccountId((current) => requestedAccountId || current || accountRows[0]?.id || '');

    if (requestedCurationId) {
      setLibraryMode('curate');
      setMissingId(null);
      if (!requestedDeckId) {
        setDeck(null);
        setDraft(null);
        setManifest(null);
        setCityVoice(null);
        setFocused(false);
        setLoading(false);
        return;
      }
    }

    const selection = librarySelection(rows, requestedDeckId);
    if (!requestedCurationId) setLibraryMode(selection.mode);
    if (selection.mode !== 'open') {
      setDeck(null);
      setDraft(null);
      setManifest(null);
      setCityVoice(null);
      setFocused(false);
      setMissingId(selection.mode === 'missing' ? selection.requestedId : null);
      setLoading(false);
      return;
    }

    setMissingId(null);
    const full = await authenticatedRequest(`${decksPath(tenantKey)}/${selection.deckId}`);
    if (full.data?.success) {
      setDeck(full.data.data.deck);
      setDraft(full.data.data.deck);
      setManifest(full.data.data.manifest);
      setCityVoice(full.data.data.cityVoice || {});
      setEdition(full.data.data.deck.edition || 'night');
      setInkPlate(full.data.data.deck.inkPlate !== false);
      setShowIssueNumber(full.data.data.deck.showIssueNumber !== false);
    } else {
      setDeck(null);
      setDraft(null);
      setManifest(null);
      setLibraryMode('missing');
      setMissingId(selection.deckId);
    }
    setLoading(false);
  }, [tenantKey, requestedDeckId, requestedCurationId, requestedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDeck = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    const result = await authenticatedRequest(`${decksPath(tenantKey)}/${draft._id}`, {
      method: 'PATCH',
      data: {
        title: draft.title,
        edition,
        inkPlate,
        showIssueNumber,
        issue: draft.issue,
        voice: draft.voice,
        slides: draft.slides,
      },
    });
    setSaving(false);

    if (!result.data?.success) {
      addNotification({
        title: 'Could not save the deck',
        message: result.data?.message || 'The request failed.',
        type: 'error',
      });
      return;
    }

    // Take the server's copy back, not the draft: a value the manifest trimmed
    // has to show trimmed, or the next save silently reverts it.
    const saved = result.data.data.deck;
    const notes = result.data.data.notes || [];
    setDeck(saved);
    setDraft(saved);
    addNotification({
      title: 'Deck saved',
      message: notes.length ? `${notes.length} value(s) trimmed to fit: ${notes[0]}` : 'All slots fit.',
      type: notes.length ? 'warning' : 'success',
    });
    // inkPlate is in the payload, so it has to be in the deps: without it this
    // callback closes over the value from the render before the toggle and
    // saves the setting you just changed away from.
  }, [draft, edition, inkPlate, showIssueNumber, tenantKey, addNotification]);

  /**
   * An image upload writes straight through to the server rather than into the
   * draft: the file cannot live in a JSON deck, and the reply carries the saved
   * deck back with the override already on it.
   */
  const setSlotImage = useCallback(
    async (slideId, slotIndex, file) => {
      if (!draft?._id) return;
      const form = new FormData();
      form.append('image', file);
      form.append('slotIndex', String(slotIndex));

      const result = await authenticatedRequest(
        `${decksPath(tenantKey)}/${draft._id}/slides/${slideId}/image`,
        { method: 'POST', data: form },
      );

      if (!result.data?.success) {
        addNotification({
          title: 'Could not set the photo',
          message: result.data?.message || 'The upload failed.',
          type: 'error',
        });
        return;
      }
      const saved = result.data.data.deck;
      setDeck(saved);
      setDraft(saved);
      addNotification({ title: 'Photo set', message: 'The slide uses it now.', type: 'success' });
    },
    [draft, tenantKey, addNotification],
  );

  const dirty = useMemo(
    () => Boolean(
      draft && deck && (
        JSON.stringify(draft) !== JSON.stringify(deck)
        || edition !== deck.edition
        || inkPlate !== (deck.inkPlate !== false)
        || showIssueNumber !== (deck.showIssueNumber !== false)
      ),
    ),
    [draft, deck, edition, inkPlate, showIssueNumber],
  );

  const exportState = useCarouselExport({
    tenantKey,
    deck,
    dirty: draft?.schemaVersion === 2 ? false : dirty,
  });

  const ensureAccount = useCallback(async () => {
    if (accountId) {
      const match = accounts.find((account) => account.id === accountId);
      if (match) return match;
    }
    const createdAccount = await authenticatedRequest('/admin/pivot/carousel-accounts', {
      method: 'POST',
      data: {
        displayName: cityDisplayName || tenantKey,
        ownerTenantKey: tenantKey,
        sourceTenantKeys: [tenantKey],
      },
    });
    const account = createdAccount.data?.data?.account;
    if (!account) {
      addNotification({
        title: 'Could not create an account',
        message: createdAccount.data?.message || 'The request failed.',
        type: 'error',
      });
      return null;
    }
    setAccountId(account.id);
    setAccounts((current) => (current.some((row) => row.id === account.id) ? current : [...current, account]));
    return account;
  }, [accountId, accounts, addNotification, cityDisplayName, tenantKey]);

  const openCuration = useCallback((id, account) => {
    const next = new URLSearchParams(searchParams);
    next.delete('deckId');
    if (account?.id) next.set('account', account.id);
    next.set('curation', id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const createDeck = useCallback(async () => {
    setSeeding(true);
    const account = await ensureAccount();
    if (!account) {
      setSeeding(false);
      return;
    }
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${account.id}/curation/drafts`, {
      method: 'POST',
      data: { format: account.defaultFormat || 'city-picks' },
    });
    setSeeding(false);
    if (result.data?.success) {
      openCuration(result.data.data.draft.id, account);
    } else {
      addNotification({
        title: 'Could not start curation',
        message: result.data?.message || 'The request failed.',
        type: 'error',
      });
    }
  }, [addNotification, ensureAccount, openCuration]);

  const archiveCarousel = useCallback(async (issue) => {
    const account = issue.accountId || accountId;
    if (!account) {
      addNotification({ title: 'Could not archive', message: 'This carousel is not on an account yet.', type: 'error' });
      return;
    }
    if (!window.confirm(`Archive “${issue.name || issue.title || 'this carousel'}”?`)) return;
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${account}/issues/${issue._id}/archive`, {
      method: 'POST',
      data: { revision: issue.revision },
    });
    if (!result.data?.success) {
      addNotification({ title: 'Could not archive', message: result.data?.message || 'The request failed.', type: 'error' });
      return;
    }
    load();
  }, [accountId, addNotification, load]);

  const deleteCarousel = useCallback(async (issue) => {
    if (!window.confirm(`Delete “${issue.name || issue.title || 'this carousel'}”? This cannot be undone.`)) return;
    const result = await authenticatedRequest(`${decksPath(tenantKey)}/${issue._id}`, { method: 'DELETE' });
    if (!result.data?.success) {
      addNotification({ title: 'Could not delete', message: result.data?.message || 'The request failed.', type: 'error' });
      return;
    }
    load();
  }, [addNotification, load, tenantKey]);

  const saveStudioDocument = useCallback(async (document, editorial = {}, revision) => {
    if (!draft?.accountId || !draft?._id) return { error: 'Missing issue', code: 400 };
    const result = await authenticatedRequest(
      `/admin/pivot/carousel-accounts/${draft.accountId}/issues/${draft._id}`,
      { method: 'PATCH', data: { revision: Number.isInteger(revision) ? revision : draft.revision, document, curation: editorial.curation, sources: editorial.sources } },
    );
    if (result.error || result.data?.success === false) {
      return {
        error: result.error || result.data?.message,
        code: result.errorCode || result.data?.code || result.code,
        status: result.code,
        issue: result.errorData?.issue,
        storedRevision: result.errorData?.storedRevision,
      };
    }
    const saved = result.data?.data?.issue;
    if (!saved) return { error: 'Save failed', code: 500 };
    setDraft((current) => ({
      ...current,
      revision: saved.revision,
      document: saved.document,
      curation: saved.curation,
      sources: saved.sources,
      name: saved.name || current.name,
      updatedAt: saved.updatedAt,
    }));
    return { document: saved.document, revision: saved.revision, editorial: { curation: saved.curation, sources: saved.sources } };
  }, [draft]);

  const reloadStudioIssue = useCallback(async () => {
    if (!draft?.accountId || !draft?._id) return null;
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${draft.accountId}/issues/${draft._id}`);
    const issue = result.data?.data?.issue;
    if (!issue) return { error: result.error || 'The saved issue could not be loaded.' };
    setDraft((current) => ({ ...current, ...issue, _id: issue.id }));
    return issue;
  }, [draft]);

  const saveStudioCopy = useCallback(async (name, document, editorial = {}) => {
    if (!draft?.accountId) return { error: 'Missing account' };
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${draft.accountId}/issues`, {
      method: 'POST',
      data: {
        name,
        format: draft.format,
        document,
        curation: editorial.curation,
        sources: editorial.sources,
      },
    });
    const issue = result.data?.data?.issue;
    if (!issue) return { error: result.error || result.data?.message || 'The copy could not be saved.' };
    return issue;
  }, [draft]);

  const startEditSelection = useCallback(async () => {
    const account = accounts.find((row) => row.id === (draft?.accountId || accountId));
    if (!account || !draft) return;
    setSeeding(true);
    const selected = (draft.curation?.snapshots || draft.sources || []).map((row) => (
      row.snapshot ? row : candidateToSelection({
        ref: row.ref || row,
        snapshot: row.snapshot || {},
        provenance: {},
      })
    ));
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${account.id}/curation/drafts`, {
      method: 'POST',
      data: {
        format: draft.format || account.defaultFormat || 'city-picks',
        selected,
        theme: draft.curation?.theme || '',
        coverPreset: draft.curation?.coverPreset,
        eventPreset: draft.curation?.eventPreset,
        issueId: draft._id,
      },
    });
    setSeeding(false);
    if (!result.data?.success) {
      addNotification({
        title: 'Could not edit the selection',
        message: result.data?.message || 'The request failed.',
        type: 'error',
      });
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('deckId', draft._id);
    next.set('account', account.id);
    next.set('curation', result.data.data.draft.id);
    setSearchParams(next);
  }, [accountId, accounts, addNotification, draft, searchParams, setSearchParams]);

  const openIssue = useCallback((id) => {
    const next = new URLSearchParams(searchParams);
    next.set('deckId', id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeLibrary = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('deckId');
    next.delete('curation');
    next.delete('account');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  return (
    <PivotTenantPage
      className={`pivot-carousel-page${focused || draft?.schemaVersion === 2 ? ' is-carousel-focused' : ''}`}
      title="Carousel"
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      actions={draft && manifest && draft.schemaVersion !== 2 ? null : (
        <>
          {draft || requestedCurationId ? (
            <button type="button" className="jgz__action" onClick={closeLibrary}>All carousels</button>
          ) : null}
          <span className="jgz__note">4:5 · 1080×1350</span>
        </>
      )}
    >
      {draft && manifest && draft.schemaVersion !== 2 ? (
        <div className="jgz">
          <PivotCarouselEditor
            deck={{ ...draft, edition, inkPlate, showIssueNumber }}
            manifest={manifest}
            cityVoice={cityVoice}
            frames={FRAME_COMPONENTS}
            dirty={dirty}
            saving={saving}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
            onDeckChange={setDraft}
            onSave={saveDeck}
            onSlotImage={setSlotImage}
            onVoiceSaved={load}
            exportState={exportState}
            tools={editionTools}
            focused={focused}
            onToggleFocus={toggleFocus}
            onBack={closeLibrary}
          />
        </div>
        ) : requestedCurationId && (accounts.find((account) => account.id === accountId) || accounts[0]) ? (
          <PivotCarouselCurationWorkspace
            account={accounts.find((account) => account.id === accountId) || accounts[0]}
            draftId={requestedCurationId}
            issue={draft && requestedDeckId ? {
              id: draft._id,
              revision: draft.revision,
              sources: draft.sources,
              curation: draft.curation,
              document: draft.document,
            } : null}
            onDraftId={(id) => openCuration(id, accounts.find((account) => account.id === accountId))}
            onCreated={(data) => {
              const next = new URLSearchParams(searchParams);
              next.delete('curation');
              next.set('deckId', data.issue.id);
              if (data.issue.accountId) next.set('account', data.issue.accountId);
              setSearchParams(next);
            }}
            onApplied={(data) => {
              const next = new URLSearchParams(searchParams);
              next.delete('curation');
              next.set('deckId', data.issue.id);
              setSearchParams(next);
              addNotification({
                title: 'Selection updated',
                message: data.diff
                  ? `${data.diff.added.length} added, ${data.diff.removed.length} removed. Retained slides were kept.`
                  : 'The issue selection was saved.',
                type: 'success',
              });
            }}
            onCancel={closeLibrary}
            notify={addNotification}
          />
        ) : draft?.schemaVersion === 2 ? (
          <>
            <StudioEditor
              key={draft._id}
              issue={draft}
              userId={user?._id || user?.id || null}
              onSave={saveStudioDocument}
              onSaveCopy={saveStudioCopy}
              onReload={reloadStudioIssue}
              onOpenIssue={openIssue}
              onExport={(slideNumbers) => exportState.startExport(slideNumbers)}
              account={accounts.find(row => row.id === draft.accountId)}
              onEditSelection={startEditSelection}
              onBack={closeLibrary}
            />
            <PivotCarouselExportPanel
              open={Boolean(exportState.panelOpen)}
              onClose={exportState.closePanel}
              onOpen={exportState.openPanel}
              job={exportState.job}
              uiState={exportState.uiState}
              progressLabel={exportState.progressLabel}
              failureLabel={exportState.failureLabel}
              revisionStale={exportState.revisionStale}
              artifactsExpired={exportState.artifactsExpired}
              onCancel={exportState.cancelExport}
              onRetry={exportState.retryExport}
              onDownload={exportState.downloadArtifact}
              busy={exportState.busy}
            />
          </>
        ) : (
          <PivotCarouselLibrary
            issues={library}
            missingId={libraryMode === 'missing' ? missingId : null}
            onOpen={openIssue}
            onCreate={createDeck}
            onArchive={archiveCarousel}
            onDelete={deleteCarousel}
            busy={seeding || loading}
          />
        )}
    </PivotTenantPage>
  );
}
