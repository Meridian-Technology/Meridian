import React, { useEffect, useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';

const TREND_SOURCES = { kym: 'Know Your Meme', later: 'Later', google: 'Google Trends', giphy: 'GIPHY' };

const REVIEW_LABELS = { unapproved: 'Unapproved', approved: 'Approved', posted: 'Posted' };

function optionState(option) {
  const parts = [];
  if (option.status === 'archived') parts.push('Archived');
  if (option.picked) parts.push('Picked');
  if (REVIEW_LABELS[option.reviewState]) parts.push(REVIEW_LABELS[option.reviewState]);
  return parts.join(' · ') || 'Active';
}

function requestTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/** `trend:kym:chinamaxxing` reads as "Chinamaxxing · Know Your Meme". */
export function trendLabel(ref) {
  const [, source = '', slug = ''] = String(ref).split(':');
  const name = slug.replace(/-/g, ' ');
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} · ${TREND_SOURCES[source] || source}`;
}

/** Review actions always name the revision currently confirmed by autosave. */
export default function PivotCarouselReview({ issue, revision, caption, onCaption, disabled, onIssue, onConflict }) {
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [text, setText] = useState('');
  const [disposition, setDisposition] = useState('change');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState([]);
  const blocked = disabled || busy;
  const approved = issue.reviewState === 'approved' && issue.approval?.revision === revision;
  const issueId = issue.id || issue._id;

  useEffect(() => {
    if (!issue.optionSetId || !issue.accountId || !issueId) {
      setOptions([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await authenticatedRequest(
          `/admin/pivot/carousel-accounts/${issue.accountId}/issues/${issueId}/options`,
        );
        if (cancelled) return;
        if (!result?.data?.success) {
          setError(result?.error || result?.data?.message || 'Could not load the other options.');
          return;
        }
        const listed = result.data.data?.options || [];
        setOptions(listed.filter(option => String(option.id) !== String(issueId)));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load the other options.');
      }
    })();
    return () => { cancelled = true; };
  }, [issue.accountId, issue.optionSetId, issueId]);

  const submit = async (action, data = {}) => {
    if (blocked) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await authenticatedRequest(
        `/admin/pivot/carousel-accounts/${issue.accountId}/issues/${issue.id || issue._id}/${action}`,
        { method: 'POST', data: { revision, ...data } },
      );
      if (!result.data?.success) {
        const code = result.errorCode || result.data?.code;
        const error = result.error || result.data?.message || 'The request failed. Try again.';
        if (code === 'REVISION_CONFLICT') onConflict({ error, ...result.errorData });
        else setError(error);
        return;
      }
      if (result.data.data.issue) onIssue(result.data.data.issue);
      if (action === 'feedback') {
        onIssue({ ...issue, feedbackNotes: [...(issue.feedbackNotes || []), result.data.data.note] });
        setText('');
        setFeedbackOpen(false);
      }
      setPosting(false);
      setMessage({ approve: 'Revision approved.', 'mark-posted': 'Marked posted.', feedback: 'Feedback saved for the next issue.' }[action]);
    } catch (err) {
      setError(err.message || 'The request failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const restoreOption = async (option) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await authenticatedRequest(
        `/admin/pivot/carousel-accounts/${issue.accountId}/issues/${option.id}/restore`,
        { method: 'POST', data: { revision: option.revision } },
      );
      if (!result?.data?.success) {
        setError(result?.error || result?.data?.message || 'Could not restore that option.');
        return;
      }
      const restored = result.data.data?.issue;
      setOptions(current => current.map(item => (item.id === option.id ? { ...item, ...restored, id: option.id } : item)));
      setMessage('Option restored.');
    } catch (err) {
      setError(err.message || 'Could not restore that option.');
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Issue review">
    <h2>Issue review</h2>
    {issue.trendRefs?.length > 0 && <div aria-label="Trends this draft uses">
      <p>Trends this draft uses. Check each fits before approving:</p>
      <ul>{issue.trendRefs.map(ref => <li key={ref}>{trendLabel(ref)}</li>)}</ul>
    </div>}
    {options.length > 0 && <div>
      <h3>Other options</h3>
      <ul aria-label="Other options">{options.map(option => <li key={option.id}>
        <span>{option.themeLabel || option.name}</span>
        <span>{optionState(option)}</span>
        {option.status === 'archived' && <button type="button" disabled={busy} onClick={() => restoreOption(option)}>Restore</button>}
      </li>)}</ul>
    </div>}
    {issue.revisionRequests?.length > 0 && <div>
      <h3>Revision requests</h3>
      <ol aria-label="Revision requests">{issue.revisionRequests.map(request => <li key={request.id}>
        Revision {request.revision}{request.requester ? ` · ${request.requester}` : ''}{request.time ? ` · ${requestTime(request.time)}` : ''}
        <p>{request.text}</p>
        {request.reason ? <p>Reason: {request.reason}</p> : null}
      </li>)}</ol>
    </div>}
    <label>Social caption<textarea value={caption} onChange={event => onCaption(event.target.value)} disabled={busy} rows={5} /></label>
    {disabled && <p>Save your changes before reviewing this revision.</p>}
    <button type="button" disabled={blocked || issue.reviewState !== 'unapproved'} onClick={() => submit('approve')}>Approve</button>
    <button type="button" disabled={blocked || !approved} onClick={() => setPosting(true)}>Mark posted</button>
    {posting && <form onSubmit={event => { event.preventDefault(); submit('mark-posted', { instagramUrl: instagramUrl.trim() }); }}>
      <p>Record that you posted this revision by hand.</p>
      <label>Instagram URL (optional)<input type="url" value={instagramUrl} onChange={event => setInstagramUrl(event.target.value)} disabled={busy} /></label>
      <button type="submit" disabled={blocked || !approved}>Confirm posted</button>
      <button type="button" disabled={busy} onClick={() => setPosting(false)}>Cancel</button>
    </form>}
    <button type="button" disabled={blocked} onClick={() => setFeedbackOpen(open => !open)}>Leave feedback</button>
    {feedbackOpen && <form onSubmit={event => { event.preventDefault(); submit('feedback', { text: text.trim(), disposition }); }}>
      <label>Disposition<select value={disposition} onChange={event => setDisposition(event.target.value)} disabled={busy}>
        <option value="approve">Approve</option><option value="reject">Reject</option><option value="change">Change</option>
      </select></label>
      <label>Feedback<textarea value={text} onChange={event => setText(event.target.value)} disabled={busy} rows={4} /></label>
      <button type="submit" disabled={blocked || !text.trim()}>Save feedback</button>
    </form>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {(issue.feedbackNotes || []).map(note => <p key={note.id}>{note.disposition} · Revision {note.revision}: {note.text}</p>)}
  </section>;
}
