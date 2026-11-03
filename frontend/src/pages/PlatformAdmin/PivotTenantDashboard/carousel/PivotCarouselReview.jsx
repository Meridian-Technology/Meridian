import React, { useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';

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
  const blocked = disabled || busy;
  const approved = issue.reviewState === 'approved' && issue.approval?.revision === revision;

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

  return <section aria-label="Issue review">
    <h2>Issue review</h2>
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
