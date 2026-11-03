import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsSection } from '../../../components/PivotOps';
import { formatPivotCopyTemplate, nestedTokenParams } from './pivotCopyFormat';
import {
  buildVoiceRows,
  pivotCopyAdminPaths,
  resetPayloadForRow,
  tokenParamsFromRows,
  writePayloadForRow,
} from './pivotVoiceCatalog';
import { groupClipTextRows } from './pivotClipAdmin';
import { PIVOT_TENANT_PAGES } from './pivotTenantPageRoutes';

const NO_FETCH_CACHE = { enabled: false };

function ClipTextRow({ row, draft, onDraft, onSave, onReset, busy, tokenParams }) {
  const inherited = row.platform ?? row.shipped ?? '';
  const value = draft ?? row.tenant ?? '';
  const changed = draft != null && draft.trim() !== (row.tenant ?? '');
  const preview = row.kind === 'template' && value
    ? formatPivotCopyTemplate(value, { ...tokenParams, ...(row.sampleArgs || {}) })
    : null;
  const inputId = `pivot-clip-text-${row.path}`;

  return (
    <li className={`pivot-clip-text__row${row.tenant != null ? ' is-override' : ''}`}>
      <div className="pivot-clip-text__meta">
        <label htmlFor={inputId} className="pivot-clip-text__key">
          {row.path.replace(/^clip\./, '')}
        </label>
        {row.params.length ? (
          <span className="pivot-clip-text__params">
            {row.params.map((param) => `{${param}}`).join(' ')}
          </span>
        ) : null}
        {row.tenant != null ? <span className="pivot-clip-text__badge">City override</span> : null}
      </div>
      <div className="pivot-clip-text__edit">
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={inherited}
          maxLength={row.maxLength}
          disabled={busy}
          onChange={(event) => onDraft(row.path, event.target.value)}
        />
        <button
          type="button"
          className="linear-btn linear-btn--primary linear-btn--sm"
          aria-label={`Save ${row.path}`}
          disabled={busy || !changed || !value.trim()}
          onClick={() => onSave(row, value.trim())}
        >
          Save
        </button>
        {row.tenant != null ? (
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm"
            aria-label={`Reset ${row.path}`}
            disabled={busy}
            onClick={() => onReset(row)}
          >
            Reset
          </button>
        ) : null}
      </div>
      {row.tenant != null ? (
        <p className="pivot-clip-text__hint">Default: {inherited}</p>
      ) : null}
      {preview ? (
        <p className={`pivot-clip-text__hint${preview.ok ? '' : ' is-error'}`}>
          {preview.ok ? `Reads: ${preview.text}` : `Template error: ${preview.error}`}
        </p>
      ) : null}
    </li>
  );
}

/**
 * This city's wording for the App Clip (`clip.*` Voice keys). Same overlay
 * as Voice; the clip receives it on its drop response.
 */
function PivotClipTextEditor({ tenantKey }) {
  const { addNotification } = useNotification();
  const paths = useMemo(() => pivotCopyAdminPaths('tenant', tenantKey), [tenantKey]);
  const { data: catalogResponse, loading: catalogLoading, error: catalogError } = useFetch(
    paths.catalog,
    { cache: NO_FETCH_CACHE },
  );
  const {
    data: layersResponse,
    loading: layersLoading,
    error: layersError,
    refetch: refetchLayers,
  } = useFetch(paths.layers, { cache: NO_FETCH_CACHE });
  const [drafts, setDrafts] = useState({});
  const [busyPath, setBusyPath] = useState('');

  const rows = useMemo(() => {
    if (!catalogResponse?.success || !layersResponse?.success) return [];
    return buildVoiceRows({
      keys: catalogResponse.data?.keys || [],
      tokens: catalogResponse.data?.tokens || [],
      layers: layersResponse.data || {},
      scope: 'tenant',
    });
  }, [catalogResponse, layersResponse]);

  const groups = useMemo(() => groupClipTextRows(rows), [rows]);
  const tokenParams = useMemo(() => nestedTokenParams(tokenParamsFromRows(rows)), [rows]);
  const overrideCount = groups.reduce(
    (sum, group) => sum + group.items.filter((row) => row.tenant != null).length,
    0,
  );

  const setDraft = useCallback((path, value) => {
    setDrafts((prev) => ({ ...prev, [path]: value }));
  }, []);

  const clearDraft = useCallback((path) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const handleSave = useCallback(async (row, value) => {
    setBusyPath(row.path);
    const { data: res, error } = await authenticatedRequest(paths.write, {
      method: 'PATCH',
      data: writePayloadForRow(row, value),
      headers: { 'Content-Type': 'application/json' },
    });
    setBusyPath('');
    if (error || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || error || 'Unable to save clip text.',
        type: 'error',
      });
      return;
    }
    clearDraft(row.path);
    refetchLayers();
    addNotification({
      title: 'Clip text saved',
      message: `${row.path} is live for this city.`,
      type: 'success',
    });
  }, [addNotification, clearDraft, paths.write, refetchLayers]);

  const handleReset = useCallback(async (row) => {
    if (!window.confirm(`Reset ${row.path} to the platform wording?`)) return;
    setBusyPath(row.path);
    const { data: res, error } = await authenticatedRequest(paths.write, {
      method: 'DELETE',
      data: resetPayloadForRow(row),
      headers: { 'Content-Type': 'application/json' },
    });
    setBusyPath('');
    if (error || !res?.success) {
      addNotification({
        title: 'Reset failed',
        message: res?.message || error || 'Unable to reset clip text.',
        type: 'error',
      });
      return;
    }
    clearDraft(row.path);
    refetchLayers();
  }, [addNotification, clearDraft, paths.write, refetchLayers]);

  const loadError = catalogError || layersError
    || (catalogResponse && !catalogResponse.success ? catalogResponse.message : null)
    || (layersResponse && !layersResponse.success ? layersResponse.message : null);

  return (
    <PivotOpsSection
      title="Text"
      titleId="pivot-clip-text-title"
      description={`What the clip says in this city. Blank fields use the platform wording.${
        overrideCount ? ` ${overrideCount} overridden.` : ''
      }`}
      actions={(
        <Link
          className="linear-btn linear-btn--ghost linear-btn--sm"
          to={`?page=${PIVOT_TENANT_PAGES.voice}`}
        >
          Open in Voice
        </Link>
      )}
    >
      {loadError ? <p className="pivot-clip__error">{loadError}</p> : null}
      {!loadError && (catalogLoading || layersLoading) && !groups.length ? (
        <p className="pivot-clip__muted">Loading clip text…</p>
      ) : null}
      {groups.map((group) => (
        <div key={group.id} className="pivot-clip-text__group">
          <h3 className="pivot-clip__subhead">{group.label}</h3>
          <ul className="pivot-clip-text__list">
            {group.items.map((row) => (
              <ClipTextRow
                key={row.id}
                row={row}
                draft={drafts[row.path]}
                onDraft={setDraft}
                onSave={handleSave}
                onReset={handleReset}
                busy={busyPath === row.path}
                tokenParams={tokenParams}
              />
            ))}
          </ul>
        </div>
      ))}
    </PivotOpsSection>
  );
}

export default PivotClipTextEditor;
