import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

function curationHref(tenantKey, event) {
  const params = new URLSearchParams({ page: '1' });
  if (event?.batchWeek) params.set('batchWeek', event.batchWeek);
  if (event?.id) params.set('eventId', event.id);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

function proposalKey(proposal) {
  return `${proposal?.a?.organizerId || ''}:${proposal?.b?.organizerId || ''}`;
}

function formatRanAt(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CatalogBackfillBar({
  lastBackfill,
  busy,
  force,
  onForceChange,
  onBackfill,
  error,
}) {
  return (
    <div className="pivot-tenant-catalog__backfill">
      <div className="pivot-tenant-catalog__backfill-copy">
        <p className="pivot-tenant-catalog__muted">
          Last backfill: {formatRanAt(lastBackfill?.ranAt)}
          {lastBackfill
            ? ` · ${lastBackfill.linked || 0} linked · ${lastBackfill.ambiguous || 0} ambiguous · ${lastBackfill.unlinked || 0} unlinked`
            : ''}
        </p>
        {lastBackfill?.ambiguousNames?.length ? (
          <p className="pivot-tenant-catalog__muted">
            Ambiguous names: {lastBackfill.ambiguousNames.join(' · ')}
          </p>
        ) : null}
        {error ? (
          <p className="pivot-lab__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pivot-tenant-catalog__backfill-actions">
        <label className="pivot-tenant-catalog__force">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => onForceChange(event.target.checked)}
            disabled={busy}
          />
          Force re-resolve
        </label>
        <button
          type="button"
          className="linear-btn linear-btn--primary linear-btn--sm"
          disabled={busy}
          onClick={onBackfill}
        >
          {busy ? 'Backfilling…' : 'Backfill'}
        </button>
      </div>
    </div>
  );
}

export function CatalogProposals({ proposals, dismissed, busy, onConfirm, onDismiss }) {
  const visible = useMemo(
    () => (proposals || []).filter((row) => !dismissed.has(proposalKey(row))),
    [dismissed, proposals],
  );
  if (!visible.length) return null;

  return (
    <div className="pivot-tenant-catalog__proposals">
      <h3 className="pivot-tenant-catalog__subhead">Suggested merges</h3>
      <ul className="pivot-tenant-catalog__proposal-list">
        {visible.map((proposal) => (
          <li key={proposalKey(proposal)} className="pivot-tenant-catalog__proposal">
            <div>
              <span className="pivot-tenant-catalog__name">
                {proposal.a?.canonicalName} → {proposal.b?.canonicalName}
              </span>
              <span className="pivot-tenant-catalog__muted">
                {' '}
                · {(proposal.reasons || []).join(', ')}
                {proposal.score != null ? ` · ${proposal.score}` : ''}
              </span>
            </div>
            <div className="pivot-tenant-catalog__proposal-actions">
              <button
                type="button"
                className="linear-btn linear-btn--primary linear-btn--sm"
                disabled={busy}
                onClick={() => onConfirm(proposal)}
              >
                Merge
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                disabled={busy}
                onClick={() => onDismiss(proposalKey(proposal))}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CatalogMergeForm({ organizers, busy, onMerge }) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  return (
    <form
      className="pivot-tenant-catalog__merge"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sourceId || !targetId) return;
        onMerge({ sourceOrganizerId: sourceId, targetOrganizerId: targetId });
      }}
    >
      <h3 className="pivot-tenant-catalog__subhead">Merge organizers</h3>
      <div className="pivot-tenant-catalog__merge-row">
        <label className="linear-field">
          <span className="linear-field__label">Source (retired)</span>
          <select
            className="linear-input"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            disabled={busy}
          >
            <option value="">Select…</option>
            {organizers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.canonicalName}
              </option>
            ))}
          </select>
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Target (kept)</span>
          <select
            className="linear-input"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            disabled={busy}
          >
            <option value="">Select…</option>
            {organizers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.canonicalName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={busy || !sourceId || !targetId || sourceId === targetId}
        >
          Merge
        </button>
      </div>
    </form>
  );
}

export function CatalogUnlinkedTable({ tenantKey, events, loading }) {
  if (loading && !events.length) {
    return <p className="pivot-lab__empty">Loading unlinked events…</p>;
  }
  if (!events.length) {
    return (
      <p className="pivot-lab__empty">
        No unlinked events. Run Backfill if this city has never been attributed.
      </p>
    );
  }

  return (
    <div className="pivot-tenant-catalog__table-wrap">
      <table className="pivot-tenant-catalog__table">
        <thead>
          <tr>
            <th>Host</th>
            <th>Event</th>
            <th>Week</th>
            <th>Source</th>
            <th>Kind</th>
          </tr>
        </thead>
        <tbody>
          {events.map((row) => (
            <tr key={row.id}>
              <td className="pivot-tenant-catalog__name">{row.hostName || '—'}</td>
              <td>
                <Link
                  className="pivot-tenant-catalog__event-link"
                  to={curationHref(tenantKey, row)}
                >
                  {row.name || 'Untitled event'}
                </Link>
              </td>
              <td className="pivot-tenant-catalog__num">{row.batchWeek || '—'}</td>
              <td className="pivot-tenant-catalog__muted">{row.source || '—'}</td>
              <td>
                <span
                  className={`pivot-tenant-catalog__claim pivot-tenant-catalog__claim--${
                    row.kind === 'ambiguous' ? 'warn' : 'muted'
                  }`}
                >
                  {row.kind}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
