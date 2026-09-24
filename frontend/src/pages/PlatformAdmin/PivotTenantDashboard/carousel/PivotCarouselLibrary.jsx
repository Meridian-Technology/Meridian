import React, { useMemo, useState } from 'react';
import { filterIssues } from './carouselLibrary';
import './PivotCarouselLibrary.scss';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PivotCarouselLibrary({
  accounts,
  accountId,
  onAccount,
  issues,
  missingId,
  onOpen,
  onCreate,
  onMigrate,
  onEditableCopy,
  busy,
}) {
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('all');
  const [status, setStatus] = useState('active');
  const visible = useMemo(() => filterIssues(issues, { q, format, status }), [issues, q, format, status]);

  return (
    <div className="jg-library">
      {missingId && (
        <p className="jg-library__missing" role="alert">
          No issue matches <span>{missingId}</span>. It may have been removed, or it belongs to another account.
        </p>
      )}
      <div className="jg-library__bar">
        <label>
          Account
          <select value={accountId || ''} onChange={(event) => onAccount(event.target.value)}>
            <option value="">This city’s unassigned decks</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Issue name" />
        </label>
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="all">All</option>
            <option value="city-picks">City picks</option>
            <option value="sorry-you-missed-it">Sorry you missed it</option>
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="button" onClick={onCreate} disabled={busy}>New issue</button>
        <button type="button" onClick={onMigrate} disabled={busy}>Assign existing decks</button>
      </div>
      {!visible.length && <p className="jg-library__empty">No issues in this view.</p>}
      <ul className="jg-library__grid">
        {visible.map((issue) => (
          <li key={issue._id || issue.id}>
            <button type="button" className="jg-library__card" onClick={() => onOpen(issue._id || issue.id)}>
              <span className="jg-library__thumb">
                {issue.coverImage
                  ? <img src={issue.coverImage} alt="" />
                  : <b>{issue.coverType || 'issue'}</b>}
              </span>
              <span className="jg-library__meta">
                <strong>{issue.name || issue.title}</strong>
                <em>{issue.format || 'legacy'} · {issue.schemaVersion === 2 ? 'editable' : 'original'} · {issue.status || 'active'}</em>
                <time dateTime={issue.updatedAt}>{when(issue.updatedAt)}</time>
              </span>
            </button>
            {issue.schemaVersion !== 2 && issue.accountId && (
              <button type="button" className="jg-library__copy" onClick={() => onEditableCopy(issue)} disabled={busy}>
                Create editable copy
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
