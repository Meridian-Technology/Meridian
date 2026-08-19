import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsBanner,
  PivotOpsCard,
} from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import PivotVoiceSaveModal from './PivotVoiceSaveModal';
import {
  formatPivotCopyTemplate,
  nestedTokenParams,
} from './pivotCopyFormat';
import {
  applySparseOverlay,
  buildVoiceRows,
  filterVoiceRows,
  groupVoiceRows,
  pivotCopyAdminPaths,
  resetPayloadForRow,
  sparseOverlayFromLayers,
  tokenParamsFromRows,
  writePayloadForRow,
} from './pivotVoiceCatalog';
import './PivotVoicePage.scss';

const NO_FETCH_CACHE = { enabled: false };

function catalogPayload(response) {
  if (!response?.success || !response.data) return { keys: [], tokens: [] };
  return {
    keys: response.data.keys || [],
    tokens: response.data.tokens || [],
  };
}

function layersPayload(response) {
  if (!response?.success || !response.data) return { entries: {}, tokens: {} };
  return {
    entries: response.data.entries || {},
    tokens: response.data.tokens || {},
    revision: response.data.revision,
  };
}

function VoiceKeyButton({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`pivot-voice__row${selected ? ' is-selected' : ''}${
        row.overridden ? ' is-override' : ''
      }`}
      aria-pressed={selected}
      title={row.shipped}
      onClick={() => onSelect(row)}
    >
      <span className="pivot-voice__row-path">{row.path}</span>
      {row.overridden ? (
        <>
          <span className="pivot-voice__row-mod" title="override" aria-hidden="true">
            M
          </span>
          <span className="pivot-voice__sr-only">override</span>
        </>
      ) : null}
    </button>
  );
}

function FilterChip({ pressed, onClick, children }) {
  return (
    <button
      type="button"
      className={`pivot-voice__chip${pressed ? ' pivot-voice__chip--active' : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LayerCell({ label, value, inheritLabel, muted }) {
  return (
    <div className={`pivot-voice__layer${muted ? ' pivot-voice__layer--muted' : ''}`}>
      <dt>{label}</dt>
      <dd>{value || inheritLabel || '—'}</dd>
    </div>
  );
}

function highlightIcu(value) {
  const text = String(value ?? '');
  const nodes = [];
  const pattern = /\{[^{}]+\}/g;
  let last = 0;
  let match = pattern.exec(text);
  let key = 0;
  while (match) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <span key={key} className="pivot-voice__tok">
        {match[0]}
      </span>,
    );
    key += 1;
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : '\u00a0';
}

function caretPosition(value, caret) {
  const upto = String(value ?? '').slice(0, Math.max(0, caret || 0));
  const lines = upto.split('\n');
  return { line: lines.length, col: (lines[lines.length - 1] || '').length + 1 };
}

function VoiceCodeEditor({ value, onChange, onCaretChange, disabled, maxLength }) {
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);
  const lines = Math.max(1, String(value || '').split('\n').length);

  const syncScroll = (event) => {
    const { scrollTop, scrollLeft } = event.target;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  };

  const reportCaret = (event) => {
    onCaretChange?.(caretPosition(event.target.value, event.target.selectionStart));
  };

  return (
    <label className="pivot-voice__draft">
      <span className="pivot-voice__sr-only">Override</span>
      <div className="pivot-voice__code">
        <div className="pivot-voice__gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <div className="pivot-voice__code-main">
          <pre
            ref={highlightRef}
            className="pivot-voice__highlight"
            aria-hidden="true"
          >
            {highlightIcu(value)}
            {'\n'}
          </pre>
          <textarea
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            spellCheck={false}
            rows={Math.max(6, lines + 1)}
            onScroll={syncScroll}
            onClick={reportCaret}
            onKeyUp={reportCaret}
            onSelect={reportCaret}
            onChange={(event) => {
              onChange(event);
              reportCaret(event);
            }}
          />
        </div>
      </div>
    </label>
  );
}

/**
 * Search-first Just Go voice catalog. Platform pack or city overlay.
 */
function PivotVoicePage({
  scope = 'platform',
  tenantKey,
  cityDisplayName,
}) {
  const { addNotification } = useNotification();
  const paths = useMemo(
    () => pivotCopyAdminPaths(scope, tenantKey),
    [scope, tenantKey],
  );
  const isPlatform = scope !== 'tenant';
  const cityLabel = isPlatform
    ? 'All cities'
    : cityDisplayName || tenantKey || 'city';

  const {
    data: catalogResponse,
    loading: catalogLoading,
    error: catalogError,
  } = useFetch(paths.catalog, { cache: NO_FETCH_CACHE });

  const {
    data: layersResponse,
    loading: layersLoading,
    error: layersError,
    refetch: refetchLayers,
  } = useFetch(paths.layers, { cache: NO_FETCH_CACHE });

  const catalog = useMemo(
    () => catalogPayload(catalogResponse),
    [catalogResponse],
  );
  const layers = useMemo(
    () => layersPayload(layersResponse),
    [layersResponse],
  );

  const [overlay, setOverlay] = useState(() =>
    sparseOverlayFromLayers({}, scope),
  );
  const [query, setQuery] = useState('');
  const [filterOverridden, setFilterOverridden] = useState(false);
  const [filterInterpolator, setFilterInterpolator] = useState(false);
  const [filterTokenUsing, setFilterTokenUsing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [openFamily, setOpenFamily] = useState('tokens');
  const [openGroups, setOpenGroups] = useState({});
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [sampleEdits, setSampleEdits] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!layersResponse?.success) return;
    setOverlay(sparseOverlayFromLayers(layersPayload(layersResponse), scope));
  }, [layersResponse, scope]);

  const baseRows = useMemo(
    () =>
      buildVoiceRows({
        keys: catalog.keys,
        tokens: catalog.tokens,
        layers,
        scope,
      }),
    [catalog.keys, catalog.tokens, layers, scope],
  );

  const rows = useMemo(
    () => applySparseOverlay(baseRows, overlay, scope),
    [baseRows, overlay, scope],
  );

  const visibleRows = useMemo(
    () =>
      filterVoiceRows(rows, {
        query,
        overridden: filterOverridden,
        interpolator: filterInterpolator,
        tokenUsing: filterTokenUsing,
      }),
    [rows, query, filterOverridden, filterInterpolator, filterTokenUsing],
  );

  const families = useMemo(() => groupVoiceRows(visibleRows), [visibleRows]);
  const searching = Boolean(query.trim());
  const overrideCount = useMemo(
    () => rows.filter((row) => row.overridden).length,
    [rows],
  );

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setDraft('');
      setSampleEdits({});
      return;
    }
    const row = rows.find((item) => item.id === selectedId);
    if (!row) return;
    const current = isPlatform ? row.platform : row.tenant;
    setDraft(current ?? row.effective ?? row.shipped ?? '');
    setSampleEdits(row.sampleArgs ? { ...row.sampleArgs } : {});
    setCaret({ line: 1, col: 1 });
    // Re-seed only when the selected key changes so typing is not wiped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isPlatform]);

  const tokenParams = useMemo(
    () => nestedTokenParams(tokenParamsFromRows(rows)),
    [rows],
  );

  const playgroundParams = useMemo(
    () => ({ ...tokenParams, ...sampleEdits }),
    [tokenParams, sampleEdits],
  );

  const draftPreview = useMemo(
    () => formatPivotCopyTemplate(draft, playgroundParams),
    [draft, playgroundParams],
  );

  const currentStored = selected
    ? isPlatform
      ? selected.platform
      : selected.tenant
    : null;
  const baseline = currentStored ?? selected?.shipped ?? '';
  const isDirty = Boolean(selected) && draft !== baseline;

  const handleSelect = useCallback((row) => {
    setSelectedId(row.id);
  }, []);

  const toggleFamily = useCallback((familyId) => {
    setOpenFamily((current) => (current === familyId ? null : familyId));
  }, []);

  const toggleGroup = useCallback((groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleReviewSave = useCallback(() => {
    if (!selected || !paths.canWrite) return;
    const next = draft.trim();
    if (!next) {
      addNotification({
        title: 'Empty copy',
        message: 'Reset to inherit instead of saving a blank string.',
        type: 'info',
      });
      return;
    }
    if (next.length > selected.maxLength) {
      addNotification({
        title: 'Too long',
        message: `Keep this ${selected.type === 'token' ? 'token' : 'string'} to ${selected.maxLength} characters.`,
        type: 'error',
      });
      return;
    }
    if (!isDirty) {
      addNotification({
        title: 'No changes',
        message: 'Voice already matches your edit.',
        type: 'info',
      });
      return;
    }
    setPreviewOpen(true);
  }, [addNotification, draft, isDirty, paths.canWrite, selected]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }
      if (!selected || !paths.canWrite) return;
      event.preventDefault();
      handleReviewSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleReviewSave, paths.canWrite, selected]);

  const handleConfirmSave = useCallback(async () => {
    if (!selected || !paths.canWrite) return;
    const next = draft.trim();
    setSaving(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      paths.write,
      {
        method: 'PATCH',
        data: writePayloadForRow(selected, next),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSaving(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || reqError || 'Unable to save voice',
        type: 'error',
      });
      return;
    }
    const pack = res.data || {};
    setOverlay({
      entries: pack.entries || {},
      tokens: pack.tokens || {},
    });
    addNotification({
      title: 'Voice saved',
      message: `${selected.path} is live on the ${isPlatform ? 'platform' : 'city'} pack`,
      type: 'success',
    });
    setPreviewOpen(false);
    refetchLayers?.();
  }, [
    addNotification,
    draft,
    isPlatform,
    paths.canWrite,
    paths.write,
    refetchLayers,
    selected,
  ]);

  const handleReset = useCallback(async () => {
    if (!selected || !paths.canWrite || currentStored == null) return;
    const confirmed = window.confirm(
      `Reset ${selected.path} to ${isPlatform ? 'shipped' : 'platform'} copy? The stored overlay will be removed.`,
    );
    if (!confirmed) return;

    setResetting(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      paths.write,
      {
        method: 'DELETE',
        data: resetPayloadForRow(selected),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setResetting(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Reset failed',
        message: res?.message || reqError || 'Unable to reset voice',
        type: 'error',
      });
      return;
    }
    const pack = res.data || {};
    setOverlay({
      entries: pack.entries || {},
      tokens: pack.tokens || {},
    });
    setDraft(
      isPlatform
        ? selected.shipped || ''
        : selected.platform ?? selected.shipped ?? '',
    );
    addNotification({
      title: 'Voice reset',
      message: `${selected.path} now inherits ${isPlatform ? 'shipped' : 'platform'} copy`,
      type: 'success',
    });
    refetchLayers?.();
  }, [
    addNotification,
    currentStored,
    isPlatform,
    paths.canWrite,
    paths.write,
    refetchLayers,
    selected,
  ]);

  const loading = catalogLoading || layersLoading;
  const loadError = catalogError || layersError;

  return (
    <PivotTenantPage
      className="pivot-voice-page"
      title="Voice"
      tenantKey={isPlatform ? '' : tenantKey}
      cityDisplayName={cityLabel}
      subtitle={
        isPlatform
            ? 'Platform pack — one key at a time. Open a group or search.'
            : 'City overlay — tenant keys win over platform, then shipped. Open a group or search.'
      }
    >
      {loadError ? (
        <PivotOpsBanner tone="danger" title="Could not load voice catalog">
          {String(loadError)}
        </PivotOpsBanner>
      ) : null}

      <PivotOpsCard className="pivot-voice">
        <aside className="pivot-voice__sidebar">
          <div className="pivot-voice__sidebar-head">
            <span>Explorer</span>
            <span className="pivot-voice__meta-line">
              {loading
                ? 'Loading…'
                : `${visibleRows.length.toLocaleString()} of ${rows.length.toLocaleString()}${
                    overrideCount ? ` · ${overrideCount} M` : ''
                  }`}
            </span>
          </div>
          <div className="pivot-voice__toolbar">
            <label className="pivot-voice__search">
              <span className="pivot-voice__sr-only">Search</span>
              <input
                type="search"
                role="searchbox"
                aria-label="Search voice keys"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="pivot-voice__chips" role="group" aria-label="Filters">
              <FilterChip
                pressed={filterOverridden}
                onClick={() => setFilterOverridden((value) => !value)}
              >
                Overridden
              </FilterChip>
              <FilterChip
                pressed={filterInterpolator}
                onClick={() => setFilterInterpolator((value) => !value)}
              >
                Interpolator
              </FilterChip>
              <FilterChip
                pressed={filterTokenUsing}
                onClick={() => setFilterTokenUsing((value) => !value)}
              >
                Token-using
              </FilterChip>
            </div>
          </div>

          {loading ? (
            <p className="pivot-voice__empty">Loading catalog…</p>
          ) : visibleRows.length === 0 ? (
            <p className="pivot-voice__empty">No keys match.</p>
          ) : (
            <div className="pivot-voice__tree" role="tree">
              {families.map((family) => {
                const familyOpen = searching || openFamily === family.id;
                const nestGroups = family.groups.length > 1;
                return (
                  <div key={family.id} className="pivot-voice__family">
                    <button
                      type="button"
                      className="pivot-voice__family-toggle"
                      aria-expanded={familyOpen}
                      title={family.hint || family.label}
                      onClick={() => toggleFamily(family.id)}
                    >
                      <span className="pivot-voice__family-label">{family.label}</span>
                      <span className="pivot-voice__group-count">
                        {family.overrideCount
                          ? `${family.count} · ${family.overrideCount} M`
                          : family.count}
                      </span>
                    </button>
                    {familyOpen ? (
                      nestGroups ? (
                        family.groups.map((group) => {
                          const groupOpen = searching || Boolean(openGroups[group.id]);
                          return (
                            <div key={group.id} className="pivot-voice__group">
                              <button
                                type="button"
                                className="pivot-voice__group-toggle"
                                aria-expanded={groupOpen}
                                onClick={() => toggleGroup(group.id)}
                              >
                                {group.label}
                                <span className="pivot-voice__group-count">
                                  {group.items.length}
                                </span>
                              </button>
                              {groupOpen ? (
                                <ul className="pivot-voice__list">
                                  {group.items.map((row) => (
                                    <li key={row.id}>
                                      <VoiceKeyButton
                                        row={row}
                                        selected={row.id === selectedId}
                                        onSelect={handleSelect}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <ul className="pivot-voice__list">
                          {family.groups[0].items.map((row) => (
                            <li key={row.id}>
                              <VoiceKeyButton
                                row={row}
                                selected={row.id === selectedId}
                                onSelect={handleSelect}
                              />
                            </li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <section className="pivot-voice__stage">
          {!selected ? (
            <p className="pivot-voice__empty pivot-voice__empty--stage">
              Open a key from the explorer to edit.
            </p>
          ) : (
            <>
              <div className="pivot-voice__tabs">
                <div className="pivot-voice__tab is-active">
                  {isDirty ? <span className="pivot-voice__dirty" aria-hidden="true" /> : null}
                  <h2 className="pivot-voice__key">{selected.path}</h2>
                </div>
              </div>
              <nav className="pivot-voice__crumbs" aria-label="Key path">
                {selected.path.split('.').map((part, index, parts) => (
                  <React.Fragment key={`${part}-${index}`}>
                    {index ? <span className="pivot-voice__crumb-sep">/</span> : null}
                    <span className={index === parts.length - 1 ? 'is-current' : undefined}>
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </nav>

              <VoiceCodeEditor
                value={draft}
                maxLength={selected.maxLength}
                disabled={!paths.canWrite}
                onCaretChange={setCaret}
                onChange={(event) => setDraft(event.target.value)}
              />

              <div className="pivot-voice__panel">
                <div className="pivot-voice__panel-head">
                  {selected.params.length ? 'Output · ICU playground' : 'Output'}
                </div>
                {selected.params.length ? (
                  <div className="pivot-voice__samples">
                    {selected.params.map((param) => (
                      <label key={param}>
                        <span>{param}</span>
                        <input
                          value={
                            sampleEdits[param] == null ? '' : String(sampleEdits[param])
                          }
                          onChange={(event) => {
                            const raw = event.target.value;
                            const asNumber = Number(raw);
                            setSampleEdits((prev) => ({
                              ...prev,
                              [param]:
                                raw !== '' &&
                                Number.isFinite(asNumber) &&
                                /^-?\d+(\.\d+)?$/.test(raw)
                                  ? asNumber
                                  : raw,
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                <p
                  className={`pivot-voice__preview${
                    draftPreview.ok ? '' : ' is-error'
                  }`}
                >
                  {draftPreview.ok ? draftPreview.text : draftPreview.error}
                </p>
                <dl className="pivot-voice__layers">
                  <LayerCell label="Shipped" value={selected.shipped} />
                  <LayerCell
                    label="Platform"
                    value={selected.platform}
                    inheritLabel="inherit shipped"
                  />
                  {isPlatform ? (
                    <LayerCell
                      label="Tenant"
                      inheritLabel="inherit only"
                      muted
                    />
                  ) : (
                    <LayerCell
                      label="Tenant"
                      value={selected.tenant}
                      inheritLabel="inherit platform"
                    />
                  )}
                  <LayerCell label="Effective" value={selected.effective} />
                </dl>
              </div>

              <div className="pivot-voice__statusbar">
                <span>
                  {selected.type === 'token' ? 'token' : selected.kind}
                  {selected.params.length ? ` · ${selected.params.join(', ')}` : ''}
                </span>
                <span>
                  Ln {caret.line}, Col {caret.col}
                </span>
                <span>
                  {draft.length} / {selected.maxLength}
                </span>
                <span>{isDirty ? 'Modified' : selected.overridden ? 'Override' : 'Shipped'}</span>
                <div className="pivot-voice__actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={handleReset}
                    disabled={
                      !paths.canWrite || resetting || currentStored == null
                    }
                  >
                    {resetting ? 'Resetting…' : 'Reset to parent'}
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handleReviewSave}
                    disabled={!paths.canWrite || saving}
                  >
                    Save
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </PivotOpsCard>

      <PivotVoiceSaveModal
        isOpen={previewOpen}
        row={selected}
        before={
          currentStored ??
          (isPlatform
            ? selected?.shipped ?? ''
            : selected?.platform ?? selected?.shipped ?? '')
        }
        after={draft.trim()}
        previewParams={playgroundParams}
        saving={saving}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </PivotTenantPage>
  );
}

export default PivotVoicePage;
